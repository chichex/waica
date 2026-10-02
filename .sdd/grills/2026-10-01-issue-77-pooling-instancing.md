# Grill — #77 entity pooling, shared materials, sprite instancing and culling
<!-- Estado: finalized. Proyecto: /Users/ayrtonmarini/workspace/waica. Fuente: issue #77. -->
<!-- SDD-Tracking: version=1; type=grill; state=finalized; issue=#77; grill=2026-10-01-issue-77-pooling-instancing; project=%2FUsers%2Fayrtonmarini%2Fworkspace%2Fwaica -->

## Modo
domain-modeling

## Hechos comprobados
- Every `Sprite`/`AnimatedSprite` builds its own material, geometry and mesh in `onReady`; textures come from the `game.assets` cache as a per-sprite clone (`packages/engine/src/components/sprite.ts:121-138`, `animated-sprite.ts:181-182`).
- Both use `MeshBasicMaterial({ transparent: true })` with three's defaults; draw order is per-object z: `layer` × 0.01 bands plus y-sort (`render-sort.ts:54-78`). Per sprite vary: size, offset, anchor, layer, color; `AnimatedSprite` adds frame and `flipX` (`sprite.ts:30-109`, `animated-sprite.ts:132-136`).
- No consumer outside the engine touches sprite meshes (editor, MCP, behaviors: grep empty); pointer picking computes boxes from component data, not meshes (`pointer.ts:52-75,207-217`).
- Draw-call frustum culling already exists (three `frustumCulled`, untouched by sprites). `static transient` excludes runtime fields from authoring defaults; it is not a reset list (`authoring-defaults.ts:21-50`).
- Scene render options live in `SceneRenderJson` (`scene.ts:36-44`) and the editor's `SceneInspector` render toggles (`packages/editor/src/editor/inspector/SceneInspector.tsx:6-30`).
- Benchmark (`packages/bench`, #133/#135) on `chichex-linux`, which renders with SwiftShader (software): one draw call and one material per sprite, one uploaded texture. Over the 16.6 ms budget at static 5000 (p95 47 ms), churn 200/step (63 ms, 218 GC pauses / 426 ms in the loop), animated 2000 (19.7 ms); static 1000 13.4 ms; churn 50/step borderline (15.7–17.4 ms).

## Decisiones resueltas
1. **Measurement first.** Done: the benchmark is on `main` (#133, #135).
2. **Delivery: one spec, one PR** (re-confirmed in 7).
3. **Pool GPU resources, not `Entity`.** `destroy()` stays final; no zombie references.
4. **Culling is render-only.** Simulation never depends on the camera.
5. **Scope:** Sprite instancing, shared materials, resource pool for churn. Culling is out.
6. **Success:** deterministic gate = bench counters (`drawCalls` and `materials` drop to the order of batches, e.g. `static-sprites-5000` 5000 → ~1 draw; churn `materialsCreated` stops growing per spawn); informational target = `static-sprites-5000` and `animated-sprites-2000` within 16.6 ms on `chichex-linux`.
7. **One spec, one PR**, accepting a large PR.
8. **Automatic instancing by key:** texture + `pixelArt` + `shape` (+ sheet for animated). No configuration.
9. **Automatic shared materials with copy-on-write.** Color travels per instance, so a sprite only moves entries when its key changes (e.g. a failed texture moves it to the untextured run).
10. **`AnimatedSprite` is in:** frame (UV offset/scale) and `flipX` per instance, via an instance attribute and shader.
11. **Draw order: order-preserving runs.** Every frame everything is ordered by z as today and consecutive same-key runs form a batch with its own `renderOrder`; the picture is identical to today's. Gain depends on how interleaved the scene is.
12. **Pool: reusable slots per batch.** Each batch's instance buffer grows geometrically, reuses freed slots (free-list), never shrinks during the scene and is released at `unloadScene` (ADR 0011). Spawn/destroy allocate no GPU resources.
13. **Per-scene escape hatch:** scene JSON `render.batch: false` returns to the current path (one mesh per sprite). It must be explained well: `SceneRenderJson` doc comment (`scene.ts:36-44`); a section in `packages/engine/README.md` (what it does, when to use it — visual regression, debugging —, what it costs, default `true`); a toggle with help text in the editor's `SceneInspector` next to y-sort (`SceneInspector.tsx:6-30`).

## Ramas pendientes
None in scope. Deferred: buffer shrinking, `Entity` pooling, a batched Tilemap variant.

## Handoff
**Topic and scope.** Reduce render and spawn cost of `Sprite` and `AnimatedSprite`, guided by `packages/bench`: shared materials, automatic instancing in order-preserving runs, reusable instance slots. Culling out.

**Constraints and non-goals.** No `Entity`/component pooling (that JS garbage stays). Culling, Tilemap and particles untouched. Simulation and Run Session determinism unchanged. No new public API besides `render.batch`. Pointer picking unchanged.

**Explicit assumptions.** The old per-sprite path is kept (the escape hatch needs it). Reactive props the inspector edits today (size, color, offset) update their instance live. Per-frame instance matrix sync is O(N) CPU and expected far cheaper than N draw calls.

**Risks and deferred questions.** PR size (decision 7) spans components, render, shader and lifecycle. Visual regression: decision 11 promises equivalence, so the spec needs screenshot equality with and without batching on the e2e scenes. Highly interleaved scenes (isometric, many textures) gain little. SwiftShader understates the real GPU benefit.

**Domain.** `CONTEXT.md` gains **Sprite Batch**.

**Recommended context for the spec.** This handoff; `packages/bench` and its baselines on `main`; `render-sort.ts`, `components/sprite.ts`, `components/animated-sprite.ts`, `particle-batch.ts` (batch + `YSortBatchParticipant` precedent); ADRs 0011, 0019, 0021, 0022. Verification: Vitest for keys, runs and free-list; `bench:remote --check` with the new counters; `test:e2e` screenshots equal with and without batching.
