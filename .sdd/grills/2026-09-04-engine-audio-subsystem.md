# Grill — Engine audio subsystem (issue #67)
<!-- State: finalized. Project: /Users/ayrtonmarini/Sync/workspace/waica. Source: issue #67 "The engine has no audio subsystem", routed here by /issue-triage. -->
<!-- SDD-Tracking: version=1; type=grill; state=finalized; issue=#67; grill=2026-09-04-engine-audio-subsystem; project=%2FUsers%2Fayrtonmarini%2FSync%2Fworkspace%2Fwaica -->

## Mode

domain-modeling

## Verified facts

### Starting point

- **F1 — There is no audio anywhere.** `grep -riE 'audio|sound|\.mp3|\.ogg|\.wav'` over `packages/*/src` and `examples/*/src` returns nothing. No playback, no mixer, no asset type.
- **F2 — The pause seam already has a mould.** `game.ts:407` gates simulation on `this.simulate`; `game.ts:417` immediately calls `this.ui.setActive(this.simulate)`. `dispose()` (`game.ts:373`) already tears down `input`, `pointer`, `ui` and `renderer`.

### Facts that changed the triage diagnosis

- **F3 — A session-scoped asset resolver already exists.** `registerSceneCatalog({ scenes, registry })` (`game.ts:204`) stores the registry at *catalog* level. `unloadScene()` (`game.ts:186-199`) nulls only `this.registry` — the live scene's — and never touches `sceneCatalog`. What the triage read as an unresolvable clash is a choice between two references that already coexist.
- **F4 — The hosts already serve audio files.** `import.meta.glob('./art/*', { query: '?url' })` in all three examples and the editor template (`examples/*/src/main.ts:63-64`) is extension-agnostic: dropping `hit.ogg` into `src/art/` already yields `artUrls['src/art/hit.ogg']`. The only extension filter lives in the editor's library (`use-project-art.ts:43`, `IMAGE_RE`).
- **F5 — Asset emission is generic over `{file, uri}`.** `create-project.ts:47`, `template.ts:29,55` and `sync-scene.mjs:100` all map `archetype.art` into `src/art/<file>` with nothing image-specific. None of them propagates `main.ts`.
- **F6 — `ParamSpec.ref` exists and `validate_project` consumes it.** `component.ts:14` declares `ref?: 'prefab' | 'stat' | 'action' | 'clip'`; `validation.ts:207-251` is a `switch (spec.ref)` where each kind produces its own finding code (`broken-prefab-ref`, `missing-clip`, …).
- **F7 — `describe_archetype` already exposes the art catalog** (`introspection.ts:188`, `art: manifest.art`).
- **F8 — Runtime documentation is a test gate.** `runtime-docs.test.ts` asserts that `packages/mcp/README.md` and `packages/cli/README.md` list all 15 tools and the runtime trust and lifecycle contract.
- **F9 — `Health` already emits game-level events**: `game.events.emit('damage', …)` (`health.ts:168`) and `'death'` (`health.ts:224`). `MeleeAttack.strike()` emits nothing — the state graph calls it directly.
- **F10 — Under isometric the scene graph holds projected positions.** `renderSurface` overwrites `entity.node.position` with `projectIsometric(...)` every frame (`game.ts:466-471`). `game.renderPoint()` converts logical to render space, and `setSceneCamera` already uses it.
- **F11 — `happy-dom@20.11.0` has no audio.** Verified directly: `AudioContext`, `AudioBuffer` and `GainNode` are all `undefined`; only `Audio`/`HTMLAudioElement` stubs exist. `pnpm test` (1214 tests, ~6s) is the repo's cheapest strong signal and cannot exercise WebAudio without a deliberate seam. Precedent for mocking a browser subsystem: `examples/isometric/src/demo-combat.test.ts:5-27` mocks `WebGLRenderer`.
- **F12 — Bridge capabilities are additive metadata.** `RUNTIME_BRIDGE_CAPABILITIES = ['click','scene']` (`runtime-bridge.ts:18`) — not a protocol bump.
- **F13 — `three` ships `Audio`, `PositionalAudio`, `AudioListener` and `AudioContext`** in the engine's own copy. Available, and deliberately not used (decision 5).

### Dependency status

- **F14 — #66 is closed** (2026-09-03, PR #79, released in 0.12.0) and left ADR 0011, whose *Consequences* names #67 as inheriting its retention line rather than re-deciding it. #74 and #76 are peers, not prerequisites. No open blocker.

## Resolved decisions

### Frontier and lifecycle

1. **Full delivery: core + positional audio + content.** The issue contradicts itself — its "Why it belongs in the engine" section argues positional audio as a central reason, its "Expected" sketch (`play(uri, { volume, loop, channel })`) has no position parameter. Resolved in favour of positional.
2. **Pausing suspends everything, music included.** `game.audio.setActive(simulate)`, symmetric to `ui.setActive` (F2), suspending the `AudioContext`. Free consequence: the Runtime Bridge's `step` mode is silent by construction, with no separate rule. Note that "pause" here is the bridge's `paused` mode and the editor's edit↔play toggle, not a player-facing pause menu — a real pause menu stays host-side and may keep sounding.
3. **The engine unlocks on the first real input and discards anything requested earlier.** It owns both gesture sources — `Input` and `Pointer` (ADR 0010) — so it needs no host cooperation. Queueing was rejected: it fires a burst of stale sounds at unlock time, desynchronised from what happened on screen.
4. **On `unloadScene()` a sound dies by default; it survives with `{ scope: 'session' }`.** Follows the letter of ADR 0011 ("anything that must outlive a scene has to be session-scoped by construction") and matches usage frequency: nearly every `play()` is a one-shot, and music — rare and deliberate — carries the annotation. **This deliberately inverts `GameUi`'s default** (`ui.ts:169-176`), whose survive-by-default exists because the host mounts a HUD once at boot.

### Implementation and mixing

5. **WebAudio directly**, with panning and attenuation computed in-engine. `THREE.PositionalAudio` was rejected on F10: its emitters are `Object3D`s and the graph carries projected positions under isometric, so they would have to hang off a parallel node — paying for the library without using its integration with the graph, and forcing another `three` mock in tests.
6. **`music` and `sfx` exist from the start; any other channel name creates one**, all scaled by a master. Follows the `Stats` precedent (`stats.ts:33` accepts undeclared stats, `entries()` enumerates runtime-created ones). Rejected: a closed set, and channels declared in `game.json` (which would add a field to `waicaGame: 1` before any consumer asks).
7. **The mixer does not persist.** Volume and mute are pure session state, starting from defaults on every `Game`. A host that wants to remember a player preference does it in a few lines of `localStorage`. Rejected `waica.params.json` outright: that file is authoring config written by the editor and read by `loadParams` at boot, not player preference. Keeping storage out of the engine also keeps e2e runs from leaking volume state into each other.
8. **Content: the three combat moments plus a looping music bed.** Sword swing, hit landing on the orc, and damage taken by the player — all three already driven by `pnpm test:e2e`. The music bed is not decoration: since #66 the isometric demo has two scenes with a Scene Transition between them, so a bed that keeps playing across the door is the only observable proof of decision 4 and of the `music` channel end to end. Footsteps were rejected: they would open an undecided branch (trigger rate and who owns it).

### Positional audio and API

9. **`play(uri, { at })` accepts an entity or a logical point**, following the entity per frame while the sound lives; omitting `at` gives a flat sound, which is what music uses. One parameter covers all three cases. The per-frame cost rides along in the `setActive` pass that already runs. Rejected: freezing the position at trigger time (cheap now, but changing `play()`'s contract later), and an authorable `SoundEmitter` component (none of the four chosen sounds is triggered from authoring, and it would add `ParamSpec`, a palette icon and validation).
10. **Attenuation in logical space, panning in projected space.** Each half where it is correct: the distance that drives volume is the real game distance (projected distance is squashed on Y by `projectIsometric`, so a source to the north would sound closer than one to the east at equal game distance), and panning follows what the player sees, via `game.renderPoint()` (F10). This asymmetry must be documented in the code so it does not read as a bug.
11. **The audio backend is injectable through `GameOptions.audio`**, defaulting to the real WebAudio implementation. This is what makes the contract assertable on rung 2 of the ladder (F11) — a test can assert that the swing requested a given URI on `sfx`, that pausing suspended, that `unloadScene()` cut the effects and left the music. Accepted cost: a public extension point nobody asked for, which becomes surface to maintain. Rejected: null-mode-by-detection with an inspectable log (a second code path that can silently diverge from the real one) and patching `globalThis.AudioContext` per test file (fragile scaffolding, and a user's project has no clean way to test its own audio).
12. **Sounds are entries in the manifest's `art` — one catalog, not two — and `ArchetypeArt` gains an additive field declaring the asset kind.** The emission pipeline (F5) stays generic and does not change. *Originally decided as "no type change at all"; revised by decision 22, which needs the kind as data. The substance — a single catalog rather than a parallel `sounds` field — is unchanged.*
13. **The handle exposes `stop()`, a readonly `playing`, a mutable `volume`, and `stop({ fadeMs })`.** More than the issue's "a handle that can be stopped": `playing` prevents starting a second music bed on scene reload, and `volume`/`fadeMs` enable ducking and a smooth cut across the Scene Transition. Accepted cost: public surface frozen ahead of a consumer asking for it.
14. **Files are fetched and decoded on the first `play()` of each URI, with decoded buffers cached for the session**, plus an optional `game.audio.preload(uris)` the host may call at boot. Caching decoded buffers is forced — re-decoding per play is not viable. By default it behaves like textures do today, so #76 can later replace the fetch layer underneath without touching this contract. The isometric demo calls `preload()` so the first swing is not late, and demonstrates the pattern. Rejected: scene-declared preloading, which would add a field to `waicaScene: 3` and has no answer for session-scoped music that belongs to no scene.
20. **The distance attenuation curve is engine constants, with no public surface.** One fixed curve, in the spirit of `CAMERA_DEFAULTS`. Attenuation is game feel — which `.sdd/project.md` lists as not verifiable without a human — so it gets tuned once by ear and frozen. Adding parameters later breaks nobody; removing them would. Rejected per-call parameters (frozen API with no consumer, and two numbers nobody can choose without listening) and per-channel curves (re-couples the channel to something that is not mixing).

### Observability, authoring and content

15. **The `RuntimeSnapshot` gains the mixer state and the list of live sounds** (uri, channel, scope), with no control operations. This is not a nicety: by decision 2 the `AudioContext` is suspended under the bridge's `paused` mode, so nothing sounds during `pnpm test:e2e` and there is no pixel or PNG to inspect. Without the snapshot, **rung 5 of the ladder can assert nothing about audio at all**. A control operation was rejected: no use case is asking for it, and the audio is suspended in `paused` mode anyway.
16. **`MeleeAttack` and `Health` gain optional sound props**, configured by the isometric archetype in its prefabs. All three archetypes inherit the capability, and it stays visible and editable in the editor through `ParamSpec`. Accepted cost: it touches `@waica/behaviors`, a published package. Rejected: project code subscribing to `game.events` (the swing emits nothing — F9 — so an event would have to be added anyway, and the sound would be invisible to the editor) and adding an `'attack'` event to `MeleeAttack` (kept as a separate, still-valid issue).
17. **The editor learns audio, with playable preview.** The library stops filtering on `IMAGE_RE`, import writes audio into `src/art/`, the sound props declare themselves with `ParamSpec.ref` (F6, adding a value), and the library offers a play button so an author can listen before assigning. This is what makes decision 16's authorability real rather than theoretical.
18. **The host starts the music bed**, one line in `examples/isometric/src/main.ts` next to `loadSceneByName('main')`, where `loadParams` and `registerSceneCatalog` already live. It touches exactly one file, because `sync-scene.mjs` does not propagate `main.ts` (F5) and no other demo ships music. Rejected: the archetype bundle (`installArchetype` runs *before* `new Game(...)`, so it has no `game` to ask) and a scene-declared field (a scene declaring something that deliberately outlives it, plus a change to `waicaScene: 3`).
19. **The editor's preview uses its own audio path**, independent of the Game's subsystem: always full volume, no mixer, indifferent to whether the game simulates. Forced by decision 2 — in edit mode the Game's context is suspended on purpose, and preview is precisely what you want to hear in that state. Routing preview through `game.audio` with a suspend bypass was rejected: it would push an editor-only concern into the engine and weaken the rule that makes rung 5 deterministic. Accepted cost: two playback paths in the repo, and the preview does not sound exactly like the game (no attenuation, no channel).

### MCP

21. **`validate_project` gains a `'sound'` case with a `missing-sound` finding**, symmetric with the other four ref kinds (F6). Without it, sound would be the only typed reference left unvalidated, and since `validate_project` is how an agent checks its own work, a mistyped URI would survive until a human noticed the silence — the game would simply not sound, with no error anywhere.
22. **`ArchetypeArt` declares the asset kind, and `describe_archetype` passes it through.** Decision 12 leaves images and sounds in one flat catalog that `introspection.ts:188` exposes as-is, where nothing tells an agent that `waica:iso-sword-swing` belongs in `hitSound` and `waica:iso-hero` does not. One additive field answers this for the agent, for the editor's picker (17) and for the validation case (21) at once. Rejected: inferring from the file extension, which would replicate the rule across the MCP, the editor and validation — exactly the duplication ADR 0010 used to justify centralising pointer input.
23. **Audio is a filterable snapshot section, included by default**, like stats. Being on by default is what lets an agent discover it can verify audio without reading documentation, and a typical game has few live sounds, so it barely weighs. `RuntimeSnapshotFilters` can exclude it for focused observation.

## Deferred branches

- **Where the preview control lives in the editor UI, and what it does while the project is in play mode.** Opened by decision 17; the 20-question budget ran out before it could be closed. **The spec must resolve it.**
- Rate limiting of repeated sounds — not needed for the chosen content (no footsteps), but the first high-frequency sound will need it.
- Automatic ducking of `music` under `sfx` — possible with decision 13's mutable `volume`, not decided.
- Whether `MeleeAttack` should emit an `'attack'` event the way `Health` emits `'damage'` (F9). Decision 16 sidestepped it with props, but uniforming behaviour observability remains a valid separate issue.

## Handoff

### Topic and scope

Give `@waica/engine` a complete, engine-owned audio subsystem: playback with channels and mixing, positional audio, integration with the pause and the scene lifecycle, observability and validation through the MCP, authoring in the editor, and real content in the isometric demo. This is the full reading of #67, not a slice.

### Verified facts

F1–F14 above. The load-bearing ones: a session-scoped resolver already exists (F3), the hosts already serve audio files (F4), asset emission is generic (F5), `validate_project` is ref-aware (F6), runtime docs are a test gate (F8), the isometric scene graph is projected (F10), and `happy-dom` has no `AudioContext` (F11).

### Resolved decisions

The 23 decisions above, grouped as frontier and lifecycle (1–4), implementation and mixing (5–8), positional audio and API (9–14, 20), observability/authoring/content (15–19), and MCP (21–23).

### Constraints and non-goals

- **Out of scope**: #74 (camera effects), #76 (asset loader — it will replace the fetch layer under decision 14 without touching this contract), #68 (fixed timestep).
- **Formats stay put**: no change to the scene format (`waicaScene: 3`) or the project format (`waicaGame: 1`). Decisions 12, 14, 18 and 20 were chosen partly to avoid it.
- **Not added**: an audio operation on `control_runtime` (15), storage inside the engine (7), an authorable `SoundEmitter` component (9), public attenuation parameters (20).
- **A channel carries mixing and nothing else** — neither lifetime (4) nor attenuation curve (20).

### Explicit assumptions (adjustable when the spec is written)

- `dispose()` closes the `AudioContext`. Treated throughout as a forced consequence, never questioned.
- Content is sourced CC0 and documented in `packages/archetype-isometric/assets/ATTRIBUTION.md`, exactly as the Puny art pack is. Stated in round 2 and not objected to.
- Updating `packages/mcp/README.md` and `packages/cli/README.md` is an obligation, not an option: `runtime-docs.test.ts` (F8) fails until the audio section of the snapshot is documented.
- A `stop({ fadeMs })` in flight freezes with the pause, like everything else — consistent with decision 2, not an exception.

### Risks and deferred questions

- **This is the largest single delivery since the isometric archetype**, and the MCP block grew it further: `engine`, `behaviors`, `archetype-isometric`, `editor`, `examples/isometric`, `mcp` (validation, introspection, docs) and the e2e gate. **The spec should seriously consider splitting it into two PRs**: engine + behaviors + MCP first (everything verifiable on rungs 2 and 5), editor + content second.
- **Audio game feel is not verifiable without a human** — attenuation, relative volumes, fade length. Decision 20 assumes this. The spec must not promise an automated criterion for it.
- **Decision 4 inverts `GameUi`'s default.** Deliberate and grounded in ADR 0011, but it is exactly the asymmetry a reviewer will flag: it needs to be written down in the code, not only here.
- **Decision 17 (preview) rests on the thinnest evidence in this contract** — it was chosen without resolving where the control lives or how it behaves in play mode. See deferred branches.
- `sync-scene.mjs:3` says "the stock art PNGs" — a comment that goes stale under decision 12. The spec should verify the copy step is genuinely generic and update the comment.
- **`validation.ts` is at 903 lines and the `max-lineas-archivo` ratchet is 950.** Decision 21 adds code to that file, leaving 47 lines of headroom. `tests-acompañan-src` also applies: every package gaining new `.ts` files under `src/` needs a `.test.ts` in the same PR.

### Glossary updated during the session

Two entries written into `CONTEXT.md` while the decisions were made:

- **Art** — any asset file an archetype ships, sounds included; the kind travels as data. _Avoid_: images, textures, sprites, graphics.
- **Audio Channel** — the named mixing group a sound plays on, with its own volume and mute, scaled by a master; it carries mixing and nothing else. _Avoid_: bus, track, group, layer.

### Recommended context for the spec

- **Read first**: this handoff, issue #67, ADR 0011 and ADR 0010 (the exact argumentative precedent for an engine-owned capability), and the #66 handoff (`.sdd/grills/2026-08-31-scene-unload-and-swap.md`).
- **Seams**: `game.ts:186` (`unloadScene`), `:204` (`registerSceneCatalog`), `:373` (`dispose`), `:407-417` (`runFrame` / `setActive`), `:466-471` (`renderSurface`); `ui.ts:169-176` (scope mould); `runtime-inspection.ts:54-55`; `runtime-bridge.ts:18`; `validation.ts:207-251`; `introspection.ts:188`; `component.ts:14`; `use-project-art.ts:43`.
- **Verification plan by rung**: decision 11 makes almost the whole contract assertable on **rung 2** — channel, volume, uri, scope on `unloadScene`, suspend on pause, discard before unlock, cache hit on the second `play()` — and decision 21 adds validation tests in the same place. Decisions 15 and 23 enable **rung 5** through `inspect_runtime` over real stdio. **Rung 7** (human) covers only decision 20's tuning.
