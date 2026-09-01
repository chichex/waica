# Grill — Scene unload and swap (issue #66)
<!-- State: finalized. Project: /Users/ayrtonmarini/Sync/workspace/waica. Source: issue #66 "loadScene only adds entities: there is no scene unload or swap", routed here by /issue-triage. -->
<!-- SDD-Tracking: version=1; type=grill; state=finalized; issue=#66; grill=2026-08-31-scene-unload-and-swap; project=%2FUsers%2Fayrtonmarini%2FSync%2Fworkspace%2Fwaica -->

## Mode
domain-modeling

## Verified facts

- **H1 — `loadScene` is add-only.** Render block → spawns → camera → `ui.defineAll` → `ui.show`. No remover anywhere (`packages/engine/src/scene.ts:163-171`).
- **H2 — `dispose()` is the only thing that empties `entities`**, and it tears down renderer, input, pointer, `resizeObserver` and UI: a shutdown, not a scene change (`game.ts:265-274`).
- **H3 — Per-entity teardown is already complete.** `Entity.destroy()` cascades `onDestroy` and unparents the node; `Sprite`, `AnimatedSprite` and `Tilemap` already dispose geometry, material and textures. An unload built on `destroy()` leaks no GPU memory (`entity.ts:62-69`; `sprite.ts:139-143`; `animated-sprite.ts:202-208`; `tilemap.ts:202-210`).
- **H4 — `GameUi` has no partial unmount.** `dispose()` is all-or-nothing, `hide()` keeps the piece mounted, `defineAll` accumulates catalogs (`ui.ts:32-34, 47-51, 79-86`).
- **H5 — `setSceneCamera(undefined)` nulls the scene camera but never restores `viewHeight`.** A latent defect: unreachable today because every host loads one scene into a fresh `Game` (`game.ts:195-211`).
- **H6 — `Pointer` holds `this.entities` by reference**, so an unload must splice in place and never reassign the array (`game.ts:108-113`).
- **H7 — The editor already changes scenes by destroying and recreating the whole `Game`**, via `<Viewport key={"scene:"+path}>` and the effect's `game.dispose()` cleanup. It recreates for three distinct reasons: scene file (React key), `epoch` (9 `setEpoch` call sites, structural edits), and `mode` (edit↔play, which rebuilds with different bindings/stats/resolution) (`Editor.tsx:1284`; `Viewport.tsx:374-384, 687-694`).
- **H8 — The four hosts import one static scene and load it once**; `game.json` has no initial-scene field (the three `examples/*/src/main.ts`, `packages/editor/template/src/main.ts:111`).
- **H9 — `Stats.reset()` exists with zero production call sites** (`stats.ts:47-53`).
- **H10 — Session-scoped subscriptions exist that nothing unsubscribes**: `setupPlatformer` calls `game.events.on('collect', …)` after `loadScene` (`archetype-platformer/src/index.ts:39-45`).
- **H11 — #66 is upstream of three open issues, blocked by none.** #67 ("the same policy question as #66"), #76 ("the cache has to survive scene swaps (#66)") and #74 (the fade "a scene transition (#66) hides the swap behind") all defer to this decision.
- **H12 — The swap happens inside one Run Session.** ADR 0005 fixes one live `Game` per session; ADR 0006 fixes readiness after the scene is loaded.
- **H13 — No test loads two scenes into one `Game`.** The pattern is testable: `examples/isometric/src/demo-combat.test.ts:68` boots a real `Game` in happy-dom.
- **H14 — No transition concept exists.** None of the 25 behaviors is a door, portal or scene trigger; `DESIGN.md:116`'s milestone-1 "couple of level screens" was never built.
- **H15 — The interaction prompt is mounted by behavior code**, not by the scene's `ui` list, and is hidden only while a grid-player scan is running (`interactable.ts:68-78`; `click-to-move.ts:260`).

## Resolved decisions

### Semantics and API

1. **One live scene; loading replaces.** The engine holds exactly one scene at a time. Additive loading (streaming an adjacent map) is explicitly out of scope: no consumer exists, and it would force per-scene arbitration of `camera`, `render.sort`, projection and the `ui` list.
2. **API: `loadScene` replaces, plus a public `game.unloadScene()`.** `loadScene(game, next, registry)` unloads before spawning. The unload is a `Game` method (it touches `entities`, `ui`, `sceneCamera`, `renderSort` — all private or instance state) that `loadScene` calls. `unloadScene()` stays public: it is the name the issue asks for, the test seam, and what allows leaving the game with no scene.
3. **After `unloadScene()` the `Game` is as newly constructed**: `registry` null, no scene camera, no `render.sort` or projection, `viewHeight` back to the constructor's. One "no scene" state to describe and test.

### Retention policy — what #67, #74 and #76 inherit

4. **Stats survive the change.** They are session-scoped: score, lives and flags cross the map. Matches the issue's own bet and today's de-facto behavior. Reset stays host-side via the existing `game.stats.reset()` (H9) — no new API.
5. **`paramOverrides` survives.** Project config, loaded before any scene.
6. **Subscriptions belong to the caller.** The unload does not touch `game.events` or `game.onUpdate`. Both already return their unsubscribe; auto-clearing would silently break a host that wires once at boot (H10) — the platformer's coin counter would stop counting after the first swap with no error.
7. **The unload unmounts only the UI pieces the scene declared in its `ui` list.** The engine does not touch what someone else mounted. The definition catalog survives.
8. **…plus pieces shown while declaring themselves scene-scoped.** `GameUi` accepts a scope when showing; `Interactable` and `click-to-move` adopt it. The "Press E" prompt dies with its scene **without** breaking decision 6's symmetry: the engine still only undoes what was declared its own. This is a rule any future behavior can follow, not a patch for today's two cases.
9. **The incoming scene defines the whole framing.** With no `camera` block, `viewHeight` returns to the constructor's. H5 is closed inside this change: it is unreachable today and it is this change that makes it observable, so it is own blast radius, not opportunistically-fixed old debt.

### Change frontier

10. **The host learns to ask for its scenes by name.** The `main.ts` files move from a static import to collecting all of `src/scenes/`, so project-owned code (a role in `src/roles/`) can ask for another map. This is what actually closes the gap the issue names. Touches the three examples, the editor template and the MCP-bundled template with its snapshots.
11. **The initial scene is NOT declared in `game.json`.** No new field in the project format.
12. **The editor adopts the API**…
13. **…only for scene-file changes.** The React key goes away and an effect calls `loadScene` when the open scene changes. Rebuilds for `epoch` (structural) and `mode` (edit↔play, which rebuilds with different bindings/stats/resolution) keep recreating the `Game`.
14. **The MCP gains both**: the live scene appears in the Runtime Snapshot, and the Runtime Bridge gains an operation to load a scene, so an agent can jump to map 3 without playing the first two. Shape precedent: the point-and-click grill taught the bridge to `click`.

### The Scene Transition

15. **The isometric demo gains a second scene, and the archetype gains the authorable piece.**
16. **The trigger is prop-configurable**: on overlap (`Hitbox`, the `Collectible`/`Hazard` pattern) or on interact.
17. **In interact mode it composes with `Interactable`**: the transition never reimplements radius or prompt; it listens to the sibling `Interactable`. The existing scan already arbitrates "nearest wins", so a door and a villager in range resolve themselves with no new rule. Accepted cost: in that mode the door is a two-component prefab.
18. **The transition names only its destination.** The incoming scene places its own `Player` wherever that scene authored it. No named entry points, no literal position.
19. **It lives in `@waica/behaviors` and all three bundles register it.** It is generic — a trigger that asks for another scene is not isometric — and follows the home of `Interactable`, `Collectible` and `Hazard`. Factory-default only in the isometric demo; visible in the editor picker for platformer and topdown.

### Delivery

20. **Verification: the full ladder plus a new `test:e2e` leg** that walks to the door, crosses in real Chrome, and asserts by snapshot that the scene changed and the stats carried over. Unit tests for the retention policy; an integrated happy-dom test over the two-scene demo.
21. **One spec, one PR.** Precedent: isometric combat and point-and-click, both delivered whole by explicit choice. No PR-size policy is active.

## Deferred branches

None within scope — the four sections of the tree closed in 19 decision questions.

Deliberately deferred to another session: named entry points for transitions; level-1 authoring of transitions beyond the component itself; routing the editor's `epoch` rebuilds through `loadScene`; an initial-scene field in `game.json`; additive/streaming scene loading.

## Handoff

### Topic and scope

Give the engine the ability to **unload the live scene and load another into the same `Game`**, with an explicit policy of what is scene-scoped and what is session-scoped; let a project ask for its scenes by name from its own code; adopt the new API in the editor for scene-file changes; give the archetype an authorable **Scene Transition**; and demonstrate it with a second scene in the isometric demo, verified through a real browser leg. One spec, one PR.

### Verified facts

See `## Verified facts` (H1–H15).

### Resolved decisions

See `## Resolved decisions` (1–21).

### Constraints and non-goals

- **Out**: additive / streaming scene loading; camera fades and visual transitions (#74); an asset cache that survives the swap (#76); audio policy (#67) — all three consume this decision, not the other way round.
- **Out**: named entry points or a spawn declared by the transition (decision 18); an initial-scene field in `game.json` (11); routing the editor's `epoch` or `mode` rebuilds through `loadScene` (13).
- **Out**: asset preloading, a "scene ready" promise, or any asynchrony in loading.
- Nothing is published to npm; the PR is not self-merged.
- Active generation policies: `higiene-ts-diff`, `tests-acompañan-src`, `max-lineas-archivo` (950), `naming-archivos`.

### Explicit assumptions (adjustable when the spec is written)

- The unload is built on `Entity.destroy()`; no new teardown path is needed (H3).
- The unload is synchronous.
- The unload splices `game.entities` in place and never reassigns the array (H6).
- The scene identifier shared by host, transition and MCP is derived from the file (`scenes/cave.scene.json` → `cave`), the way prefabs and UI pieces are already derived in `main.ts`.
- The new e2e leg runs against the real isometric demo, not a synthetic project.
- The demo's second scene reuses existing archetype art; no new assets beyond what the transition itself needs.

### Risks and deferred questions

- **Public surface in lockstep.** `loadScene` changes semantics in a package that publishes alongside five others. No known consumer of the additive behavior exists, but it is an observable contract change and must be announced.
- **This policy is precedent for three issues.** Decisions 4 and 6 draw the line that #67 (session-scoped music vs scene-scoped effects), #76 (the cache survives) and #74 inherit. The spec should say so out loud.
- **The editor is the most demanding consumer.** Adopting `loadScene` for scene-file changes requires proving that selection, gizmos, grid, UI preview and pan/zoom survive a reload over the same `Game` — things the remount reinitializes for free today.
- **Accidental transitions** in overlap mode: tunable with the door's `Hitbox`, but it is game feel, and feel is not verifiable without a human.
- **Return without a door**: by decision 18, coming back through the same door lands you where the origin map authored its `Player`, not next to the door. Accepted knowingly; if it grates in the demo, it is fixed by authoring positions.

### Recommended context for the spec

- **Artifacts**: `.sdd/project.md`; this handoff; `CONTEXT.md` (**Session-scoped**, **Scene Transition**); ADRs 0005, 0006 and 0011.
- **Engine**: `scene.ts`, `game.ts`, `ui.ts`, `entity.ts`, `runtime-bridge.ts`, `runtime-inspection.ts`.
- **Behaviors**: `interactable.ts`, `click-to-move.ts`, `grid-player-role.ts`.
- **Archetypes**: the three `bundle.ts` and `registry.ts`.
- **Editor**: `Viewport.tsx` (the `[epoch, mode]` effect, lines 374-694), `Editor.tsx` (the key at 1284, `openView` at 524).
- **Host/tooling**: the four `main.ts`; `packages/mcp/src/` (control_runtime, validation, `create-project.test.ts`); `scripts/runtime-e2e.mjs`; `scripts/sync-scene.mjs`.
- **Issues**: #66 (source); #67, #74, #76 (consumers of the policy).
