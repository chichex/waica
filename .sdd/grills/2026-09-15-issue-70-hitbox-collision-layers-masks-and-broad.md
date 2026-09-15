# Grill — Issue #70 Hitbox Collision Layers, Masks, and Broadphase
<!-- SDD-Tracking: version=1; type=grill; state=finalized; issue=chichex/waica#70; grill=issue-70-hitbox-collision-layers-masks-and-broad-20260915-e1267f93; project=%2FUsers%2Fayrtonmarini%2FSync%2Fworkspace%2Fwaica -->

## Mode

domain-modeling

## Verified facts

- Current `Game.dispatchCollisions()` snapshots Hitbox owners in entity order, evaluates every `i < j` pair, runs exact overlap geometry, dispatches first-side components, checks both entities are still alive, and then dispatches second-side components.
- Issue #69 is merged and establishes a stable `game.query` service, separate Hitbox/transform/Solid geometry domains, eager call-time snapshots, live returned references, stable source ordering, and package-internal replaceable candidate providers. The current providers still enumerate their full domains and accept no spatial bounds.
- `Entity.position` and Hitbox geometry fields are directly mutable; no spatial dirty hooks exist.
- `Tilemap.cellSize` belongs to each Tilemap component, and a scene can contain zero or several Tilemaps.
- Scene and prefab props plus `authoringDefaults()` preserve arrays, but generic Inspector arrays are currently read-only and `ParamOverrides` currently accepts only scalar values.
- `Collectible`, `Hazard`, and overlap `SceneTransition` currently reject non-player entities inside `onCollide`; the platformer example `Projectile` rejects roles other than patroller/chaser.
- The shipped inventory has ten archetype Hitboxes, three platformer-template Hitbox JSON files, and eleven example Hitbox JSON files.
- Relevant focused baseline before implementation: 126/126 tests passed across eight files.
- Domain artifacts are root `CONTEXT.md` plus ADR-0001 through ADR-0015; no `CONTEXT-MAP.md` exists.
- During this grill, `CONTEXT.md` gained canonical definitions for Collision Layer, Collision Mask, and Collision Broadphase, and Spatial Query now explicitly states that Collision Masks do not narrow it.

## Resolved decisions

1. **Hitbox collision-category shape.** `Hitbox` publicly exposes one `layer: string` membership and one multi-value `collidesWith: string[]` interest mask.
2. **Either-side eligibility.** A pair proceeds to exact overlap geometry when A's mask names B's layer or B's mask names A's layer. Eligibility is independent of entity iteration direction.
3. **Queries are mask-agnostic.** Layers and masks govern automatic Hitbox overlap dispatch only. `game.query.area` and `game.query.point` preserve all issue #69 domain, filter, snapshot, and ordering semantics.
4. **Directional callback recipients.** After an eligible pair overlaps, only each side whose mask names the other side's layer receives `onCollide`. Mutual matches retain first-side component insertion order, the between-sides liveness check, and second-side component insertion order.
5. **Live runtime mutation.** Dispatch reads each live Hitbox's `layer` and `collidesWith` when consuming that not-yet-processed pair. Changes during `onUpdate` affect the same Simulation Step. Changes inside one callback can affect later pairs, but processed pairs are not replayed.
6. **Defaults and wildcard.** Omitted values mean `layer = 'default'` and `collidesWith = ['*']`. In a mask, `*` matches every valid layer and `[]` means no outgoing interest. Two unconfigured Hitboxes therefore retain current two-sided callbacks, and an unconfigured Hitbox retains callbacks against an explicitly named valid layer.
7. **Canonical identifiers and fail-closed values.** A valid layer matches `^[a-z][a-z0-9-]*$`; comparison is exact and case-sensitive. `*` is mask-only. Duplicate mask entries are idempotent. Malformed or non-string entries are ignored. An explicitly invalid layer is not targetable, while an absent property receives the class default. Runtime never trims, lowercases, coerces, or normalizes these values.
8. **Separate indexed domains.** The Game-owned broadphase indexes Hitboxes for automatic dispatch plus `area`/`point`, and separately indexes direct and `SolidSource`-derived Solids for `ray`. `nearest` remains a linear transform query. DynamicBody physical-contact resolution remains outside this change. Geometry domains cannot cross or combine.
9. **Tilemap-derived grid size.** Every grid uses the smallest finite positive `cellSize` among live Tilemaps in the current scene. With no valid Tilemap, it uses `1` logical unit. Multiple Tilemaps are order-independent, and invalid sizes are ignored. The same selected size feeds separate Hitbox and Solid buckets.
10. **Fresh per-operation snapshots.** Every `area`, `point`, and `ray` call builds a fresh grid from candidates alive at call start. After all component updates, automatic collision dispatch builds its own fresh grid and freezes an ordered spatial-pair snapshot. Later spawns do not enter that dispatch; destroyed entities are skipped, preserving the existing between-sides liveness check. Exact bodies plus live layers/masks are re-read as each frozen pair is consumed. Movement or resize may invalidate a candidate but cannot create a pair absent from the dispatch-start spatial snapshot. Each next operation recomputes Tilemap size and sees scene swaps, spawns, movement, shape changes, and derived-Solid rebuilds.
11. **Bounded occupancy and exact fallback.** A valid indexed body's AABB may occupy at most a fixed internal number of cells. Larger bodies go into an overflow bucket and are compared against all relevant same-domain candidates. A query region above the cap enumerates the full same-domain snapshot. Oversized geometry remains correct and only degrades performance locally. Non-finite or zero-area bodies are skipped; existing shape fallbacks and finite negative dimensions remain valid. The cap is tested package-internal tuning, never public API or a semantic guarantee.
12. **Deduplication and canonical order.** A collision snapshot emits each unordered Hitbox pair at most once and sorts pairs lexicographically by original `game.entities` indices `(i,j)`, reproducing the prior nested loops. `area` and `point` restore entity order. `ray` restores `sceneSolids` source order so equal-distance ties remain unchanged. Grid AABB work is broadphase work; masks are checked before exact `collisionOverlap` narrowphase. Callback component order and liveness behavior remain intact.
13. **Generic string-list authoring.** `ParamSpec` gains `kind?: 'string-list'`. Hitbox declares `collidesWith` with that kind. The generic Inspector can add, edit, remove, and author an empty list through entity props, prefab props, instance overrides, and multi-selection. It writes `string[]` directly and never silently trims, changes case, sorts, or deduplicates. Existing arrays without this metadata remain read-only and all other `ParamSpec` behavior remains unchanged.
14. **String-list parameter overrides.** Public `ParamOverrides` expands its value union from `number | boolean | string` to also accept `string[]`. `loadParams` and `applyParamOverrides` can therefore author `collidesWith` through `public/waica.params.json`. Arbitrary nested objects and non-string arrays remain unsupported.
15. **Shipped owner-role taxonomy.** Player Hitboxes use `player` and `['*']`; slime, blob, and orc use `enemy` and `['player']`; coin, potion, and crate use `collectible` and `['player']`; overlap doors use `scene-transition` and `['player']`; the platformer bullet uses `projectile` and `['enemy']`. Player/enemy and player/trigger overlaps notify both interested sides. Bullet/enemy overlap notifies only Projectile. Incompatible non-player populations are rejected before narrowphase.
16. **Masks are authoritative for migrated handlers.** Remove `isPlayer` guards from `Collectible`, `Hazard`, and overlap `SceneTransition`; retain SceneTransition's independent trigger-mode check. Remove Projectile's patroller/chaser role guard. Once invoked, those handlers act without rechecking identity. This deliberately means wildcard defaults preserve engine dispatch compatibility but not behavior-level outcomes for an existing un-migrated carrier; migration guidance is mandatory.
17. **Complete shipped migration, not external rewriting.** Apply the taxonomy to all ten Hitboxes in `packages/archetype-{platformer,topdown,isometric}/src/prefabs.ts`; the three JSON files under `packages/editor/template/src`; and all eleven Hitbox JSON files under the three examples, including the bullet. Update registry-default tests, prefab tests, snapshots, and behavior/example tests. Editor `newPrefabComponents` and MCP scaffolds emit explicit player/enemy settings when identity is known; NPC, custom, identity-less character, and generic object Hitboxes retain class defaults. Existing external Project files are not rewritten.
18. **Authoring-time diagnostics.** Inspector preserves typed values but reports invalid `Hitbox.layer`, `*` as a layer, non-`string[]` masks, and invalid/non-string mask entries inline as errors; duplicate mask entries are warnings. `validate_project` reports the same semantics across prefab props, inline scene components, instance overrides, and `public/waica.params.json`, without repeating inherited findings. Empty masks and syntactically valid unknown names are valid. Runtime remains fail-closed and emits no per-step warnings.
19. **Deterministic work-count proof.** Package-internal instrumentation or dependency seams, never root exports, expose candidate-pair and exact-overlap counts to tests. With fallback cell size 1: 1,000 small isolated Hitboxes produce zero candidate pairs and zero narrowphase calls; 500 isolated two-Hitbox overlap clusters produce at most 500 unique pairs and exactly 500 narrowphase calls; 1,000 co-located Hitboxes with mutually incompatible masks produce zero narrowphase calls even though a single dense cell may enumerate 499,500 spatial pairs. An area over one local region and a ray through a narrow corridor inspect local indexed candidates rather than all 1,000 same-domain entries while preserving ordered results. Wall-clock thresholds are not completion gates.
20. **Full autonomous verification ladder.** Run `pnpm typecheck`; focused Vitest coverage for matching/defaults/mutation, broadphase grid/overflow/counts, dispatch order/liveness, existing Spatial Query semantics, behavior guard removal, Inspector list editing/diagnostics, MCP validation, all three archetype prefabs/generators, and platformer Projectile; then `pnpm test`, `pnpm build`, `pnpm test:dist`, and `pnpm test:e2e`. Browser scenarios exercise migrated runtime outcomes; deterministic component tests cover editor authoring. Inspect public README/JSDoc and the external-project migration table. No manual visual/gameplay proof is required, and all active generation-policy gates apply.

## Pending branches

No unresolved branch remains inside issue #70.

Deliberately deferred blocks are persistent/incremental indices, DynamicBody/Solid solver acceleration, multiple layer membership, a public collision-category registry or collision matrix, automatic external-project rewriting, and dense-cell algorithms beyond this uniform grid.

## Handoff

### Scope

Specify named directional Hitbox Collision Layers and Collision Masks, a Game-owned uniform-grid Collision Broadphase for separate Hitbox and Solid candidate domains, generic list authoring and validation, complete shipped taxonomy migration, mask-authoritative behavior handlers, deterministic work bounds, and autonomous verification. Preserve every issue #69 query/domain/order guarantee except where this handoff explicitly defines the collision-dispatch snapshot boundary.

### Restrictions and non-goals

- Do not add collision shapes, multiple Hitboxes per entity, multiple layer membership, a collision matrix, or a category registry.
- Do not change Solid/DynamicBody physical contact semantics or accelerate the physical solver.
- Do not apply masks to Spatial Queries or accelerate `nearest`, navigation, Pointer picking, or unrelated scans.
- Do not expose broadphase providers, indices, rebuild controls, occupancy caps, plugin points, or tuning through the root package API.
- Do not auto-rewrite external Project files.
- Do not release, version-bump, publish, or add changelog work.
- Do not use a wall-clock benchmark as a completion gate.

### Dependencies and consequences

- Issue #69 and ADR-0015 are hard prerequisites: eager snapshots, live references, separate geometry domains, stable candidate order, and tie behavior remain binding.
- The broadphase must compute bounds to create candidates. “Masks before geometry” means before exact pair narrowphase, not before AABB indexing.
- A frozen dispatch pair set is a deliberate semantic boundary: callback movement can remove a later exact overlap but cannot introduce an absent spatial pair in the same dispatch.
- Removing handler identity guards makes authored masks a behavior contract. Existing user Projects using those handlers must migrate before relying on the new release.
- Player wildcard interest intentionally preserves broad player-side callbacks. Dense non-player populations gain most of the mask filtering.
- A pathologically dense cell remains an honest quadratic spatial worst case; the intended improvement is removal of global all-pairs work for sparse and local workloads.

### Explicit assumptions

- The exact internal occupancy cap is selected during specification or implementation and locked by internal tests, not public documentation.
- Broadphase AABBs may produce false positives; existing exact geometry remains authoritative.
- Valid layer names form an open vocabulary. Validation checks shape, not registration.
- Issue #69's `where` predicate invocation count remains non-contractual.
- The pre-existing untracked `mcp-stderr.log` is unrelated and must not be included.

### Risks and deferred work

- A very small live Tilemap `cellSize` may increase bucket pressure; overflow must keep memory bounded and correctness exact.
- Runtime failure is intentionally quiet, placing usability responsibility on Inspector and MCP diagnostics.
- External behavior compatibility depends on explicit mask migration because the selected guard removal is intentionally not defense in depth.
- Persistent indices would require dirty tracking for direct field mutation and therefore remain deferred.
- Multiple category membership, registry-backed categories, automatic migration tooling, and dense-cell specialist algorithms require separate decisions.

### Verification guidance

- Keep broadphase and matching helpers in dedicated engine modules so `game.ts` and every touched TypeScript file remain below the 950-line policy gate.
- Use test-first red/green sequencing for matching, ordered dispatch, overflow, operation snapshots, and candidate-count workloads.
- Preserve every existing area/point/ray result, strict-boundary rule, order, and tie test while changing only candidate discovery.
- Test editor list operations and errors without relying on a browser; test actual migrated collision outcomes in the existing browser e2e harness.
- Run the exact ladder from decision 20 and retain command/count evidence for the future SDD run.

### Recommended context for the next session

Use this finalized handoff together with:

- `chichex/waica#70`;
- `.sdd/project.md`;
- `.sdd/grills/2026-09-14-issue-69-public-logical-space-spatial-query-api.md`;
- `docs/adr/0015-spatial-queries-keep-geometry-domains-separate.md`;
- the updated root `CONTEXT.md`.

A future spec should decompose engine matching/broadphase, query-provider integration, editor list authoring, MCP diagnostics, behavior/prefab migration, and deterministic work-count verification into independently testable criteria. No implementation occurred during this grill.
