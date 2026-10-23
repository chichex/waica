# Grill — #205 3D animation: per-clip fade and 1D clip blending
<!-- Estado: finalized. Proyecto: /home/chiche/workspace/waica. Fuente: issue #205. -->
<!-- SDD-Tracking: version=1; type=grill; state=finalized; issue=#205; grill=2026-10-20-issue-205-fade-and-blend; project=%2Fhome%2Fchiche%2Fworkspace%2Fwaica -->

## Hechos comprobados

Verified in this session at `main` `ecf7e1c` (v0.30.1); paths under `packages/engine/src` unless stated.

1. **The Animator already crossfades.** `fade` (default 0.15 s, `0` cuts) is one value per Animator; `play()` does `previous.crossFadeTo(action, this.fade, false)` (`components/animator.ts:47-52, 107-121`). The issue's premise ("switches clips without crossfade") is outdated: what is missing is a finer-grained fade and blending, both deferred by ADR 0029's last paragraph.
2. **Per-clip overrides exist for `loop` and `speed`** in `Animator.clips` (`components/animator.ts:9-15`), edited by `AnimatorClipOverridesRow` (`packages/editor/src/editor/inspector/animator-clip-rows.tsx:142`).
3. **Interrupting a crossfade pops.** three's `fadeOut()` always schedules weight 1 → 0 (`three@0.186.1 src/animation/AnimationAction.js:319-321`): an action that was fading in at 0.3 jumps to full weight before fading out (idle→walk, then walk→run 0.05 s later).
4. **`play()` restarts the clip** through `action.reset()` (`components/animator.ts:116`), even one still carrying weight.
5. **Speed is analog with a stick, discrete with keys.** `CharacterMotor.walk` sets `desiredVelocity` straight from the input axes scaled by `speed` (6) or `runSpeed` (10), no acceleration (`packages/behaviors/src/character-motor.ts:56, 72, 139-146`): a half stick moves at 3 m/s while `Walking_A` plays in full (foot sliding); keys jump 0 → 6 → 10 in one step.
6. **Walk and run are separate states** switched by `signal:move` / `signal:run` from the `character` role (`packages/behaviors/src/character-states.ts:60-63, 147`); the role already reads `body.linearVelocity` every step (`:131-137`).
7. **Art.** The shipped `knight.glb` has 8 clips (Idle, Walking_A, Running_A, Jump_Start, Jump_Idle, 1H_Melee_Attack_Chop, Dodge_Forward, Death_A). The source `Knight.glb` (KayKit Adventurers 1.0 at `672074b`, sha256 `60428e3a…`, matching `packages/archetype-third-person/assets/ATTRIBUTION.md`) has 76, including `Walking_Backwards`, `Running_Strafe_Left`, `Running_Strafe_Right` (no walking strafe, no running backwards). `scripts/trim-character-glb.mjs` re-trims deterministically. The packed third-person assets are 1,532,140 of 3,145,728 bytes (`.sdd/project.md`).
8. **No strafe exists.** `CharacterMotor` always turns toward the desired velocity (`character-motor.ts:148`); nothing in engine or behaviors decouples facing from movement.
9. **The skeleton** has one speed per state: `patrol` on `Walking_A` at 1.5, `chase` on `Running_A` at 3 (`examples/third-person/src/characters/skeleton.character.json:41, 54, 129, 136`).
10. **The state machine is space-agnostic** and plays through the Clip Target `play(name)` (`animation/clip-target.ts`); the 3D-animation grill kept loop/speed on the Animator "so the state machine stays space-agnostic" (`.sdd/grills/2026-10-12-3d-animation.md`, decision 7).
11. **MCP** checks `initialClip` and the `clips` keys against the glb's clip names (`packages/mcp/src/animator-validation.ts:81-101`).
12. **Snapshot**: `inspectState()` returns `{ loaded, current, time, playing, poseHash }` (`components/animator.ts:18-29`). The third-person e2e compares the frame-13 `poseHash` across both Render Backends (`scripts/runtime-e2e-third-person.mjs:193-194`).
13. **Bench** has `skinned-characters-{50,200}` (one walking clip per entity, 60 steps); baselines are recorded on `chichex-linux` via `pnpm bench:remote` (`.sdd/project.md`).
14. **Editor**: the viewport simulates only in Play (`packages/editor/src/editor/viewport-game.ts:49`); the state editor's clip field lists the glb's clips (`StateEditorModal.tsx:15-16, 63`); `styles.css` has no width or coarse-pointer media query (no mobile support); `jsx-a11y` runs at error (`.sdd/coding-policies.md`, Ajustes).
15. Issue #205 has no comments and no spec. The issue #203 stack (PRs #228-#232) touches `examples/third-person/src/characters/player.character.json` (`castShadows`/`receiveShadows` on the Model), `ComponentCard.tsx`, `inspector-props.ts` and `.sdd/project.md`, and nothing under `animation/`, the Animator or the StateMachine.

## Decisiones resueltas

**Block 1 — Scope**
1. #205 delivers **per-clip fade** and a **1D blend by speed**.
2. The **2D directional blend**, a `CharacterMotor` strafe mode and re-trimming the Knight with strafe/backwards clips go to a **new issue**. Masked animation layers are a non-goal.

**Block 2 — Fine-grained fade**

3. The fade override lives **per clip**: `Animator.clips[name].fade` is the fade-in into that clip; without it, `Animator.fade` applies. The StateMachine and the Clip Target contract do not change.
4. An interrupted fade fades every sounding action **from its current weight** (never from 1): the Animator schedules its own fades instead of three's `crossFadeTo`/`fadeOut`.
5. A clip asked for again while it **still carries weight continues from its time** and rises from that weight; a finished one-shot, or a clip with no weight, restarts at 0 (ADR 0029's restart of a finished one-shot holds).
6. The demo (and the archetype template) set **a few per-clip fades**, e.g. attack and dodge 0.05 s, `Death_A` 0.3 s; the spec tunes the values.

**Block 3 — 1D blend**

7. A blend is a **virtual clip on the Animator**: `blends.<Name> = { param, points: [{ clip, at }], smoothing }`. Its name joins `clipNames`; a state plays it with `clip: "<Name>"`. StateMachine and Clip Target unchanged.
8. **Named parameters**: `animator.setParam(name, value)`. The `character` and `enemy` roles write `speed` (planar speed) every Simulation Step.
9. **Phase sync**: the clips of a blend share one normalized time; the cycle duration is interpolated by weight (Unity-style 1D blend tree).
10. **Smoothing per blend** (`smoothing`, seconds): the parameter approaches its target step by step, deterministic under the fixed step.
11. **Demo Player**: `idle`, `walk` and `run` all play `clip: "Locomotion"` (`Idle`@0, `Walking_A`@6, `Running_A`@10). The state graph and the role do not change; switching among them is `play(current)`, a no-op, so the smoothed speed drives the transition. The e2e asserts weights instead of `current = Walking_A`.
12. **The skeleton uses no blend**; the `enemy` role still writes `speed`.

**Block 5 — Exposure and verification**

13. The Animator snapshot adds `weights` (clip → weight, only those > 0) and `params` (smoothed values).
14. A bench scenario **`blended-characters-{50,200}`** (the rig with a three-clip phase-synced blend), baselines recorded on `chichex-linux` through `bench:remote`.

**Block 6 — Design**

15. A **Blends section** in the Animator inspector: one card per blend with name, parameter, smoothing and a table of points (a clip select from the glb plus a threshold; add/remove; ordered by threshold); a missing clip is marked with `MissingOption`. Reuses `NumberField` and the clip-row pattern.
16. **Edit-mode preview** through a parameter slider.
17. The preview shows the **animated cycle of the selected entity only**: just its Animator advances; physics, roles and the rest of the scene stay still.
18. The slider value is **transient**: never written to JSON, never in undo history; back to 0 when the selection changes.
19. The slider lives **in the blend's card**.

## Ramas pendientes
None.

## Diseño

- **Surface:** `packages/editor` (React 19 + Vite), `con sistema` through the `:root` tokens of `packages/editor/src/styles.css`. No visual-direction change, no UI kit.
- **Screens and states:** the Animator inspector. `AnimatorClipOverridesRow` gains a "Fade (s)" `NumberField` per clip, empty = inherits `Animator.fade` (shown as such). A new Blends section (decision 15) with its slider (decisions 16-19). Blend names appear in the `initialClip` select and in `StateEditorModal`'s clip field, since they join `clipNames`. States: glb unreadable → clips typed by hand, as today; a stored clip the glb lacks → marked missing, never rewritten; no blends → an empty section with its add action.
- **Reuse vs new:** reuse `animator-clip-rows.tsx`, `NumberField`, `MissingOption`, `useGlbClips`; new: the Blends card and the preview slider.
- **Platform and accessibility:** native labelled controls like the rest of the inspector (`jsx-a11y` at error). Mobile/webview does not apply (the editor has no mobile support).
- **Reference captures:** none; the inventory has no mocks, Storybook, `design-sync/` bundle or Claude Design project.

## Handoff

**Topic and scope.** Animator mixing in 3D scenes: a per-clip fade-in, a pop-free interrupted fade, a continuing re-entry, and a 1D blend (a virtual clip mixing several glb clips by a smoothed, phase-synced named parameter), dogfooded in the third-person demo's Player, exposed in the snapshot, measured by a bench scenario and authored in the editor with an edit-mode preview. One spec.

**Confirmed decisions.** The nineteen above; the spec takes them as confirmed and does not re-ask them.

**Constraints and non-goals**
- Out: 2D directional blend, strafe mode, masked layers, additive clips, root motion (#207), retargeting (#206), per-state or per-transition fade.
- Unchanged: `StateMachine`, the Clip Target contract, `CHARACTER_STATE_GRAPH`, 2D (`AnimatedSprite`, `ClipDef`).
- No new dependency (three's action weights and `timeScale` suffice). The fixed step (ADR 0014) holds: the `poseHash` stays frame-exact and equal on both Render Backends.

**Explicit assumptions** (the spec lists them as `[ASSUMED]`)
- A parameter outside the points clamps to the end clips; an unwritten parameter is 0; a `setParam` before the glb settles is kept.
- A blend's fade-in reads `clips[<blend>].fade`, else the global `fade`.
- A blend's clips loop; `clip:end` never fires for a blend (`clip-end-on-looping-clip` extends to it).
- A per-clip `speed` override scales that clip's duration before the phase sync.
- `validate_project` extends `missing-clip` to blend points and adds findings for a blend name colliding with a glb clip, non-increasing thresholds and `loop: false` on a point; the codes are the spec's.
- The archetype template follows the demo (`scripts/sync-scene.mjs`). New ADR vs amending ADR 0029 is the spec's call. Minor version bump.
- The three's weight/`timeScale` arithmetic stays deterministic under the 1/60 step [inference: today's crossfade already passes the pinned poseHash test].

**Risks and deliberately deferred questions**
- **Conflicts with the issue #203 stack** in `player.character.json`, `ComponentCard.tsx`/`inspector-props.ts` and `.sdd/project.md`: rebase once #203 lands.
- **The edit-mode preview changes the viewport contract (ADR 0030):** one Animator must advance without `game.simulate`, without touching history or JSON.
- `components/animator.ts` grows (own fades, blends, params): the 600-logical-line limit may call for splitting the module.
- Phase sync assumes the KayKit locomotion clips start on the same foot: verify.
- The interruption policy changes poses mid-fade: pinned unit-test hashes are re-pinned deliberately.
- **#151:** CI's Linux WebGPU frame may be blank; pixels are asserted where the frame draws, snapshot and pose on both backends.
- Bench baselines need `chichex-linux` reachable unattended (it once asked for an interactive Tailscale SSH check).
- **Deferred:** opening the 2D-blend issue (decision 2).

**Recommended context for the spec session**
- This handoff; ADRs 0004, 0014, 0029, 0030; `.sdd/grills/2026-10-12-3d-animation.md`, `.sdd/grills/2026-10-12-3d-editor.md`, `.sdd/grills/2026-10-13-archetype-third-person.md`; `CONTEXT.md` (Animator, Clip Target, Simulation Step).
- Engine: `components/animator.ts`, `animation/clip-target.ts`, `animation/pose-hash.ts`, `state/state-machine.ts`, `components/animator-determinism.test.ts`, `components/animator-clip-progress.test.ts`.
- Behaviors: `character-states.ts`, `enemy-states.ts`, `character-motor.ts`, `own-one-shot-clip.ts`.
- Editor: `inspector/animator-clip-rows.tsx`, `StateEditorModal.tsx`, `viewport-game.ts`, `use-viewport-game.ts`, `glb-clips.ts`, `inspector-animator.test.tsx`, `inspector-animator-clips.test.tsx`.
- MCP: `animator-validation.ts`, `state-machine-validation.ts`, `clip-resolution.ts`.
- Bench and e2e: `packages/bench/src/page/skinned-characters.ts`, `packages/bench/src/sweep.ts`, `scripts/runtime-e2e-third-person.mjs`, `scripts/runtime-e2e-animation.mjs`, `scripts/runtime-e2e-editor-3d.mjs`.
- Demo and template: `examples/third-person/src/characters/player.character.json`, `packages/archetype-third-person/src/prefabs.ts`, `scripts/sync-scene.mjs`, `scripts/trim-character-glb.mjs`.
