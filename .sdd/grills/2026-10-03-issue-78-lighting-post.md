# Grill — #78 2D lighting and post-processing
<!-- Estado: finalized. Proyecto: /Users/ayrtonmarini/workspace/waica. Fuente: #78. -->
<!-- SDD-Tracking: version=1; type=grill; state=finalized; issue=#78; grill=2026-10-03-issue-78-lighting-post; project=%2FUsers%2Fayrtonmarini%2Fworkspace%2Fwaica -->

## Modo
domain-modeling

## Hechos comprobados
(Re-verified 2026-10-06 after #140 merged in `b61566b`; v0.24.0.)
- Sprite, Tilemap, AnimatedSprite and particles still build `MeshBasicMaterial`, mapped by three to `MeshBasicNodeMaterial` (`components/sprite.ts:143`, `components/tilemap.ts:295`, `particle-batch.ts:83`, `components/animated-sprite.ts:195`). The Sprite Batch material is TSL: `SpriteBatchMaterial extends MeshBasicNodeMaterial` (`sprite-batch.ts:70`).
- The renderer draws straight into the 8-bit canvas, each material encoding sRGB itself, so alpha blending happens on sRGB values; a render target keeps the linear working space (`render-output.ts:13-26`, `drawStraightToCanvas`).
- `renderSurface()` draws directly through `spriteBatches.drawFrame(..., renderer.render)` with letterbox scissor (`game.ts:706-739`, `game.ts:843-853`). No render target, no internal-resolution buffer; `resolution` sets aspect/letterbox only.
- Fade and Flash are HTML layers over the canvas (ADR 0020); MCP screenshots are `page.screenshot` of the canvas (`packages/mcp/src/runtime-browser.ts:324`).
- `SceneRenderJson` holds `sort`, `projection`, `batch` (`scene.ts:35-53`).
- The bench counts draws with `renderer.info.render.drawCalls` on both backends (`packages/bench/src/draw-counter.ts:50-52`).
- ADR 0025: #78 builds on node materials and three's render pipeline, not `EffectComposer`.
- Tilemap declares `solidTiles` and turns each into a `Solid` AABB of `cellSize` in logical space; `sceneSolids(game)` gathers every Solid in the scene (`components/tilemap.ts:175-403`, `scene-solids.ts:24`).
- `pnpm test:e2e` holds Sprite Batch on/off pixel parity at zero tolerance on both backends.

## Decisiones resueltas
1. **A1 Scope:** lights, Ambient Light, Emissive, solid-tile occlusion and two Post Effects, all in #78. (Revised: was a single post pass.)
2. **A2 WebGPU:** migrate first (#140, landed in `b61566b`).
3. **B1 Technique:** a light-map in a render target, multiplied over the scene; materials and the Sprite Batch are not touched for lighting.
4. **B4 Off path:** a scene without lights and without post draws straight to the canvas exactly as in 0.24.
5. **B2 Light-map resolution:** the internal `resolution` with nearest upscale; without `resolution`, the canvas size.
6. **B3 Receivers:** everything drawn is lit; a sprite or a particle emitter marked `emissive` is drawn after the light-map at full brightness.
7. **C2 Ambient:** `render.lighting.ambient` in the scene JSON as starting value plus a tweenable runtime API (day/night); dies with its scene.
8. **B5 Composition:** scene straight to the canvas, then the light-map as a multiply-blended quad, then emissives. Ambient 1.0 with no lights gives the unlit pixels. A scene render target exists only when a Post Effect is on.
9. **C1 Falloff:** smooth by default, optional `bands: N`.
10. **C3 Isometric radius:** logical world space, shown as a 2:1 ellipse.
11. **C4 Occlusion:** solid tiles block light.
12. **C5 Occluders:** only Tilemap `solidTiles`; props with a Solid cast no shadow.
13. **C6 Shadow edge:** configurable per light — hard by default, optional soft (`softness`). (Interpreted from the user's "tenerlo diferente".)
14. **C7 Occluder face:** the occluding tile receives the light that reaches it; the shadow starts behind it.
15. **E1 Post:** vignette (intensity, radius) and color grading (tint, contrast, saturation), both off by default.
16. **D1 Snapshot:** the Runtime Snapshot exposes the current ambient, every light (entity, position, radius, color, intensity, shadow) and the active Post Effects.
17. **D2 Editor:** Light and the scene lighting fields are inspector-editable; the edit-mode viewport shows real lighting plus a radius gizmo per light.
18. **D3 Demo and e2e:** a new dark dungeon scene in the isometric demo (torches, walls, an emissive flame); screenshots on both backends compared with a bounded tolerance; existing scenes keep zero-tolerance parity.

## Ramas pendientes
None in scope.

## Handoff
**Topic and scope.** One delivery: 2D Lights, per-scene Ambient Light, Emissive drawables, solid-tile occlusion and two Post Effects (vignette, color grading), on `WebGPURenderer` + TSL.

**Decisions.** The eighteen above.

**Constraints and non-goals.**
- No existing scene changes (B4).
- No change to Sprite Batch semantics (ADR 0024), the HTML Camera Effects (ADR 0020) or letterboxing.
- No bloom. Props and moving entities cast no shadow. No `EffectComposer` (ADR 0025).

**Assumptions (approved with the contract).**
- E2: post runs at the same internal resolution as the light-map (follows B2).
- C8: no light count limit; cost is measured by a new lights + occlusion bench scenario (D4), baselines regenerated on chichex-linux.
- Multiply over the sRGB canvas gives acceptable darkening. [inference: the multiply happens on sRGB, not linear, values; D3 screenshots confirm]
- Fade and Flash stay above lighting and post because they are HTML. [inference: ADR 0020]

**Risks and deferred questions.**
- Occlusion cost per light per frame; measure on SwiftShader (worst case).
- Soft shadows at internal resolution look blocky; expected under B2.
- The D3 tolerance is set by the spec from measured data.
- Prop and dynamic occlusion are a follow-up.

**Context for the spec.** `game.ts` (`renderSurface`, `resize`), `render-output.ts`, `sprite-batches.ts`, `particle-batch.ts`, `components/tilemap.ts`, `scene-solids.ts`, `scene.ts`, `projection.ts`, `runtime-inspection.ts`, `camera-effects.ts`, the editor viewport, `scripts/runtime-e2e.mjs`, `packages/bench/src/sweep.ts`; ADRs 0009, 0020, 0024, 0025; the terms **Light**, **Ambient Light**, **Emissive**, **Post Effect** in `CONTEXT.md`.
