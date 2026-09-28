# Grill — Issue #76 Asset loader

<!-- Status: finalized. Project: /Users/ayrtonmarini/workspace/waica. Source: chichex/waica#76 "No asset loader: textures load on demand, uncached and unpreloaded", routed here by /issue-triage. -->
<!-- SDD-Tracking: version=1; type=grill; state=finalized; issue=chichex/waica#76; grill=2026-09-24-issue-76-asset-loader; project=%2FUsers%2Fayrtonmarini%2Fworkspace%2Fwaica -->

## Mode

domain-modeling

## Verified facts

All on `origin/main` at `dd70db3` (v0.17.0).

- **F1 — Three module-scope `TextureLoader`s, one `load()` per instance.** `packages/engine/src/components/sprite.ts:6,124`, `animated-sprite.ts:8,171`, `tilemap.ts:16,251`. Nothing enables `THREE.Cache`.
- **F2 — three 0.185.1: `TextureLoader.load` creates a new `Texture` and `Source` per call.** `THREE.Cache` only dedupes the file fetch (`ImageLoader.js:53`), never the GPU upload.
- **F3 — three shares the GPU between clones and reference-counts disposal.** `Texture.copy` shares `source` by reference; `WebGLTextures` keeps one GL texture per `(source, sampler key)` with a `usedTimes` count, and a clone's `dispose()` deletes it only at zero. Clones with the same wrap/filter share one upload; `pixelArt` on/off yields two variants.
- **F4 — `Sprite.onDestroy` disposes geometry and material but not its texture** (`sprite.ts:139-143`; `Material.dispose` does not dispose `map`). `AnimatedSprite` (`:206`) and `Tilemap` (`:206`) dispose theirs.
- **F5 — `AnimatedSprite` mutates `repeat`/`offset` per instance** (`animated-sprite.ts:177`, `showFrame`), so it needs its own `Texture` object. **`Tilemap.rebuildGeometry` needs the image size and today fires from the `load` callback** (`tilemap.ts:251-252,282`) — a callback a cache hit never produces.
- **F6 — `resolveProps` (`scene.ts:96-116`) resolves every string prop through `registry.resolveAsset` at spawn**; components receive resolved URLs. Audio resolves late through `sceneCatalog.registry` (`game.ts:182`), which survives `unloadScene()`.
- **F7 — Audio is the exact precedent.** `audio/audio-subsystem.ts:86-87,182-184,332`: `resourceStates`/`resourcePromises`, deduplicated `ensureLoading`, `preload(uris)` that resolves even when a file fails (one warn per uri, CA-9), `unloadScene()`, `dispose()`, and an injectable backend through `GameOptions.audio` (ADR 0013) with `FakeAudioBackend` in `audio/test-helpers.ts`.
- **F8 — `loadScene` is synchronous** (`scene.ts:167`). Hosts chain `registerSceneCatalog` → `loadSceneByName('main')` → `game.start()` (`examples/*/src/main.ts:124-125,164`; `packages/editor/template/src/main.ts`). The editor builds one `Game` per `[epoch, mode]` and disposes it (`Viewport.tsx:407,743`), and reloads scene files over the same `Game` (`:760`).
- **F9 — The Runtime Bridge registers inside `game.start()`** (`game.ts:390-406`); the MCP readiness probe only checks the bridge hook (`packages/mcp/src/runtime-browser.ts:112-135`); `RUNTIME_BRIDGE_CAPABILITIES = ['click','scene','fixed-step']` is additive metadata (`runtime-bridge.ts:20`); every screenshot returns `metadata()` (`runtime-browser.ts:305`). `RuntimeBridgeReady` has no asset field (`runtime-session-manager.ts:18-27`).
- **F10 — The e2e samples pixels only from the red HTML overlay** (`scripts/runtime-e2e.mjs:401-404,445-454`), never from a textured sprite. After a bridge `scene` operation it inspects; it takes no screenshot.
- **F11 — The inherited line.** ADR 0011 (Consequences): "the asset cache (#76) inherit[s] rather than re-decide" session scope. The #66 handoff (`.sdd/grills/2026-08-31-scene-unload-and-swap.md:88`) left out "asset preloading, a scene ready promise, or any asynchrony in loading". The #67 handoff, decision 14: #76 replaces audio's fetch layer later without touching that contract.
- **F12 — Editor art URLs churn.** Every refresh or import recreates all blob URLs and revokes the previous batch (`packages/editor/src/editor/use-project-art.ts:179-190`); the memoised registry depends on `urlFor` (`Editor.tsx:547`).
- **F13 — The isometric demo shares art across scenes.** `main` = 3 crates, 3 trees, 2 rocks, ground, player, villager, orc, door; `cave` = ground, player, 2 rocks, door (`examples/isometric/src/scenes/*.scene.json`). Today `main` issues 8 `load()` calls for 3 prop images.
- **F14 — Gates.** `game.ts` 751 lines, `runtime-browser.ts` 524, `runtime-session-manager.ts` 383 (ratchet 950). New `.ts` under `packages/engine/src/` needs a `.test.ts` in the same PR; kebab-case. Component tests run in happy-dom with `vi.mock('three')` replacing only `WebGLRenderer`; nothing mocks `TextureLoader`. Focused run: `pnpm vitest run packages/engine/src/components/sprite.test.ts packages/engine/src/components/tilemap.test.ts` (10/10, 0.5 s).

## Resolved decisions

### Lifecycle and ownership

1. **Keep-all for the session.** The cache lives with the `Game` and empties only in `dispose()`; `unloadScene()` and `loadScene` never touch it — the literal reading of ADR 0011 and the same rule audio chose (#67, decision 14). Going `cave → main` re-downloads nothing. Accepted cost: memory grows with the distinct assets visited (kilobytes for pixel art), and in the editor every art refresh leaves stale blob-URL entries until that `Game` is disposed. Rejected: reference counting with a post-load sweep (counters in three components, a pinning rule for `preload`, and one more decision about sweeping on a bare `unloadScene()`), and explicit host release (public surface with no consumer, frozen across six packages).
2. **One instance per `Game`: `game.assets`.** Like `game.audio` and `game.time`: it dies in `dispose()`, every test isolates, and the editor's edit `Game` and Play `Game` share nothing. Accepted cost: toggling edit → play reloads all art into the new `Game` (from in-memory blob URLs, cheap). Rejected: a module singleton — revoked editor blob URLs cached forever (F12), shared state across test files, no natural `dispose()`.

### Readiness

3. **`loadScene` stays synchronous; `game.assets.ready()` is a separate promise.** Respects what #66 left out (F11) and ADR 0006; no host, test or bridge signature changes. A host that wants no pop-in does `loadSceneByName('main')`, `await game.assets.ready()`, `game.start()`. Accepted cost: the signal is opt-in; whoever does not await it sees today's pop-in. Rejected: an async `loadScene` (public signature in six lockstep packages, the bridge's `scene` operation, `Viewport.tsx:423,760`, dozens of tests, and the #66 line) and cache-only (the MCP still could not wait for a complete scene).
4. **`ready()` waits for everything requested so far**, by any component or by `preload()`. No declaration, no scan: `loadScene` spawns, components request, `ready()` waits. A runtime spawn that requests new art reopens `pending`; calling `ready()` with nothing requested resolves immediately. Rejected: a per-`loadScene` epoch (two counters and an "epoch" that runtime prefab spawns break) and declared asset props on `Component` (new metadata for the three components and for third-party behaviors, while the real load would still happen after spawning under a synchronous `loadScene`).
5. **The bridge reports and the MCP waits.** `metadata()` gains `assets: { pending, loaded, failed }` and the capability `'assets'`; the Run Session waits for `pending === 0` at readiness and after a `scene` operation, bounded by the existing session timeout. An engine build without the capability behaves as today. Rejected: metadata only (every agent reinvents the polling, `capture_screenshot` can still catch pop-in) and nothing in the MCP.
6. **A failed texture does not break `ready()`.** One warn per uri, the consumer stays untextured (flat colour), `failed` counts in the status. Mirrors audio's CA-9: a broken PNG must not hang a host or a Run Session. Rejected: rejecting with the failed uris (a host awaiting without try/catch breaks over an optional asset) and resolving with a report object (no longer `Promise<void>`, duplicates the status).
7. **`capture_screenshot` also waits for `pending === 0`**, bounded by the session timeout; past it, a structured failure rather than a half-textured capture. This covers a runtime `spawnPrefab` with new art right before a capture.

### Scope and surface

8. **Textures only.** `Sprite`, `AnimatedSprite` and `Tilemap` migrate; audio keeps its cache and `preload` (#67, decision 14 anticipated a later replacement of its fetch layer). Accepted cost: two similarly shaped caches coexist for one more release. Rejected: moving audio's fetch/decode under the loader now (touches `WebAudioBackend.load` and the ADR 0013 contract, couples the loader to the `AudioContext`) and a generic file fetch (no consumer).
9. **Minimal public surface: `preload(uris)`, `ready()` and a read-only status `{ pending, loaded, failed }`.** What the issue asks for and what the bridge needs (5). A host that wants a loading bar reads the status per frame from `game.onUpdate`. Rejected: progress events (frozen surface with no consumer) and cache access `has`/`get`/`release` (a stability promise over the cached `Texture`; `release` contradicts decision 1).
10. **The hosts exercise the pattern.** The three examples and `packages/editor/template/src/main.ts` `await game.assets.ready()` between `loadSceneByName('main')` and `game.start()`, where `loadParams` and `registerSceneCatalog` already live. Four `main.ts` files, since `sync-scene.mjs` does not propagate `main.ts`. Accepted cost: the first frame waits for the images. Rejected: README only (the pattern would run in no demo) and template + isometric only (three hosts, two behaviours).
11. **Name: `ready()` in the API, "Assets Ready" in the glossary.** Reads naturally at the call site and in the bridge (`assets.pending === 0`); the glossary entry says a recorded failure counts as resolved. Rejected: `settled()` (exact, less natural, unlike audio's `preload`) and `whenLoaded()` (lies after a failure).

## Deferred branches

None inside the chosen scope. Future issues, not blocks of this session: an eviction policy (trigger: a measurement, in the spirit of #77); audio's fetch layer under the loader (#67, decision 14); progress events; a reactive `Sprite.texture` (its own TODO at `sprite.ts:26`).

## Handoff

### Topic and scope

Give `@waica/engine` an engine-owned texture loader: a per-`Game` cache keyed by resolved URL, `preload`, an **Assets Ready** signal that hosts and Run Sessions can await, and the three components that load on their own today migrated onto it. Textures only; audio keeps its own cache and `preload`.

### Verified facts

F1–F14 above. Load-bearing: three shares GPU uploads between clones and reference-counts disposal (F3); `AnimatedSprite` needs its own `Texture` and `Tilemap` rebuilds geometry from the load callback (F5); `resolveProps` hands components resolved URLs while audio resolves late through the catalog (F6); audio is the exact precedent for cache, `preload` and the injectable seam (F7); `loadScene` is synchronous and hosts chain `loadSceneByName` and `start()` (F8); the bridge registers inside `start()` and `capabilities` is additive (F9); the e2e never sampled a textured pixel (F10); ADR 0011 and the #66/#67 handoffs fix the inherited line (F11); the editor recreates and revokes blob URLs on every refresh (F12).

### Resolved decisions

The 11 decisions above: lifecycle and ownership (1–2), readiness (3–7), scope and surface (8–11).

### Constraints and non-goals

- **Out of scope**: #73 (particles), #74 (camera effects), #77 (pooling/instancing), #78 (lighting); cache eviction; audio under the loader; progress events; a reactive `Sprite.texture`.
- **Formats stay put**: `waicaScene: 3` and `waicaGame: 1` are untouched.
- **`THREE.Cache` stays disabled**: the engine's own cache makes it redundant.
- **No new `control_runtime` operation**: the signal travels in the metadata that already accompanies every snapshot and screenshot.

### Explicit assumptions (adjustable when the spec is written)

- **The test seam follows ADR 0013 verbatim**: a texture backend injectable through `GameOptions`, the real `TextureLoader`-based one by default, a fake shipped in the engine for happy-dom tests.
- **Consumers receive clones of a cached base texture** keyed by resolved URL; `pixelArt` sampler params and UV animation stay per clone; GPU sharing and reference-counted disposal come from three (F3). Each component's `onDestroy` disposes only its clone; the base lives with the cache.
- **`preload(uris)` resolves through the registered scene catalog's resolver**, as audio does (`game.ts:182`); components arrive already resolved (F6). Both paths land on the same cache key.
- **`Tilemap` and `AnimatedSprite` move from the `load` callback to a per-request promise** that also fires on a cache hit (F5).
- **Bridge counters are cumulative per `Game`**: `loaded` and `failed` grow, `pending` is current.
- **`dispose()` disposes every cached texture** and rejects nothing.
- **`RuntimeMetadata` / `RuntimeBridgeMetadata` gain the optional `assets` field**; the snapshot needs no new section.
- **Docs**: a `game.assets` section in `packages/engine/README.md`; the MCP and CLI READMEs describe the wait in the Run Session contract (`runtime-docs.test.ts` may gate it; the spec verifies).
- **No engine-side timeout for `ready()`**, like audio; the timeout lives in the MCP.

### Risks and deferred questions

- **Memory under keep-all** grows with distinct assets visited and, in the editor, with every art refresh until that `Game` is disposed. Accepted; revisit on a measurement.
- **A stalled image delays boot** for a host awaiting `ready()`. No engine timeout; the spec decides whether to document or bound it.
- **Run Session readiness takes longer** by the image load time; the e2e's 15 s waits suffice locally.
- **Visual verification**: the e2e never sampled a textured sprite (F10). The spec should add a deterministic proof — `assets.pending === 0` and `loaded >= N` in the metadata after readiness and after `scene`, plus a pixel of a known sprite.
- **Public surface in lockstep**: `game.assets`, the `GameOptions` seam, `assets` in the bridge metadata and the `'assets'` capability.
- **Gates**: `runtime-browser.ts` 524 and `runtime-session-manager.ts` 383 lines against the 950 ratchet; a new module under `packages/engine/src/` needs its `.test.ts` in the same PR.

### Glossary updated during the session

One entry written into `CONTEXT.md` when decision 11 was confirmed:

- **Assets Ready** — the state of a Game in which every texture requested so far has loaded, or has failed and been recorded; what a host awaits before its first frame and a Run Session waits for before reporting ready or capturing a screenshot. _Avoid_: loaded, preloaded, settled, scene ready.

One ADR was proposed after this handoff froze (decision 3, with 5, 6 and 7 as consequences); if approved it is `docs/adr/0019-assets-ready-is-a-promise-beside-a-synchronous-scene-load.md`.

### Recommended context for the spec

- **Read first**: this handoff, issue #76, ADR 0011, ADR 0013, ADR 0006, and the #66 and #67 handoffs (`.sdd/grills/2026-08-31-scene-unload-and-swap.md`, `.sdd/grills/2026-09-04-engine-audio-subsystem.md`).
- **Seams**: `components/sprite.ts:6,121-143`, `animated-sprite.ts:8,154-207`, `tilemap.ts:16,242-262`; `scene.ts:96-116,167`; `game.ts:161-200` (constructor), `:243` (`unloadScene`), `:390-406` (`start` and bridge registration), `:442` (`dispose`); `runtime-bridge.ts:20,120-130`; `packages/mcp/src/runtime-browser.ts:112-135,301,322`; `runtime-session-manager.ts:18-27,198-203`; `examples/*/src/main.ts:124-125,164`; `packages/editor/template/src/main.ts`; `Viewport.tsx:407,423,739,760`; `audio/audio-subsystem.ts:86-87,182-184,332` and `audio/test-helpers.ts` as the mould.
- **Verification plan by rung**: with the seam nearly the whole contract is unit-testable in happy-dom (cache hit on the second request, distinct clones over a shared base, `pending`/`loaded`/`failed`, `ready()` with and without failures, `dispose()`); the bridge and the MCP wait are tested in `packages/mcp` against its fake; readiness and the deterministic screenshot cross to `pnpm test:e2e`. Human: nothing.
