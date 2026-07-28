# Spec — Pre-topdown hardening: archetype seams, registries, identity, input, tests, solver
<!-- Generada por /sdd-spec el 2026-07-28. Fuente: pedido libre (auditoría multi-agente 2026-07-28). Estado: aprobada -->

## Contexto
The engine is about to grow its second archetype (top-down 2D), but today every archetype seam is hardwired to the platformer: `ACTIVE_ARCHETYPE` is a build-time constant read at module top-level (`packages/editor/src/project/archetype.ts:21`, consumed in `Home.tsx`, `template.ts`, `icons.ts`, `Explorer.tsx`, `use-project-art.ts`, `Viewport.tsx`), the picked archetype id is discarded and never persisted, the role/logic-set registries are merge-only module Maps with no reset API (`packages/engine/src/state/hooks.ts:36,79`) silently claimed via `import '@waica/behaviors'` in `chassis.ts:4`, "the player" is defined as "has `PlatformerMotor`" in Collectible/Hazard/Chaser, `DEFAULT_BINDINGS` hardcodes `left/right/jump` in the engine (`packages/engine/src/input.ts:6-9`), and the per-axis Solid collision solver exists as two hand-synced copies (`platformer-motor.ts` and `chaser.ts`). This spec is the pre-work that turns the top-down archetype from a fork into data + new role code. It also bundles three sanctioned bug fixes found in the same audit: stuck keys on focus loss, tunneling at the 0.1s dt clamp, and the `ResizeObserver` leak in `Game.dispose()`.

**Hard constraint**: zero observable behavior change for the existing platformer archetype — existing projects (`game.json` without an `archetype` field = platformer) must keep working identically — EXCEPT the three sanctioned fixes above.

## Comportamiento esperado

### Item 1 — Archetype manifest (identity persisted, runtime lookup)
- **CA-1** (ALTA): Creating a project stamps the picked archetype id into `game.json` as `"archetype": "<id>"` (plain string). Unit test over the template/creation output.
- **CA-2** (ALTA): Opening a project resolves its archetype from `game.json`; a missing `archetype` field resolves to `platformer`. Unit test over the resolution function with both shapes.
- **CA-3** (ALTA): The exported `ACTIVE_ARCHETYPE` build-time constant no longer exists; consumers resolve the archetype at runtime (function/hook taking the project's id). Pass/fail: `grep -rn "ACTIVE_ARCHETYPE" packages/editor/src` returns no consumers outside the archetype module itself, and `pnpm typecheck` is green.

### Item 2 — Registries: per-archetype installation with reset semantics
- **CA-4** (ALTA): The engine exposes an install/reset API for the role and logic-set registries. Installing archetype bundle A then bundle B leaves ONLY B's roles and logic sets registered — no per-state merge residue. Unit test: register a `player` role with `run/jump` states, install a bundle whose `player` has only `walk`; `logicSet('player')` must not contain `run` or `jump`.
- **CA-5** (ALTA): `chassis.ts` no longer blanket-imports `@waica/behaviors` for its side effects; it installs the bundle of the project's resolved archetype. Unit test with stubs + structural check (no bare `import '@waica/behaviors'`).
- **CA-6** (ALTA): Starting an editor Play session registers role code from the current project files only: code from a role file deleted since the previous Play no longer executes. Unit test over the play-runner registration path with stubs.

### Item 3 — Driver-agnostic player identity
- **CA-7** (ALTA): `Collectible` is collected when touched by the entity whose `StateMachine.role === 'player'`, regardless of which motor/driver component it has. Unit test with a stub entity carrying a StateMachine with `role: 'player'` and no `PlatformerMotor`.
- **CA-8** (ALTA): `Hazard`'s generic hurt path triggers against the `role === 'player'` entity without requiring `PlatformerMotor`. Stomp math remains platformer-only (still gated on the motor) and unchanged.
- **CA-9** (ALTA): `Chaser` target discovery finds the entity whose `StateMachine.role === 'player'` instead of the first entity with `PlatformerMotor`. Ghost/flyer/walker pursuit behavior otherwise unchanged (existing tests stay green).
- **CA-10** (ALTA): Semantic tightening is intentional: an entity WITH `PlatformerMotor` but `role !== 'player'` is no longer collected-for / hurt-generic / targeted. Unit test asserts the new negative case.

### Item 4 — Input defaults out of the engine + stuck-keys fix
- **CA-11** (ALTA): The engine's `DEFAULT_BINDINGS` no longer hardcodes platformer actions: the engine-level default is empty/neutral, and `Input` uses the bindings handed to it (archetype-declared). Unit test: constructing `Input` with `{ up: [...] }` yields no `jump` action.
- **CA-12** (ALTA): The platformer archetype declares exactly today's map (`left: ArrowLeft/KeyA`, `right: ArrowRight/KeyD`, `jump: Space/ArrowUp/KeyW`) plus its action labels, so existing platformer projects behave identically. Unit test on the archetype bundle + full suite green.
- **CA-13** (ALTA): On `window` blur and on `document` visibilitychange→hidden, all held keys are released: after dispatching the event, `isDown(...)` is false for every action that was held. Unit test with happy-dom events. (Sanctioned behavior change #1.)
- **CA-14** (MEDIA): The editor controls UI (`ProjectPane`) reads action labels and "Reset to defaults" targets from the project's archetype — reset restores the archetype's map, not an engine constant. Verified by human protocol (below); unit-test the pure resolution helper where extractable.

### Item 5 — Characterization tests for the four seams
- **CA-15** (ALTA): `collision-shape.ts` geometry (`collisionOverlap` and shape cases) has tests pinning current behavior.
- **CA-16** (ALTA): `PlatformerMotor.resolveAxis` has tests pinning: contact convergence (binary search lands flush), the already-overlapping bail, and the grounded rule.
- **CA-17** (ALTA): The `StateMachine` component runtime has tests pinning `playClip` resolution, press/signal consumption, and transition chaining (not just its pure helpers).
- **CA-18** (ALTA): `Game` glue has tests pinning camera-mover discovery (the `vx` duck-typing) and `dispatchCollisions`. Known out-of-scope bugs encountered while pinning (jump-buffer double-consume, spawn-inside-wall pass-through, initial `onEnter` mid-spawn) are pinned AS-IS with a comment marking them as documented current behavior, not approved behavior.

### Item 6 — Shared axis solver + tunneling fix
- **CA-19** (ALTA): One shared per-axis Solid resolution module lives in the engine; `PlatformerMotor` and `Chaser` both consume it. The duplicated `resolveAxis` bodies and the hand-synced `MAX_FALL_SPEED` comment in `chaser.ts` are gone. Structural + unit.
- **CA-20** (ALTA): Tunneling is fixed via substepping in the shared solver: at `dt = 0.1` (the clamp) with speed × dt greater than a wall's thickness, the character stops at the wall instead of passing through. Unit test with a thin Solid and high velocity. (Sanctioned behavior change #2.)
- **CA-21** (ALTA): Platformer feel is preserved: the CA-16 characterization tests pass unchanged except the specific cases the tunneling fix updates deliberately (those assert the new behavior and say so).

### Item 7 — ResizeObserver leak
- **CA-22** (ALTA): `Game.dispose()` disconnects the `ResizeObserver` created in the constructor (`game.ts:79`). Unit test with a stubbed global `ResizeObserver` asserting `disconnect()` is called on dispose. (Sanctioned behavior change #3.)

### Global
- **CA-23** (ALTA): `pnpm test`, `pnpm typecheck`, and `pnpm build` are all green at the end (baseline today: 314 tests / 33 files, all packages typecheck, build ~3s).
- **CA-24** (MEDIA): Editor end-to-end sanity: create a project, reopen it, Play the platformer demo — identical behavior to today (movement, jump, collectibles, hazards, chasers), and the controls panel shows the platformer actions. Human protocol below.

## Fuera de alcance
- The top-down archetype itself (movement, roles, tiles, camera preset) — this spec only prepares the seams.
- The directional animation contract (1 state : N clips), camera generalization (two-axis lookahead, velocity-provider interface), and `AnimatedSprite` anchor option — deliberately deferred to be designed against real top-down needs (audit: "fix during pivot").
- The double-stomp order-dependence bug in `Hazard` (platformer-only gameplay bug, does not compound with the pivot).
- The three low-severity bugs listed in CA-18: pinned AS-IS, not fixed.
- CI setup, coverage tooling, editor bundle code-splitting (contract gaps, separate decisions).

## Inferencias
| # | Inferencia | Elección | Alternativa razonable | Confianza | Resolución |
|---|---|---|---|---|---|
| 1 | Shape of the `game.json` field | Plain string `"archetype": "platformer"` | `{ id, version }` object | alta | confirmada |
| 2 | Registry API shape | `installArchetype(bundle)`: reset + register; chassis installs the project's archetype | Bare `clearRegistries()`, caller orchestrates | media | confirmada |
| 3 | Player identity signal | `StateMachine.role === 'player'` (already exists) | Dedicated `PlayerTag` component | media | confirmada |
| 4 | Where input defaults live | Archetype manifest declares bindings + labels; engine default becomes empty/neutral | Engine keeps generic `left/right`, archetype adds `jump` | media | confirmada |
| 5 | "Zero behavior change" vs the 3 fixes | Zero change EXCEPT the 3 sanctioned fixes (stuck keys, tunneling, leak) | Absolute zero (fixes out of spec) | alta | confirmada |
| 6 | Characterization tests vs known out-of-scope bugs | Pin AS-IS with a documenting comment | Skip tests over buggy behavior | alta | confirmada |
| 7 | Tunneling fix approach | Substepping in the shared solver (displacement cap per step) | Swept AABB | baja | confirmada — flagged as risk |
| 8 | Identity-change side effect | Accept the tightening (motor-but-not-player entities stop collecting/being targeted) | Preserve current odd behavior behind a flag | alta | confirmada |

## Verificabilidad
**ALTA (22 of 24 CAs)** — the contract's ladder runs deterministic vitest today (`pnpm test` verificado 2026-07-28, 314 tests, ~1s, happy-dom): all registry/identity/solver/input/leak behavior is pure logic or stub-testable (the entity-stub pattern already exists in `patrol.test.ts`). **MEDIA (CA-14, CA-24)** — editor UI seams need a live editor; the repo has no scripted e2e suite (contract: browser rung is interactive-only), and the chosen mechanism is vitest-only, so these two are verified by the human protocol below. No generation policies are active in the contract; no PR-size gate forces a partition. Blast radius is real (~20 files across engine/editor/behaviors in one PR) — accepted by the requester as a single spec.

## Plan de verificacion
**Mechanism (user-chosen): vitest only + human protocol for the two MEDIA CAs.**
- CA-1..CA-13, CA-15..CA-23: `pnpm test` — each CA maps to named unit/characterization tests written test-first where the CA changes behavior (TDD; the contract marks the runner green and ~1s). CA-3 additionally: `grep -rn "ACTIVE_ARCHETYPE" packages/editor/src` empty outside the archetype module. CA-23: `pnpm test && pnpm typecheck && pnpm build` all green.
- Order note for the runner: land CA-15..CA-18 (characterization) BEFORE the refactors they protect (items 1, 2, 4, 6) — they are the safety net the rest of the spec assumes.
- **Human protocol (CA-14, CA-24), ~2 min after the PR:**
  1. `pnpm editor`, open the printed localhost URL.
  2. Create a new platformer project (demo scene). Confirm the project's `game.json` contains `"archetype": "platformer"`.
  3. Press Play: move, jump, collect a collectible, touch a hazard, get chased. Everything feels identical to current main.
  4. Open the project/controls panel: actions read Left/Right/Jump with today's keys; "Reset to defaults" restores exactly that map.
  5. Close and reopen the project: it opens as platformer (no re-pick, no blank-scene offer).
  6. Switch to another window mid-Play and come back: no key stays stuck held.

## Riesgos y gaps
- **Substepping (inference #7, confianza baja)**: the tunneling fix touches game feel. Mitigation: CA-16/CA-21 characterization first; if feel regresses, swept AABB is the fallback and the spec's CA-20 assertion (stops at wall) still defines pass/fail.
- **Single-PR blast radius** (~20 files, 7 items): no size policy gates it, but review load is high; the runner should keep commits per-item to keep the PR reviewable.
- **Editor seams only human-verified** (vitest-only mechanism): CA-14/CA-24 regressions would surface post-merge in the 2-min protocol, not in CI (there is no CI — contract gap).
- **Registry reset vs Monaco/Play interplay**: CA-6 touches `play-runner.ts`/`play-code.ts`, where the audit also saw a concurrent double-Play issue (out of scope) — the runner must not accidentally widen scope there.
- No `[ASSUMED]` markers: all 8 inferences were reviewed and confirmed by the user on 2026-07-28.
