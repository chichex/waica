# Grill — Issue #75 Gamepad and analog input

<!-- Status: finalized. Project: /Users/ayrtonmarini/workspace/waica. Source: chichex/waica#75 "Input is keyboard-only: gamepad and touch are still TODO", routed here by /issue-triage. -->
<!-- SDD-Tracking: version=1; type=grill; state=finalized; issue=chichex/waica#75; grill=2026-10-01-issue-75-gamepad-analog-input; project=%2FUsers%2Fayrtonmarini%2Fworkspace%2Fwaica -->

## Mode
domain-modeling

## Verified facts
- `Input` reads only the keyboard; `axis()` = `held(pos) - held(neg)`, exactly -1/0/1 (`packages/engine/src/input.ts:83-86`).
- `InputBindings` is `Record<string, string[]>` of `KeyboardEvent.code` (`input.ts:5`).
- `input.endFrame()` closes every fixed 1/60 s Simulation Step (`packages/engine/src/game.ts:625-628`); `blur`/`visibilitychange` release held keys (`input.ts:126-133`).
- Axis consumers: `packages/behaviors/src/player-states.ts:68` (`runTowards(dir)`, already continuous, `platformer-motor.ts:96-100`); `packages/behaviors/src/grid-player-role.ts:90-96` (any non-zero keyboard axis cancels the Move Order); `TopdownMotor.run` normalizes its vector (`topdown-motor.ts:21-24`).
- The Runtime Bridge exposes `injectAction(action, press|hold|release)` and `heldActions` (`packages/engine/src/runtime-bridge.ts:111-113`).
- The editor viewport already zooms with the wheel (`packages/editor/src/editor/use-viewport-pointer.ts:21`): that part of #75 is already done.
- The editor controls panel captures keys from `keydown` into an action's bindings (`packages/editor/src/editor/ProjectPane.tsx:49-52`).
- The engine has no notion of a player (no hit in `packages/engine/src` nor `CONTEXT.md`).

## Resolved decisions
1. **Cut.** This delivery is gamepad + analog axis + device switching. Pointer, touch/virtual stick and local multiplayer go to child issues.
2. **Analog API.** Every Action has `value(action)` in 0..1; one half of a stick binds to an action. `axis(neg, pos)` = `value(pos) - value(neg)`, so it becomes analog with no behavior change.
3. **Players.** `game.input` is player 1: keyboard plus a single pad. Other pads are ignored, not merged. A multi-player model is a child issue.
4. **Device combination.** An action is held if any source holds it; its value is the max across sources. Releasing one source never releases what another still holds. Pad disconnect, `blur` and `visibilitychange` release the pad's state, like the keyboard today.
5. **Dead zone.** Radial, with an engine default and an optional override in the Game options.
6. **Binding format.** Same `Record<action, string[]>`, with `Gamepad:<control>` codes over the W3C `standard` mapping (e.g. `Gamepad:A`, `Gamepad:LeftStickLeft`). The manifest shape does not change.
7. **Move Order.** Any non-zero directional input past the dead zone, keyboard or stick, cancels the Move Order and drives the motor with its magnitude.
8. **Runtime Bridge.** `injectAction` accepts an optional 0..1 `value` on `hold`; no value means 1. This changes the Bridge protocol and the MCP tools.
9. **Player-1 pad.** The first `standard`-mapping pad to connect; sticky until it disconnects, then the next in connection order takes over.
10. **Archetype defaults.** All three archetypes ship pad bindings: left stick + D-pad for movement; platformer A = `jump`; topdown and isometric A = `interact`, X = `attack`.
11. **Held threshold.** An analog source counts as held at value >= 0.5; `justPressed` fires when it crosses the threshold upward. Fixed in the engine.
12. **Runtime Snapshot.** Adds `actionValues: { action: value }` for held actions; `heldActions` is unchanged.
13. **Editor display.** Readable labels ("Gamepad A", "Left stick ←"); the MCP keeps exposing raw strings.
14. **Editor capture.** The controls panel also captures a pad button or stick half: the first one to cross the threshold while capturing.

## Constraints and non-goals
- `consume()`/`consumed()` and the current value-less `injectAction` semantics are preserved; keyboard behavior is unchanged.
- Out: pointer move/hover/aim, mouse buttons, in-game wheel, touch, virtual stick, local multiplayer, rumble, non-`standard` mappings.

## Assumptions
- `navigator.getGamepads()` is polled once per Simulation Step, before component updates (detail left to the spec).
- The spec fixes the exact default dead zone (0.2 was the reference during the interview).
- happy-dom lets tests mock `navigator.getGamepads` (inference; verified by writing the mock).

## Risks
- Public API changes in `@waica/engine`, the Runtime Bridge protocol and the MCP tools; lockstep versioning applies.
- Stick feel and dead zone value are human-only to validate; e2e has no real pad, so analog is verified through Bridge injection and mocks.
- Editor capture adds pad polling to the editor and must clean up under StrictMode.

## Pending branches
None within scope. Deferred to child issues: pointer (move, hover/aim, buttons, in-game wheel); touch with virtual stick; local multiplayer (one `Input` per player).

## Handoff
The decisions above are the contract. Context for the spec: `.sdd/project.md`, ADR-0010 (engine-owned pointer), ADR-0014 (fixed steps), `packages/engine/src/input.ts`, `runtime-bridge.ts`, `packages/behaviors/src/grid-player-role.ts`, `packages/archetype-*/src/controls.ts`, `packages/editor/src/editor/ProjectPane.tsx`, `packages/mcp/src/introspection.ts`, and the **Action** and **Move Order** entries in `CONTEXT.md` (updated in this session).
