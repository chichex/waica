import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    // The example's src/components/* is the canonical "project code" the
    // toolkit exists for: it is an acceptance case, so it gets guarded too.
    include: ['packages/**/src/**/*.test.ts', 'examples/**/src/**/*.test.ts'],
  },
})
