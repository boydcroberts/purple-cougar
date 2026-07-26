import { defineConfig } from 'vitest/config'

export default defineConfig({
  server: { host: true, port: 5183 },
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts'],
  },
})
