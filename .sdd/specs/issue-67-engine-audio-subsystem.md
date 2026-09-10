# Spec — Engine audio subsystem: channels, positional sound, scene-aware lifetime and an inspectable mixer
<!-- Generada por /sdd-spec el 2026-09-08. Fuente: issue #67 (via grill 2026-09-04-engine-audio-subsystem). Estado: implementada -->
<!-- SDD-Tracking: version=1; type=spec; state=implemented; issue=#67; grill=2026-09-04-engine-audio-subsystem; superseded-by=none -->

## Contexto

There is no audio anywhere in Waica: a grep for `audio`, `sound`, `.mp3`, `.ogg` or `.wav` across `packages/*/src` and `examples/*/src` returns nothing — no playback, no mixer, no asset type. A project can drop an `<audio>` element in and get a menu click, but nothing that follows what only `Game` owns: the pause (`game.ts:407`), the scene lifecycle (`unloadScene`, `game.ts:186`), the camera, and session state.

The seams this lands on already exist. `game.ts:417` calls `this.ui.setActive(this.simulate)` right after the simulation guard — the mould for a subsystem that reacts to the pause. `registerSceneCatalog` (`game.ts:204`) stores a registry that survives `unloadScene()`, so a session-scoped resolver is already available. `import.meta.glob('./art/*', { query: '?url' })` in all three examples and the template is extension-agnostic, so hosts already serve audio files. `ArchetypeArt` is `{file, uri}` with nothing image-specific, and `create-project.ts:47` / `template.ts:29` emit it generically. `ParamSpec.ref` exists (`component.ts:14`) and `validate_project` consumes it in a `switch` (`validation.ts:207-251`).

The 24 decisions behind this spec were closed in `.sdd/grills/2026-09-04-engine-audio-subsystem.md` and are not reopened here. Two of them are archived as ADR 0012 (a sound dies with its scene unless it says otherwise) and ADR 0013 (audio reaches the browser through a replaceable seam).

## Comportamiento esperado

### Engine — the subsystem

- **CA-1 — Playback, channels and master.** `game.audio.play(uri, opts)` hands the backend the resolved uri, the channel, the volume and the loop flag. `music` and `sfx` exist from construction at volume 1; naming any other channel in `play()` creates it at volume 1; `game.audio.channels()` enumerates every channel including runtime-created ones; setting the master scales every channel's effective volume. Muting a channel makes its sounds inaudible without stopping them. **[ALTA]**
- **CA-2 — The handle.** `play()` returns a handle exposing `stop()`, a readonly `playing`, a mutable `volume`, and `stop({ fadeMs })`. `playing` is `true` until the sound ends or is stopped. Setting `volume` changes the sound's gain while it plays. `stop({ fadeMs })` ramps the gain to zero over that many milliseconds before releasing, and `playing` stays `true` for the length of the ramp. **[ALTA]**
- **CA-3 — The mixer does not persist.** A freshly constructed `Game` reports master and every factory channel at their defaults, regardless of what a previous `Game` in the same page set. Nothing is written to `localStorage`, `sessionStorage` or `waica.params.json`. **[ALTA]**
- **CA-4 — The editor's pause suspends audio.** Setting `game.simulate = false` suspends the audio output; setting it back to `true` resumes it. Sounds in flight are not stopped or restarted — they resume where they were. **[ALTA]**
- **CA-5 — A registered Runtime Bridge silences the output but not the model.** While a Runtime Bridge is registered, nothing reaches the audio device, and `play()` still registers the sound: it appears in the live-sound list, on its channel, with its scope, and its handle behaves per CA-2. *(Resolves a gap the grill left: `simulate` is assigned in exactly one place in the repo — `Viewport.tsx:415` — and the bridge never touches it, so CA-4 does not cover stepped mode.)* **[ALTA]**
- **CA-6 — Autoplay unlock.** Before any keyboard or pointer input, `play()` registers nothing and starts no `AudioContext`. On the first `keydown` or click the context is created and resumed, and `play()` calls from then on behave normally. Calls made before the unlock are discarded, never queued or replayed. Registering a Runtime Bridge also satisfies the unlock, without producing any output — see `[DEVIATION 2026-09-08]`. **[ALTA]**
- **CA-7 — Scene scope (ADR 0012).** `unloadScene()` stops every sound started without a scope and leaves every sound started with `{ scope: 'session' }` playing, with its handle still reporting `playing === true`. **[ALTA]**
- **CA-8 — Positional audio.** `play(uri, { at: entity })` recomputes the sound's placement every frame from that entity's current position; `play(uri, { at: { x, y } })` fixes it; omitting `at` produces a flat sound with no panning or attenuation. Attenuation is derived from the distance between the listener and the source in **logical** coordinates; panning is derived from their positions after `game.renderPoint()`, so under `projection: 'isometric'` a source that appears to the right pans right while its volume still reflects real game distance. **[ALTA]**
- **CA-9 — Loading, caching and failure.** The first `play()` of a uri fetches and decodes it once; a second `play()` of the same uri reuses the decoded buffer and issues no second fetch. `game.audio.preload(uris)` returns a promise that resolves even when one of the files fails. A uri that cannot be fetched or decoded logs one warning for that uri and never throws; subsequent `play()` calls for it stay silent without warning again. **[ALTA]**
- **CA-10 — Teardown.** `game.dispose()` stops every live sound, including session-scoped ones, and closes the `AudioContext`. **[ALTA]**

### Assets and behaviors

- **CA-11 — Sounds are art with a declared kind.** Every `ArchetypeArt` entry carries `kind: 'image' | 'sound'`. The isometric archetype declares four sound entries. Creating a project through either path — `packages/mcp/src/create-project.ts` and the editor's `template.ts` — emits those files into `src/art/` and rewrites their uris to project paths, exactly as it already does for images. **[ALTA]**
- **CA-12 — Behaviors trigger the sounds.** `MeleeAttack` declares a `swingSound` param and `Health` declares a `hurtSound` param, both with `ParamSpec.ref: 'sound'`. Striking plays the configured swing sound; taking damage plays the configured hurt sound at the damaged entity's position. A component with the prop unset plays nothing and logs nothing. The isometric archetype configures a different `hurtSound` for the player (`prefabs.ts:126`) and the orc (`prefabs.ts:181`). **[ALTA]**

### MCP

- **CA-13 — `validate_project` validates sound references.** A prefab whose sound prop names a uri that exists in neither the archetype's art nor the project's `src/art/` produces a `missing-sound` finding at **error** severity, symmetric with `broken-prefab-ref`. A prop naming an existing sound produces no finding, and an unset prop produces no finding. **[ALTA]**
- **CA-14 — `describe_archetype` exposes the kind.** Every art entry it returns carries its `kind`, so a caller can tell a sound from a sprite without inspecting file names. **[ALTA]**
- **CA-15 — The snapshot carries audio.** `RuntimeSnapshot` gains `audio: { master, channels: { <name>: { volume, muted } }, playing: [{ uri, channel, scope }] }`, sorted deterministically. It is included by default and can be excluded through `RuntimeSnapshotFilters` like any other section. **[ALTA]**
- **CA-16 — The audio snapshot survives real stdio.** Driving a controlled isometric Project through the built CLI over real MCP stdio in Chrome: after the steps that trigger the sword swing, `inspect_runtime` reports the swing's uri in `audio.playing` on the `sfx` channel, and the run produces no audio output. **[MEDIA]**

### Editor

- **CA-17 — The library and the pickers learn audio.** The asset library lists `.ogg` files found in `src/art/` alongside images, and importing `.ogg` files writes them to `src/art/` — both paths today gated by `IMAGE_RE` (`use-project-art.ts:43` for the scan, `:204` for the import). A prop declared `ref: 'sound'` renders as a picker listing the available sounds, not as free text. **[ALTA]**
- **CA-18 — Preview.** Each sound row in the library carries a play control that sounds through the editor's own audio path, independent of the Game's subsystem, at full volume and regardless of whether the game simulates. The control is disabled while the project is in play mode. **[ALTA]**

### Demo and documentation

- **CA-19 — The isometric demo sounds.** Booting the shipped isometric scene: the sword swing, the hit landing on the orc and the damage taken by the player each play their configured sound, and a looping music bed plays on the `music` channel with `{ scope: 'session' }`. After a Scene Transition to the second scene, the music bed is still in the live-sound list and was never restarted, while the combat sounds from the previous scene are gone. **[ALTA]**
- **CA-20 — Documentation.** `packages/mcp/README.md` and `packages/cli/README.md` describe the `audio` section of the Runtime Snapshot, and `runtime-docs.test.ts` passes. `packages/archetype-isometric/assets/ATTRIBUTION.md` lists the four sound files with their CC0 source. **[ALTA]**
- **CA-21 — Game feel.** Attenuation over distance, the relative volumes of the four sounds, and the fade length used at the Scene Transition sound right to a person listening. **[NULA — requires human testing; see the protocol below]**

## Fuera de alcance

- **#74 (camera effects), #76 (asset loader), #68 (fixed timestep).** #76 will later replace the fetch layer under CA-9 without changing that contract.
- **No format changes**: the scene format (`waicaScene: 3`) and the project format (`waicaGame: 1`) are untouched. Channels are not declared in `game.json`; sounds are not declared per scene.
- **No audio operation on `control_runtime`** — the snapshot is read-only for audio.
- **No storage inside the engine** — a host that wants to remember a player's volume does it itself.
- **No authorable `SoundEmitter` component** — sounds are triggered from behaviors and the host, not placed on entities.
- **No public attenuation parameters** — the curve is engine constants.
- **No footstep sounds**, and no automatic ducking of `music` under `sfx`.
- **No preview playback in the prop picker** — only in the library (CA-18).

## Inferencias

| # | Inferencia | Elección propuesta | Resolución |
|---|---|---|---|
| 1 | Where the editor's preview control lives and what it does in play mode | Play button per library row, disabled while the project runs | elegida por usuario: play button per library row, disabled in play mode |
| 2 | Does this spec cover the whole delivery or is it split? | Two chained specs (A: engine + behaviors + MCP; B: editor + content) | elegida por usuario: **one single spec for the whole delivery** — see Riesgos |
| 3 | Shipped audio file format | `.ogg` throughout | confirmada |
| 4 | Shape of the kind field on `ArchetypeArt` | `kind: 'image' \| 'sound'`, required | confirmada |
| 5 | Names of the sound props | `MeleeAttack.swingSound`, `Health.hurtSound`, configured per prefab | confirmada |
| 6 | Where the subsystem lives in the engine | `packages/engine/src/audio/`, like `animation/`, `components/`, `state/` | confirmada |
| 7 | What `play()` does when a uri fails to load or decode | Warn once per uri and continue; never throw | confirmada |
| 8 | What `preload()` returns | `Promise<void>` that resolves even if a file fails | confirmada |
| 9 | Extensions the editor accepts | A new `AUDIO_RE` beside `IMAGE_RE`; scan and import accept both | confirmada |
| 10 | Severity of `missing-sound` | Error, symmetric with `broken-prefab-ref` | confirmada |
| 11 | Shape of the snapshot's audio section | `{ master, channels: { name: { volume, muted } }, playing: [{ uri, channel, scope }] }` | confirmada |
| 12 | When the `AudioContext` is constructed | Lazily, at unlock; `game.audio` always exists | confirmada |
| 13 | Concrete source of the CC0 content | A CC0 pack — four files: swing, hit, hurt, music | confirmada |
| 14 | What happens to audio under the bridge's paused/step mode, given `simulate` stays `true` | Bridge registered ⇒ output silenced, model intact | elegida por usuario: output silenced, model intact |

Inferences 1 and 14 were opened by gaps the grill left; 14 was found by cross-checking the handoff against the code (see Riesgos).

## Verificabilidad

**Global: MIXTO, dominante ALTA — 19 ALTA, 1 MEDIA, 1 NULA.**

The reason in one line: decision 11 of the grill (an audio backend injectable through `GameOptions.audio`, archived as ADR 0013) turns what would have been a browser-only feature into one that is almost entirely assertable on the cheapest rung.

- **ALTA (CA-1…CA-15, CA-17, CA-18, CA-19, CA-20)** — rung 2 of the ladder. `pnpm test` was run against this checkout while writing this spec: **1345 tests in 145 files, all passing, 5.89s**. The injected backend records exactly what the real WebAudio implementation would receive, so these assertions observe real behaviour rather than a mock asserting itself. The editor criteria are ALTA because the editor already has 39 test files including React component tests (`viewport-scene-swap.test.tsx`).
- **MEDIA (CA-16)** — rung 5. `pnpm test:e2e` (~17s) needs a host-installed Chrome and drives real processes; deterministic in its gameplay assertions, but exposed to host failures.
- **NULA (CA-21)** — `.sdd/project.md` lists game feel as not verifiable without a human, and grill decision 20 assumes exactly that: the curve is tuned once by ear and frozen.

### Conflicts with the contract's generation policies

- **`max-lineas-archivo` (950) — a live conflict, not a hypothetical.** `packages/mcp/src/validation.ts` is at **917 lines**; 33 remain. CA-13 adds a `switch` case plus its resolution branch. **The run must extract the ref-resolution logic into its own module instead of growing that file**, and that new module needs its own `.test.ts` under `tests-acompañan-src`.
- **`tests-acompañan-src`** — `engine`, `behaviors`, `mcp`, `editor` and `archetype-isometric` all gain new `.ts` under `src/`; each needs at least one `.test.ts` in the same PR. The verification plan already produces them.
- **`higiene-ts-diff` and `naming-archivos`** — routine. Files under `packages/engine/src/audio/` go in kebab-case; no `any`, `@ts-ignore`, `export default` or `enum` on new lines.
- **PR size is not an active gate** in this repo (offered and declined 2026-08-06), so no partition is forced — but see Riesgos.

## Plan de verificacion

| CA | Mechanism |
|---|---|
| CA-1…CA-15, CA-17, CA-18, CA-20 | `pnpm test` — vitest with the injected audio backend and happy-dom. Assertions name the uri, channel, volume, loop, scope and lifecycle event the backend received |
| CA-19 | `pnpm test` — an integrated test in the style of `examples/isometric/src/demo-combat.test.ts`: real `Game` plus `loadScene`, `WebGLRenderer` mocked through the engine's own three copy, audio backend injected. Asserts the three combat triggers, then a scene swap, then that the music handle is still the same object and still playing while the combat sounds are gone |
| CA-13 | `pnpm test` — extend `packages/mcp/src/param-reference-validation.test.ts` with a valid ref, a broken ref and an unset prop |
| CA-16 | `pnpm test:e2e` — a new leg in `scripts/runtime-e2e.mjs`: controlled isometric Project through the built CLI over real MCP stdio, step to the swing, then `inspect_runtime` and assert `audio.playing` contains the swing uri on `sfx` |
| CA-21 | Human test protocol (below) |
| all | Standard ladder before the PR: `pnpm typecheck` → `pnpm test` → `pnpm build` → `pnpm test:dist` |

### Human test protocol (CA-21)

1. Run `pnpm dev:isometric` and open the printed URL.
2. Press any key to unlock audio. Confirm the music bed starts.
3. Walk up to the orc and attack. Confirm the swing and the hit read as two distinct sounds, and that neither buries the music.
4. Walk away from the orc and attack again. Confirm the sound is perceptibly quieter with distance.
5. Take a hit from the orc. Confirm the damage sound is legible without looking at the screen.
6. Cross the door into the second scene. Confirm the combat sounds stop and the music neither cuts nor restarts.
7. Confirm no relative volume feels out of place. If any does, adjust the engine attenuation constants and repeat — this is the one-time tuning grill decision 20 budgeted for.

## Desviaciones

- **`[DEVIATION 2026-09-08]` — a registered Runtime Bridge satisfies the autoplay unlock.** CA-5 requires `play()` to register sounds while a bridge is registered, and CA-6 gates registration on a real `keydown`/`pointerdown`. Those two cannot both hold as written: `Input.injectAction` (`input.ts:55-69`) mutates internal sets directly and dispatches **no DOM event**, so a bridge-driven run never produces a trusted gesture — `play()` would register nothing, CA-5 would be unimplementable, and CA-16 would have nothing to observe in `audio.playing`. Resolved by having bridge registration flip the one-way unlock latch while immediately silencing output, so the model records and no audio device is ever touched. Scope unchanged. Covered by the CA-5 test in `packages/engine/src/audio/game-audio.test.ts`, which asserts `resumeCalls`/`suspendCalls` stay at 0 throughout.
- **`[DEVIATION 2026-09-08]` — the snapshot's audio section is not filterable.** CA-15 says audio is "filterable like any other section", but no section of `RuntimeSnapshot` is filterable today: `RuntimeSnapshotFilters` (`runtime-inspection.ts:29-33`) filters entities only, and `stats`, `scene`, `entities` and `projectionIssues` are always emitted. Audio is emitted unconditionally like every other section rather than inventing the first section filter. Scope unchanged.
- **`[DEVIATION 2026-09-08]` — a looping sound requested before the autoplay unlock is retained, not discarded.** CA-6 discards every pre-unlock call, following grill decision 3, whose stated reason is that queued one-shots would all fire at once at unlock and sound broken. But a host starts its music bed in `main()`, synchronously at page load, which is by definition before any gesture — so the isometric demo's bed was discarded and never returned: combat sounds worked (their calls come later) and the music was simply gone, with no error. Found by the demo group, confirmed at `audio-subsystem.ts:89`. Resolved by retaining **only** `loop: true` calls and starting them at unlock; non-looping pre-unlock calls are still discarded, which preserves decision 3's actual reason since a bed is deliberate, singular, and does not go stale by waiting. Scope unchanged.
- **`[CORRECTION 2026-09-08]` — `game.audio.play()` now resolves uris through the session-scoped catalog registry.** Not a deviation: CA-1 already required `play()` to hand the backend the *resolved* uri, and the first implementation did no resolution at all, so any direct call (a project role, or the host) reached `fetch('waica:…')` and died on an unregistered URL scheme — total silence with one warning. Resolution goes through `sceneCatalog.registry` rather than `game.registry`, because `unloadScene()` nulls the latter and a `{ scope: 'session' }` bed must outlive the swap.
- **`[DEVIATION 2026-09-08]` — CA-3 drops its storage-API assertion.** `localStorage`/`sessionStorage` are not reachable in this vitest environment (Node warns `localStorage is not available because --localstorage-file was not provided` and the property throws), and no existing test in the repo touches them. The substantive check is kept — two independent `Game` instances share no mixer state — plus a source-level grep confirming the audio sources reference neither storage API nor `waica.params.json`.

## Riesgos y gaps

- **A gap in the source grill, found while writing this spec.** The handoff records as a resolved consequence that "the bridge's `step` mode is silent by construction". It is not: `simulate` is assigned in exactly one place in the repo — `Viewport.tsx:415`, the editor's edit↔play toggle — and the Runtime Bridge never touches it (`pause` calls `Game.stop()`, which only clears the animation loop; `step` calls `runFrame` with `simulate` still `true`). CA-5 is the explicit rule that closes it. The handoff's decision 2 should be read as covering the editor's edit mode only.
- **Single-PR risk, accepted deliberately.** Inference 2 offered splitting into two chained specs and the choice was one spec for the whole delivery. This PR will touch `engine`, `behaviors`, `archetype-isometric`, `editor`, `examples/isometric` and `mcp` at once — the largest since the isometric archetype. PR size is not a gate here, so nothing blocks it; the cost is reviewability, and the run should keep commits grouped by package so the diff can be read in passes.
- **`validation.ts` at 917 of 950 lines.** CA-13 will breach the ratchet unless the run extracts the ref-resolution module first. This is a hard gate, not advice.
- **ADR 0012's asymmetry needs to be visible in the code.** A sound dying by default inverts `GameUi`'s survive-by-default, and a reviewer will read it as an oversight unless the code says why.
- **CA-8's two coordinate spaces need a comment.** Attenuation in logical space and panning in projected space is correct and looks like a bug.
- **`sync-scene.mjs:3` says "the stock art PNGs"** — a comment that goes stale under CA-11. The run should confirm the copy step is genuinely generic and update the comment.
- **The contract itself is stale in its counts.** `.sdd/project.md` was refreshed at 0.9.0 and records 1214 tests in 133 files; this checkout is at 0.12.0 with 1345 in 145. Commands, environments and the ladder are unchanged, so the verdict above stands, but a `/sdd-init --update` is due.
- **[NEEDS-INPUT] The concrete CC0 sound files are not chosen.** Inference 13 fixed the policy (a CC0 pack, four files, documented in `ATTRIBUTION.md`) but not the source. The run has to pick actual files and record their provenance; if none is acceptable, CA-19 and CA-21 stall while CA-1…CA-18 and CA-20 remain deliverable.

## Resultado de ejecucion (2026-09-08 · HEAD c5dd8d2)

Ladder run to its ceiling on this HEAD: `pnpm typecheck` clean across all 11 workspace projects · `pnpm test` **1456 tests in 154 files, all passing** (baseline on `main` was 1345 in 145) · `pnpm build` clean · `pnpm test:dist` green including its packed browser leg · `pnpm test:e2e` green on Google Chrome 152.0.7977.83.

| CA | Estado | Evidencia |
|---|---|---|
| CA-1 · CA-2 · CA-3 | verificado | `pnpm test packages/engine` — channels/master/handle/no-persistence asserted against the injected backend |
| CA-4 · CA-5 | verificado | `pnpm test` — `setActive` suspends and resumes; a registered bridge silences output while `liveSounds()` keeps recording. A deliberate mutation reintroducing the spurious resume→suspend was caught red |
| CA-6 | verificado | `pnpm test` — pre-unlock one-shots discarded, never queued; loops retained (see the deviation) |
| CA-7 | verificado | `pnpm test` — `unloadScene()` stops scene-scoped sounds and leaves `{ scope: 'session' }` playing |
| CA-8 | verificado | `pnpm test packages/engine` — the decisive case: two sources at equal *logical* distance but different compass directions get identical attenuation, proving logical and not projected distance drives volume |
| CA-9 · CA-10 | verificado | `pnpm test` — one fetch per uri, `preload` resolves through a failure, warn-once, `dispose()` closes the context |
| CA-11 · CA-12 | verificado | `pnpm test` — `ArchetypeArt.kind`, four sound entries, both project-creation paths emit them; `swingSound`/`hurtSound` fire on strike and on damage. The `.ogg` files are verified to start with the `OggS` magic bytes |
| CA-13 | verificado | `pnpm test packages/mcp` — `missing-sound` at error severity for a broken ref, silent for a valid one and for an unset prop |
| CA-14 · CA-15 | verificado | `pnpm test` — `describe_archetype` carries `kind`; `RuntimeSnapshot.audio` carries master, channels and live sounds, deterministically ordered |
| CA-16 | verificado | `pnpm test:e2e` — Chrome 152, generated Project over real MCP stdio: the mixer is inspectable, the bed is live at boot on `music`/`session`, the swing reaches `playing` on `sfx`/`scene` |
| CA-17 · CA-18 | verificado | `pnpm test packages/editor` — library and import accept `.ogg`, `ref: 'sound'` renders a picker, sound rows carry a play control disabled in play mode |
| CA-19 | verificado *(corregido — ver abajo)* | `pnpm test examples/isometric` — the three combat triggers, and the bed proven **not restarted** across a Scene Transition by exactly one backend `play()` call for its uri and an empty `stops` list. Confirmed again in a real browser by CA-16. **This row originally overstated the result**: `demo-audio.test.ts` imports `ARCHETYPE` and the scenes from the `@waica/archetype-isometric` package, so it proved the archetype and said nothing about the example's own shipped files — which had never been re-synced, leaving `pnpm dev:isometric` with music and no combat sounds. Caught by code review, fixed by running `scripts/sync-scene.mjs`, and now guarded by `examples/isometric/src/example-art-and-sound-sync.test.ts`, which fails on an unsynced tree |
| CA-20 | verificado | `pnpm test packages/mcp` — `runtime-docs.test.ts` green with both READMEs documenting the audio section; `ATTRIBUTION.md` records all four files with their CC0 provenance |
| CA-21 | **pendiente de prueba humana** | Not automatable by design. The 7-step protocol above is the checklist; it is in the PR body |
| POL-higiene-ts-diff | cumplida | Both greps over the diff: 0 hits |
| POL-tests-acompañan-src | cumplida | `engine`, `mcp` and `editor` each gained new `src/*.ts` and each gained `*.test.ts` in the same change |
| POL-max-lineas-archivo | cumplida | Largest touched `.ts` is `packages/mcp/src/validation.ts` at **882** (was 917; CA-13's extraction to `param-reference-resolution.ts` bought the headroom the spec demanded). Cap 950 |
| POL-naming-archivos | cumplida | All 17 new files under `src/` match the contract's pattern |

### Notes a reviewer should read

- **Three defects were found by integration, not by unit tests, and all three were real.** (1) The demo's music bed was discarded forever because `play()` ran at boot, before any gesture — combat sounds worked, so the symptom was "audio but no music" with no error. (2) `play()` resolved no `waica:` uri at all, so any direct call died on an unregistered URL scheme; component props only worked because the scene loader resolves them at spawn. (3) A generated project got no music because its `main.ts` comes from the generic editor template, not from `examples/isometric` — found by the browser gate, closed by giving the manifest an optional `music` field.
- **A green test was found to be green over a real bug.** `demo-audio.test.ts` originally called `unlock()` before the boot music `play()`, inverting the real world's order and hiding defect (1). The ordering was corrected and the corrected test was verified meaningful by reverting only the fix and watching it fail.
- **Three editor `.tsx` files exceed 950 lines** — `Inspector.tsx` (2284), `Editor.tsx` (2134), `Explorer.tsx` (1185). All three were already over on `main` (2272 / 2128 / 1126); this change added +12 / +6 / +59. The contract's `max-lineas-archivo` gate is written against `.ts` and its script measures `.ts`, so the gate passes as declared. Reported here rather than silently, and left alone per the repo's rule that pre-existing findings are not fixed inside an unrelated change.
- **One anomalous test run was observed and could not be reproduced.** During a period of concurrent worktree creation and `pnpm install`, a full-suite run reported one extra failure. Seven subsequent full-suite runs — 3 on `main` (1345/1345) and 4 on this branch (1456/1456) — were clean, as were 5 isolated runs of the two process-spawning tests involved (`runtime-dev-server`, `project-component-process`). Not attributable to this change, and not proven pre-existing either.

## Remediacion de review (2026-09-09 · PR #82)

An automated review left 11 inline findings. Each was validated against the code before acting; ten held and were fixed with a regression test first, one was rejected with evidence. Ladder after remediation: `pnpm typecheck` clean · `pnpm test` **1472 tests in 156 files** · `pnpm build` clean · `pnpm test:dist` green · `pnpm test:e2e` green on Chrome 152.

| Finding | Disposicion | Evidencia |
|---|---|---|
| The isometric example was never re-synced — `pnpm dev:isometric` had music and no combat sounds | corregido | `scripts/sync-scene.mjs` run; guarded from now on by `examples/isometric/src/example-art-and-sound-sync.test.ts`, which failed on the unsynced tree first. **This is the finding that corrects CA-19's row above** |
| `updatePlacements()` overwrote a fading sound's gain every frame, cancelling `stop({ fadeMs })` | corregido | Regression test failed with 3 `setVolume` calls instead of 1; `LiveSound.fading` now excludes it from the per-frame pass |
| `FakeAudioBackend` shipped inside the published `@waica/engine` and its CLI-vendored copies | corregido | `tsconfig.build.json` now excludes `src/**/test-*.ts`; verified absent from both `packages/engine/dist/audio/` and `packages/cli/dist/mcp/node_modules/@waica/engine/`. Exposed a matching gap in `scripts/test-dist.mjs`, whose filter only recognised a top-level helper — fixed to match the file name |
| A sound could be dragged onto a sprite's texture | corregido | Regression test showed `onSetTexture` called with a `.ogg`; fixed at both ends (sound rows are no longer draggable, and the drop target only accepts uris from its image-filtered list) |
| The editor's sound preview could not be stopped and overlapped itself — one click started 97.5 s of music | corregido | `BrowserSoundPreview` now tracks the single preview in flight; the control became a play/stop toggle and stops on entering play mode |
| `validate_project` blessed sound uris the runtime cannot resolve (nested paths) and non-audio files | corregido | `projectSoundRefs` is now non-recursive, matching `import.meta.glob('./art/*')`, and filters to `.ogg`. The pre-existing test that encoded the old contract was tightened, not loosened |
| `MeleeAttack` played its swing flat while `Health` played its hurt positionally | corregido | `{ at: this.entity }` added, matching the `Health` precedent; no evidence the asymmetry was deliberate |
| `[...channels()].sort()` copied a fresh array twice | corregido | `channels()` confirmed to return a new array on every call |
| `ed-sound-play` / `ed-x-sound` had no CSS rules | corregido | Rules added using the panel's existing tokens. Visual only — **honestly not covered by a test** |
| The `inertHandle` doc comment described a path the code does not take | corregido | Control flow verified; a failed uri returns a real handle with `ended = true`, not an inert one |
| `preload()` constructs the `AudioContext` before a gesture, said to violate CA-6 | **rechazado** | CA-6 is written about `play()`. An `AudioContext` is born suspended, so decoding is not output, and `web-audio-backend.ts:14-16` documents this exception deliberately — CA-9's `preload()` cannot decode without it |

A sub-claim of the validator finding was also rejected: `public/` uris are correctly reported as `missing-sound`, because no `resolveAsset` in the repo maps them and they 404 in an exported project. Widening the validator would have made it bless a reference that breaks at runtime. Noted, not fixed: `public/`-placed **images** have the same unreachability and no validation at all — a pre-existing gap, left for its own change.

### Segunda ronda de review (2026-09-09)

A second automated review left nine further findings on `21276bc`, and conceded the CA-6 rebuttal from the first round ("no lo leo como violación de spec"). All nine held; all were fixed with a regression test first. Ladder after: `pnpm typecheck` clean · `pnpm test` **1490 tests in 158 files** · `pnpm build` clean · `pnpm test:dist` green · `pnpm test:e2e` green on Chrome 152 · four policy gates green.

| Finding | Disposicion | Evidencia |
|---|---|---|
| `preload()` warmed the package's copies while the synced prefabs played the project's — the preload heated nothing that sounds | corregido | Test derives the expected set from `ARCHETYPE.art` cross-referenced against the shipped prefabs, so it keeps catching drift; failed first with `['waica:iso-hit', …]` vs `['src/art/waica-iso-hit.ogg', …]` |
| A generated demo project shipped a dead 1.0 MB copy of the music: `ARCHETYPE.music` is a `waica:` uri, so it always resolved to the package | corregido | `create_project` now rewrites `music` to `src/art/<file>` for `demo`, exactly as prefab props already were; `blank` keeps the `waica:` uri. Both generation paths changed together — `create-project.test.ts` compares them byte-for-byte |
| The editor's preview toggle was keyed by a volatile object URL, so any re-scan left an unstoppable preview | corregido | The same broken state an earlier fix removed, reached by another door. Keyed by `path` now, plus a stop on deleting the playing file — both halves proven necessary by disabling each in turn |
| The editor's Play mode never started the music bed, so the same project sounded different under `pnpm dev` and inside the editor | corregido | Fixed in `Viewport.tsx`, which is where the Play-mode `Game` is actually built — not in `Editor.tsx`, where the finding pointed |
| `handle.volume` during a fade wrote straight to the backend, undoing the ramp | corregido | Same mechanism as the already-fixed placement bug, different door. The setter now stores the value but skips the backend write while fading |
| A fade requested while the output is suspended never came due, leaving the sound `playing: true` forever | corregido | The reviewer rated their own confidence low-medium and had not tried it in a browser; the mechanism was verified and is real — `context.currentTime` freezes while suspended, and a Run Session stays suspended for its whole life |
| `liveSounds()` promised "every currently-playing sound", which the set does not guarantee | corregido | Docstrings plus both READMEs now say it means "the mixer accepted these calls" — it also holds a loop retained before the unlock, a sound still loading, and one about to fail |
| Both READMEs still described the pre-narrowing `missing-sound` rule | corregido | They now state the two constraints (`.ogg`, and directly in `src/art/`) and why: the hosts glob `./art/*`, which never crosses a `/` |
| The sync test matched prefab components by index rather than by type | corregido | Order-independent now. Checked before assuming: two components of the same type on one entity is already rejected by the engine as `duplicate-component` |
| *(first round)* `preload()` constructs the `AudioContext` before a gesture | conceded by the reviewer | The spec point was accepted; the code now carries a comment saying the construction is deliberate, so the next reader does not re-file it |
