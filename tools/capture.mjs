#!/usr/bin/env node
/**
 * Screenshot QA harness.
 *
 * Launches its OWN headless Chrome rather than reusing a shared playwright-mcp
 * profile, which locks when another session holds the browser. Never kill the
 * other session's Chrome — use this instead.
 *
 * Usage:
 *   node tools/capture.mjs <prefix> "reset:1,wait:0.5,shot:idle"
 *
 * Commands, comma separated, run in order:
 *   reset:1         reload the page and re-wait for the QA hook. This clears
 *                   in-memory game state only. The lifetime counter is
 *                   deliberately persisted in localStorage (src/counter.ts)
 *                   and survives a reset — do not expect it to zero out.
 *   wait:<seconds>  let the real frame loop run
 *   tap:<n>         tap n times, spaced 500ms apart (hardcoded here, not the
 *                   real skip-ball timing)
 *   fling:<x>,<y>   NOT comma-safe; use flingx:<x> then flingy:<y> then fling:1
 *   step:<n>        advance n fixed physics steps without rendering time
 *   eval:<expr>     evaluate and log
 *   shot:<name>     write <prefix>-<name>.png; prints a loud warning if the
 *                   file is implausibly small for a rendered scene (see
 *                   SIZE_FLOOR_BYTES below)
 *   angle:<deg>     orbit the camera azimuth to <deg> for the next shots
 *
 * `fling`, `step`, and `angle` drive window.__pc.fling / .stepPhysics /
 * .setCameraAzimuth, which Task 8 adds — they do not exist yet. Until then,
 * every one of those three commands fails LOUDLY through callHook() below: a
 * diagnostic naming the missing hook and the task that adds it, then a
 * nonzero exit. None of them silently no-op and none of them throw a raw,
 * unlabeled TypeError — a downstream user must never end up holding a
 * screenshot that looks fine but was taken at the wrong camera angle, or
 * with physics that silently never advanced.
 */
import { chromium } from 'playwright-core'
import { mkdir, stat } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'

const OUT = join(homedir(), 'agents', 'screenshots', 'purple-cougar')
const URL = process.env.PC_URL ?? 'http://localhost:5183'

// A blank/solid-colour 1280x900 frame (what a failed WebGL render or the
// SwiftShader software fallback produces) compresses to ~5.3KB — measured
// directly by screenshotting solid black/sky-blue/white pages at this same
// viewport. Real rendered scenes from this app measured 21.7KB-56.3KB across
// several poses. 10,000 bytes sits well below every real sample and well
// above the blank baseline, so it catches the failure this tool exists to
// catch without flagging legitimate frames.
const SIZE_FLOOR_BYTES = 10_000

const [prefix = 'shot', script = 'wait:1,shot:default'] = process.argv.slice(2)

await mkdir(OUT, { recursive: true })

const browser = await chromium.launch({
  headless: true,
  args: ['--use-angle=metal'],
})
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
page.on('console', (m) => {
  if (m.type() === 'error') console.error('[console.error]', m.text())
})
page.on('pageerror', (e) => console.error('[pageerror]', e.message))

async function boot() {
  await page.goto(URL)
  await page.waitForFunction(() => Boolean(window.__pc))
  await page.waitForTimeout(400)
}

await boot()

/**
 * Single choke point for every QA hook that a later task might not have
 * added yet. Checks window.__pc[name] is a function before calling it; on a
 * miss, prints a diagnostic naming the missing hook and which task adds it,
 * then exits nonzero. This is the only way fling/step/angle should ever
 * touch window.__pc — never call those hooks directly elsewhere below.
 */
async function callHook(name, dueTask, invoke) {
  const exists = await page.evaluate(
    (n) => typeof window.__pc[n] === 'function',
    name,
  )
  if (!exists) {
    console.error(
      `[capture] window.__pc.${name}() does not exist yet — ${dueTask} adds it. ` +
        'Refusing to continue: a screenshot taken without it would look ' +
        'plausible but not be what was asked for.',
    )
    await browser.close()
    process.exit(1)
  }
  await invoke()
}

let flingX = 0
let flingY = 0

for (const raw of script.split(',')) {
  const [cmd, arg = ''] = raw.trim().split(':')
  switch (cmd) {
    case 'reset':
      await boot()
      break
    case 'wait':
      await page.waitForTimeout(Number(arg) * 1000)
      break
    case 'tap': {
      const n = Number(arg)
      for (let i = 0; i < n; i++) {
        await page.evaluate(() => window.__pc.tap())
        await page.waitForTimeout(500)
      }
      break
    }
    case 'flingx':
      flingX = Number(arg)
      break
    case 'flingy':
      flingY = Number(arg)
      break
    case 'fling':
      await callHook('fling', 'Task 8 (ball view, wiring, and fling)', () =>
        page.evaluate(
          ([x, y]) => window.__pc.fling(x, y),
          [flingX, flingY],
        ),
      )
      break
    case 'step':
      await callHook('stepPhysics', 'Task 8 (ball view, wiring, and fling)', () =>
        page.evaluate((n) => {
          for (let i = 0; i < n; i++) window.__pc.stepPhysics()
        }, Number(arg)),
      )
      break
    case 'angle':
      await callHook(
        'setCameraAzimuth',
        'Task 8 (ball view, wiring, and fling)',
        () => page.evaluate((d) => window.__pc.setCameraAzimuth(d), Number(arg)),
      )
      break
    case 'eval':
      console.log(arg, '=>', JSON.stringify(await page.evaluate(arg)))
      break
    case 'shot': {
      const path = join(OUT, `${prefix}-${arg}.png`)
      await page.screenshot({ path })
      const { size } = await stat(path)
      console.log('wrote', path, `(${size} bytes)`)
      if (size < SIZE_FLOOR_BYTES) {
        console.error(
          `[capture] SIZE WARNING: ${path} is only ${size} bytes, below the ` +
            `${SIZE_FLOOR_BYTES}-byte floor for a plausible rendered scene. ` +
            'A blank or solid-colour frame at this viewport compresses to ' +
            '~5.3KB; real scenes here run 20KB+. This usually means WebGL ' +
            'fell back to SwiftShader software rendering (check for ' +
            '--use-angle=metal) or the page rendered blank/black. Open the ' +
            'file and look before trusting it.',
        )
      }
      break
    }
    default:
      console.warn('unknown command:', raw)
  }
}

await browser.close()
