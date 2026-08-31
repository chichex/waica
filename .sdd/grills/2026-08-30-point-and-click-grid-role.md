# Grill — Point-and-click for the grid player role (isometric factory-default, topdown opt-in)
<!-- State: finalized. Project: /Users/ayrtonmarini/Sync/workspace/waica. Source: free-form user request (2026-08-30): "I want to add point and click to the isometric, though I'm not sure if it applies to topdown too". -->
<!-- SDD-Tracking: version=1; type=grill; state=finalized; issue=none; grill=2026-08-30-point-and-click-grid-role; project=%2FUsers%2Fayrtonmarini%2FSync%2Fworkspace%2Fwaica -->

## Mode
domain-modeling

## Verified facts
- **H1 — Input is keyboard-only.** `packages/engine/src/input.ts` listens to `keydown/keyup` via `KeyboardEvent.code`; `controls.json` maps action→codes; the editor's controls panel (`ProjectPane.tsx`) only captures keys. `TODO(H1): gamepad and touch`. Two specs explicitly excluded pointer input: `client-extensibility-toolkit.md` ("Input stays keyboard-only") and `issue-24-mcp-runtime-harness.md` (the bridge declares "pointer input unavailable").
- **H2 — Movement is already decoupled from keys.** `GridMotor.run(inputX, inputY, dt)` (shared by `IsoMotor`/`TopDownMotor`) takes a screen-space vector, accelerates with damping, collides per axis against Solids and derives facing (8-way iso / dominant axis topdown). The role (`grid-player-role.ts`) only feeds that vector from `input.axis(...)`.
- **H3 — Screen→logical exists outside the engine.** `unprojectIsometric` is the exact inverse; the editor already converts client→render→logical (`Viewport.tsx#toWorld`, `viewport-space.ts`). `Game` doesn't expose it, and with a fixed `resolution` there's a letterbox (`setViewport/setScissor`) to discount.
- **H4 — Obstacles.** Iso demo: 16×16 `Tilemap` with solid `WATER`/`BORDER` (derives a `Solid` per cell, has `cellAt`/`cellBounds`) + trees/rocks/villager with `Solid`. Topdown demo: no Tilemap, entity-tiles (`Sprite`+`Solid`). `sceneSolids(game)` enumerates all of it.
- **H5 — Clicks reach the canvas in play mode.** The editor Viewport's `onPointerDown` returns early if `mode !== 'edit'`, and the engine's UI shell is `pointer-events:none`: a game-owned listener works both standalone and inside the editor.
- **H6 — The bridge doesn't click today.** `control_runtime` only does `press/hold/release/pause/resume/step`; the happy-dom and Playwright scene tests against `window.__waica.game` can already dispatch `PointerEvent`.
- **H7 — Neighbors.** `Interactable` (radius + `interact`), `MeleeAttack.strike(facing)` (range 1, from the `attack` state), the orc's `Patrol`+`Hazard`+`Health`. There is no "go to a point" in behaviors (`Chaser` is platformer-only: X + gravity).
- **H8 — Product.** `DESIGN.md` only mentions point & click as a future community archetype; controls are part of the archetype.

## Resolved decisions
1. **Scope: isometric factory-default, topdown opt-in.** A generic mechanic on the shared grid player role; the iso player ships it; the topdown demo doesn't change.
2. **Full semantics: walk + interact + attack.** Click on ground = walk; click on an `Interactable` = approach its radius and fire the line; click on an entity with foreign `Health` = approach `MeleeAttack` range and strike.
3. **Input: left click; each click replaces the Move Order.** A touch tap is equivalent (PointerEvent). No configurable button.
4. **Feedback: a destination marker** from the archetype (iso diamond / topdown circle) visible until arrival or cancellation.
5. **Navigation: A\* over a Navigation Grid** rasterized from `sceneSolids()` (Tilemap cells + entity Solids); also works in topdown without a Tilemap.
6. **The keyboard cancels the Move Order** and takes back direct control; no modes.
7. **Architecture: the engine owns the pointer primitive** (PointerEvent on the canvas + screen→logical conversion with camera/letterbox/projection); **a new component in `@waica/behaviors`** consumes it to move the role.
8. **Moving target: the Move Order follows the entity** (re-plans toward its current position); it dies/disappears = the order cancels.
9. **Unreachable destination: walk to the nearest walkable cell** to the clicked point; the marker is drawn where it actually ends up.
10. **Picking by projected sprite bounds** (what you see is what you click), ties broken by y-sort order; same criterion as the editor.
11. **The bridge/MCP learns to click:** a pointer operation on `RuntimeControlRequest` and `control_runtime`; supersedes `issue-24`'s "pointer unavailable". The e2e test proves a click over the real MCP lane.
12. **Topdown opt-in = the component registered in both bundles:** it ships in the iso player prefab; in topdown it appears in the editor's picker.
13. **Delivery: one spec and one PR** with everything (precedent: the iso combat feature).
14. **Canonical terms: Move Order and Navigation Grid**, recorded in `CONTEXT.md`.

## Deferred branches
None within scope. Deferred to another session: drag-to-move / configurable button and mouse bindings in the editor; point-and-click enabled by default in topdown; dedicated touch UI (virtual joystick); gamepad (`TODO(H1)`); a grid `Chaser` using the Navigation Grid.

## Handoff

### Topic and scope
Give the grid player the ability to be played with mouse/touch: click on the world to walk (with pathfinding), click on an NPC to approach and interact, click on an enemy to approach and attack. The isometric archetype ships it factory-default; topdown registers it as an opt-in component. One spec and one PR.

### Verified facts
See `## Verified facts` (H1–H8).

### Resolved decisions
See `## Resolved decisions` (1–14).

### Constraints and non-goals
- No configurable button or mouse bindings in `controls.json`/the editor panel; no drag-to-move; no gamepad.
- No changes to the topdown or platformer demo/prefabs/template (only registering the component in the topdown bundle).
- No changes to the directional contract, clip names, or the camera algorithm.
- Full local ladder (typecheck + test + build + test:dist + test:e2e) before the PR; publishing to npm stays human.
- Active generation policies (higiene-ts-diff, tests-accompany-src, max 950 lines, kebab-case naming).

### Explicit assumptions (adjustable when the spec is written)
- The Navigation Grid uses a 1×1 logical cell aligned to the Tilemap when one exists; entity Solids are rasterized to the cells they cover. Recomputed per click/re-plan, not per physics frame (the cost on 16×16 maps is trivial).
- The click-to-move component is passive like the motors: the grid role queries it in its update and hands the vector to `GridMotor` — so acceleration, facing, collision, `signal:move/stop` and the `attack/hurt/dead` states stay intact (hurt/dead interrupt the Move Order or pause it; the spec pins this down).
- Arrival with a short tolerance (~0.2 cells); attacking reuses the existing `input:attack` transition/`attack` state once in range.
- The engine primitive exposes the last click as a logical point + picked entity; the bridge operation injects logical coordinates (entity picking resolves the same way a real click does).
- The marker is a small new archetype asset (CC0/original), not an engine-render change.

### Risks and deferred questions
- **Game feel** (re-plan speed, arrival tolerance, how the A\* detour feels) isn't verifiable without a human — a human protocol goes in the spec.
- The bridge's pointer operation touches protocol v1 (additive, but versioning needs deciding in the spec) and MCP conformance.
- Picking by sprite bounds requires reading render bounds from behaviors or exposing them through an engine seam — the spec defines the seam.
- The `attack` state freezes the body for 0.3s; chaining "walk→strike→keep going" may need a graph tweak (the spec decides whether the Move Order survives the swing).
- Deferred: see `## Deferred branches`.

### Recommended context for the spec
`packages/engine/src/{input,game,projection,tilemap-grid,scene-solids,runtime-bridge}.ts`, `packages/behaviors/src/{grid-motor,grid-player-role,iso-motor,topdown-motor,facing,interactable,melee-attack}.ts`, `packages/archetype-isometric/src/{prefabs,scene-default,controls,bundle}.ts`, `packages/editor/src/editor/{Viewport.tsx,viewport-space.ts}` (conversion precedent), `packages/mcp/src/{server,runtime-service,runtime-browser}.ts`, `scripts/runtime-e2e.mjs`, `.sdd/specs/issue-24-mcp-runtime-harness.md` (CA-3 to supersede), `docs/adr/0005` and `0006`, and the `Move Order` / `Navigation Grid` terms in `CONTEXT.md`.
