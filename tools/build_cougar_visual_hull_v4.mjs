/**
 * Offline Purple Cougar v4 geometry builder.
 *
 * Reads Pillow-prepared PGM masks, computes exact signed-distance fields,
 * intersects four calibrated projection pairs, runs Three.js MarchingCubes,
 * adds a separate tapered TubeGeometry tail, and writes an OBJ plus metrics.
 *
 * No DOM, browser, WebGL renderer, localhost server, or runtime asset is used.
 */

import {
  BufferGeometry,
  CatmullRomCurve3,
  ConeGeometry,
  REVISION,
  SphereGeometry,
  TubeGeometry,
  Vector3,
} from "three";
import { MarchingCubes } from "three/addons/objects/MarchingCubes.js";
import {
  appendFileSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { performance } from "node:perf_hooks";
import { fileURLToPath } from "node:url";
import path from "node:path";

const SCRIPT = fileURLToPath(import.meta.url);
const PROJECT = path.resolve(path.dirname(SCRIPT), "..");
const OUTPUT = path.join(PROJECT, "artifacts", "v4", "node");
const MANIFEST_PATH = path.join(OUTPUT, "mask-manifest.json");
const OBJ_PATH = path.join(OUTPUT, "purple-cougar-visual-hull-v4.obj");
const METRICS_PATH = path.join(
  OUTPUT,
  "purple-cougar-visual-hull-v4-metrics.json",
);
const RESOLUTION = clamp(
  Number.parseInt(process.env.COUGAR_HULL_RESOLUTION ?? "96", 10),
  64,
  112,
);
const MAX_POLYGONS = 320_000;

function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value));
}

function loadPgm(filePath) {
  const buffer = readFileSync(filePath);
  const header = buffer.subarray(0, 160).toString("latin1");
  const match = /^P5\s+(\d+)\s+(\d+)\s+(\d+)\s/.exec(header);
  if (!match) {
    throw new Error(`Unsupported PGM header: ${filePath}`);
  }
  const width = Number.parseInt(match[1], 10);
  const height = Number.parseInt(match[2], 10);
  const maximum = Number.parseInt(match[3], 10);
  if (maximum !== 255) {
    throw new Error(`Expected 8-bit PGM data in ${filePath}`);
  }
  const offset = Buffer.byteLength(match[0], "latin1");
  const source = buffer.subarray(offset, offset + width * height);
  if (source.length !== width * height) {
    throw new Error(`Truncated PGM data in ${filePath}`);
  }
  const mask = new Uint8Array(source.length);
  for (let index = 0; index < source.length; index += 1) {
    mask[index] = source[index] >= 128 ? 1 : 0;
  }
  return { width, height, mask };
}

function edt1d(values, output, sites, boundaries) {
  const count = values.length;
  const infinity = 1e12;
  let envelope = 0;
  sites[0] = 0;
  boundaries[0] = -infinity;
  boundaries[1] = infinity;

  for (let query = 1; query < count; query += 1) {
    let site = sites[envelope];
    let intersection =
      (values[query] + query * query - (values[site] + site * site)) /
      (2 * query - 2 * site);
    while (intersection <= boundaries[envelope]) {
      envelope -= 1;
      site = sites[envelope];
      intersection =
        (values[query] + query * query - (values[site] + site * site)) /
        (2 * query - 2 * site);
    }
    envelope += 1;
    sites[envelope] = query;
    boundaries[envelope] = intersection;
    boundaries[envelope + 1] = infinity;
  }

  envelope = 0;
  for (let query = 0; query < count; query += 1) {
    while (boundaries[envelope + 1] < query) {
      envelope += 1;
    }
    const site = sites[envelope];
    const delta = query - site;
    output[query] = delta * delta + values[site];
  }
}

function squaredDistanceTransform(mask, width, height, seedValue) {
  const infinity = 1e12;
  const horizontal = new Float64Array(mask.length);
  const result = new Float64Array(mask.length);
  const maximum = Math.max(width, height);
  const values = new Float64Array(maximum);
  const output = new Float64Array(maximum);
  const sites = new Int32Array(maximum);
  const boundaries = new Float64Array(maximum + 1);

  for (let y = 0; y < height; y += 1) {
    const row = y * width;
    for (let x = 0; x < width; x += 1) {
      values[x] = mask[row + x] === seedValue ? 0 : infinity;
    }
    edt1d(
      values.subarray(0, width),
      output.subarray(0, width),
      sites.subarray(0, width),
      boundaries.subarray(0, width + 1),
    );
    horizontal.set(output.subarray(0, width), row);
  }

  for (let x = 0; x < width; x += 1) {
    for (let y = 0; y < height; y += 1) {
      values[y] = horizontal[y * width + x];
    }
    edt1d(
      values.subarray(0, height),
      output.subarray(0, height),
      sites.subarray(0, height),
      boundaries.subarray(0, height + 1),
    );
    for (let y = 0; y < height; y += 1) {
      result[y * width + x] = output[y];
    }
  }
  return result;
}

function createSignedDistance(maskData) {
  const distanceToForeground = squaredDistanceTransform(
    maskData.mask,
    maskData.width,
    maskData.height,
    1,
  );
  const distanceToBackground = squaredDistanceTransform(
    maskData.mask,
    maskData.width,
    maskData.height,
    0,
  );
  const field = new Float32Array(maskData.mask.length);
  for (let index = 0; index < field.length; index += 1) {
    field[index] =
      Math.sqrt(distanceToBackground[index]) -
      Math.sqrt(distanceToForeground[index]);
  }
  return { ...maskData, field };
}

function bilinearSample(view, u, v) {
  const x0 = Math.floor(u);
  const y0 = Math.floor(v);
  if (
    x0 < 0 ||
    y0 < 0 ||
    x0 + 1 >= view.width ||
    y0 + 1 >= view.height
  ) {
    return -Math.max(view.width, view.height);
  }
  const tx = u - x0;
  const ty = v - y0;
  const row0 = y0 * view.width;
  const row1 = (y0 + 1) * view.width;
  return (
    view.field[row0 + x0] * (1 - tx) * (1 - ty) +
    view.field[row0 + x0 + 1] * tx * (1 - ty) +
    view.field[row1 + x0] * (1 - tx) * ty +
    view.field[row1 + x0 + 1] * tx * ty
  );
}

function sampleView(view, forward, animalLeft, up) {
  const projected =
    view.projection[0] * forward + view.projection[1] * animalLeft;
  const u = view.centerU + view.pixelsPerHeight * projected;
  const v = view.groundV - view.pixelsPerHeight * up;
  return bilinearSample(view, u, v) / view.pixelsPerHeight;
}

function cardinalField(views, forward, animalLeft, up) {
  const front = sampleView(views.front, forward, animalLeft, up);
  const rear = sampleView(views.rear, forward, animalLeft, up);
  const left = sampleView(views.left, forward, animalLeft, up);
  const right = sampleView(views.right, forward, animalLeft, up);
  const mirroredBlend = smoothstep(0.24, 0.43, up);
  // Generated views disagree most around individual feet. Preserve the union
  // there, then converge to measured mirrored-pair averages through the torso.
  const frontRear = lerp(Math.max(front, rear), (front + rear) * 0.5, mirroredBlend);
  const leftRight = lerp(Math.max(left, right), (left + right) * 0.5, mirroredBlend);
  return smoothMinimum(frontRear + 0.008, leftRight + 0.008, 0.032);
}

function optimizeObliqueCenters(views, bounds, tailCutoff) {
  // The supplied sheet calibration is already measured. The earlier
  // one-sided containment score biased three centers to search boundaries, so
  // this durable first base keeps the measured optical centers unchanged.
  void bounds;
  void tailCutoff;
  const adjustments = {};
  for (const name of ["fl45", "fr45", "rl45", "rr45"]) {
    const view = views[name];
    view.centerU = view.initialCenterU;
    adjustments[name] = 0;
  }
  return adjustments;
}

function completeField(views, forward, animalLeft, up, tailCutoff) {
  if (forward <= tailCutoff) {
    return -0.12;
  }
  const cardinal = cardinalField(views, forward, animalLeft, up);
  const diagonalA =
    (sampleView(views.fl45, forward, animalLeft, up) +
      sampleView(views.rr45, forward, animalLeft, up)) *
    0.5;
  const diagonalB =
    (sampleView(views.fr45, forward, animalLeft, up) +
      sampleView(views.rl45, forward, animalLeft, up)) *
    0.5;
  const diagonal = smoothMinimum(
    diagonalA + 0.016,
    diagonalB + 0.016,
    0.026,
  );
  const viewIntersection = smoothMinimum(cardinal, diagonal, 0.03);
  // Pose-inconsistent extremities are reconstructed as measured shells. Keep
  // this field to the contiguous torso/chest/haunch volume.
  const coreGate = Math.min(
    forward + 0.56,
    0.6 - forward,
    up - 0.29,
    0.94 - up,
  );
  return smoothMinimum(viewIntersection, coreGate, 0.026);
}

function fillMarchingField(effect, views, bounds, tailCutoff) {
  const size = effect.size;
  const sizeSquared = effect.size2;
  let minimum = Infinity;
  let maximum = -Infinity;
  let positive = 0;
  for (let leftIndex = 0; leftIndex < size; leftIndex += 1) {
    const animalLeft = lerp(
      bounds.animalLeft[0],
      bounds.animalLeft[1],
      leftIndex / (size - 1),
    );
    const leftOffset = leftIndex * sizeSquared;
    for (let upIndex = 0; upIndex < size; upIndex += 1) {
      const up = lerp(bounds.up[0], bounds.up[1], upIndex / (size - 1));
      const row = leftOffset + upIndex * size;
      for (let forwardIndex = 0; forwardIndex < size; forwardIndex += 1) {
        const boundary =
          forwardIndex === 0 ||
          forwardIndex === size - 1 ||
          upIndex === 0 ||
          upIndex === size - 1 ||
          leftIndex === 0 ||
          leftIndex === size - 1;
        const forward = lerp(
          bounds.forward[0],
          bounds.forward[1],
          forwardIndex / (size - 1),
        );
        const value = boundary
          ? -0.12
          : completeField(views, forward, animalLeft, up, tailCutoff);
        effect.field[row + forwardIndex] = value;
        if (value >= 0) positive += 1;
        minimum = Math.min(minimum, value);
        maximum = Math.max(maximum, value);
      }
    }
  }
  return { minimum, maximum, positive };
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function smoothstep(edge0, edge1, value) {
  const t = clamp((value - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

function smoothMinimum(left, right, radius) {
  const h = Math.max(radius - Math.abs(left - right), 0) / radius;
  return Math.min(left, right) - (h * h * radius) / 4;
}

function createVariableTube(points, radii, tubularSegments, radialSegments) {
  const curve = new CatmullRomCurve3(points, false, "centripetal", 0.45);
  const geometry = new TubeGeometry(
    curve,
    tubularSegments,
    1,
    radialSegments,
    false,
  );
  const positions = geometry.getAttribute("position");
  const normals = geometry.getAttribute("normal");
  const center = new Vector3();
  for (let ring = 0; ring <= tubularSegments; ring += 1) {
    const progress = ring / tubularSegments;
    curve.getPointAt(progress, center);
    const scaled = progress * (radii.length - 1);
    const lower = Math.min(Math.floor(scaled), radii.length - 1);
    const upper = Math.min(lower + 1, radii.length - 1);
    const radius = lerp(radii[lower], radii[upper], scaled - lower);
    for (let radial = 0; radial <= radialSegments; radial += 1) {
      const index = ring * (radialSegments + 1) + radial;
      positions.setXYZ(
        index,
        center.x + normals.getX(index) * radius,
        center.y + normals.getY(index) * radius,
        center.z + normals.getZ(index) * radius,
      );
    }
  }
  positions.needsUpdate = true;
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

function createTaperedTail() {
  const points = [
    new Vector3(-0.43, 0.72, 0),
    new Vector3(-0.52, 0.7, 0),
    new Vector3(-0.61, 0.66, 0),
    new Vector3(-0.75, 0.57, 0.01),
    new Vector3(-0.9, 0.4, 0.015),
    new Vector3(-1.06, 0.23, 0.02),
    new Vector3(-1.23, 0.16, 0.025),
    new Vector3(-1.39, 0.18, 0.02),
    new Vector3(-1.51, 0.3, 0.01),
    new Vector3(-1.53, 0.46, 0),
  ];
  return createVariableTube(
    points,
    [0.088, 0.082, 0.071, 0.059, 0.048, 0.037, 0.024, 0.012],
    72,
    14,
  );
}

function ellipsoidGeometry(
  radii,
  center,
  rotationZ = 0,
  widthSegments = 28,
  heightSegments = 18,
) {
  const geometry = new SphereGeometry(
    1,
    widthSegments,
    heightSegments,
  );
  geometry.scale(radii[0], radii[1], radii[2]);
  if (rotationZ !== 0) geometry.rotateZ(rotationZ);
  geometry.translate(center[0], center[1], center[2]);
  geometry.computeVertexNormals();
  return geometry;
}

function createOrganicAssembly() {
  const parts = [];
  parts.push({
    name: "NeckConnector",
    geometry: ellipsoidGeometry([0.21, 0.3, 0.2], [0.5, 0.69, 0], -0.18),
  });
  parts.push({
    name: "Braincase",
    geometry: ellipsoidGeometry([0.235, 0.205, 0.215], [0.72, 0.82, 0]),
  });
  parts.push({
    name: "MuzzleBase",
    geometry: ellipsoidGeometry([0.145, 0.095, 0.16], [0.9, 0.745, 0], -0.06),
  });
  for (const side of [-1, 1]) {
    const ear = new ConeGeometry(0.078, 0.17, 14, 3);
    ear.scale(0.78, 1, 0.66);
    ear.rotateX(side * 0.12);
    ear.rotateZ(side * -0.08);
    ear.translate(0.7, 1.02, side * 0.135);
    ear.computeVertexNormals();
    parts.push({
      name: `${side < 0 ? "Right" : "Left"}Ear`,
      geometry: ear,
    });

    const foreTube = createVariableTube(
      [
        new Vector3(0.38, 0.7, side * 0.135),
        new Vector3(0.39, 0.51, side * 0.14),
        new Vector3(0.4, 0.29, side * 0.145),
        new Vector3(0.41, 0.1, side * 0.15),
      ],
      [0.105, 0.082, 0.061, 0.054],
      42,
      12,
    );
    parts.push({
      name: `${side < 0 ? "Right" : "Left"}Foreleg`,
      geometry: foreTube,
    });
    parts.push({
      name: `${side < 0 ? "Right" : "Left"}Forepaw`,
      geometry: ellipsoidGeometry(
        [0.125, 0.055, 0.088],
        [0.46, 0.055, side * 0.15],
        -0.03,
      ),
    });

    parts.push({
      name: `${side < 0 ? "Right" : "Left"}Haunch`,
      geometry: ellipsoidGeometry(
        [0.17, 0.275, 0.145],
        [-0.34, 0.57, side * 0.145],
        -0.18,
      ),
    });
    const hindTube = createVariableTube(
      [
        new Vector3(-0.38, 0.55, side * 0.145),
        new Vector3(-0.35, 0.4, side * 0.15),
        new Vector3(-0.26, 0.24, side * 0.15),
        new Vector3(-0.24, 0.1, side * 0.155),
      ],
      [0.13, 0.105, 0.073, 0.057],
      42,
      12,
    );
    parts.push({
      name: `${side < 0 ? "Right" : "Left"}Hindleg`,
      geometry: hindTube,
    });
    parts.push({
      name: `${side < 0 ? "Right" : "Left"}Hindpaw`,
      geometry: ellipsoidGeometry(
        [0.145, 0.057, 0.098],
        [-0.14, 0.057, side * 0.155],
        0.02,
      ),
    });
  }
  parts.push({ name: "Tail_TaperedTube", geometry: createTaperedTail() });
  return parts;
}

function transformMainPosition(position, bounds) {
  return [
    lerp(bounds.forward[0], bounds.forward[1], (position[0] + 1) * 0.5),
    lerp(bounds.up[0], bounds.up[1], (position[1] + 1) * 0.5),
    lerp(
      bounds.animalLeft[0],
      bounds.animalLeft[1],
      (position[2] + 1) * 0.5,
    ),
  ];
}

function transformMainNormal(normal, bounds) {
  const transformed = [
    normal[0] / (bounds.forward[1] - bounds.forward[0]),
    normal[1] / (bounds.up[1] - bounds.up[0]),
    normal[2] / (bounds.animalLeft[1] - bounds.animalLeft[0]),
  ];
  const length = Math.hypot(...transformed) || 1;
  return transformed.map((value) => value / length);
}

function geometryData(
  name,
  geometry,
  drawCount,
  positionTransform,
  normalTransform,
) {
  const positions = geometry.getAttribute("position");
  const normals = geometry.getAttribute("normal");
  const count = Math.min(drawCount ?? positions.count, positions.count);
  const vertices = new Array(count);
  const vertexNormals = new Array(count);
  for (let index = 0; index < count; index += 1) {
    vertices[index] = positionTransform([
      positions.getX(index),
      positions.getY(index),
      positions.getZ(index),
    ]);
    vertexNormals[index] = normalTransform([
      normals.getX(index),
      normals.getY(index),
      normals.getZ(index),
    ]);
  }

  const triangles = [];
  if (geometry.index) {
    for (let index = 0; index < geometry.index.count; index += 3) {
      triangles.push([
        geometry.index.getX(index),
        geometry.index.getX(index + 1),
        geometry.index.getX(index + 2),
      ]);
    }
  } else {
    for (let index = 0; index < count; index += 3) {
      triangles.push([index, index + 1, index + 2]);
    }
  }
  return { name, vertices, normals: vertexNormals, triangles };
}

function writeObj(parts) {
  writeFileSync(
    OBJ_PATH,
    [
      "# Purple Cougar visual hull v4\n",
      "# Offline Three.js MarchingCubes + tapered TubeGeometry tail\n",
      "mtllib purple-cougar-visual-hull-v4.mtl\n",
    ].join(""),
  );
  writeFileSync(
    path.join(OUTPUT, "purple-cougar-visual-hull-v4.mtl"),
    [
      "newmtl NeutralClay\n",
      "Ka 0.160 0.145 0.150\n",
      "Kd 0.710 0.640 0.660\n",
      "Ks 0.060 0.055 0.060\n",
      "Ns 18.0\n",
      "illum 2\n",
    ].join(""),
  );

  let vertexOffset = 0;
  let normalOffset = 0;
  const bounds = {
    minimum: [Infinity, Infinity, Infinity],
    maximum: [-Infinity, -Infinity, -Infinity],
  };
  let triangleCount = 0;

  for (const part of parts) {
    const lines = [`\no ${part.name}\n`, "usemtl NeutralClay\n"];
    for (const vertex of part.vertices) {
      lines.push(`v ${format(vertex[0])} ${format(vertex[1])} ${format(vertex[2])}\n`);
      for (let axis = 0; axis < 3; axis += 1) {
        bounds.minimum[axis] = Math.min(bounds.minimum[axis], vertex[axis]);
        bounds.maximum[axis] = Math.max(bounds.maximum[axis], vertex[axis]);
      }
    }
    for (const normal of part.normals) {
      lines.push(`vn ${format(normal[0])} ${format(normal[1])} ${format(normal[2])}\n`);
    }
    for (const triangle of part.triangles) {
      const refs = triangle.map((index) => {
        const vertex = vertexOffset + index + 1;
        const normal = normalOffset + index + 1;
        return `${vertex}//${normal}`;
      });
      lines.push(`f ${refs[0]} ${refs[1]} ${refs[2]}\n`);
    }
    appendFileSync(OBJ_PATH, lines.join(""));
    vertexOffset += part.vertices.length;
    normalOffset += part.normals.length;
    triangleCount += part.triangles.length;
  }
  return {
    bounds,
    vertices: vertexOffset,
    normals: normalOffset,
    triangles: triangleCount,
  };
}

function format(value) {
  return Number.isFinite(value) ? value.toFixed(7) : "0.0000000";
}

function main() {
  const manifest = JSON.parse(readFileSync(MANIFEST_PATH, "utf8"));
  const views = {};
  const distanceStart = performance.now();
  for (const definition of manifest.views) {
    const mask = createSignedDistance(
      loadPgm(path.join(OUTPUT, definition.file)),
    );
    views[definition.name] = {
      ...mask,
      centerU: definition.center_u,
      initialCenterU: definition.center_u,
      groundV: definition.ground_v,
      pixelsPerHeight: definition.pixels_per_height,
      projection: definition.projection_forward_left,
    };
  }
  const distanceTransformMs = performance.now() - distanceStart;
  const bounds = {
    forward: manifest.bounds.forward,
    animalLeft: manifest.bounds.animal_left,
    up: manifest.bounds.up,
  };
  const centerAdjustments = optimizeObliqueCenters(
    views,
    bounds,
    manifest.tail_cutoff_forward,
  );

  const effect = new MarchingCubes(
    RESOLUTION,
    undefined,
    false,
    false,
    MAX_POLYGONS,
  );
  effect.isolation = 0;
  const fillStart = performance.now();
  const fieldStats = fillMarchingField(
    effect,
    views,
    bounds,
    manifest.tail_cutoff_forward,
  );
  effect.blur(0.86);
  const fieldBuildMs = performance.now() - fillStart;
  const triangulationStart = performance.now();
  effect.update();
  const triangulationMs = performance.now() - triangulationStart;
  if (effect.count / 3 >= MAX_POLYGONS) {
    throw new Error("MarchingCubes reached its polygon buffer limit");
  }

  const identity = (value) => value;
  const assembly = createOrganicAssembly();
  const parts = [
    geometryData(
      "CougarTorsoVisualHull",
      effect.geometry,
      effect.count,
      (position) => transformMainPosition(position, bounds),
      (normal) => transformMainNormal(normal, bounds),
    ),
    ...assembly.map((part) =>
      geometryData(
        part.name,
        part.geometry,
        undefined,
        identity,
        identity,
      ),
    ),
  ];
  const objStats = writeObj(parts);
  const metrics = {
    prototype: "Purple Cougar visual hull v4 offline Node base",
    review_disposition: {
      status: "rejected-research-evidence",
      promotion_allowed: false,
      runtime_integration_allowed: false,
      reasons: [
        "stacked primitive assembly does not match the supplied cougar",
        "limbs remain stick-straight with disk-like paws",
        "shoulder and torso overlaps remain visibly disconnected",
        "head, ears, and muzzle read as generic primitives",
        "tail still reads as a separate hose at the root",
      ],
    },
    source_manifest: path.relative(PROJECT, MANIFEST_PATH),
    output_obj: path.relative(PROJECT, OBJ_PATH),
    method: {
      body: [
        "exact 2D Euclidean signed-distance transforms",
        "front/rear and left/right mirrored-pair averaging",
        "smooth minimum intersection with two opposite 45-degree pairs",
        "one scalar-field blur before Three.js MarchingCubes",
        "intersection limited to contiguous torso/chest/haunch core",
      ],
      assembly:
        "measured overlapping head, ear, four-limb, paw, haunch, and neck shells",
      tail: "separate continuously tapered Three.js TubeGeometry",
      excluded: [
        "ball",
        "tether",
        "cuff",
        "whiskers",
        "eyes",
        "muzzle detail geometry",
        "runtime materials",
        "rigging",
      ],
    },
    calibration: {
      oblique_center_adjustments_pixels: centerAdjustments,
      bounds,
      tail_cutoff_forward: manifest.tail_cutoff_forward,
    },
    field: {
      resolution: RESOLUTION,
      cells: effect.size3,
      positive_cells_before_blur: fieldStats.positive,
      scalar_range_before_blur: [fieldStats.minimum, fieldStats.maximum],
      signed_distance_transform_ms: round(distanceTransformMs),
      field_build_and_blur_ms: round(fieldBuildMs),
      triangulation_ms: round(triangulationMs),
    },
    geometry: {
      vertices: objStats.vertices,
      normals: objStats.normals,
      triangles: objStats.triangles,
      body_vertices: effect.count,
      body_triangles: effect.count / 3,
      assembly_triangles: parts
        .slice(1)
        .reduce((sum, part) => sum + part.triangles.length, 0),
      tail_triangles:
        parts.find((part) => part.name === "Tail_TaperedTube")?.triangles
          .length ?? 0,
      bounds_min_xyz: objStats.bounds.minimum,
      bounds_max_xyz: objStats.bounds.maximum,
      dimensions_xyz: objStats.bounds.maximum.map(
        (value, axis) => value - objStats.bounds.minimum[axis],
      ),
      obj_bytes: statSync(OBJ_PATH).size,
      topology: "triangle-soup torso plus indexed overlapping organic shells in OBJ",
      watertight_validation: "not run; tail intentionally remains a separate shell",
    },
    environment: {
      node: process.version,
      three_revision: REVISION,
    },
    masks: Object.fromEntries(
      manifest.views.map((view) => [
        view.name,
        {
          dimensions: [view.width, view.height],
          bounds: view.bounds,
          foreground_pixels: view.foreground_pixels,
        },
      ]),
    ),
  };
  writeFileSync(METRICS_PATH, `${JSON.stringify(metrics, null, 2)}\n`);
  console.log(JSON.stringify(metrics, null, 2));
  console.log(`Saved OBJ: ${OBJ_PATH}`);
  console.log(`Saved metrics: ${METRICS_PATH}`);
}

function round(value) {
  return Number(value.toFixed(3));
}

main();
