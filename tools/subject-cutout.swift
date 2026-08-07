// Lifts the foreground subject out of a reference render into a clean RGBA
// cutout, so character plates ship with a real alpha edge instead of a chroma
// key. The green-screen shader in cinematicSquirrel.ts existed only because no
// matting step was available; Vision's foreground-instance mask holds fur and
// whisker detail that a key-color distance test cannot.
//
//   swift tools/subject-cutout.swift <in.png> <out.png> [instanceIndex]
//
// Prints the tight bounding box of the matted subject as JSON so callers can
// crop and record pixel-measured anchors without reopening the file.

import AppKit
import CoreImage
import Foundation
import Vision

func fail(_ message: String) -> Never {
    FileHandle.standardError.write(Data("subject-cutout: \(message)\n".utf8))
    exit(1)
}

let args = CommandLine.arguments
guard args.count >= 3 else { fail("usage: subject-cutout <in.png> <out.png> [instanceIndex]") }
let inputURL = URL(fileURLWithPath: args[1])
let outputURL = URL(fileURLWithPath: args[2])
let wantedInstance = args.count > 3 ? Int(args[3]) : nil

guard let source = CIImage(contentsOf: inputURL) else { fail("cannot read \(inputURL.path)") }

let request = VNGenerateForegroundInstanceMaskRequest()
let handler = VNImageRequestHandler(ciImage: source, options: [:])
do { try handler.perform([request]) } catch { fail("vision failed: \(error)") }

guard let observation = request.results?.first else { fail("no foreground subject found") }

// allInstances is a 1-based IndexSet; index 0 is the background.
let instances: IndexSet
if let wanted = wantedInstance {
    guard observation.allInstances.contains(wanted) else {
        fail("instance \(wanted) not present; found \(Array(observation.allInstances))")
    }
    instances = IndexSet(integer: wanted)
} else {
    instances = observation.allInstances
}

let masked: CVPixelBuffer
do {
    masked = try observation.generateMaskedImage(
        ofInstances: instances,
        from: handler,
        croppedToInstancesExtent: false,
    )
} catch {
    fail("masking failed: \(error)")
}

let context = CIContext()
let cutout = CIImage(cvPixelBuffer: masked)
guard let cgImage = context.createCGImage(cutout, from: cutout.extent) else {
    fail("cannot rasterize cutout")
}

// Vision returns the full frame with everything else zeroed. Measuring the
// opaque extent here saves a second decode when the caller crops.
let width = cgImage.width
let height = cgImage.height
var pixels = [UInt8](repeating: 0, count: width * height * 4)
guard
    let bitmap = CGContext(
        data: &pixels,
        width: width,
        height: height,
        bitsPerComponent: 8,
        bytesPerRow: width * 4,
        space: CGColorSpaceCreateDeviceRGB(),
        bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue,
    )
else { fail("cannot allocate measuring bitmap") }
bitmap.draw(cgImage, in: CGRect(x: 0, y: 0, width: width, height: height))

var minX = width, minY = height, maxX = -1, maxY = -1
for y in 0..<height {
    for x in 0..<width where pixels[(y * width + x) * 4 + 3] > 8 {
        if x < minX { minX = x }
        if x > maxX { maxX = x }
        if y < minY { minY = y }
        if y > maxY { maxY = y }
    }
}
guard maxX >= minX, maxY >= minY else { fail("matte is empty") }

let bitmapRep = NSBitmapImageRep(cgImage: cgImage)
bitmapRep.size = NSSize(width: width, height: height)
guard let png = bitmapRep.representation(using: .png, properties: [:]) else {
    fail("cannot encode png")
}
do { try png.write(to: outputURL) } catch { fail("cannot write \(outputURL.path): \(error)") }

let json = """
{"width":\(width),"height":\(height),"instances":\(observation.allInstances.count),\
"boundsTopLeft":{"x":\(minX),"y":\(minY),"w":\(maxX - minX + 1),"h":\(maxY - minY + 1)}}
"""
print(json)
