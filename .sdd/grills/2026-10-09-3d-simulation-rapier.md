# Grill — 3D simulation: Rapier world, Collider/RigidBody, character motor, 3D queries (roadmap block 2)
<!-- Estado: finalized. Proyecto: /Users/ayrtonmarini/workspace/waica. Fuente: pedido libre (block 2 of the 3D roadmap, after spec #154 landed in 8fa63b0). -->
<!-- SDD-Tracking: version=1; type=grill; state=finalized; issue=none; grill=2026-10-09-3d-simulation-rapier; project=%2FUsers%2Fayrtonmarini%2Fworkspace%2Fwaica -->

## Hechos comprobados

Verified in this session by reading the code at `main` (`8fa63b0`) and by measurements; citations are `file:line` under `packages/engine/src` unless stated.

- **No physics phase exists in the 2D loop.** `simulateStep` runs input, game time, every component's `onUpdate` in the Component Update Schedule, then `dispatchCollisions()` (Hitbox triggers only), then the camera (`game.ts:717-732`). Each `DynamicBody` or behavior motor resolves against the `Solid`s inside its own `onUpdate`, axis by axis, with sub-steps and bisection and no broadphase (`solid-axis.ts:38-104`; `components/dynamic-body.ts:64-100`).
- **Gravity and `grounded` live in behaviors, not in the engine.** `PlatformerMotor.gravity = 42` and `grounded` at `packages/behaviors/src/platformer-motor.ts:51, 121, 149-164`; `Chaser` likewise (`chaser.ts:36, 68`). `DynamicBody` has no gravity, mass or layers and is used only by the platformer example's projectile.
- **Everything is x/y.** `CollisionBody` is `{x, y, width, height, shape, points}` (`collision-shape.ts:4-12`); contact normals are cardinal (`component.ts:41-53`); `game.query` (`area`, `point`, `nearest`, `ray`) takes 2D signatures (`spatial-query.ts:88-155`); the broadphase is a 2D hash grid rebuilt per use (`spatial-broadphase.ts`). z, rotation and scale are ignored by every collision path.
- **The 2D collision components are rejected in 3D scenes.** `TWO_D_COMPONENTS` lists `Sprite, AnimatedSprite, Tilemap, Solid, DynamicBody, Hitbox, Light, ParticleEmitter` (`scene-space.ts:38-47`); `validateEntitySpace` reports `component-space-mismatch` (`packages/mcp/src/space-validation.ts:42-63`). The behavior motors (`PlatformerMotor`, `TopDownMotor`, `IsoMotor`, `GridMotor`, `Chaser`) are not on the list, so they validate clean in a 3D scene although they collide on x/y. The list is a string list in the engine and cannot name behaviors by import.
- **What the 3D trunk left in place.** `game.space`, `game.camera` as a union, `game.worldToScreen`; the entity transform JSON is `position` (2 or 3 numbers), `rotation` (degrees, Euler XYZ) and `scale`, applied to `entity.node` (`entity-transform.ts:22-30`); `Entity` exposes `position` and `scale`, rotation only through `entity.node.rotation`; `Model.root` is public but there is no bounds API; `raycastPick` intersects Models, not colliders (`pointer-raycast.ts:45`); `inspect_runtime` carries `space`, `view`, per-entity position/rotation/scale and 3D lighting.
- **Simulation contract.** `SIMULATION_STEP = 1/60`, `MAX_STEPS_PER_FRAME = 6`, lost time is dropped (`fixed-step.ts:8, 16`; ADR 0014). Run Sessions step whole frames. ADR 0015: a new query domain is an explicit API expansion; ADR 0016: one layer and one mask per Hitbox, either side's interest makes a pair eligible.
- **`game.ts` has no room:** about 598 of the 600-logical-line error tier, 893 of 950 physical lines.
- **Rapier was planned and never adopted.** `DESIGN.md:91` names Rapier; `components/solid.ts:13-14` has `TODO(H1): general dynamic bodies via Rapier; genre character controllers stay hand-rolled so their game feel remains deterministic`; `.sdd/specs/issue-3-dynamic-body.md` kept it out of scope. The lockfile holds `@dimforge/rapier3d-compat@0.12.0` only as a transitive dependency of `@types/three`; nothing imports it.
- **Rapier 3D npm variants, all at 0.21.0, Apache-2.0** (`npm view`): `rapier3d`, `rapier3d-compat`, `rapier3d-simd`, `rapier3d-simd-compat`, `rapier3d-deterministic`, `rapier3d-deterministic-compat`. The README of each package (0.21.0): `-compat` "embed the .wasm file into the .js sources encoded with base64 … bigger package size, but much wider bundler support"; the standard build "does **not** guarantee cross-platform determinism of the physics simulation (but it is still locally deterministic, on the same machine)"; `-simd` "internal SIMD optimizations enabled … requires support for simd128"; `-deterministic` "a less optimized build but with a guarantee of a cross-platform deterministic execution". The Rust docs say `enhanced-determinism` and SIMD are mutually exclusive; no SIMD+deterministic package exists. The `-compat` packages expose `module: dist/rapier.mjs` and need `await RAPIER.init()`.
- **Measured** (own script: a ground slab, N dynamic unit boxes stacked in a grid, 600 steps at 1/60, three runs, best time; md5 of every body's translation at the end):

  | Variant | 1000 boxes, Mac arm64 Node 26 | 1000 boxes, Linux x86_64 Node 24 | 50 boxes, Mac | Position hash Mac = Linux |
  |---|---|---|---|---|
  | `rapier3d-compat` | 0.40 ms/step | 0.31 ms/step | 0.024 ms/step | yes (`c8112bef762b`) |
  | `rapier3d-simd-compat` | 0.33 ms/step | 0.21 ms/step | 0.019 ms/step | yes (`b09ba988d645`) |
  | `rapier3d-deterministic-compat` | 0.42 ms/step | 0.33 ms/step | 0.025 ms/step | yes (`c8112bef762b`) |

  Init (`RAPIER.init()`) took 30–55 ms in Node. Standard and deterministic produced the same hash on both machines; SIMD produced a different hash, identical on both machines.
- **Node:** 26.4.0 locally, 22 on CI (`.github/workflows/ci.yml:33, 61`); both run wasm and simd128.
- **Example and bench.** `examples/smoke-3d` is static: no input, movement or physics (`src/main.ts`, `src/scenes/main.scene.json`). `packages/bench` has thirteen 2D scenarios and no 3D plan (`src/sweep.ts:7-21`); its harness could run a `ScenarioPlan` with `render.space: '3d'`.
- **Docs that already speak.** ADR 0027: "Physics, skeletal animation playback, shadows and a third-person archetype are later blocks." Issue #154 (spec, approved, implemented) lists "3D physics or collision, character motor, navigation (block 2)" out of scope, and its grill handoff named the block's topics: "collision and motor (Rapier vs hand-rolled, with a spike), determinism, 3D queries, navigation". `CONTEXT.md` defines Solid, Hitbox, Spatial Query, Collision Layer/Mask, Navigation Grid ("Avoid: navmesh") in Logical Coordinates, and has no Dynamic Body entry.

## Decisiones resueltas

1. **Target of the block:** a kinematic character that walks on the ground, bumps into walls and boxes, and jumps under gravity.
2. **Solver: Rapier 3D.** The user's decision, against the recommendation of mirroring the hand-rolled 2D solver (and against `TODO(H1)`). Recorded as such.
3. **Variant: `@dimforge/rapier3d-deterministic-compat` 0.21.0**, chosen after the measurements above. The user first asked for "the one that performs best"; the research showed every variant is far under budget and only this one guarantees cross-platform determinism.
4. **Body types exposed: static, kinematic and dynamic.** Re-asked after decision 2: with Rapier in, dynamic bodies (fall, bounce, stack) enter this block.
5. **Loading: dynamic `import()` when the first 3D scene loads.** A 2D project never pays the ~2 MB. The 3D scene waits for Rapier behind `game.ready()`, which is already asynchronous because of the renderer.
6. **Gravity: a `simulation.gravity: [0, -9.81, 0]` block in the scene JSON**, with that default when absent. A per-body `gravityScale`.
7. **Components: `Collider` + `RigidBody`**, mirroring Rapier's model. `Collider` alone is a static wall or floor. `Collider` + `RigidBody{type: 'dynamic' | 'kinematic'}` is a body that moves. `Collider{sensor: true}` with `layer` and `collidesWith` is a trigger with the 2D Hitbox's semantics (ADR 0016).
8. **Shapes: box, sphere and capsule**, with explicit size always. Never derived from the Model.
9. **A minimal character motor in `@waica/behaviors`:** moves the kinematic body on the XZ plane relative to the world axes, jumps when grounded. Follow camera and camera-relative input belong to the archetype block.
10. **Queries: all four of `game.query` gain 3D signatures.** `ray`, `area` and `point` against colliders through Rapier; `nearest` by transform including z. An explicit API expansion, as ADR 0015 requires.
11. **Navigation: nothing in this block.**
12. **Example: extend `examples/smoke-3d`** with a keyboard-driven character, a step and a falling body; its e2e leg grows.
13. **How a component declares its space: a static marker on the class** (`static space: '2d' | '3d' | 'both'`). Validation reads it and the fixed `TWO_D_COMPONENTS` list goes away. The 2D behavior motors get tagged and stop validating clean in 3D scenes. New components of this block are born tagged.

## Ramas pendientes

Ordered roadmap after this block: 3. animation (`AnimationMixer`, a `play(clip)` contract for StateMachine); 4. 3D editor; 5. third-person archetype (follow/orbit camera, `known-archetypes.ts` row). Derived and undated: 3D navigation, 2.5D, Rapier for 2D scenes, shadows and spot lights.

## Handoff

**Topic and scope.** Give scenes with `render.space: '3d'` collision, gravity, bodies and a character that walks and jumps, with Rapier 3D as the solver. Navigation, animation, the 3D editor and the archetype stay out.

**Confirmed decisions.** The thirteen above; the spec takes them as confirmed and does not re-ask them.

**Constraints and non-goals**
- 2D is untouched: it keeps the hand-rolled solver. Rapier exists only in 3D scenes. Migrating 2D to Rapier is a derived, undated block.
- The fixed step (ADR 0014) and the Component Update Schedule do not change. One Rapier step per Simulation Step.
- No navigation, joints, trimesh or cylinder colliders, follow camera, animation, 3D editor, shadows.
- Nothing new in `game.ts` beyond the hook of the physics phase; the physics lives in new modules.
- No release in this block.

**Explicit assumptions** (the spec lists them as `[ASSUMED]` inferences)
- One Rapier world per live scene, dying with it like audio and timers.
- The physics phase runs after the components' `onUpdate` and before `dispatchCollisions`.
- Sync: static bodies are created from the JSON once; kinematic bodies read `entity.position`, which the motor moves (`setNextKinematicTranslation`); dynamic bodies are Rapier's and write `entity.position` and the node's rotation every step.
- Colliders follow the entity's rotation and scale. The character's kinematic body has its rotation locked (an upright capsule).
- The character uses Rapier's `KinematicCharacterController` with its defaults (autostep, max slope, snap-to-ground) and exposes `grounded`.
- `onContact` receives 3D normals. Sensors reuse `onCollide` and ADR 0016's layers; solid colliders collide with everything.
- `inspect_runtime` exposes per body: type, velocity, `grounded`; and `simulation.gravity`.
- Tests run real Rapier under Vitest (wasm in Node): deterministic, ALTA.
- One 3D bench scenario (falling boxes) with deterministic counters and a position hash.
- A direct, exact-pinned dependency of `@waica/engine`; the CLI vendors it; the MCP runner and source fallback add the specifier.

**Risks and deferred questions**
- Rapier contradicts `TODO(H1)`. The deterministic build mitigates it; the spec should require a cross-platform hash CA (Mac vs the Linux bench host, `pnpm bench:remote`).
- Rapier breaks its API between minors: exact pin and a single adapter module.
- About 2 MB more in 3D projects' bundles; `test:dist` must cover it.
- happy-dom + wasm under Vitest, and the MCP's no-dist source fallback with a wasm dependency: verify early.
- Issue #151 (blank WebGPU frames on CI Linux) still affects the extended leg's pixel assertions.
- The scope is large; the spec should cut layers, for example: world and bodies; character and queries; example, bench and docs.
- Game feel (jump height, acceleration, step height) is human-verified.

**Pending blocks.** See "Ramas pendientes".

**Recommended context for the spec session.** Issue #154 and ADR 0027; ADRs 0014, 0015, 0016; `packages/engine/src/game.ts:717-732`, `solid-axis.ts`, `collision-dispatch.ts`, `collision-category.ts`, `spatial-query.ts`, `scene-space.ts`, `entity-transform.ts`, `fixed-step.ts`, `components/{model,dynamic-body,hitbox,solid}.ts`, `runtime-inspection.ts`; `packages/behaviors/src/{platformer-motor,grid-motor}.ts`; `packages/mcp/src/{space-validation,project-component-fallbacks,project-component-runner,collision-category-validation}.ts`; `scripts/runtime-e2e-smoke-3d.mjs`; `packages/bench/src/{sweep.ts,page/harness.ts}`; `examples/smoke-3d/src/`; Rapier's JS user guide (getting started, character controller, determinism) at rapier.rs and the 0.21.0 README.
