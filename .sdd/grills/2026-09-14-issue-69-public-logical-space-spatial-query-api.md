# Grill — Issue #69 Public Logical-Space Spatial Query API
<!-- Estado: finalized. Proyecto: /Users/ayrtonmarini/Sync/workspace/waica. Fuente: chichex/waica#69. -->
<!-- SDD-Tracking: version=1; type=grill; state=finalized; issue=chichex/waica#69; grill=issue-69-public-logical-space-spatial-query-api-20260914-e071ef88; project=%2FUsers%2Fayrtonmarini%2FSync%2Fworkspace%2Fwaica -->

## Modo
domain-modeling

## Hechos comprobados

- `Game.entities` is a mutable, spawn-ordered array that is spliced in place when entities are destroyed; `Game` currently has no spatial query service.
- `Entity.position` remains in Logical Coordinates under isometric projection; rendering projects separately under ADR-0009.
- `Hitbox` is trigger geometry, `Solid` is static physical geometry, and `DynamicBody` contacts remain separate from trigger overlap.
- `Tilemap` implements `SolidSource` and derives multiple transient `Solid` instances. `sceneSolids()` enumerates direct and derived geometry in stable entity/component order.
- Existing overlap math supports rectangle, polygon, and polygonally approximated circle/ellipse and excludes exact boundary contact.
- Pointer uses inclusive Sprite/AnimatedSprite bounds in render space and resolves front-most by layer and projected Y under ADR-0010.
- `MeleeAttack` snapshots the entity array and queries Hitbox + Health; `interactUpdate` measures transform distance against each target-owned radius; Chaser caches the first player; navigation consumes both the first Tilemap and all scene Solids.
- Issue #57 is resolved. Issue #70 remains open and owns layers, masks, broadphase, and collision-dispatch acceleration.
- The focused triage baseline was green on the same clean commit `f75616f6e4b4dff102ac0135b89b710b7f1962d3`: 62 tests across six relevant files.
- `.sdd/project.md` describes a deterministic verification ladder but records version 0.9.0 while current packages are 0.14.0.
- `CONTEXT.md` now defines Spatial Query, Hitbox, Solid, and Ray Hit.

## Decisiones resueltas

1. `Game` exposes a stable readonly `game.query` service.
2. `area` and `point` inspect only live entities' `Hitbox` geometry in Logical Coordinates; entities without Hitbox do not participate.
3. `nearest` considers every filtered live entity by logical `entity.position`, without requiring collision geometry.
4. `ray` intersects all physical `Solid` geometry, direct and `SolidSource`-derived, including Tilemap solids.
5. A Ray Hit exposes both the owning `Entity` and exact intersected `Solid`; a derived Solid reference is query-snapshot identity, not durable Tilemap-cell identity.
6. Every operation accepts one optional declarative filter: `with` requires every listed Component class, `without` rejects any listed class, `exclude` accepts one Entity or a readonly entity collection, and `where` is a final entity predicate. Ray filters apply to the Solid owner.
7. A const `with` tuple narrows returned Entity types so `get(Class)` is non-optional for required classes. A `where` type guard may narrow further; ray applies the result type to `hit.entity`.
8. `area` and `point` return matches in `game.entities` order. Equal-distance `nearest` picks the first entity in that order. Equal-distance `ray` picks the first Solid in stable physical-source order.
9. `area` requires positive interior overlap and `point` requires strict interior containment. Exact edge or vertex contact is excluded; Pointer's independent visual bounds remain inclusive.
10. Calls eagerly snapshot candidates alive at query time. Later spawns do not appear; later destruction does not remove returned references, so mutating consumers re-check `alive`. Point/distance/normal records are snapshot values while Entity, Component, and Solid references remain live objects.
11. `nearest` uses 2D Euclidean distance to logical transforms, ignores Z, and returns the narrowed Entity or `null`.
12. `nearest.maxDistance` is optional and inclusive. Omitted or positive Infinity is unlimited; zero admits only the same transform; negative or NaN returns `null`.
13. For `nearest`, `where(entity, { distance })` receives the already-computed Euclidean distance and runs as eligibility before ranking, preserving target-owned radii.
14. `ray` normalizes finite non-zero `(dx,dy)`. It tests the closed segment `[0,maxDistance]`, including an exact endpoint. Zero max distance is valid; non-finite inputs, zero direction, or negative max distance return `null` without throwing.
15. Ray supports every current Solid shape: exact rectangle and simple-polygon edges, plus analytic ellipse intersection and gradient-derived normal for `shape: 'circle'`.
16. Ray requires a strict interior crossing. A strictly interior origin reports the first exit surface at positive distance. Pure tangency or boundary-collinear travel is no hit. A boundary origin heading inward hits at distance zero; outward or tangent does not. Zero-area shapes are ignored.
17. At a polygon entry vertex, the face whose outward normal most opposes the ray wins, then stable edge order. At an exit vertex, the most direction-aligned face wins, then stable edge order.
18. `RayHit | null` contains `{ entity, solid, distance, point: { x, y }, normal: { x, y } }`; distance and point are logical query-time values and normal is unit-length and outward.
19. Migrate `MeleeAttack.strike` to `area` with Health requirement and self exclusion, preserving offsets, scene order, all-target damage, alive checks, invulnerability reporting, and destruction safety. Migrate `interactUpdate` to `nearest` with Interactable requirement, player exclusion, and target-owned inclusive radius through contextual `where`, preserving input/UI behavior.
20. Do not migrate Chaser: its cached first-player contract is not nearest-player semantics.
21. Navigation retains `sceneSolids()` plus first-Tilemap discovery; no public Solid enumeration or physical-area operation is added.
22. Pointer retains render-space Sprite/AnimatedSprite picking, inclusive bounds, and layer/projected-Y front-most resolution; no visual mode is added to `point`.
23. Centralize Hitbox/Solid-to-`CollisionBody` extraction and stable candidate enumeration behind engine-internal replaceable providers. Start with linear scans and publish no index/plugin abstraction.
24. Future #70 acceleration must preserve logical geometry, filters, eager snapshots, source order, ties, and hit semantics.
25. Collision dispatch may share the body helper but remains behaviorally unchanged and O(n²) in #69.
26. Expected semantic signatures are `area(body, filter?) -> Entity[]`, `point(x, y, filter?) -> Entity[]`, `nearest(x, y, { ...filter, maxDistance? }?) -> Entity | null`, and `ray(x, y, dx, dy, maxDistance, filter?) -> RayHit | null`; exact exported type names may be refined without semantic change.
27. `area`/`point` reuse existing `CollisionBody` shape resolution and current polygonal circle outline; analytic ellipse handling is ray-only.
28. Invalid/non-finite area or point inputs return `[]`; invalid/non-finite nearest coordinates return `null`.
29. `where` predicates are pure eligibility tests; invocation count is not a side-effect contract, allowing future candidate pruning.
30. Existing component cardinality remains unchanged; multiple Hitboxes per entity are not introduced.

## Ramas pendientes

No unresolved branch remains inside issue #69. Deliberately deferred blocks are issue #70 acceleration/layers/masks, any future nearest-player Chaser behavior, physical-area or visual query expansion, and durable Tilemap-cell identity.

## Handoff

### Scope

Specify a public, typed, read-only `game.query` service for deterministic 2D Spatial Queries in Logical Coordinates. Keep the initial implementation linear and preserve the semantic separation between Hitbox targeting, transform proximity, Solid obstruction, and Pointer visual picking.

### Restrictions and non-goals

- Do not implement broadphase, layers, masks, a collision matrix, or any other part of #70.
- Do not publish a spatial-index or plugin interface.
- Do not add render-space/sprite modes to point, public Solid enumeration, or Solid-area queries.
- Do not change Chaser targeting, Pointer picking, navigation semantics, or collision-dispatch behavior.
- Do not create durable identities for Tilemap cells or generated Solids.

### Dependencies and consequences

- One central body-conversion rule must own offsets, dimensions, shapes, and points so queries and collision code cannot drift.
- Stable source-order ties are public behavior that every future broadphase must reproduce.
- Type narrowing and liveness are query-time guarantees only; returned live references can subsequently mutate or die.
- Analytic ray/ellipse behavior intentionally differs from overlap's polygonal circle approximation.
- This is a published engine/behaviors API and therefore costly to reverse.

### Risks and deferred work

- Lock numerical epsilon behavior near boundaries, tangencies, and vertices with deterministic tests.
- Linear performance remains until #70.
- Nearest-player Chaser behavior, physical-area queries, visual queries, and durable Tilemap-cell provenance need separate product decisions.
- Refresh `.sdd/project.md` before execution because its package-version snapshot is stale.

### Verification guidance

- Keep the service and geometry helpers in dedicated engine modules so `game.ts` remains below the 950-line gate.
- Unit-test rectangle, polygon, and analytic ellipse rays; entry, exit, tangent, boundary, vertex, endpoint, zero-length, malformed-input, direct-Solid, and derived-Solid cases.
- Unit-test area/point strict boundaries, Hitbox offsets and shapes, logical/isometric coordinates, filters, TypeScript narrowing, ordering/ties, and query-time mutation snapshots.
- Add regression tests for MeleeAttack and interactUpdate, and prove Chaser, navigation, Pointer, and collision dispatch remain unchanged.
- Run typecheck, focused tests, the full unit suite, build, and published-package-shape verification under the refreshed autonomy contract.
