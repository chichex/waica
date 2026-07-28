# Spec — Client extensibility toolkit: project components, collision hooks, runtime prefab spawn, Lifetime
<!-- Generada por /sdd-spec el 2026-07-28. Fuente: pedido libre. Estado: aprobada -->

## Contexto

Product decision: waica ships **tools, not prebuilt mechanics** — a client building a gun (or any custom mechanic) must be able to do it as *project code*, without forking the engine and without leaving the editor. Today that path is broken end to end: the editor wires its registry to the archetype npm package only (`packages/editor/src/editor/Editor.tsx:422-431` spreads `archetype.registry`, never project components), the Play runner shims only `@waica/engine`/`@waica/behaviors` and leaves relative imports to fail in the browser (`packages/editor/src/editor/play-runner.ts:17-33`, policy pinned by `play-code.test.ts` "leaves unknown specifiers"), collisions dispatch only to `Component.onCollide` — never to states/roles code (`packages/engine/src/game.ts:221-255`, `StateHooks` is `onEnter/onUpdate/onExit` only, `packages/engine/src/state/hooks.ts:12-17`), `Game` does not retain the `SceneRegistry` so nothing can spawn a prefab at runtime (`game.ts` has no registry field; `game.spawn()` at `:85-90` is bare), and the editor's "New component" button is disabled with "coming soon" (`Explorer.tsx:37` `CUSTOM_COMPONENTS: string[] = []`, `:912-925`). The template's project-code glob covers only `./roles/*.ts` and `./states/*.ts` (`packages/create-waica/template/src/main.ts:10`).

The integrating acceptance case is the canonical tutorial mechanic: a gun written in `examples/platformer/src/components/gun.ts` (project code, **never** in `packages/behaviors`) that fires a bullet prefab, working both in `pnpm dev` and in Play-in-editor.

**Hard constraint**: zero observable behavior change for existing projects that have no `src/components/` directory.

## Comportamiento esperado

### Item 1 — Template loads project components

- **CA-1** (ALTA): The create-waica template `src/main.ts` (and `examples/platformer/src/main.ts`, which mirrors it) globs `./components/*.ts` into `projectCode`, executed after `installArchetype` and before `loadScene`, alongside roles/states. Pass/fail: structural test asserting the emitted template content includes the `./components/*.ts` glob (extend `packages/editor/src/project/template.test.ts`), plus `grep` parity check on the example's `main.ts`.

### Item 2 — Play pipeline: project components + relative imports

- **CA-2** (ALTA): `loadPlayCode` lists and loads `src/components/*.ts` **before** states and roles (so states/roles can import them); a component file that fails to transpile or execute reports into `result.errors` exactly like states do today. Unit test over `MemFS` + fake transpiler (extend `packages/editor/src/project/play-code.test.ts`).
- **CA-3** (ALTA): Relative imports between project `src/` files resolve in Play: a state/role file importing `'../components/gun'` executes against the transpiled gun module (project files are transpiled into a specifier→URL map fed to `rewriteImports`). A relative specifier that matches no project file reports an error naming the file instead of failing silently in the browser. Unit test; this **inverts** the current `play-code.test.ts` case `'leaves unknown specifiers for the browser to report'` for project-relative specifiers.

### Item 3 — Editor: registry composition, UI, scaffold

- **CA-4** (ALTA): Registry composition merges project component classes over the archetype's: the merged `components` map contains both; on a name collision the **project class wins** and a warning is emitted naming the shadowed type. Pure function, unit test.
- **CA-5** (MEDIA): Editor UI end-to-end: a project component appears in the Inspector "+ behaviour" dropdown (`Inspector.tsx:1229-1244` reads the merged map) and in the Explorer "Components → Custom" group; its `static params` render as inspector sliders; its file opens in an **editable** CodePane (⌘S saves), not the read-only script view. Verification: human protocol (below) — autonomous signal limited to typecheck/build/smoke under the chosen mechanism.
- **CA-6** (ALTA): "New component" scaffold logic lives in a pure module (pattern: `packages/editor/src/project/states.ts` + `states.test.ts`): `src/components/<name>.ts` path helper, list helper, and a template that defines a `Component` subclass with `static componentName` and `static params`; scaffolding **never overwrites** an existing file. Unit test over `MemFS`.

### Item 4 — Collision bridge to states/roles

- **CA-7** (ALTA): `StateHooks` gains `onCollide?(ctx: StateContext, other: Entity)`. When an entity carrying a `StateMachine` collides (Hitbox↔Hitbox), the FSM dispatches `onCollide` to the current state's hooks honoring the `'*'` and `'default'` conventions (`hooks.ts:19-25`), via `StateMachine.onCollide` (a `Component` hook that `dispatchCollisions` already calls — `component.ts:43-44`). Unit tests using the `CollisionProbe`/`makeGame` harness (`packages/engine/src/game.test.ts:43-59`) and the runtime FSM harness (`state-machine-runtime.test.ts`).

### Item 5 — Runtime prefab spawn

- **CA-8** (ALTA): `loadScene` retains its registry on the `Game` (public field, precedent: `paramOverrides` at `game.ts:51`). New API `game.spawnPrefab(prefab: string, options?: { name?: string; position?: [number, number] })` instantiates the prefab's components with resolved props/assets (reusing `spawnFromJson`, `scene.ts:114-126`), applies `position` and the existing per-name `paramOverrides`, and returns the `Entity`. Unknown prefab id, or calling before any `loadScene`, warns to console and returns `null`. Unit tests over `scene.test.ts` + the mocked-three `game.test.ts` harness.

### Item 6 — Lifetime component

- **CA-9** (ALTA): A generic `Lifetime` component in `@waica/behaviors`, registered in `PLATFORMER_REGISTRY` (so it appears under "+ behaviour"): destroys its entity once accumulated `onUpdate` dt reaches `seconds`; `static params` exposes `seconds` (label/min/max/step) for inspector/overlay tuning. Unit test driving `onUpdate(dt)`.

### Item 7 — Integrator: the gun as project code (canonical tutorial)

- **CA-10** (MEDIA): `examples/platformer` gains the gun as project code: `src/components/gun.ts` (+ projectile logic as project code), an `objects/bullet.object.json` prefab, and a `shoot` binding in `src/controls.json`. **No gun/projectile code lands in `packages/behaviors` or `packages/archetype-platformer`** (pass/fail: `grep -ri 'gun\|bullet\|projectile' packages/behaviors packages/archetype-platformer` returns nothing). In `pnpm dev`: pressing `shoot` spawns the bullet prefab via `game.spawnPrefab`; the bullet flies straight (no gravity), stops at `Solid`, destroys a `patroller`/`chaser` on hit, and expires via `Lifetime`. Autonomous signal: structural greps + dev-server smoke; real behavior: human protocol (the example exposes `window.__waica.game`, so the protocol can assert entity state from the console). Soft guidance, reported not gated: gun.ts stays in the ~40-60 line ballpark — it is the "tools made it easy" proxy.
- **CA-11** (MEDIA): In the editor (demo mode / opened project): the Gun appears under Custom with editable source and param sliders, and Play runs the scene with zero `[waica] Play could not run` console errors while shooting works. Autonomous signal: editor smoke; real behavior: human protocol.

## Fuera de alcance

- Prebuilt weapon/projectile behaviors in `packages/behaviors` or any archetype — explicit product decision (tools, not content).
- A scripted Playwright/Cypress e2e suite (remains a contract gap; mechanism chosen below is unit + smoke).
- Arbitrary npm dependencies in Play-transpiled project code (shims stay `@waica/engine` + `@waica/behaviors`; per-file emit, no bundler).
- Live HMR of project code *during* an active Play session (Play keeps its reset-per-Play semantics, `play-code.ts:50-59`).
- The pre-existing autosave/Play race (Play <600 ms after a keystroke runs stale disk content, `Editor.tsx:867-881` vs `CodePane.tsx:130-137`) — noted in risks, not fixed here.
- Mouse/pointer input (aiming) — `Input` stays keyboard-only (`input.ts:10-11`).
- A generic health/damage system; the example bullet destroys its target directly.
- Game-feel tuning of the gun (human-only per contract).

## Inferencias

| # | Inferencia | Elección propuesta | Alternativa razonable | Confianza | Resolución |
|---|---|---|---|---|---|
| 1 | ¿Colisiones llegan a states/roles? (el pedido decía "evaluar") | Sí: `onCollide?(ctx, other)` en `StateHooks` vía `StateMachine.onCollide` | Solo Components custom; o signal `collide` automático | media | confirmada |
| 2 | Cómo el editor conoce las clases del proyecto fuera de Play | Ejecutar `src/components/*.ts` al abrir el proyecto y re-ejecutar en save/Play (mismo pipeline Monaco→blob), merge en `registryWithPrefabs` | Extracción estática de metadata sin ejecutar | media | confirmada |
| 3 | Forma de la API de spawn runtime | `loadScene` retiene registry en `Game`; `game.spawnPrefab(id, {name?, position?})` | Registry en `GameOptions`; función suelta | alta | confirmada |
| 4 | ¿Lifetime entra y dónde? | Entra, en `@waica/behaviors` + `PLATFORMER_REGISTRY` | Excluirlo; o engine core | media | confirmada |
| 5 | Colisión de nombres proyecto/archetype | Proyecto pisa + warning visible | Error; o archetype gana | media | confirmada |
| 6 | Alcance de imports en Play | Relativos dentro de `src/` resuelven; npm sigue limitado a shims `@waica/*` | Bundler real con deps npm | alta | confirmada |
| 7 | Edición del componente en el editor | Vista editable nueva tipo `stateFile` (`ExplorerView` + `sanitizeView`) + scaffold que abre el archivo | Read-only como Scripts | alta | confirmada |
| 8 | Qué hace la gun del ejemplo | `shoot` en controls; bala = prefab spawneado; recta, `Lifetime`, frena en `Solid`, destruye patroller/chaser | Versión sin daño | media | confirmada |
| 9 | "~40 líneas" del gun.ts | Guía blanda reportada, no CA duro | CA duro `wc -l ≤ 60` | alta | confirmada |
| 10 | Race de autosave/Play (<600 ms) | Fuera de alcance, anotado en riesgos | Incluir flush-before-Play | media | confirmada |

## Verificabilidad

**Mixto: CA-1..4, CA-6..9 ALTA · CA-5, CA-10, CA-11 MEDIA.** The ALTA grades are anchored in the contract's verified `pnpm test` (~1s, vitest + happy-dom, deterministic) and in harnesses that already exist: `play-code.test.ts` (MemFS + fake transpiler), `states.test.ts` (scaffold/list over MemFS), `game.test.ts` (mocked three + `CollisionProbe` + direct `dispatchCollisions` seam), `state-machine-runtime.test.ts`, `scene.test.ts`, `template.test.ts` — no new test infrastructure is invented. The MEDIA grades are capped by the contract: browser behavior is only reachable via the interactive Playwright MCP rung (no scripted e2e suite exists — contract gap), and the **user chose the cheaper mechanism** (unit + smoke), so the three MEDIA CAs are *not autonomously observed* in this run: their autonomous signal is proxy-only (typecheck, build, dev/editor liveness smoke) and their real verification is the human protocol below. No CA is BAJA or NULA. No generation policies are active; no conflicts.

## Plan de verificacion

Mechanism (chosen by user): **unit + smoke** — vitest TDD for all ALTA CAs, liveness smoke for dev/editor, full contract ladder as global gate. No browser automation gates this spec; a human protocol covers the MEDIA CAs.

| CA | Mechanism | Command / assertion |
|---|---|---|
| CA-1 | unit (structural) | extend `template.test.ts`: emitted `src/main.ts` contains `./components/*.ts` glob; `grep` parity in `examples/platformer/src/main.ts` |
| CA-2 | unit | extend `play-code.test.ts`: MemFS with `src/components/gun.ts` → loaded first; transpile failure lands in `result.errors` |
| CA-3 | unit | `play-code.test.ts`: state importing `'../components/gun'` resolves via the project URL map; unmatched relative specifier → reported error (inverts the pinned `'leaves unknown specifiers'` case) |
| CA-4 | unit | new test on the pure merge fn: both maps merged; collision → project class wins + warning emitted |
| CA-5 | smoke + human | `pnpm editor` up + `curl -sf` (contract rung 4); human protocol steps 1-4 |
| CA-6 | unit | new `project/components.test.ts` over MemFS: path/list/template helpers; never-overwrite semantics |
| CA-7 | unit | `game.test.ts` harness: two Hitbox entities, one with StateMachine whose current state (and `'*'`/`'default'`) declares `onCollide` → hook receives `(ctx, other)`; state without hook → no dispatch |
| CA-8 | unit | `scene.test.ts`/`game.test.ts`: `loadScene` then `spawnPrefab('objects/coin', {position})` → entity with prefab components at position, paramOverrides applied; unknown id / no registry → warn + `null` |
| CA-9 | unit | new `lifetime.test.ts`: `onUpdate` accumulation destroys at `seconds`; entity alive before threshold |
| CA-10 | greps + smoke + human | `grep -ri 'gun\|bullet\|projectile' packages/behaviors packages/archetype-platformer` → empty; files exist in example; `pnpm dev` + `curl -sf`; human protocol steps 5-8 |
| CA-11 | smoke + human | `pnpm editor` + `curl -sf`; human protocol steps 1-4 (uses the gun) |
| global | ladder | `pnpm typecheck` && `pnpm test` && `pnpm build` all green |

**Protocolo de prueba humana** (CA-5, CA-10, CA-11 — agendado, no escondido):

1. `pnpm editor`, open the demo project. In Explorer → Components, click "＋ New component", name it `Gun`: a `src/components/gun.ts` opens in an **editable** Monaco tab (⌘S saves). Confirm the Custom group lists it.
2. Select the Player entity → Inspector → "+ behaviour…": confirm `Gun` appears in the dropdown; add it; confirm its `static params` render as sliders.
3. Press Play. Confirm the console shows **no** `[waica] Play could not run` lines.
4. Press the shoot key in Play: confirm a bullet spawns and travels. Stop Play; edit a Gun param; Play again and confirm the change applies.
5. `pnpm dev` (examples/platformer). Press the `shoot` binding: a bullet spawns at the player's facing side and flies straight (no gravity drop).
6. Shoot at a wall: the bullet stops/despawns at the `Solid` instead of passing through.
7. Shoot a patroller/chaser: the enemy is destroyed. In the browser console, `__waica.game.entities` reflects the despawns.
8. Shoot into open space: the bullet despawns on its own (Lifetime) — confirm via `__waica.game.entities.length` returning to baseline.

## Riesgos y gaps

- **MEDIA CAs not autonomously observed (chosen mechanism).** The user opted for unit + smoke: CA-5/10/11 pass autonomously only by proxy. The human protocol is the real gate for them. If the /sdd-run session happens to have Playwright MCP available, running steps 1-8 interactively is a sanctioned optional upgrade, not a requirement.
- **Blast radius.** One spec touches engine + editor + behaviors + archetype + template + example in a single PR. No PR-size policy is active in the contract, so this is allowed; if it becomes unwieldy, the natural partition is Items 1-3 (components pipeline) / Items 4-6 (engine APIs) / Item 7 (example), in that order.
- **Executing project TS at editor-open (inferencia 2).** User code runs in the editor process outside Play (same code Play already runs, but earlier). An infinite loop or top-level throw in a component file must surface as a reported error, not a frozen editor — /sdd-run should treat error containment as part of CA-4/5 quality.
- **Class identity across re-executions.** Re-running a component file creates new class objects; entities in a live viewport Game keep old instances until the epoch-driven teardown rebuilds the Game (`Viewport.tsx:589`). Registry refresh must bump the epoch or document staleness.
- **`play-runner.ts` remains untested** (needs a real Monaco worker): CA-2/3 pin the pure layer (`play-code.ts`) only; the emit end is covered indirectly by the human protocol.
- **Param overrides are keyed by entity name** (`game.ts:108-112`): all bullets named `Bullet` share overrides. Acceptable and documented; `spawnPrefab`'s `name` option lets a project opt out.
- **Contract drift (minor).** `.sdd/project.md` records "314 tests in 33 files"; the repo now has 42 test files. Worth a `/sdd-init --update` after this lands.
