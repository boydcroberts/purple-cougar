import { defineConfig, devices } from '@playwright/test'

// Without --use-angle=metal, headless Chromium on darwin silently falls back to
// SwiftShader at ~3fps and every rAF-driven wait times out.
const darwinGpuArgs = process.platform === 'darwin' ? ['--use-angle=metal'] : []

export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  fullyParallel: true,
  use: {
    baseURL: 'http://localhost:5183',
    ...devices['Desktop Chrome'],
    launchOptions: { args: darwinGpuArgs },
  },
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:5183',
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
})
