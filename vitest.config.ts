import { defineConfig } from 'vitest/config'

export default defineConfig({
  // A checked-in .glb fixture is an asset a test imports with `?inline`.
  assetsInclude: ['**/*.glb'],
  // One three for the whole module graph (ADR 0027): addons such as GLTFLoader
  // import 'three', the engine draws with 'three/webgpu'. Only the bare
  // specifier is redirected; three/webgpu, three/tsl and three/addons/* stay.
  resolve: { alias: [{ find: /^three$/, replacement: 'three/webgpu' }] },
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
