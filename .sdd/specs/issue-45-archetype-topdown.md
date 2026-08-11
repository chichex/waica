# Spec — Topdown archetype: @waica/archetype-topdown, TopDownMotor, Zelda-like demo, fifth-package release wiring
<!-- Generada por /sdd-spec el 2026-08-10. Fuente: grill .sdd/grills/2026-08-08-archetype-topdown.md (Spec 2) + issue #44. Estado: aprobada -->

## Contexto
Spec 1 (PR #43, merged as `d242391`) landed the engine foundations: opt-in y-sort (`render.sort: 'y'`), two-axis camera (`lookaheadY` + `CameraVelocityProvider`), the directional animation contract (`ArchetypeManifest.animation`, `resolveDirectionalClip`, `AnimationFacingProvider`, `setFlipX`) and the archetype unlock (tokenized template, strict editor registry, MCP `known-archetypes.ts` + `create_project archetype` param, archetype-agnostic `sync-scene.mjs`). This spec ships the consumer: the second archetype, published as the fifth lockstep package. The platformer package (~440 lines of pure data + 6 test files) is the mold; `pnpm -r build` orders topologically so the new package needs no build wiring. Issue #44 lists the landmines from the PR #43 review that this spec absorbs. All six manifests sit at 0.6.1.

**Hard constraints (from the handoff)**: iso is designed-for but NOT implemented; zero observable behavior change for the platformer archetype; the demo must exercise y-sort (real occlusion), the two-axis camera and `interact`.

## Comportamiento esperado

### Item 1 — Package `@waica/archetype-topdown` (id `topdown`)
- **CA-1** (ALTA): `packages/archetype-topdown` exists at version 0.6.1, `files: ["dist", "assets"]`, source exports `.` → `./src/index.ts` and `./manifest` → `./src/manifest.ts` with the same `publishConfig` lowering as the platformer; deps `@waica/engine` + `@waica/behaviors` at `workspace:^`; `pnpm typecheck` and `pnpm build` pick it up with no explicit ordering. Unit (extended lockstep test) + typecheck.
- **CA-2** (ALTA): Dual-entry manifest per ADR 0002: node-safe `ARCHETYPE satisfies ArchetypeManifest` (id `topdown`, package-relative `resolveAsset`), browser entry adds `registry` + `artUrls` (`satisfies BrowserArchetypeManifest`). Twin of `manifest.test.ts`: exhaustive `toEqual`, node entry = browser minus `artUrls`/`registry`, `resolveAsset('waica:<x>') === 'assets/<file>'`.
- **CA-3** (ALTA): The manifest declares `animation`: `directions: ['n','s','e','w']`, clip naming `<state>-<dir>`, base contract with state fallbacks (`walk → idle`). Unit.
- **CA-4** (ALTA): Bindings `up/down/left/right` (arrows + WASD) and `interact` (`KeyE`, `Space`) with action labels. Twin of `controls.test.ts`.
- **CA-5** (ALTA): Prefabs (player, NPC, enemy reusing existing behaviors, collectible, solid tiles and at least one tall occluder e.g. tree), palette derived from prefabs, entityIcons; default demo scene with `render: { sort: 'y' }`, camera `follow` + `lookaheadY > 0` + limits, occluders placed so walking behind/in front of them flips draw order, an NPC, an enemy and collectibles; blank scene keeps `render.sort: 'y'` and no follow. Twins of `prefabs.test.ts` + scene shape assertions.

### Item 2 — `TopDownMotor` + roles (`@waica/behaviors`)
- **CA-6** (ALTA): `TopDownMotor`: 8-direction movement with normalized diagonals (diagonal speed == cardinal speed), acceleration/deceleration, no gravity; per-axis Solid resolution via the shared `resolveSolidAxis` (anti-tunneling); implements `CameraVelocityProvider` (real `{vx, vy}`) and `AnimationFacingProvider` with 4-direction facing — dominant axis wins, ties keep the last facing. Unit harness in the style of `platformer-motor.test.ts` (flush contact, no tunneling at clamped dt, diagonal normalization, facing rule).
- **CA-7** (ALTA): Topdown `player` role (driver `TopDownMotor`): `idle`/`walk` graph with `move`/`stop` signals, `'*'` tick hook, cloned from the `playerUpdate` pattern. Unit via the state-machine harness.
- **CA-8** (ALTA): New `Interactable { line, radius }` component in behaviors; pressing `interact` with an `Interactable` within radius sets `stats.set('npcLine', line)` and shows the `npc-line` UI piece (`{{npcLine}}` binding); walking out of radius hides it. The archetype's NPC prefab uses it with the existing `npc` role. Unit with stubbed input/stats/ui.

### Item 3 — CC0 art
- **CA-9** (ALTA checks / visual NULA): CC0 assets (Kenney or complemented from another CC0 pack, per the handoff) committed under `packages/archetype-topdown/assets/` together with a license/attribution file; 4-direction idle+walk sheets for player and NPC, an enemy sprite, tiles and a collectible. Unit: every `art.ts` row has its file on disk, and PNG IHDR dimensions are consistent with each prefab's declared `cols`/`rows` × clip frames. Visual quality is human (CA-22).

### Item 4 — Fifth-package release wiring + #44 absorption
- **CA-10** (ALTA): `PUBLISHED_LIBRARIES` gains `archetype-topdown`; `packages/cli/src/package.test.ts:79` lockstep list gains it; `bundle-mcp.mjs` vendors it (derived — its log counts 4); `publish.yml` comments and `README`/`packages/cli/README`/`packages/mcp/README` counts updated; `/publish` SKILL.md updated (description, bump loop, verify loop, §0 bootstrap note naming `@waica/archetype-topdown`). Unit + structural grep (`grep -rn "three @waica\|all four" README* .claude/skills/publish` finds no stale count).
- **CA-11** (ALTA): `test-dist.mjs` topdown twins: the package joins the packed set and `vendoredLibraries`; packed-manifest assertions for `exports['./manifest']`; plain-Node probe asserts `ARCHETYPE.id === 'topdown'` on both entries and a vendored topdown asset file survives packing. `pnpm test:dist` green.
- **CA-12** (ALTA): Editor: `ARCHETYPES` record gains topdown; picker card flips to `status: 'ready'` with blurb "Zelda-style overhead view: 8-direction movement with depth-sorted drawing."; `script-sources.ts` gains the `TopDownMotor` row; `projectFiles(name, start, 'topdown')` output snapshot-tested and byte-equal to MCP `createProject(…, 'topdown')` (extended `create-project.test.ts`). `Home.demo()` stays platformer.
- **CA-13** (ALTA): MCP: `KNOWN_ARCHETYPES` gains the topdown row; `loadBundledModule` switch gains its two literal cases; `archetypes.ts` derives from the list (all known packages force-attempted in discovery; load failure fatal only for the default/required ids) — the literals at `:75`/`:89` are gone; the forked runner's mirrored list gains the entry; `describe_archetype 'topdown'` resolves (the existing reject pin at `introspection.test.ts:354` is deliberately rewritten). Unit.
- **CA-14** (ALTA): `prepareWorkspaceRuntime` guard becomes per-package: a missing archetype dist excludes only that archetype's mappings with a warning; engine/behaviors/platformer mappings still install. Unit.
- **CA-15** (ALTA): `manifest.animation` is wired: the template `src/main.ts` and the editor (chassis install + play path) call `installDirectionalAnimation(ARCHETYPE.animation ?? null)` after `installArchetype`; template snapshot regenerated; a topdown project therefore plays `<state>-<dir>` clips. Unit + snapshot.
- **CA-16** (ALTA): Y-sort participation moves from `instanceof Sprite || instanceof AnimatedSprite` to an explicit opt-in engine seam implemented by both sprite classes; z output for existing scenes is unchanged (existing render-sort and game tests stay green untouched). Unit.
- **CA-17** (ALTA logic / visual humano): Editor UI: `lookaheadY` slider row in `CameraInspector` (shown with `follow`, like `lookahead`) and a y-sort toggle in `SceneInspector` backed by a new `ops.setRenderProp` (stamps `waicaScene: 3`). Unit on ops + inspector rendering.
- **CA-18** (ALTA): Portable archetype conformance suite, parameterized over both manifests: prefab component types registered in the archetype's own registry; scene/blank prefab refs and ui names resolve; bindings/labels non-empty and consistent; every clip a prefab's StateMachine states reference exists in its sprite's declared clips (directional contract-aware); palette ↔ prefabs coherent; `art` rows have files; and `archetypePackageName(id) === KNOWN_ARCHETYPES[id].packageName` for every row — the #44 convention gap becomes a gate. Both archetypes pass.
- **CA-19** (ALTA): `examples/topdown` app mirroring `examples/platformer` (main.ts imports `{ ARCHETYPE } from '@waica/archetype-topdown'`); `sync-scene.mjs` `TARGETS` gains it; `node scripts/sync-scene.mjs && git diff --exit-code` leaves the tree unchanged; root script `dev:topdown` serves it.
- **CA-20** (MEDIA): New topdown leg in `pnpm test:e2e`: a controlled project with `archetype: topdown` through the real MCP stdio Runtime Session — semantic `move` input changes player position AND the active clip/facing responds (e.g. `walk-e` → `walk-w` with flip when reversing); the platformer leg stays untouched.

### Global
- **CA-21** (MEDIA): Full ladder green: `pnpm test`, `pnpm typecheck`, `pnpm build`, `pnpm test:dist`, `pnpm test:e2e` (both with the new topdown twins; baseline today: 873 tests / 91 files).
- **CA-22** (NULA): Human protocol (~3 min, below): topdown demo feel, visible y-sort occlusion, camera feel with vertical lookahead, NPC line, art looks right; platformer demo unchanged.
- **CA-23** (NULA): npm bootstrap agenda: before the next `v*` tag, hand-publish `@waica/archetype-topdown@<current version>` with 2FA and configure its Trusted Publisher (per `/publish` §0) — otherwise the tag's publish run fails on the new package. Human-only, checklisted in the PR.

## Fuera de alcance
- Projectiles/bow, real dialogue system, melee — future stages on the same example (handoff).
- Isometric implementation, iso grid, 8-direction art/mirroring at runtime (the contract stays 4-dir; iso remains design-ready only).
- Tilemap primitive, spatial hash/broadphase work (O(n²) risk stays measured-later), rooms/flip-screen camera.
- Publishing to npm (human-only; this spec only leaves the wiring ready) and the `Home.demo()` landing shortcut (stays platformer).
- The `AnimatedSprite` configurable anchor (deferred from the hardening; bottom-center suffices per handoff assumption).

## Inferencias
| # | Inferencia | Elección | Alternativa razonable | Confianza | Resolución |
|---|---|---|---|---|---|
| 1 | Concrete actions/bindings | `up/down/left/right` (arrows+WASD) + `interact` (KeyE, Space) | Other key layout / implicit axes | alta | confirmada |
| 2 | CC0 art sourcing | The run downloads a qualifying Kenney CC0 pack (complementing from another CC0 pack if needed), commits used sprites + license | Generated placeholder art / user-provided files | baja | elegida por usuario: descarga CC0 en el run |
| 3 | Diagonal facing rule | Dominant axis wins; ties keep last facing | Horizontal wins / last cardinal input | media | confirmada |
| 4 | NPC interact mechanism | `Interactable {line, radius}` component + player-role interact lookup → stats+ui | Role-only logic / Hitbox-overlap trigger | media | confirmada |
| 5 | Demo enemies/pieces | Reuse Patrol/Chaser/Collectible/Health/Hazard | New dedicated topdown enemy | media | confirmada |
| 6 | `examples/topdown` app | Yes — mirror of examples/platformer, new sync-scene target | Demo only as archetype default scene | media | confirmada |
| 7 | TopDownMotor shape | 8-dir normalized, shared per-axis solver, both providers, no gravity | Minor variants | alta | confirmada |
| 8 | `manifest.animation` wiring | `installDirectionalAnimation(ARCHETYPE.animation ?? null)` after `installArchetype`, engine API unchanged | Extend `installArchetype` signature | media | confirmada |
| 9 | Conformance suite timing | Born in this spec, parameterized over both archetypes | Defer again | media | confirmada |
| 10 | Editor UI for lookaheadY + y-sort | Include: slider + scene toggle (`setRenderProp`) | Defer to a later editor change | media | confirmada |
| 11 | Y-sort seam refactor | Include minimal: opt-in engine interface replaces instanceof | Keep instanceof | media | confirmada |
| 12 | Picker blurb copy | "Zelda-style overhead view: 8-direction movement with depth-sorted drawing." | Other copy | alta | confirmada |

## Verificabilidad
**Mixed, ALTA-dominant: CA-1..CA-19 ALTA** — pure data + components with existing harness molds (platformer package tests, motor harness, state-machine harness, template snapshot, known-archetypes/create-project tests), all runnable via `pnpm test` (green today: 873 tests, ~4.5s, verified 2026-08-10 on `main`). **CA-20, CA-21 MEDIA** — browser e2e legs: deterministic by design, host-Chrome-dependent (contract rungs 5-6, verified 2026-08-08/10). **CA-9 (visual), CA-22, CA-23 NULA** — game feel, art quality and the npm bootstrap are human by nature; protocols below. No generation policies are active; blast radius ~50 files across a new package + behaviors/editor/mcp/scripts/workflow/skill matches the accepted Spec 1/hardening precedent. **Special risk**: the art download needs network + kenney.nl availability during the run — a one-time exception to the contract's local-only profile; once committed, everything is local and deterministic again.

## Plan de verificacion
**Mechanism (user-chosen): vitest TDD + conformance suite + structural greps + command checks + dist/e2e topdown twins + full ladder + human protocol.**
- CA-1..CA-19: `pnpm test` — each CA maps to named unit tests written test-first where behavior is new; molds: `manifest/prefabs/controls/registry-data/update-schedules` twins, `platformer-motor.test` harness style, `known-archetypes/create-project/server` extensions, template snapshot for `projectFiles(…, 'topdown')`. CA-10 additionally: structural grep proves no stale "three/four packages" count in READMEs and `/publish`. CA-19 additionally: `node scripts/sync-scene.mjs && git diff --exit-code`.
- CA-16: existing render-sort/game y-sort tests must pass UNTOUCHED (the refactor proves itself against the pins Spec 1 landed).
- CA-20/CA-21: `pnpm test:e2e` and `pnpm test:dist` with the new legs, then the full ladder.
- **Order note for the runner**: land the conformance suite early (it drives the manifest/prefab work test-first); wire CA-15 before CA-20 (the e2e clip/facing assertion depends on the contract being installed); download and commit art (CA-9) before the scene/prefab CAs that reference the sheets.
- **Human protocol (CA-22, ~3 min after the PR):**
  1. `pnpm editor`, create a **Top-down** project (demo). Play: move in 8 directions (diagonals feel same speed), walk behind and in front of a tree — the draw order flips; camera leads vertically when moving up/down.
  2. Walk to the NPC, press E — a text line appears; walk away — it hides.
  3. Touch the enemy (damage), collect a collectible (counter moves).
  4. Create a platformer project — identical feel to current main.
- **Human protocol (CA-23, before the next release tag):** follow `/publish` §0 for `@waica/archetype-topdown`: `cd packages/archetype-topdown && pnpm publish --access public --no-git-checks` at the version on `main`, verify with `npm view`, then add its Trusted Publisher (repo `chichex/waica`, workflow `publish.yml`).

## Riesgos y gaps
- Art sourcing depends on network + kenney.nl during the run; if no single pack covers every sheet, the run complements from another CC0 pack (handoff-sanctioned). Committed result is deterministic; license file required.
- CA-23 is a hard release blocker by design: tagging `v*` before the bootstrap fails the publish workflow on the new package. The PR checklist carries it.
- Blast radius ~50 files with no size policy active — same accepted precedent as Spec 1.
- `pnpm test:e2e`/`test:dist` require host Chrome; the publish-CI Chrome provisioning gap from the contract (`[NEEDS-INPUT]`) is unchanged.
- Broadphase O(n²) stays unmeasured until the demo map exists; if the demo feels slow, measure there (grill deferred branch #4) — not a CA of this spec.
- The directional contract is a module-global registry (review finding, PLAUSIBLE): acceptable while one Game runs at a time; revisit if the editor ever runs two live games side by side.
