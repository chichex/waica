import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    // Every vi.spyOn/vi.fn is restored after each test, so no mock leaks
    // across tests (coding policies, node section: restore mocks).
    restoreMocks: true,
    // The example's src/components/* is the canonical "project code" the
    // toolkit exists for: it is an acceptance case, so it gets guarded too.
    include: [
      'packages/**/src/**/*.test.ts',
      'packages/**/src/**/*.test.tsx',
      'examples/**/src/**/*.test.ts',
    ],
  },
})
