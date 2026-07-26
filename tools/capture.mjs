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
 *   reset:1         reload the page and wait for the QA hook (clears all state)
 *   wait:<seconds>  let the real frame loop run
 *   tap:<n>         tap n times, spaced by the current skip duration
 *   fling:<x>,<y>   NOT comma-safe; use flingx:<x> then flingy:<y> then fling:1
 *   step:<n>        advance n fixed physics steps without rendering time
 *   eval:<expr>     evaluate and log
 *   shot:<name>     write <prefix>-<name>.png
 *   angle:<deg>     orbit the camera azimuth to <deg> for the next shots
 */
import { chromium } from 'playwright-core'
import { mkdir } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'

const OUT = join(homedir(), 'agents', 'screenshots', 'purple-cougar')
const URL = process.env.PC_URL ?? 'http://localhost:5183'

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
      await page.evaluate(
        ([x, y]) => window.__pc.fling(x, y),
        [flingX, flingY],
      )
      break
    case 'step':
      await page.evaluate((n) => {
        for (let i = 0; i < n; i++) window.__pc.stepPhysics()
      }, Number(arg))
      break
    case 'angle':
      await page.evaluate((d) => window.__pc.setCameraAzimuth?.(d), Number(arg))
      break
    case 'eval':
      console.log(arg, '=>', JSON.stringify(await page.evaluate(arg)))
      break
    case 'shot': {
      const path = join(OUT, `${prefix}-${arg}.png`)
      await page.screenshot({ path })
      console.log('wrote', path)
      break
    }
    default:
      console.warn('unknown command:', raw)
  }
}

await browser.close()
