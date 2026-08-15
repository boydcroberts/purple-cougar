import { defineConfig } from 'vitest/config'

export default defineConfig(({ mode }) => ({
  // GitHub Pages hosts project sites below /<repository>/.
  base: mode === 'github-pages' ? '/purple-cougar/' : '/',
  server: { host: true, port: 5183 },
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts'],
  },
}))
