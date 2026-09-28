# Grill — Issue #74 Camera effects

<!-- Status: finalized. Project: /Users/ayrtonmarini/workspace/waica. Source: chichex/waica#74 "No camera effects: shake, fade and scene transitions have nowhere to live", routed here by /issue-triage. -->
<!-- SDD-Tracking: version=1; type=grill; state=finalized; issue=chichex/waica#74; grill=2026-09-28-issue-74-camera-effects; project=%2FUsers%2Fayrtonmarini%2Fworkspace%2Fwaica -->

## Mode

domain-modeling

## Verified facts

All on `main` at `4289db8` (v0.18.0).

- **F1 — `game.camera` is the public `THREE.OrthographicCamera`** (`packages/engine/src/game.ts:109`, `readonly`). The editor reads and writes its `position` directly (`packages/editor/src/editor/Viewport.tsx:445-450`).
- **F2 — The camera only moves inside the Simulation Step** (`updateSceneCamera(SIMULATION_STEP)`, `game.ts:582`), and `stepSceneCamera` starts from the previous step's `camera.position` (`game.ts:718-729`). An offset written onto that position would feed back into smoothing, so the base center and the drawn center must be separate.
- **F3 — Fixed resolution renders inside a scissor with black letterbox bars** (`game.ts:644-651`, `resize()` at `game.ts:752-775`). All three examples declare `resolution` 640×360 and `pixelsPerUnit: 16` (`examples/*/src/game.json`).
- **F4 — The UI overlay covers the whole canvas** (`position:absolute;inset:0;z-index:9000`) and is shown only while simulating (`packages/engine/src/ui.ts:188-203`).
- **F5 — The engine does not know `pixelsPerUnit`** (only the editor reads it: `packages/editor/src/project/game.ts:26-56`). The camera applies no snapping today (`packages/engine/src/camera.ts`).
- **F6 — `SceneTransition` calls `game.loadSceneByName(scene)` directly** (`packages/behaviors/src/scene-transition.ts`). Mid-frame calls defer the swap to the next frame's start; a second mid-frame request loses and warns (`game.ts:299-339`).
- **F7 — Inherited lines.** ADR 0011 (Consequences): camera effects (#74) inherit the session/scene line. ADR 0017: timers/tweens are scene-scoped unless `{ scope: 'session' }`, and it names a #74 transition fade as the case that must cross a scene change. ADR 0019: `game.assets.ready()` is the precedent for a promise beside synchronous engine calls.
- **F8 — `game.time.tween(options)`** exists with named easings (`packages/engine/src/game-time.ts:4,53,290`).
- **F9 — `CONTEXT.md` already defined Scene Transition, Tween and Timer** and lists "transition" under Tween's _Avoid_.
- **F10 — Gates.** `game.ts` has 776 lines (ratchet 950). New `.ts` under `packages/engine/src/` needs a `.test.ts` in the same package in the PR; kebab-case. `camera.test.ts` covers the pure `stepSceneCamera`.

## Resolved decisions

The user asked for every decision at once with defaults and accepted all thirteen explicitly.

1. **API location.** `game.camera` stays the `THREE.OrthographicCamera`. A new service `game.cameraEffects` holds the effects. Rejected: replacing `game.camera` with a wrapper (breaks the editor and the public API).
2. **Effects in scope.** Shake, fade and flash. Punch-zoom is deferred: it collides with `setViewHeight`, its 2..80 clamp and the editor's zoom.
3. **Shake shape.** `shake({ intensity, seconds, easing? })`. `intensity` is the maximum offset in world units; decay defaults to linear to zero and accepts #71's easing names. The jitter is pseudo-random but deterministic per Simulation Step, so frame-exact Run Sessions and screenshots reproduce. Rejected: positional arguments and true randomness.
4. **Shake vs limits.** The offset is applied after follow and clamping and is not re-clamped; at a map edge up to `intensity` beyond `limits` may show. The base center that smoothing starts from never includes the offset. Rejected: re-clamping (the shake vanishes at edges, which the issue calls out).
5. **Pixel snapping.** With a fixed `resolution`, the shake offset rounds to one screen pixel (`viewHeight / resolution.height` world units). Without a resolution there is no snap. The base camera is not snapped. Rejected: never snapping; snapping the base camera (changes today's render in all three examples).
6. **Overlapping shakes.** The strongest current amplitude wins; each shake decays independently. Rejected: summing (unbounded) and last-replaces.
7. **Fade coverage.** A fade covers the game viewport inside the letterbox, including the world, UI Pieces and Anchored Pieces. Rejected: world only with the HUD above.
8. **Fade shape.** `fade({ to, seconds, easing? })` with `to` = `'black' | 'white' | hex color | 'clear'`; it starts from the current opacity and the color holds afterwards. It returns a handle with `cancel()` and `done: Promise<boolean>` (`true` completed, `false` cancelled). `flash({ color, seconds })` is a pulse up and back to clear. Rejected: promise only; #71 handle only.
9. **Scope across `unloadScene()`.** A fade is session-scoped and survives the swap; shake and flash are scene-scoped and die with the scene without callbacks. Rejected: everything scene-scoped with an ADR 0017-style opt-in.
10. **Scene Transition integration.** `SceneTransition` gains optional params `fadeSeconds` (default 0 = today's hard cut) and `fadeColor` (default black): fade to color → `loadSceneByName` → fade to `'clear'`. No engine transition helper. The Runtime Bridge `scene` operation stays a hard cut. Rejected: an engine helper such as `loadSceneByName(name, { fade })`.
11. **During the outgoing fade.** Simulation and input keep running; that `SceneTransition` ignores further triggers until its swap happens. Rejected: freezing input or simulation (needs a new API).
12. **Authoring and observation surfaces.** Effects are code-only plus the `SceneTransition` params (visible to the editor and MCP as params). No scene-JSON block. Runtime inspection and the MCP snapshot expose, read-only, the current shake offset and fade opacity/color for e2e verification. Rejected: exposing nothing.
13. **Editor.** No effects in edit mode (nothing simulates); returning to edit mode clears shake, fade and flash. Rejected: an editor preview.

## Deferred branches

- Punch-zoom (a later session).

## Handoff

### Topic and scope

Add shake, fade and flash to the engine's scene camera as `game.cameraEffects`, and let a Scene Transition hide its swap behind a fade. Punch-zoom is out.

### Verified facts

F1–F10 above.

### Resolved decisions

Decisions 1–13 above.

### Constraints and non-goals

- No punch-zoom, reduced-motion or global disable switch.
- No camera-effect block in scene JSON.
- No post-processing (#78) or particles (#73); no render targets.
- No simulation or input freeze during a transition.
- `game.camera` and the Runtime Bridge `scene` operation do not change.

### Explicit assumptions (adjustable when the spec is written)

- Effects advance on Game Time and freeze while the Game is not simulating.
- The fade draws as a layer above the UI overlay, aligned to the letterbox rect; the spec picks the medium (HTML or three.js).
- Cancelling a fade leaves the opacity where it was, like a cancelled Tween.

### Risks and deferred questions

- Shake feel is not autonomously verifiable; per-step offsets, fade opacity and screenshots are.
- A session-scoped fade to black that nobody clears leaves the screen black; the spec should decide whether that deserves a warning.
- Two `SceneTransition`s firing in one frame with different fades: today the first swap wins (F6); the fade interplay is deferred.

### Glossary updated during the session

- **Camera Effect** (with Shake, Fade, Flash) added to `CONTEXT.md`.
- **Scene Transition** now notes it may hide the swap behind a Fade.

### Recommended context for the spec

`packages/engine/src/game.ts` (`updateSceneCamera`, `renderSurface`, `resize`, `unloadScene`), `camera.ts`, `ui.ts`, `game-time.ts`, `runtime-inspection.ts`, `packages/behaviors/src/scene-transition.ts`, `scripts/runtime-e2e.mjs`; ADRs 0011, 0017, 0018, 0019; `CONTEXT.md`.
