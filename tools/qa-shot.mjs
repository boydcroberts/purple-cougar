import { chromium } from 'playwright-core'
import { mkdir } from 'node:fs/promises'
const OUT = '/Users/boydroberts/agents/screenshots/purple-cougar'
const URL = process.env.PC_URL ?? 'http://localhost:5184'
const W = Number(process.env.W ?? 1280), H = Number(process.env.H ?? 800)
const PREFIX = process.argv[2] ?? 'shot'
await mkdir(OUT, { recursive: true })
const browser = await chromium.launch({ headless: true, args: ['--use-angle=metal'] })
const page = await browser.newPage({ viewport: { width: W, height: H } })
page.on('pageerror', e => console.error('[pageerror]', e.message))
page.on('console', m => { if (m.type() === 'error') console.error('[err]', m.text()) })
await page.goto(URL)
await page.waitForFunction(() => Boolean(window.__pc))
await page.waitForTimeout(3500)
await page.screenshot({ path: `${OUT}/${PREFIX}-idle.png` })
console.log('hooks', await page.evaluate(() => Object.keys(window.__pc)))
console.log('cam', await page.evaluate(() => window.__pc.cameraPos?.()))
console.log('phase', await page.evaluate(() => window.__pc.phase?.()))
// tap the cougar -> roar
await page.evaluate(() => window.__pc.roar?.())
await page.waitForTimeout(600)
await page.screenshot({ path: `${OUT}/${PREFIX}-roar.png` })
// fling the ball
try { await page.evaluate(() => window.__pc.fling(2.2, 3.4)) } catch (e) { console.log('fling err', e.message) }
await page.waitForTimeout(700)
await page.screenshot({ path: `${OUT}/${PREFIX}-fling.png` })
// squirrel
try { await page.evaluate(() => window.__pc.squirrelDash()) } catch (e) { console.log('sq err', e.message) }
await page.waitForTimeout(700)
await page.screenshot({ path: `${OUT}/${PREFIX}-squirrel.png` })
await page.waitForTimeout(700)
await page.screenshot({ path: `${OUT}/${PREFIX}-squirrel2.png` })
await browser.close()
