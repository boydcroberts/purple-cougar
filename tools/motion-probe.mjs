/**
 * Proves that a region of the frame is actually animating.
 *
 * A screenshot cannot show motion, and "the shader compiled" is not evidence
 * that anything moved. This grabs two frames a fixed interval apart and reports
 * the mean per-pixel delta inside each named region, so a claim like "the
 * waterfall flows now" is backed by a number instead of a vibe.
 *
 *   node tools/motion-probe.mjs [gapSeconds]
 */
import { chromium } from 'playwright-core'
import { mkdir, writeFile } from 'node:fs/promises'

const OUT = '/Users/boydroberts/agents/screenshots/purple-cougar'
const URL = process.env.PC_URL ?? 'http://localhost:5183'
const W = Number(process.env.W ?? 1280)
const H = Number(process.env.H ?? 800)
const GAP = Number(process.argv[2] ?? 1.2)

// Fractions of the viewport, matched to the plate regions in livingPlate.ts.
const REGIONS = {
  upperFalls: [0.66, 0.02, 0.74, 0.2],
  lowerFalls: [0.56, 0.3, 0.66, 0.52],
  lake: [0.04, 0.42, 0.3, 0.55],
  sky: [0.24, 0.04, 0.52, 0.26],
  cougar: [0.33, 0.3, 0.53, 0.72],
  stonePath: [0.42, 0.85, 0.62, 0.98],
}

await mkdir(OUT, { recursive: true })
const browser = await chromium.launch({ headless: true, args: ['--use-angle=metal'] })
const page = await browser.newPage({ viewport: { width: W, height: H } })
page.on('pageerror', (e) => console.error('[pageerror]', e.message))
page.on('console', (m) => {
  if (m.type() === 'error') console.error('[err]', m.text())
})
await page.goto(URL)
await page.waitForFunction(() => Boolean(window.__pc))
await page.waitForTimeout(3500)

const first = await page.screenshot()
await page.waitForTimeout(GAP * 1000)
const second = await page.screenshot()
await writeFile(`${OUT}/motion-a.png`, first)
await writeFile(`${OUT}/motion-b.png`, second)
await browser.close()

// Decode both PNGs in a throwaway browser page; no image library needed.
const decoder = await chromium.launch({ headless: true, args: ['--use-angle=metal'] })
const tab = await decoder.newPage()
const deltas = await tab.evaluate(
  async ({ a, b, regions, width, height }) => {
    const load = (bytes) =>
      new Promise((resolve) => {
        const blob = new Blob([new Uint8Array(bytes)], { type: 'image/png' })
        const img = new Image()
        img.onload = () => resolve(img)
        img.src = URL.createObjectURL(blob)
      })
    const draw = async (bytes) => {
      const img = await load(bytes)
      const canvas = new OffscreenCanvas(width, height)
      const ctx = canvas.getContext('2d')
      ctx.drawImage(img, 0, 0)
      return ctx.getImageData(0, 0, width, height).data
    }
    const pa = await draw(a)
    const pb = await draw(b)
    const out = {}
    for (const [name, box] of Object.entries(regions)) {
      const x0 = Math.floor(box[0] * width)
      const y0 = Math.floor(box[1] * height)
      const x1 = Math.floor(box[2] * width)
      const y1 = Math.floor(box[3] * height)
      let total = 0
      let count = 0
      let peak = 0
      for (let y = y0; y < y1; y++) {
        for (let x = x0; x < x1; x++) {
          const i = (y * width + x) * 4
          const d =
            Math.abs(pa[i] - pb[i]) +
            Math.abs(pa[i + 1] - pb[i + 1]) +
            Math.abs(pa[i + 2] - pb[i + 2])
          total += d
          if (d > peak) peak = d
          count++
        }
      }
      out[name] = { mean: total / count / 3, peak: peak / 3 }
    }
    return out
  },
  {
    a: Array.from(first),
    b: Array.from(second),
    regions: REGIONS,
    width: W,
    height: H,
  },
)
await decoder.close()

console.log(`gap ${GAP}s — mean per-pixel delta (0-255)`)
for (const [name, value] of Object.entries(deltas)) {
  console.log(`  ${name.padEnd(12)} mean ${value.mean.toFixed(3)}  peak ${value.peak.toFixed(1)}`)
}
