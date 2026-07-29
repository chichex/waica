# Spec — Support reusable dynamic bodies that collide with Solid geometry
<!-- Generada por /skill:sdd-spec el 2026-07-29. Fuente: issue #3. Estado: implementada -->
<!-- SDD-Tracking: issue=#3; grill=none -->

## Contexto

The engine has static `Solid` colliders and a deterministic, substepped `resolveSolidAxis` helper, but movement integration and contact policy are duplicated by `PlatformerMotor`, `Chaser`, and the platformer example's project-owned `Projectile`. There is no reusable component that lets arbitrary prefab-defined entities move against `Solid` geometry or observe physical contacts independently from `Hitbox` trigger overlaps.

## Comportamiento esperado

- **CA-1 — Velocity integration (ALTA):** An entity with `DynamicBody` and no blocking `Solid` moves by exactly `velocity * dt` on both axes when its update runs.
- **CA-2 — Physical resolution (ALTA):** When movement would intersect a `Solid`, `DynamicBody` stops at a non-overlapping contact position, sets the blocked velocity component to zero, and preserves the tangential component. This works for movement from the left, right, above, and below.
- **CA-3 — Tunneling prevention (ALTA):** A body whose single-frame displacement crosses a `Solid`, including one thinner than that displacement, cannot finish on the far side. The deterministic sweep/substep implementation supports every finite displacement representable within the engine's normal numeric domain; invalid non-finite `dt` or velocity values are outside the contract.
- **CA-4 — Initial overlap recovery (ALTA):** A `DynamicBody` that begins intersecting one or more `Solid` colliders is moved to a non-overlapping position before normal velocity integration. Resolution uses the smallest separating translation; equal-distance ties use a documented stable axis/direction order so identical inputs produce identical results.
- **CA-5 — Observable physical contacts (ALTA):** Every update step in which a `Solid` blocks movement invokes the entity components' separate `onContact(contact)` hook. The contact value identifies the contacted entity and `Solid`, the blocked axis, and a unit surface normal. Multiple distinct blockers produce distinguishable contact values.
- **CA-6 — Trigger independence (ALTA):** An entity may carry both `DynamicBody` and `Hitbox`. A physical `Solid` contact is reported only through `onContact`; a `Hitbox` overlap remains reported only through `onCollide`. Adding either mechanism does not suppress or synthesize events for the other.
- **CA-7 — Configurable physical shape (ALTA):** `DynamicBody` owns its collision shape independently from `Hitbox` and accepts the engine's existing collision fields (`shape`, `width`, `height`, `offsetX`, `offsetY`, and polygon `points`). An entity does not require a `Hitbox` to collide physically.
- **CA-8 — Prefab and editor support (ALTA):** A prefab JSON component entry with `type: "DynamicBody"` constructs the component and applies its supported properties. The platformer registry exposes `DynamicBody`, and its editable parameters and defaults are available to the existing editor inspector/component infrastructure.
- **CA-9 — Public reusable adoption (ALTA):** The platformer example projectile uses `DynamicBody` for movement and wall/platform contact rather than performing its own `Solid` sweep or overlap recovery. Its existing enemy-hit behavior continues through `Hitbox`, demonstrating the two collision channels together.
- **CA-10 — Existing controller compatibility (ALTA):** Existing `PlatformerMotor` and `Chaser` public behavior and characterization tests remain unchanged; neither controller is required to add or delegate to `DynamicBody`.

## Fuera de alcance

- Dynamic-body-to-dynamic-body physical collision and resolution.
- Mass, forces, impulses, torque, angular velocity, restitution, friction, and rigid-body simulation.
- Automatic gravity; project behavior may update the public velocity.
- Full moving-platform semantics such as carrying riders or transferring a `Solid` entity's velocity. Collision uses each `Solid` at its current transform.
- Migrating or rewriting `PlatformerMotor` or `Chaser`.
- Combining physical contacts with `Hitbox` trigger events.
- Adding Rapier or another physics backend.
- Browser-level visual or game-feel acceptance testing.

## Inferencias

| # | Inferencia | Eleccion propuesta | Alternativa razonable | Confianza | Resolucion |
|---|---|---|---|---|---|
| 1 | Public component type | Engine-level `DynamicBody` | `KinematicBody` or another name | media | confirmada |
| 2 | Movement ownership | `DynamicBody.onUpdate(dt)` integrates velocity automatically | Project code calls `step(dt)` | baja | confirmada |
| 3 | Included dynamics | Linear 2D velocity only | Gravity, forces, or restitution | media | confirmada |
| 4 | Physical shape source | Own shape configuration, independent from `Hitbox` | Require and reuse `Hitbox` | baja | confirmada |
| 5 | Default response | Resolve per axis, zero blocked velocity, preserve tangential velocity | Notify only or configurable bounce | media | confirmada |
| 6 | Contact API | Separate `onContact(contact)` hook with `Solid`, axis, and normal | Pollable state or start/stay/end events | baja | confirmada |
| 7 | Contact frequency | Notify every update step that produces a physical block | Notify only on contact start | baja | confirmada |
| 8 | Initial embedding | Deterministic minimum-translation recovery | Disable the body or report only | baja | confirmada |
| 9 | Tunneling | Deterministic sweep/substeps for finite normal-domain displacement | Publish a maximum supported speed | media | confirmada |
| 10 | Dynamic-vs-dynamic collision | Out of scope | Resolve body-to-body contacts | alta | confirmada |
| 11 | Moving `Solid` behavior | Read current transform without velocity transfer | Full moving-platform support | media | confirmada |
| 12 | Trigger coexistence | `DynamicBody` and `Hitbox` use independent hooks | Fold triggers into the new component | alta | confirmada |
| 13 | Existing controllers | Keep `PlatformerMotor` and `Chaser` independent | Refactor them onto `DynamicBody` | alta | confirmada |
| 14 | Editor registration | Register in the platformer archetype and expose inspector params | Global editor registration outside archetypes | media | confirmada |
| 15 | Example adoption | Migrate the example projectile | Test only through isolated fixtures | media | confirmada |
| 16 | Backend | Extend the existing deterministic collision machinery | Introduce Rapier | media | confirmada |
| 17 | Compatibility | Additive change preserving current scenes and hooks | Permit incompatible collision-hook changes | alta | confirmada |

## Verificabilidad

**ALTA for CA-1 through CA-10.** The autonomy contract records `pnpm test` as a deterministic Vitest suite and explicitly identifies unit/component tests as the cheapest strong signal. Motion, collision resolution, recovery, hook dispatch, JSON construction, registry metadata, and controller compatibility are all observable without rendering or external services. `pnpm typecheck` and `pnpm build` provide monorepo-wide API and bundling regression signals.

## Plan de verificacion

- **CA-1:** Add deterministic `DynamicBody` unit tests that call its update with fixed `dt` values and assert exact X/Y displacement.
- **CA-2:** Unit-test contacts from all four directions; assert non-overlap, zero blocked velocity, and unchanged tangential velocity.
- **CA-3:** Unit-test a displacement larger than the body and a thin `Solid`; assert the body remains on the approach side and does not overlap.
- **CA-4:** Start bodies inside one and multiple `Solid` colliders; assert non-overlap after recovery and identical results across repeated runs, including an equal-distance tie fixture.
- **CA-5:** Attach a probe component implementing `onContact`; assert contact count and payload identity, axis, and normal for one and multiple blockers.
- **CA-6:** In a world containing both `Solid` and `Hitbox` interactions, independently spy on `onContact` and `onCollide`; assert neither channel receives the other's event.
- **CA-7:** Test rectangular and polygonal body configuration without a sibling `Hitbox`, including offsets.
- **CA-8:** Load a prefab entry through the existing scene/component registry path and assert property assignment; unit-test platformer registry membership and editor-visible parameter/default metadata.
- **CA-9:** Update the existing projectile tests to assert `DynamicBody` wall contact and retained `Hitbox` enemy overlap behavior, with no project-owned call to `resolveSolidAxis` or `Solid` overlap recovery.
- **CA-10:** Keep the existing `PlatformerMotor`, `Chaser`, and full repository tests green without attaching `DynamicBody` to those entities.
- Run the focused tests during red-green-refactor, then finish with `pnpm typecheck`, `pnpm test`, and `pnpm build` from the repository root.

## Riesgos y gaps

- The existing `resolveSolidAxis` intentionally ignores pre-existing overlaps, so CA-4 requires a new recovery path with explicit deterministic tie-breaking rather than using that behavior unchanged.
- Axis-separated resolution has corner-order semantics. The implementation must document and lock its stable X/Y order in tests.
- Dispatching `onContact` to a snapshot of components should follow the safety pattern used by `onCollide`, because a handler may destroy the entity or remove a component.
- The editor has no scripted browser e2e suite, but browser verification is unnecessary for the accepted registry/metadata contract; behavior is covered by deterministic unit tests.
- No CI exists. The complete verification ladder must therefore be run locally before the implementation PR.

<details>
<summary>Body original</summary>

## Problem

Waica currently provides `Solid` for static geometry and hand-written character controllers such as `PlatformerMotor` and `Chaser`. However, project-owned moving objects do not have a reusable dynamic-body abstraction that can move and resolve collisions against `Solid` geometry.

A concrete example is a projectile: it can use `Hitbox` to overlap enemies, but platforms only have `Solid`, so the projectile passes through level geometry unless each project implements its own collision sweep and resolution. The same gap affects moving crates, knockback-driven objects, debris, and other non-character bodies.

## Desired capability

Provide a reusable engine-level mechanism for dynamic or kinematic entities that:

- moves using velocity over simulated time;
- detects and resolves contact against existing `Solid` geometry;
- prevents tunneling at normal gameplay speeds, or clearly documents supported limits;
- exposes collision/contact information to project behavior code;
- works alongside `Hitbox` trigger collisions without conflating triggers and physical contacts;
- can be configured from prefab JSON and registered in the editor like other components;
- has deterministic tests for movement and collision resolution.

The public contract should support use cases such as projectiles, moving boxes, and generic movable hazards without requiring each archetype or game to implement a separate solver.

## Acceptance examples

- A projectile moving horizontally stops or is notified when it reaches a platform or wall represented by `Solid`.
- A dynamic body cannot remain embedded in a `Solid` after collision resolution.
- Project code can distinguish a physical contact with level geometry from a `Hitbox` overlap with another entity.
- Existing hand-tuned character controllers continue to work without being forced onto the generic body implementation.

## Implementation note

The engine currently contains a TODO mentioning general dynamic bodies via Rapier. This issue intentionally describes the required behavior rather than prescribing Rapier or another backend; the implementation choice can remain with the engine maintainers.

</details>

## Resultado de ejecucion (2026-07-29 · HEAD e3e80df)

| CA | Estado | Evidencia |
|---|---|---|
| CA-1 | verificado | `pnpm exec vitest run packages/engine/src/components/dynamic-body.test.ts packages/engine/src/game.test.ts packages/archetype-platformer/src/registry.test.ts examples/platformer/src/components/projectile.test.ts`: 28/28 verdes; integración exacta X/Y. |
| CA-2 | verificado | Mismo comando focalizado: contactos desde izquierda, derecha, abajo y arriba quedan no solapados, anulan sólo `vx`/`vy` bloqueado y preservan el tangencial. |
| CA-3 | verificado | Mismo comando focalizado: desplazamiento 10 contra `Solid` de ancho 0.05 queda del lado de aproximación y sin solapamiento. |
| CA-4 | verificado | Mismo comando focalizado: recuperación simple y múltiple verde en cinco repeticiones; empate estable `-X, +X, -Y, +Y`. |
| CA-5 | verificado | Mismo comando focalizado: dos blockers distintos entregan entidad, instancia `Solid`, eje y normales unitarias diferenciables. |
| CA-6 | verificado | `game.test.ts` dentro del comando focalizado: `onContact` físico y `onCollide` trigger se despachan exclusivamente por sus canales. |
| CA-7 | verificado | `dynamic-body.test.ts` dentro del comando focalizado: rectángulo y polígono con offsets colisionan sin `Hitbox`. |
| CA-8 | verificado | `game.test.ts` construye todos los campos desde prefab JSON; `registry.test.ts` verifica registro, parámetros editables y defaults. |
| CA-9 | verificado | `projectile.test.ts` dentro del comando focalizado conserva 6/6; grep estructural sin `resolveSolidAxis`, `collisionOverlap`, `insideSolid` ni `get(Solid)` en `projectile.ts`. |
| CA-10 | verificado | `pnpm exec vitest run packages/behaviors/src/platformer-motor.test.ts packages/behaviors/src/player-identity.test.ts packages/engine/src/solid-axis.test.ts`: 12/12 verdes; diff contra `main` sin cambios en controllers/tests existentes. |

Escalera contractual completa: `pnpm typecheck` verde en los siete workspaces; `pnpm test` 407/407 en 49 archivos; `pnpm build` verde con el warning preexistente de chunk grande del editor. El ejemplo y el editor respondieron HTTP 200 al smoke de Vite y ambos procesos fueron detenidos. Políticas de generación activas: ninguna. Desviaciones de la spec: ninguna.
