# Grill — #78 2D lighting and post-processing
<!-- Estado: paused. Proyecto: /Users/ayrtonmarini/workspace/waica. Fuente: #78. -->
<!-- SDD-Tracking: version=1; type=grill; state=paused; issue=#78; grill=2026-10-03-issue-78-lighting-post; project=%2FUsers%2Fayrtonmarini%2Fworkspace%2Fwaica -->

## Modo
domain-modeling

## Hechos comprobados
- Every drawable is unlit `MeshBasicMaterial`: `sprite-batch.ts:81`, `components/sprite.ts:143`, `components/tilemap.ts:295`, `particle-batch.ts:83`, `components/animated-sprite.ts:195`.
- The Sprite Batch instance shader is injected with `onBeforeCompile` (`sprite-batch.ts:83`). `WebGPURenderer` node materials do not honor `onBeforeCompile` (no reference in `three@0.186.1` `renderers/common` or `NodeMaterial`).
- The game renders at canvas resolution (`antialias: true`, pixel ratio up to 2, `setSize` to the CSS size); `resolution` only sets aspect, letterbox viewport/scissor and shake snapping (`game.ts:240-241`, `game.ts:831-845`). There is no internal-resolution buffer.
- No render target exists; `renderSurface()` renders straight to the canvas through `spriteBatches.drawFrame` (`game.ts:700-730`).
- Fade and Flash are HTML layers over the canvas at z 9001 (`camera-effects.ts:111-163`, ADR 0020); lighting would not affect them.
- MCP screenshots are a Playwright `page.screenshot` clipped to the canvas rect (`packages/mcp/src/runtime-browser.ts:353-391`).
- Scene render options live in `SceneRenderJson` (`sort`, `projection`, `batch`; `scene.ts:35-53`).
- The bench counts draws and GPU-syncs with WebGL `readPixels` (`packages/bench/src/draw-counter.ts:72-85`).
- three 0.186.1 ships `PostProcessing` / `RenderPipeline` for the WebGPU path.
- `pnpm test:e2e` holds Sprite Batch pixel parity at zero tolerance across the three demos.

## Decisiones resueltas
1. **A1 Scope:** 2D lights plus a minimal post-processing hook (a single pass) in this delivery.
2. **A2 WebGPU:** migrate to `WebGPURenderer` first. The user chose to do the migration before #78; #78 is blocked by #140 (Migrate rendering to WebGPURenderer) and this grill resumes assuming WebGPU + TSL.
3. **B1 Technique:** a light-map in a render target, multiplied over the scene; materials and the Sprite Batch are not touched for lighting.

## Ramas pendientes
- B2: light-map resolution (internal `resolution` with nearest upscale vs canvas).
- B3: what receives light (particles, emissive sprites).
- C1: light component (falloff smooth vs banded). C2: per-scene ambient (scene JSON + runtime control, day/night). C3: isometric radius shape. C4: shadows/occlusion (likely non-goal).
- D1: Runtime Snapshot. D2: editor. D3: demo and e2e verification. D4: bench scenario.
- E1: which single post pass (vignette recommended). E2: post resolution.
- Revisit after the WebGPU migration lands: any fact above about materials, render pipeline or bench may change.

## Handoff
