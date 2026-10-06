# Grill — #140 Migrate rendering to WebGPURenderer
<!-- Estado: finalized. Proyecto: /Users/ayrtonmarini/workspace/waica. Fuente: #140. -->
<!-- SDD-Tracking: version=1; type=grill; state=finalized; issue=#140; grill=2026-10-03-issue-140-webgpu-renderer; project=%2FUsers%2Fayrtonmarini%2Fworkspace%2Fwaica -->

## Modo
domain-modeling

## Hechos comprobados
- Today `Game` builds a synchronous `THREE.WebGLRenderer({ canvas, antialias: true })` (`packages/engine/src/game.ts:240`).
- In three 0.186.1, `WebGPURenderer.render()` throws before `await renderer.init()` (`three/src/renderers/common/Renderer.js:1498-1500`).
- `WebGPURenderer` ships its own WebGL2 fallback, `WebGLBackend`, via `getFallback` (`three/src/renderers/webgpu/WebGPURenderer.js:59-69`).
- `MeshBasicMaterial` maps to `MeshBasicNodeMaterial` automatically (`StandardNodeLibrary.js:68`): Sprite, AnimatedSprite, Tilemap and particle materials need no rewrite.
- The only custom shader is the Sprite Batch instance transform, injected with `onBeforeCompile` (`packages/engine/src/sprite-batch.ts:47-83`); node materials ignore `onBeforeCompile`, so it must move to TSL.
- `@waica/engine` re-exports `export * as THREE from 'three'` (`packages/engine/src/index.ts:216`); 17 non-test engine files and 1 bench file import `three`.
- About 50 test files mock `WebGLRenderer` through `vi.mock('three')` (e.g. `packages/engine/src/game.test.ts:4-16`).
- The bench counts draws and GPU-syncs with WebGL `readPixels` and probes a WebGL2 context (`packages/bench/src/draw-counter.ts:72-85`, `packages/bench/src/page/renderer-probe.ts:7-12`).
- Must keep working: letterbox viewport/scissor (`game.ts:831-855`), MCP screenshots as a Playwright `page.screenshot` of the canvas (`packages/mcp/src/runtime-browser.ts:353-391`), editor edit-mode overlays drawn from `game.onUpdate` with `simulate = false` (`game.ts:596-600`), Sprite Batch on/off pixel parity at zero tolerance in `pnpm test:e2e`.

## Decisiones resueltas
1. **A1 Backend:** WebGPU when the browser offers it, otherwise `WebGPURenderer`'s WebGL2 fallback.
2. **A2 One path:** `WebGLRenderer` is removed; no classic opt-out.
3. **D1 THREE:** `@waica/engine` re-exports `three/webgpu`; the engine and the bench import from it so a bundle never holds two copies of three.
4. **F1 Version:** minor 0.24.0 with a migration note (async startup; `THREE` from the webgpu build, without `WebGLRenderer` or `ShaderMaterial`).
5. **B1 Startup:** `new Game(...)` stays synchronous and gains `game.ready(): Promise<void>`, resolved once the renderer is initialized. Frames before that simulate but draw nothing. Examples, the project template and the editor await `ready()` before their first frame.
6. **B2 Failure:** when no backend initializes, `ready()` rejects with an error that names both backends.
7. **B4 Selection:** no public backend option; the browser decides (the e2e legs choose through Chrome flags).
8. **B3 Bridge:** a Run Session waits for `game.ready()` before it is operational; the Runtime Snapshot / metadata expose `backend: 'webgpu' | 'webgl2'`.
9. **C1 Parity:** screenshots of the three demos before and after, compared with a bounded per-pixel tolerance; Sprite Batch on/off parity stays at zero tolerance inside the new renderer.
10. **C2 E2E:** `pnpm test:e2e` runs two explicit legs, WebGL2 and WebGPU; a WebGPU leg that does not get WebGPU is a failure, never a skip.
11. **E1 Bench:** draw counts from `renderer.info`, GPU sync per backend, backend recorded per result, baselines regenerated on chichex-linux.

## Ramas pendientes
None in scope.

## Handoff
**Topic and scope.** Replace `THREE.WebGLRenderer` with `WebGPURenderer` (`three/webgpu`) keeping the same rendered output and API, except startup and the re-exported `THREE`. Prerequisite of #78 (lighting and post-processing), whose grill is paused at `.sdd/grills/2026-10-03-issue-78-lighting-post.md`.

**Decisions.** The eleven above.

**Constraints and non-goals.**
- No lighting, render targets or post-processing (that is #78).
- No change to Sprite Batch semantics (ADR 0024), letterboxing, or the HTML Camera Effects (ADR 0020).
- No public option to force a backend.

**Assumptions.**
- Headless Chrome on `ubuntu-latest` can expose WebGPU with flags and SwiftShader/Vulkan. [inference: depends on the runner's Chrome build; the spec must verify it with a `navigator.gpu.requestAdapter()` probe in CI before committing to decision 10]
- `page.screenshot` captures a presented WebGPU canvas after a step. [inference: the canvas is composited like any other; verified by the e2e]

**Risks and deferred questions.**
- If CI cannot get WebGPU, decision 10 has to be revisited.
- `three/webgpu` bundle size: watch the existing >500 kB warning.
- The exact tolerance of decision 9 is set by the spec from measured data.
- Replacing ~50 `vi.mock('three')` with a shared renderer fake is an implementation detail.
- Async init under the editor's StrictMode double mount needs cleanup (`viewport-strict-mode.test.tsx` exists).

**Context for the spec.** `game.ts` (constructor, `renderSurface`, `resize`), `sprite-batch.ts`, `sprite-batches.ts`, `index.ts`, `runtime-bridge.ts`, `runtime-inspection.ts`, `packages/mcp/src/runtime-browser.ts`, `scripts/runtime-e2e.mjs`, `packages/bench/src/*`, `examples/*/src/main.ts`, `packages/editor/template/src/main.ts`, `packages/editor/src/editor/Viewport.tsx`; ADRs 0019, 0020, 0024; the **Render Backend** term in `CONTEXT.md`.
