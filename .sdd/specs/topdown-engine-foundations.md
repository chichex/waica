# Spec — Topdown foundations: y-sort, two-axis camera, directional animation contract, archetype unlock
<!-- Generada por /sdd-spec el 2026-08-08. Fuente: grill .sdd/grills/2026-08-08-archetype-topdown.md. Estado: implementada -->

## Contexto
The repo is about to grow its second archetype (`@waica/archetype-topdown` — Spec 2 of the partition fixed by the grill handoff). This is Spec 1: the engine generalizations the top-down genre needs — automatic y-sort, two-axis camera follow, the directional animation contract in the manifest — plus removal of the platformer hardcodes left in template/MCP/scripts. Today draw order is a manual `layer` int mapped to z (`packages/engine/src/components/sprite.ts:76-79`), camera lookahead is horizontal-only and the followed entity's velocity is discovered by `.vx` duck-typing (`packages/engine/src/camera.ts:108`, `packages/engine/src/game.ts:322-324`), `AnimationContract` exists (`packages/engine/src/animation/contract.ts:8-13`) but is absent from `ArchetypeManifest`, and the template/MCP hardcode `@waica/archetype-platformer` (`packages/editor/template/src/main.ts:9`, `template/package.json.tpl:12`, `packages/mcp/src/package-resolver.ts:29-47`, `packages/mcp/src/create-project.ts:144-160`, `scripts/sync-scene.mjs:35-38`, `packages/editor/src/project/archetype.ts:9-19`).

**Hard constraint (from the handoff)**: zero observable behavior change for the platformer archetype — EXCEPT the sanctioned unknown-archetype-id error of CA-12.

## Comportamiento esperado

### Item 1 — Y-sort (opt-in render mode)
- **CA-1** (ALTA): Scene JSON v3 accepts an optional `render` block with `sort: 'y'`. A scene without the block keeps today's exact draw order (z = layer × 0.01, spawn order within a layer). Unit tests on scene resolution + sprite z assignment.
- **CA-2** (ALTA): With `sort: 'y'`, same-layer sprites are ordered by world Y every frame: lower Y renders in front. Moving an entity past another's Y flips their draw order on the next step. Unit test with two sprites and a simulated step.
- **CA-3** (ALTA): `layer` remains the primary band under `sort: 'y'`: a higher-layer sprite renders in front of a lower-layer one regardless of Y. Unit.
- **CA-4** (ALTA): The sort key is the entity's world Y position (bottom-center anchored sprites → feet); `Sprite.offsetY` does not shift the sort key. Unit.

### Item 2 — Two-axis camera
- **CA-5** (ALTA): `SceneCameraJson` gains optional `lookaheadY` (default 0); `stepSceneCamera` applies vertical lookahead symmetric to the horizontal one (|vy| > 1 threshold). Unit on the pure function.
- **CA-6** (ALTA): The engine exposes an explicit camera-velocity-provider interface supplying `{vx, vy}`; `Game` discovers the followed entity's velocity through it; the `.vx` duck-typing in `game.ts:322-324` is gone (structural grep over `packages/engine/src`) and `PlatformerMotor` implements the interface (real `vy`). The hardening's pinned mover-discovery characterization tests are updated deliberately to pin the new mechanism.
- **CA-7** (ALTA): Platformer scenes (no `lookaheadY`) produce `stepSceneCamera` output identical to today for identical inputs — golden-value tests written BEFORE touching the function.

### Item 3 — Directional animation contract
- **CA-8** (ALTA): The engine exposes a directional animation contract: declared directions (e.g. `['n','s','e','w']`), clip naming `<state>-<dir>`, and declarable fallbacks including mirroring (e.g. `w` resolves to `e` flipped). A pure resolver returns `{clip, flip}`: exact clip → declared directional fallback (with flip) → base `AnimationContract` chain (`resolveClip`). Unit; the design must type-check for 8 directions (iso-ready) even though only 4 are exercised.
- **CA-9** (ALTA): `ArchetypeManifest` gains an optional `animation` field carrying the directional contract; the type-only fixture (`packages/engine/src/archetype.ts:43-59`) compiles with and without it; the platformer manifest does not declare it and the full suite stays green. Typecheck + unit.
- **CA-10** (ALTA): With a directional contract installed, `StateMachine` clip playback resolves state × facing through the resolver (facing supplied by the driving component; stubbed in tests). Without a contract, today's name-based resolution is untouched. Unit with stub facing.

### Item 4 — Archetype unlock (template/MCP/scripts)
- **CA-11** (ALTA): The template `src/main.ts` consumes the standard `ARCHETYPE` export (registry + bundle from the manifest, per ADR 0002) and the archetype package specifier is a token substituted by `projectFiles` from the picked archetype; `package.json.tpl` declares the archetype dependency via token. A generated platformer project is behaviorally identical, and its generated `main.ts` contains no `PLATFORMER_*` symbol. Unit over `projectFiles` output.
- **CA-12** (ALTA): The editor archetype registry is data-driven; resolving an id that is present-but-unknown produces an explicit error surfaced in the UI instead of silently falling back to platformer (**sanctioned behavior change**); an ABSENT `archetype` field still resolves to platformer (hardening CA-2 compat). Unit on the resolution function: negative case + compat case.
- **CA-13** (ALTA): MCP `create_project` accepts an optional `archetype` parameter (default `platformer`) validated against the known-archetype list; `BUNDLED_SPECIFIERS`, the built-entry map and the workspace alias maps derive from that single list (today: one entry). Unknown archetype id → tool error, no files written. Unit on package-resolver + create-project tests.
- **CA-14** (ALTA): `scripts/sync-scene.mjs` resolves the archetype from the target project's `game.json` instead of importing platformer literally; running it over the repo example and the template leaves the tree unchanged: `node scripts/sync-scene.mjs && git diff --exit-code`.

### Global
- **CA-15** (MEDIA): Full ladder green: `pnpm test`, `pnpm typecheck`, `pnpm build`, `pnpm test:dist`, `pnpm test:e2e` — the platformer runtime e2e and packed-shape suites pass without changes to their assertions (baseline today: 805 tests / 86 files; e2e verificado 2026-08-08).
- **CA-16** (MEDIA): Editor smoke, human protocol (~2 min, below): platformer project plays identically; a corrupted archetype id shows a visible error.

## Fuera de alcance
- The topdown archetype itself: `@waica/archetype-topdown`, `TopDownMotor`, demo scene/art (CC0 pack), fifth-package release wiring, picker enablement + blurb update — all Spec 2.
- Projectiles/bow, NPC dialogue system, melee attack (future stages on the same example, per handoff).
- Isometric: iso grid, 8-direction mirroring implementation, configurable pivots. The directional contract only needs to be extensible by design (CA-8).
- Tilemap primitive, spatial hash / broadphase work, rooms camera.
- Editor integration of the animation-gap checklist (contract stays engine-side for now).
- `AnimatedSprite` anchor option — not needed: the sort key is entity Y, not mesh geometry (handoff assumption held).

## Inferencias
| # | Inferencia | Elección | Alternativa razonable | Confianza | Resolución |
|---|---|---|---|---|---|
| 1 | Where y-sort is declared | Optional `render: { sort: 'y' }` block in scene JSON v3 (like the `camera` block); absent = today | Manifest flag threaded into `Game` | media | confirmada |
| 2 | Y-sort × `layer` interaction | `layer` stays the primary band; world Y orders within a layer (replaces spawn-order fallback) | Y-sort ignores `layer` | media | confirmada |
| 3 | Sort reference point | Entity world Y (bottom-center anchor → feet) | Mesh bottom edge (incl. `offsetY`) | media | confirmada |
| 4 | Two-axis camera shape | Keep `lookahead` horizontal; add optional `lookaheadY` default 0 | Migrate to `lookahead: {x,y}` | media | confirmada |
| 5 | Velocity provider shape | Explicit engine interface `{vx, vy}`; `PlatformerMotor` adopts it; duck-typing removed | Extend duck-typing to `.vy` | media | confirmada |
| 6 | Directional contract scope in Spec 1 | Engine piece + optional `animation` manifest field + StateMachine resolution with stub facing; no editor integration | Type + pure resolver only; runtime wiring in Spec 2 | media | confirmada |
| 7 | Template main.ts unlock | Consume standard `ARCHETYPE` export; package specifier tokenized in `projectFiles`; dep tokenized in `package.json.tpl` | One main.ts per archetype | media | confirmada |
| 8 | Unknown archetype id in editor | Visible error for present-but-unknown id; absent field stays platformer | Keep silent fallback until Spec 2 | media | confirmada |
| 9 | MCP creation API | `create_project` gains optional validated `archetype` param (default platformer); specifier/entry/alias lists derived from one list | Defer the param to Spec 2 | alta | confirmada |
| 10 | `sync-scene.mjs` | Parametrized by the target project's `game.json`, in this spec | Defer to Spec 2 | alta | confirmada |

## Verificabilidad
**Mixed, ALTA-dominant: CA-1..CA-14 ALTA** — pure logic or stub-testable with patterns the repo already uses (`stepSceneCamera` and `resolveClip` are pure; template tested via `projectFiles`; resolver has existing tests), and the contract runs `pnpm test` green today (805 tests, 3.59s, verificado 2026-08-08) — TDD puro. **CA-15 MEDIA** — `pnpm test:e2e` (9.6s) and `pnpm test:dist` (15s) are green today but are browser e2e: deterministic by design, host-Chrome-dependent (contract rungs 5-6). **CA-16 MEDIA** — editor feel is contractually not autonomously verifiable; human protocol below (hardening CA-24 precedent). No generation policies are active and there is no PR-size gate; blast radius (~20+ files across engine/editor/mcp/scripts) matches the accepted hardening precedent.

## Plan de verificacion
**Mechanism (user-chosen): vitest TDD + structural greps + command checks + full ladder + 2' human protocol.**
- CA-1..CA-13: `pnpm test` — each CA maps to named unit tests written test-first where behavior changes. CA-6 additionally: `grep -rn "\.vx" packages/engine/src/game.ts` shows no camera duck-typing. CA-11 additionally: generated `main.ts` asserted to contain `ARCHETYPE` and no `PLATFORMER_` symbols.
- CA-14: `node scripts/sync-scene.mjs && git diff --exit-code`.
- CA-15: `pnpm test && pnpm typecheck && pnpm build && pnpm test:dist && pnpm test:e2e` all green.
- **Order note for the runner**: land CA-7 golden camera tests BEFORE touching `stepSceneCamera`; CA-6 deliberately rewrites the hardening's pinned mover-discovery tests (the diff must show new pins replacing the duck-typing pins, not deleted coverage).
- **Human protocol (CA-16), ~2 min after the PR:**
  1. `pnpm editor`, open the printed localhost URL.
  2. Create a platformer project (demo). Play: move, jump, collect, get chased — identical feel to main.
  3. Edit the project's `src/game.json`: set `"archetype": "banana"`. Reopen the project → a visible error appears; the editor does NOT silently open it as platformer.

## Riesgos y gaps
- CA-6 rewrites characterization pins from the pre-topdown hardening (mover discovery) — sanctioned, but review the diff for replaced-not-deleted coverage.
- `render.sort` and the manifest `animation` field are new public API on the 0.x line: they ship to npm on the next lockstep release; renaming later breaks generated projects. Mitigated: nothing external consumes them until Spec 2 publishes the topdown archetype.
- Blast radius ~20+ files in one PR (no size policy active; hardening precedent accepted by the requester via the grill partition decision).
- `pnpm test:e2e`/`test:dist` require a system Chrome; the publish-CI provisioning gap from the contract (`[NEEDS-INPUT]`) is unchanged by this spec.
- Spec 2 (archetype + demo + fifth package) depends on this spec landing; the portable archetype conformance suite stays deferred to Spec 2 (where a second archetype exists to exercise it).

## Resultado de ejecucion (2026-08-08 · HEAD 13d6bed)
Baseline note: the suite on `main` had grown to 825 tests / 87 files since this spec quoted 805/86; the run ends at 865 tests / 90 files (40 new).

| CA | Estado | Evidencia |
|---|---|---|
| CA-1 | verificado | `pnpm test`: game.test.ts "keeps the exact layer-only z for scenes without a render block" pins z = layer × 0.01 with spawn-order ties; `render` block typed into `SceneJson` (scene.ts) |
| CA-2 | verificado | game.test.ts "orders same-layer sprites by world Y and flips on crossing" — flip observed after moving an entity past the other's Y |
| CA-3 | verificado | render-sort.test.ts "keeps the layer as the primary band" (+ band-confinement property) and game.test.ts "keeps a higher layer in front regardless of Y" |
| CA-4 | verificado | game.test.ts "sorts on entity Y: a sprite offsetY does not shift the key" |
| CA-5 | verificado | camera.test.ts "vertical lookahead" (4 tests): default 0, symmetric application, |vy| > 1 threshold, no-lookaheadY scenes unaffected |
| CA-6 | verificado | game.test.ts provider-seam pin + negative pin (bare `.vx` field no longer moves the camera, exact 0); `grep "\.vx" packages/engine/src/game.ts` → only the typed `velocity?.vx` read; PlatformerMotor implements the interface (platformer-motor.test.ts) |
| CA-7 | verificado | Golden tests committed at 7643c0b BEFORE touching stepSceneCamera (exact damp values incl. the shipped platformer camera block); green before and after the two-axis change |
| CA-8 | verificado | directional.test.ts: exact clip → declared fallback with flip → chained flips → base `resolveClip` chain → cycle safety; 8-direction type fixture compiles under `pnpm typecheck` |
| CA-9 | verificado | `pnpm typecheck` green with both manifest fixtures (with and without `animation`); platformer manifest untouched (manifest.test.ts exhaustive toEqual intact); full suite green |
| CA-10 | verificado | state-machine-runtime.test.ts directional block (5 tests) with stubbed facing: exact, mirrored, base-chain, no-contract and no-facing paths |
| CA-11 | verificado | template.test.ts: generated main.ts contains `ARCHETYPE` import and no `PLATFORMER_` symbol; token sweep over all generated files; snapshot diff is exactly the 4 sanctioned lines × 2 starts; MCP create-project byte-equality suite green |
| CA-12 | verificado | archetype.test.ts: 4 present-but-unknown ids throw `Unknown archetype "<id>"`; absent id resolves platformer; error surfaced in Editor pane (`role="alert"`) and Home alert |
| CA-13 | verificado | known-archetypes.test.ts + create-project.test.ts "rejects an unknown archetype id and writes nothing" (ENOENT asserted) + explicit-param equality; resolver/workspace-runtime/loader maps derive from the single list. Nota: the forked component runner cannot import siblings (standalone child), so it mirrors the list with a pointer comment |
| CA-14 | verificado | `node scripts/sync-scene.mjs && git diff --exit-code` on the committed tree → unchanged; the script resolves each target's archetype from its `game.json` via the Node-safe `ARCHETYPE` manifest |
| CA-15 | verificado | `pnpm test` 865/90 · `pnpm typecheck` 7 projects clean · `pnpm build` · `pnpm test:dist` (packed Runtime Session e2e, Chrome 151.0.7922.77) · `pnpm test:e2e` (checkout, Chrome 151) — all green, no assertion changed in those suites |
| CA-16 | pendiente humano | Protocol (~2 min) in `## Plan de verificacion`; checklist in the PR |
