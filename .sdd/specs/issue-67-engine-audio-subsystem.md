# Spec — Engine audio subsystem: channels, positional sound, scene-aware lifetime and an inspectable mixer
<!-- Generada por /sdd-spec el 2026-09-08. Fuente: issue #67 (via grill 2026-09-04-engine-audio-subsystem). Estado: aprobada -->
<!-- SDD-Tracking: version=1; type=spec; state=approved; issue=#67; grill=2026-09-04-engine-audio-subsystem; superseded-by=none -->

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
- **CA-6 — Autoplay unlock.** Before any keyboard or pointer input, `play()` registers nothing and starts no `AudioContext`. On the first `keydown` or click the context is created and resumed, and `play()` calls from then on behave normally. Calls made before the unlock are discarded, never queued or replayed. **[ALTA]**
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

## Riesgos y gaps

- **A gap in the source grill, found while writing this spec.** The handoff records as a resolved consequence that "the bridge's `step` mode is silent by construction". It is not: `simulate` is assigned in exactly one place in the repo — `Viewport.tsx:415`, the editor's edit↔play toggle — and the Runtime Bridge never touches it (`pause` calls `Game.stop()`, which only clears the animation loop; `step` calls `runFrame` with `simulate` still `true`). CA-5 is the explicit rule that closes it. The handoff's decision 2 should be read as covering the editor's edit mode only.
- **Single-PR risk, accepted deliberately.** Inference 2 offered splitting into two chained specs and the choice was one spec for the whole delivery. This PR will touch `engine`, `behaviors`, `archetype-isometric`, `editor`, `examples/isometric` and `mcp` at once — the largest since the isometric archetype. PR size is not a gate here, so nothing blocks it; the cost is reviewability, and the run should keep commits grouped by package so the diff can be read in passes.
- **`validation.ts` at 917 of 950 lines.** CA-13 will breach the ratchet unless the run extracts the ref-resolution module first. This is a hard gate, not advice.
- **ADR 0012's asymmetry needs to be visible in the code.** A sound dying by default inverts `GameUi`'s survive-by-default, and a reviewer will read it as an oversight unless the code says why.
- **CA-8's two coordinate spaces need a comment.** Attenuation in logical space and panning in projected space is correct and looks like a bug.
- **`sync-scene.mjs:3` says "the stock art PNGs"** — a comment that goes stale under CA-11. The run should confirm the copy step is genuinely generic and update the comment.
- **The contract itself is stale in its counts.** `.sdd/project.md` was refreshed at 0.9.0 and records 1214 tests in 133 files; this checkout is at 0.12.0 with 1345 in 145. Commands, environments and the ladder are unchanged, so the verdict above stands, but a `/sdd-init --update` is due.
- **[NEEDS-INPUT] The concrete CC0 sound files are not chosen.** Inference 13 fixed the policy (a CC0 pack, four files, documented in `ATTRIBUTION.md`) but not the source. The run has to pick actual files and record their provenance; if none is acceptable, CA-19 and CA-21 stall while CA-1…CA-18 and CA-20 remain deliverable.
