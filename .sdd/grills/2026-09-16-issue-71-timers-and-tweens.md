# Grill — Issue #71 Timers and Tweens
<!-- Status: finalized. Project: /home/chiche/workspace/waica. Source: chichex/waica#71 "No timers or tweens: scheduling only exists inside StateMachine transitions". -->
<!-- SDD-Tracking: version=1; type=grill; state=finalized; issue=chichex/waica#71; grill=2026-09-16-issue-71-timers-and-tweens; project=%2Fhome%2Fchiche%2Fworkspace%2Fwaica -->

## Mode

domain-modeling

## Verified facts

- **F1 — No scheduling primitive.** Nothing in `packages/engine/src` offers `after`/`every`/tween; `Game` has no `time` member. Existing public services follow the `game.query` / `game.audio` / `game.ui` / `game.stats` shape.
- **F2 — Simulation Step order.** `simulateStep()` (`game.ts`) runs the Component Update Schedule → `dispatchCollisions()` → `updateSceneCamera()` → host `updateFns` → `input.endFrame()`. `flushPendingSceneLoad()` runs before every step. With `simulate = false` no step runs (the editor's edit mode still gets one host callback per frame).
- **F3 — The Runtime Bridge steps through the same pipeline.** `step { frames }` calls `runFrame(1)` per frame, so anything evaluated inside a step is deterministic under MCP with no extra work.
- **F4 — Hand-rolled countdowns.** `Health.invulnerable` and `Health.blinkClock` (`packages/behaviors/src/health.ts:136,219`), `Lifetime.elapsed` (`lifetime.ts:18`), the platformer example `Gun.remaining` (`examples/platformer/src/components/gun.ts:22`), `PlatformerMotor.coyoteTimer`/`bufferTimer` (`platformer-motor.ts:86-89`), `StateMachine.elapsed` (`state-machine.ts:166`) and `ClipPlayer.t`. All compare with `SIMULATION_TIME_EPSILON`.
- **F5 — `timer:0.3` lasts exactly 18 steps** (fixed-timestep grill F7, ADR 0014).
- **F6 — Two opposite scope precedents.** ADR 0011: host subscriptions (`game.onUpdate`, `game.events`) and `GameUi` pieces survive a scene change by default. ADR 0012: sounds die with their scene unless `{ scope: 'session' }`. ADR 0012's consequences require any future subsystem with a scope flag to justify which precedent it follows.
- **F7 — No runtime component removal.** `Entity` only has `destroy()`, which cascades `onDestroy` to its components.
- **F8 — Promises are not step-exact.** A `.then` continuation runs after the whole synchronous `runFrame`; under `step { frames: 10 }` it runs after all ten steps.
- **F9 — Snapshot precedent.** `RuntimeSnapshot.audio` is emitted unconditionally, documented in `packages/mcp/README.md:72` and `packages/cli/README.md:51`, and asserted by `scripts/runtime-e2e.mjs:867`. It added no bridge capability. The MCP passes snapshots through with no schema of its own. Metadata already carries `simulationTime = frame × 1/60`, which equals Game Time under a Run Session.
- **F10 — The loop catches nothing.** An exception thrown from `onUpdate` propagates out of the step.
- **F11 — First scene load does not unload.** `loadScene()` (`scene.ts:168`) calls `game.unloadScene()` only when `game.registry` is already set, so the very first load of a Game never runs an unload.
- **F12 — Float trap for step counts.** `after(0.1)` is due on step 6, but `Math.ceil(0.1 * 60)` is 7 (`0.1 * 60 === 6.000000000000001`).
- **F13 — Domain artifacts.** `CONTEXT.md` and ADR-0001 through ADR-0016 are maintained. During this grill `CONTEXT.md` gained **Game Time**, **Timer** and **Tween**.

## Resolved decisions

1. **Scope.** Timers (`after`, `every`) plus a minimal tween ship together.
2. **Step placement.** Timers fire and tweens advance at the **start of every Simulation Step**, before the Component Update Schedule. `after(0.1)` scheduled during step k fires at the start of step k+6.
3. **Scene lifetime.** Timers and tweens are **scene-scoped by default**: `unloadScene()` cancels them. `{ scope: 'session' }` survives a scene change. This follows ADR 0012, not ADR 0011.
4. **Ownership.** An `{ owner: entity }` option cancels the timer or tween when that entity is destroyed. An owner that is already dead at scheduling time yields a timer that never fires. No `Component` shortcut (`this.after`).
5. **`every` cadence.** Each due time is the previous due time plus the interval, with no drift (`every(0.25)` fires every 15 steps, `every(0.1)` every 6). An interval shorter than one step is raised to one step, so `every` fires at most once per step.
6. **Handle.** `after`, `every` and `tween` return `{ cancel(), active, elapsed, remaining }`.
7. **Tween value.** A tween interpolates a single number. Vectors are interpolated inside `onUpdate`.
8. **Tween completion.** An `onComplete` callback runs in the same step the value reaches `to`. No Promise API.
9. **Migrations.** Only `Health` migrates (`invulnerable` and `blinkClock`). `inspectState` keeps reporting the remaining invulnerability seconds, read from the handle's `remaining`.
10. **Easing.** A small closed set of names (`linear`, `quadIn`/`quadOut`/`quadInOut`, `cubicIn`/`cubicOut`/`cubicInOut`, `sineInOut`) or a custom `(t) => number`. Default `linear`.
11. **Tween cancellation.** `cancel()` leaves the last applied value in place and does not run `onComplete`. Owner destruction and scene unload behave the same way.
12. **Invalid input.** A non-finite duration or a non-function callback logs a `[waica]` warning and returns a handle with `active: false` that never fires. A negative duration is treated as 0 (next step).
13. **Tween start.** `tween()` calls `onUpdate(from)` synchronously on creation, then advances every step.
14. **Snapshot visibility.** The Runtime Snapshot gains a `time` section with a pending count and the next due event.
15. **Game Time reader.** `game.time.now` is session Game Time: whole steps run × 1/60 since the Game started. It stands still while not simulating or paused and does not reset on scene changes.
16. **Snapshot breakdown (delegated to the agent, simplest option chosen).** A single total: `time: { pending, nextInSteps }`.
17. **Next-event unit.** `nextInSteps` is an integer: `step { frames: nextInSteps }` makes the next timer fire or the next tween complete. `null` when nothing is pending.

## Pending branches

None inside issue #71.

## Handoff

### Scope

Add a public `game.time` service to `@waica/engine`: `after`, `every`, a single-number `tween` and a `now` Game Time reader, all advanced only by Simulation Steps. Add a `time` section to the Runtime Snapshot and migrate `Health`'s invulnerability window and blink onto the new API.

```ts
const stun = game.time.after(0.3, () => fsm.goto('idle'), { owner: entity })
game.time.every(1, () => game.stats.set('clock', game.time.now), { scope: 'session' })
game.time.tween({
  from: 0, to: 1, seconds: 0.5, easing: 'quadOut',
  onUpdate: (v) => { overlay.opacity = v },
  onComplete: () => game.loadSceneByName('b'),
  owner: entity,
})
stun.remaining // 0.25
game.time.now  // 12.5
```

Touches `packages/engine` (service, snapshot section, exports, README), `packages/behaviors` (`Health`), `packages/mcp/README.md`, `packages/cli/README.md`, and verification in unit tests plus `scripts/runtime-e2e.mjs`.

### Restrictions and non-goals

- No time scale, hit-stop, or per-timer pause/resume.
- No Promises; no object or property tweens; no `delay`, `repeat` or `yoyo` on tweens (compose with `after`).
- No timer labels; no per-type or per-scope breakdown in the snapshot.
- Do not migrate `Lifetime`, `Gun`, `PlatformerMotor`, `StateMachine.elapsed` or `ClipPlayer`. Do not change `timer:N`.
- No new Runtime Bridge capability and no protocol version bump.
- Camera effects (#74), world-space text (#72) and any animation system stay out.

### Explicit assumptions

- Nothing advances outside a Simulation Step: not by the wall clock, not in edit mode, not while the bridge is paused.
- `after` never fires synchronously. `after(0)` and negative durations fire at the start of the next step.
- A timer created inside a timer or tween callback never fires in that same pass.
- Timers due in the same step fire by due time, ties by creation order.
- `every` first fires after one interval, not on creation. A callback cancels its own repeat through a closure over the handle.
- Due checks use `SIMULATION_TIME_EPSILON`, so `after(0.3)` lasts exactly 18 steps, matching `timer:0.3`.
- On its final step a tween calls `onUpdate(to)` with exactly `to`, then `onComplete`. With `seconds: 0` it applies `from` on creation and `to` plus `onComplete` at the start of the next step.
- An unknown easing name falls under the invalid-input rule.
- An exception thrown from a callback propagates, like one thrown from `onUpdate`.
- `owner` plus `scope: 'session'`: the owner still cancels it on destroy.
- `now` is computed as steps × 1/60, never as a running float sum.
- `Game.dispose()` cancels everything.
- The `time` snapshot section is emitted unconditionally, like `audio`. It does not repeat `now` (metadata already carries `simulationTime`). `pending` counts scene- and session-scoped timers and tweens together.

### Risks and deliberately deferred questions

- **`Health` parity.** The window used to close inside `Health.onUpdate` (after `StateMachine`); it now closes at the start of the step. A component that attacks before `Health` in that same step could see the window closed one step earlier than today. The spec must pin a parity test; the isometric combat leg of `pnpm test:e2e` is the first alarm.
- **Scope asymmetry.** `game.onUpdate` and `game.events` survive a scene change (ADR 0011) but timers do not. A clock scheduled in `main.ts` must pass `{ scope: 'session' }`. The engine README must state this next to audio's rule.
- **Scene-scoped timers created before the first scene load (F11, found while persisting this handoff).** `loadScene()` skips `unloadScene()` on a Game's first load, so a scene-scoped timer created at boot would survive the first load and die at the first transition. The spec must decide the rule (e.g. cancel on first load too, or warn) instead of inheriting this by accident.
- **Re-entrancy of the synchronous `onUpdate(from)`.** It runs before the handle is returned; the spec defines what cancelling from inside it means.
- **Deferred to future work:** time scale, snapshot labels or breakdown, migrating `Lifetime` and `Gun`, a `Component` shortcut.

### Recommended context for the spec session

- **Files:** `packages/engine/src/game.ts` (`simulateStep`, `unloadScene`, `dispose`), `entity.ts`, `scene.ts` (`loadScene`), `fixed-step.ts`, `state/state-machine.ts` (`timer:N` parity), `audio/audio-subsystem.ts` and `audio/types.ts` (scope precedent), `runtime-inspection.ts` (`audio` section precedent), `index.ts`, `packages/engine/README.md`, `packages/behaviors/src/health.ts` and its tests, `packages/mcp/README.md:72`, `packages/cli/README.md:51`, `packages/mcp/src/runtime-docs.test.ts`, `scripts/runtime-e2e.mjs:867`.
- **Domain:** ADR 0004, 0011, 0012, 0014. `CONTEXT.md` terms Game Time, Timer, Tween.
- **Verification:** TDD on `runFrame` using `fixed-step-test-support.ts`; parity `after(0.3)` = 18 steps = `timer:0.3`; existing `Health` tests green plus a window-parity test; isometric combat e2e leg unchanged plus an assertion on the `time` section; then the full ladder (`typecheck → test → build → test:dist → test:e2e`).
