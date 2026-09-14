# Grill — Fixed simulation step (issue #68)
<!-- State: finalized. Project: /Users/ayrtonmarini/Sync/workspace/waica. Source: issue #68 "The simulation is framerate-dependent: the loop has no fixed timestep", routed here by /issue-triage. -->
<!-- SDD-Tracking: version=1; type=grill; state=finalized; issue=#68; grill=2026-09-12-fixed-timestep; project=%2FUsers%2Fayrtonmarini%2FSync%2Fworkspace%2Fwaica -->

## Mode

domain-modeling

## Verified facts

- **F1 — One variable `dt`, one channel.** `tick` (`packages/engine/src/game.ts:417-422`) and `resumeRuntime` (`game.ts:408-415`) derive `dt` from the clock with a 0.1 s clamp. `runFrame` (`game.ts:424-453`) hands that single `dt` to `component.onUpdate?.(dt)`, `updateSceneCamera(dt)` and the host `updateFns`, then calls `input.endFrame()` and `renderSurface()`.
- **F2 — Logical and render positions are the same object outside projection.** `entity.position` returns `node.position` unless the scene is isometric (`entity.ts:24-26`, deliberate zero-copy). Only `applyYSort` (`game.ts:477`) and the isometric reprojection (`game.ts:489-490`) read the node.
- **F3 — What actually drifts.** `THREE.MathUtils.damp` (camera `camera.ts:140-141`, motor squash/acceleration `platformer-motor.ts:90-99`) is already framerate-independent. Euler integration (`platformer-motor.ts:121,133`, `dynamic-body.ts:64-69`), `resolveSolidAxis` sampling (`solid-axis.ts:33-36`) and accumulated timers (`state-machine.ts:158`, `clip-player.ts:28`, `ATTACK_SECONDS`/`HURT_SECONDS = 0.3`) are not.
- **F4 — Per-frame input state.** `input.endFrame()` (`input.ts:93-99`) clears `justDown`; `platformer-motor.ts:87` and `state-machine.ts:193` read `justPressed`. Two steps under one `endFrame` would see the same press twice. The pointer's pending click is drained by its consumer and is already step-safe.
- **F5 — Runtime Bridge contract today.** `step { dt?, frames? }`: `dt` defaults to 1/60, validated `0 < dt ≤ 0.1`; `frames` 1–600; `advance()` accumulates `simulationTime` (`runtime-bridge.ts:151-171`). Schema and validation are mirrored in `packages/mcp/src/server.ts:219,231,238,253,258,400-472` and typed in `runtime-service.ts:55`. `RUNTIME_BRIDGE_PROTOCOL_VERSION = 1`; a mismatch in `activeRuntimeBridgeHook()` (`:73-79`) disables the bridge entirely. `RUNTIME_BRIDGE_CAPABILITIES` (`:18`) is the additive channel.
- **F6 — Who sends `dt`.** All five legs of `scripts/runtime-e2e.mjs` send `dt: 1/60` (`:414-416,518-531,638-640,758-759,1134`). No MCP test mentions `dt`. Only `runtime-bridge.test.ts:270,333` send another value (`0.05`, `0.100001`). `packages/mcp/README.md:66` documents the range.
- **F7 — The feel was tuned at 60 Hz and barely moves.** This machine's display runs at 60.00 Hz. With `jumpVelocity = 14`, `gravity = 42` (`platformer-motor.ts:50-51`) and the code's semi-implicit integration, the jump apex is 2.217 u / airtime 0.667 s at 1/60 versus 2.275 u at 1/120 (+2.6 %). `timer:0.3` becomes exactly 18 steps. `MathUtils.damp` is unaffected.
- **F8 — Existing projects do not receive the change on their own.** Generated projects depend on `^0.13.0` (`/publish` skill, line 17); under 0.x semver that pins the minor. There is no `CHANGELOG.md` and no GitHub Releases; tags are lightweight and each release is a minor-bump PR.
- **F9 — Domain artifacts are live.** `CONTEXT.md` and `docs/adr/` (13 ADRs) are maintained. ADR 0006 states Run Sessions "advance frames with explicit `dt`". ADR 0004 defines the per-frame Component Update Schedule. The glossary had no term for the step; `Simulation Step` was added during this session.

## Resolved decisions

1. **One channel, fixed step.** Everything that receives `dt` today — components, `updateSceneCamera`, host `updateFns` — receives exactly 1/60. No render hook is added. Closes B3 by derivation: the camera lives inside the step.
2. **1/60 is an engine constant.** Not configurable per project or through `GameOptions`.
3. **Accumulator with a per-frame step cap; leftover time is dropped.** The game may fall behind the wall clock but never plays in slow motion. The 0.1 s clamp is removed; the cap replaces it. Spec suggestion, not a decision: cap = 6 steps = 100 ms, parity with today's clamp.
4. **No render interpolation in this delivery.** The last step is what renders; `Entity`'s zero-copy stays intact. Stepping at 120 Hz and above is accepted. Closes B2 by derivation.
5. **`step { frames }` without `dt`.** Removed from the bridge type, the MCP schema/validation and the README; an engine that receives a `dt` returns an explicit error, never ignores it. `frames` keeps its name: while paused, one frame is one Simulation Step; `simulationTime` advances `frames × 1/60`. `'fixed-step'` is added to `RUNTIME_BRIDGE_CAPABILITIES`; the protocol version is **not** bumped.
6. **No retuning.** The spec proves parity with a deterministic test: the platformer jump's apex and airtime at the fixed step equal today's 60 Hz values within a small tolerance, and `timer:0.3` lasts 18 steps.
7. **No change-specific note; a general beta disclaimer instead.** There are no prior projects to protect, so compatibility is broken freely. A pre-1.0 sentence ("expect breaking changes between minors until 1.0") goes into the **Status** paragraph of `README.md:7`, mirrored in `packages/cli/README.md` (the npm-facing page). The placement is the agent's recommendation and may be adjusted.

## Deferred branches

None pending for this scope. Deliberately deferred to future work: render interpolation (new issue), renaming `frames` → `steps`, the final value of the per-frame cap.

## Handoff

### Scope

Replace the engine's variable-`dt` loop with a fixed **Simulation Step** of 1/60 s consumed from an accumulator, redefine the Runtime Bridge's `step` in terms of steps, and prove the current feel is unchanged. Touches `packages/engine`, `packages/mcp`, `scripts/runtime-e2e.mjs`, `README.md` and `packages/cli/README.md`.

### Derived constraints (acceptance criteria material)

- `input.endFrame()` runs **after every step**, not once per render frame (F4).
- `flushPendingSceneLoad()` is evaluated **before every step**.
- Exactly once per render frame: `ui.setActive`, `audio.setActive`, `audio.updatePlacements`, `renderSurface`.
- `resumeRuntime` shares the accumulator with `tick`; the bridge's `advance()` counts steps.
- `simulate = false` (editor edit mode) keeps rendering without running steps.
- The Component Update Schedule (ADR 0004) runs in full inside each step, unchanged.
- Behavior tests that call `onUpdate(0.5)` directly are **not** touched; `runtime-bridge.test.ts:270,333` are rewritten; the five e2e legs drop `dt: 1/60`.

### Non-goals

Render interpolation · retuning · renaming `frames` · compatibility with prior projects or CLIs · a configurable step · #69/#70/#71/#74 · changes to the update schedule.

### Explicit assumptions

Rendering happens once per `requestAnimationFrame` · the reference feel is the 60 Hz one · the bridge has no consumers beyond the MCP and the e2e script.

### Risks and deliberately deferred questions

- Any component reading `performance.now()` on its own breaks determinism: the spec must grep and decide.
- The e2e legs with fine tolerances (`|x − 1.5| < 0.001`) should stay identical — they already use 1/60 — and are the first signal if something moved.
- Deferred: interpolation (new issue), `frames` rename, final cap value.
- ADR 0006 is partially outdated until the ADR step of this closure resolves it.

### Recommended context for the spec session

Files: `packages/engine/src/game.ts`, `runtime-bridge.ts` (+ test), `packages/mcp/src/server.ts`, `runtime-service.ts`, `packages/mcp/README.md`, `scripts/runtime-e2e.mjs`, `README.md`, `packages/cli/README.md`. Verification: `game.test.ts` already drives `runFrame` directly — add `tick` tests with synthetic timestamps (accumulation, cap, drop, `endFrame` per step) plus the jump-parity test; then the full ladder (`typecheck → test → build → test:dist → test:e2e`). Glossary: `Simulation Step` is in `CONTEXT.md:48`. ADRs: evaluated after this handoff, one by one.
