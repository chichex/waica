# Spec — Point-and-click for the grid player role (isometric factory-default, topdown opt-in)
<!-- Generada por /sdd-spec el 2026-08-30. Fuente: grill 2026-08-30-point-and-click-grid-role. Estado: implementada -->
<!-- SDD-Tracking: version=1; type=spec; state=implemented; issue=none; grill=2026-08-30-point-and-click-grid-role; superseded-by=none -->

## Contexto
The engine's `Input` is keyboard-only (`packages/engine/src/input.ts` listens for `KeyboardEvent.code` on `window`; `TODO(H1): gamepad and touch`), yet grid movement is already input-agnostic: `GridMotor.run(inputX, inputY, dt)` (shared by `IsoMotor`/`TopDownMotor`) takes a screen-space vector and derives acceleration, facing, collision and the `move/stop` signals from it (`packages/behaviors/src/{grid-motor,grid-player-role}.ts`). Screen→logical conversion exists only in the editor (`packages/editor/src/editor/{Viewport.tsx#toWorld,viewport-space.ts}`); the Runtime Bridge cannot inject pointer input (`.sdd/specs/issue-24-mcp-runtime-harness.md` CA-3, superseded by this spec). The user wants the isometric demo playable by mouse/touch — walk, talk, fight — with topdown able to opt in. Source of truth: finalized handoff `.sdd/grills/2026-08-30-point-and-click-grid-role.md` (14 decisions) plus glossary terms **Move Order** and **Navigation Grid** (`CONTEXT.md`) and `docs/adr/0010-pointer-input-is-engine-owned.md`.

## Comportamiento esperado
- **CA-1 (ALTA) — Engine pointer primitive.** A new engine-owned pointer seam (`game.pointer`, class `Pointer`) listens for `pointerdown` (primary button; a touch tap is the same event) on the game canvas and exposes the click as: the logical-space point (converting through camera position/frustum, the fixed-resolution letterbox viewport when `resolution` is set, and `unprojectIsometric` under isometric projection) plus the picked entity, resolved against projected sprite render bounds (`Sprite`/`AnimatedSprite` width/height/offset/anchor at the entity's projected position), y-sort order breaking ties (front-most wins). No pointer listener exists anywhere outside the engine (ADR-0010).
- **CA-2 (ALTA) — Navigation Grid.** A pure module rasterizes the scene's walkability into 1×1 logical cells: `sceneSolids(game)` output (entity `Solid`s and `Tilemap`-derived solids) marks cells unwalkable. With a `Tilemap` present the grid aligns to it; without one (topdown) it covers the AABB of player + destination + all Solids plus a 1-cell margin. Derived per plan, never authored.
- **CA-3 (ALTA) — Pathfinding.** A* over the Navigation Grid, 8-way neighborhood with corner-cutting forbidden (a diagonal step requires both adjacent cardinals walkable). An unreachable or out-of-grid destination resolves to the nearest walkable cell to the clicked point; the path returned ends there.
- **CA-4 (ALTA) — Ground Move Order.** A new passive component `ClickToMove` in `@waica/behaviors`, driven by the grid player role's update (state code owns the frame): a ground click creates a Move Order; the player walks the A* path through `GridMotor` (acceleration, facing, collision, `signal:move/stop` intact) and arrives within ~0.2 cells of the final cell center. Each new click replaces the order; any keyboard movement input cancels it immediately.
- **CA-5 (ALTA) — NPC Move Order.** Clicking an entity with `Interactable` creates an entity-target Move Order: the player paths to the target until within `Interactable.radius`, then triggers the line through the same route as `interactUpdate` (sets the `npcLine` stat, shows the `npc-line` UI piece) without simulating the `interact` key.
- **CA-6 (ALTA) — Attack Move Order.** Clicking an entity with a foreign `Health` (e.g. the orc) creates an entity-target Move Order: the player paths to within `MeleeAttack.range`, enters the existing `attack` state via the graph's `input:attack` transition (no changes to `ISO_PLAYER_STATE_GRAPH`), and keeps re-engaging after each swing until the target dies or disappears, which cancels the order. The path re-plans toward the target's current position while it moves.
- **CA-7 (ALTA) — Interruptions.** Entering `hurt` pauses the Move Order (it resumes after the stun); entering `dead` cancels it.
- **CA-8 (ALTA state / BAJA looks) — Destination marker.** Ground orders show the archetype's marker at the cell where the walk will actually end (the nearest-reachable cell, not the raw click); it disappears on arrival or cancellation. Entity-target orders show no marker. The marker's visual quality is human-verified (CA-12).
- **CA-9 (ALTA) — Wiring.** The isometric `characters/player` prefab ships `ClickToMove`; both `ISOMETRIC_REGISTRY_DATA.components` and the topdown registry list it (editor picker opt-in for topdown); the topdown/platformer demos, prefabs and templates are otherwise untouched; `scripts/sync-scene.mjs` propagates the iso prefab/scene/art changes to `examples/isometric` and the editor template; the marker art ships as a new archetype asset recorded in `art.ts` and `ATTRIBUTION.md`.
- **CA-10 (ALTA) — Bridge click operation.** `RuntimeControlRequest` gains `{operation:'click', x, y}` in logical coordinates (protocol stays v1, additive); the engine bridge resolves it through the same picking as a real click and now rejects unknown operations with `runtime-operation-failed` instead of silently ignoring them; `control_runtime` exposes the operation with schema validation (x/y required numbers for `click`, forbidden elsewhere).
- **CA-11 (MEDIA) — Browser e2e over MCP.** The isometric leg of `scripts/runtime-e2e.mjs` drives a click through `control_runtime`: a ground click moves the player to the expected logical cell (snapshot assertion), and clicking the orc walks into range and lands strikes until the orc dies (its entity leaves the snapshot).
- **CA-12 (NULA) — Game feel, marker looks, real touch.** Re-plan cadence, A* detour feel, arrival tolerance, marker visuals, and tap-on-device are human-verified per the protocol below.

## Fuera de alcance
- Configurable mouse button, mouse bindings in `controls.json`/editor controls panel, drag-to-move, gamepad.
- Any change to topdown/platformer demos, prefabs or templates beyond registering `ClickToMove` in the topdown registry.
- Directional-contract, clip-name or camera-algorithm changes.
- Factory-default point-and-click for topdown; virtual joystick / touch UI; grid `Chaser` on the Navigation Grid (deferred branches in the handoff).

## Inferencias
| # | Inferencia | Eleccion | Alternativa | Confianza | Resolucion |
|---|---|---|---|---|---|
| 1 | Component name | `ClickToMove` | `PointerMove`/`MoveOrder` | media | confirmada |
| 2 | Engine primitive shape | new `Pointer` class as `game.pointer` | extend `Input` | media | confirmada |
| 3 | Enemy click: how many strikes | re-engage until target dies/disappears | one strike per click | media | confirmada |
| 4 | `hurt`/`dead` vs Move Order | hurt pauses; dead cancels | both cancel | media | confirmada |
| 5 | Grid coverage without Tilemap | AABB of player+destination+Solids, +1 cell margin | camera limits | media | confirmada |
| 6 | A* neighborhood | 8-way, corner-cutting forbidden | 4-way | alta | confirmada |
| 7 | Arrival distances | reuse `Interactable.radius` / `MeleeAttack.range`; ~0.2-cell point tolerance | new params | alta | confirmada |
| 8 | Marker on entity targets | ground orders only | highlight target too | media | confirmada |
| 9 | Bridge op shape | `click x,y` logical; v1 additive; engine rejects unknown ops | protocol v2 / screen coords | media | confirmada |
| 10 | Interact trigger | `interactUpdate` route (stat + UI), no key simulation | inject `interact` action | alta | confirmada |
| 11 | Player graph | unchanged; feed existing `input:attack` edge | new `engage` signal/edge | media | confirmada |
| 12 | Marker asset | new small archetype sprite | code-generated mesh | alta | confirmada |

Decisions 1–14 of the handoff are confirmed source and are not restated here.

## Verificabilidad
Mixto — **CA-1..CA-10 ALTA**: pure/unit and integration vitest, deterministic, `pnpm test` verified green in the contract (5.99s, 1214 tests); the integration CAs follow the shipped-scene pattern of `examples/isometric/src/demo-combat.test.ts` (real `Game` + `loadScene` in happy-dom with the engine's three mocked). **CA-11 MEDIA**: `pnpm test:e2e` verified green (16.71s, Chrome 151) but browser-bound, slower and host-dependent. **CA-8 looks and CA-12 NULA**: the contract explicitly lists game feel and visual correctness as not autonomously verifiable. Generation policies: no PR-size gate (declined); `tests-acompañan-src` is satisfied by the CAs' tests in engine, behaviors, both archetypes and mcp; new files kebab-case (`pointer.ts`, `navigation-grid.ts`, `click-to-move.ts`); no touched file near the 950-line ratchet (`packages/mcp/src/validation.ts` at 903 stays untouched — the op lands in `server.ts`/`runtime-service.ts`/`runtime-browser.ts`).

## Plan de verificacion
Mechanism (confirmed by user 2026-08-30): unit/integration vitest + extended iso e2e leg + human protocol.
- CA-1: engine unit tests (happy-dom): dispatch `pointerdown` at canvas coordinates → assert logical point under identity and isometric projection, with and without fixed `resolution` letterbox; picking tests with overlapping sprites assert front-most y-sort winner. `pnpm test`.
- CA-2/CA-3: pure unit tests on the new grid/pathfinding modules: rasterization of a scene with Tilemap solids + entity Solids; A* around an L-shaped wall; corner-cut rejection; nearest-reachable fallback for a click on water/out of bounds. `pnpm test`.
- CA-4..CA-8(state): integration tests in `examples/isometric/src` (and/or `packages/behaviors`) booting `ISOMETRIC_SCENE`: simulate a click via the pointer seam, run frames, assert player position reaches the marker cell, order replacement, keyboard cancellation, npcLine stat set on arrival, orc losing hearts per swing until destroyed, hurt pause/dead cancel, marker entity present exactly while a ground order is live. `pnpm test`.
- CA-9: archetype/package tests: prefab JSON includes `ClickToMove`; both registries expose it; `pnpm build` + MCP `create-project`/conformance tests compare generated projects (contract note: stale dists make these fail — build first).
- CA-10: bridge unit tests (`runtime-bridge.test.ts`): click op resolves point+entity, unknown op throws `runtime-operation-failed`; MCP schema tests on `control_runtime`. `pnpm test`.
- CA-11: `pnpm test:e2e` — iso leg: `control_runtime {operation:'click', x, y}` at a free cell → stepped frames → snapshot position assertion; click at the orc's logical position → snapshot shows orc gone after enough steps.
- Full ladder before the PR: `pnpm typecheck` + `pnpm test` + `pnpm build` + `pnpm test:dist` + `pnpm test:e2e`.
- **CA-12 human protocol**: 1) `pnpm dev:isometric`, click an open meadow cell — the marker appears there, the hero walks a sensible route and stops naturally; 2) click across the water — the hero walks around the pond to the nearest bank cell shown by the marker; 3) click the villager — hero walks up, the line appears without pressing E; 4) click the orc — hero chases the patrol, swings until it dies; 5) mash WASD mid-walk — the order dies instantly, no rubber-banding; 6) judge marker art in both iso and (opt-in project) topdown; 7) on a touch device or DevTools touch emulation, tap = click. Report anything that feels laggy, jittery or lost.

## Riesgos y gaps
- The `attack` state freezes the body 0.3s (`grid-player-role.ts`); re-engaging after each swing must not fight the state machine — if the existing `input:attack` edge proves insufficient (inference 11), the fallback is the alternative (a role-owned edge), which cascades into prefab/template/snapshot regeneration. Flagged for the run.
- Picking needs sprite render bounds outside the editor: the engine must own that computation (ADR-0010); watch drift vs the editor's `appearance-bounds`.
- The bridge click op supersedes `issue-24` CA-3's "pointer unavailable" — that spec's statement is outdated once this lands (annotation, not behavior change).
- e2e click assertions depend on deterministic stepping while paused (ADR-0006 semantics): queue the click while paused, then step — the e2e leg must prove that ordering.
- Game feel is the top-variance item (per the combat handoff's experience); human protocol is the real gate for CA-12.
- Local-only oddity noted in the contract: port 5173 may be taken on this machine; liveness checks must read the printed port.

## Resultado de ejecucion (2026-08-30 · HEAD 389603d)
| CA | Estado | Evidencia |
|---|---|---|
| CA-1 | verificado | `pnpm test`: `packages/engine/src/pointer.test.ts` 10/10 verdes (click-to-logical conversion identity/isometric, letterbox rejection and offset, front-most y-sort tie-break, `injectClick`) |
| CA-2 | verificado | `pnpm test`: `packages/behaviors/src/navigation-grid.test.ts` 6/6 verdes (Tilemap alignment + solid tiles, entity Solids on top, mover excluded, AABB fallback without a Tilemap) |
| CA-3 | verificado | `pnpm test`: `packages/behaviors/src/pathfinding.test.ts` 12/12 verdes (A* around an L-wall, corner-cut forbidden both ways, nearest-reachable fallback for a blocked/out-of-grid click) |
| CA-4 | verificado | `pnpm test`: `examples/isometric/src/demo-point-and-click.test.ts` — ground click walks and clears order+marker on arrival; new click replaces the order and destroys the old marker; keyboard input cancels immediately (3/7 of that file's tests) |
| CA-5 | verificado | `pnpm test`: same file — clicking the villager walks up and sets `npcLine`/shows `npc-line` with no `interact` press, no marker shown |
| CA-6 | verificado | `pnpm test` (same file, walks into range and re-attacks until the orc dies) + `pnpm test:e2e` isometric leg (`runIsometricPointAndClick`, real MCP `control_runtime` click against the shipped scene, orc removed from the snapshot) — green, 15.16–15.97s browser duration across two runs |
| CA-7 | verificado | `pnpm test`: same file — hurt pauses the order (untouched for the whole stun) and resumes after; the player's own death cancels the order and destroys its marker |
| CA-8 | verificado (estado) / pendiente humano (aspecto) | Marker spawn/clear/replace covered by the CA-4 tests above; entity-target orders show no marker, asserted in the CA-5/CA-6 tests. Visual quality is CA-12 |
| CA-9 | verificado | `pnpm build` + `node scripts/sync-scene.mjs` propagated the prefab/scene/art into `examples/isometric` and the editor template; `packages/archetype-isometric/src/registry-data.test.ts` and `packages/archetype-topdown/src/registry-data.test.ts` updated and green; `packages/mcp/src/archetype-conformance.test.ts` green (new art row resolves a URL); `packages/editor/src/project/template.test.ts` isometric golden snapshot regenerated and green |
| CA-10 | verificado | `pnpm test`: `packages/engine/src/runtime-bridge.test.ts` (+3: click resolves through the game pointer, rejects non-finite x/y, rejects an unsupported operation instead of silently ignoring it) and `packages/mcp/src/server.test.ts` (+1 test, +3 invalid-argument cases folded into the existing loop: missing x/y, x without y, click with a forbidden `action`) |
| CA-11 | verificado | `pnpm test:e2e` green end to end (build + full suite), 15.965s then 15.157s browser duration across two independent runs; the new leg asserts a queued click does not move the player before the next `step` (ADR-0006 ordering), then that stepping walks it to the clicked cell, then that clicking the orc kills it |
| CA-12 | pendiente de prueba humano | Protocol as written above in the spec; not attempted autonomously |

**Escalera completa** (HEAD 389603d): `pnpm typecheck` 1.98s verde (11/11 proyectos) · `pnpm test` 6.35s verde (1279 tests, 139 archivos, sube de 1214 en el contrato) · `pnpm build` 3.82s verde · `pnpm test:dist` 17.86s verde (packed browser leg 4.661s) · `pnpm test:e2e` verde dos corridas independientes (20.24s y 15.16s de wall time total con build fresco cada vez; 15.97s y 15.16s de duración del leg de browser).

**Políticas de generación** (las 4 activas, contra el diff `origin/main...HEAD`): higiene-ts-diff 0 hits · tests-acompañan-src cumple (behaviors y engine, los únicos con `.ts` no-test nuevos, agregan tests en el mismo PR) · max-lineas-archivo el archivo más grande tocado es `server.ts` con 752 líneas (tope 950) · naming-archivos todos los archivos nuevos bajo `src/` son kebab-case.

**Desviaciones**: ninguna que cambie el alcance de un CA. Una decisión de implementación no anticipada explícitamente por la spec, documentada aquí por transparencia: cuando el plan A* cuantizado a celda deja al Move Order de NPC/ataque una celda corta del radio/alcance real (una entidad cuyo propio `Solid` no está grid-aligned puede bloquear más de una celda alrededor suyo — el caso real fue la villager, cuyo `Solid` 0.8×0.6 centrado en un vértice de grilla bloqueaba las 4 celdas vecinas), el último tramo se cierra con un vector directo hacia el objetivo en vez de abortar la orden; la colisión real de `GridMotor` contra cada `Solid` (incluido el del objetivo) sigue deteniendo el movimiento físicamente, así que nunca camina a través de nada — es sólo el mecanismo con el que se cierra el hueco de cuantización del plan. Cubierto por los tests de CA-5/CA-6/CA-11 contra la escena real.
