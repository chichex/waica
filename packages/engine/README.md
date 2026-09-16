# `@waica/engine`

Waica's public engine core: entities and components, the game loop, scene and prefab loading, state machines, input, collisions, sprites, camera, stats, and UI.

```ts
import { Component, Game, loadScene } from '@waica/engine'
```

## Hitbox Collision Layers and Masks

Every `Hitbox` belongs to one named Collision Layer and declares the other layers in which it is interested through a Collision Mask:

```ts
import { Hitbox } from '@waica/engine'

entity.add(Hitbox, {
  layer: 'projectile',
  collidesWith: ['enemy'],
})
```

A layer must match `^[a-z][a-z0-9-]*$`. Layer names form an open, project-owned vocabulary; matching is exact and case-sensitive. `"*"` is valid only in a mask and matches every valid layer. An empty mask means no outgoing interest. Invalid layers cannot be targeted, and invalid or non-string mask entries are ignored without runtime coercion or warnings.

A pair reaches exact overlap testing when either side's mask names the other side's layer. After an overlap, only an interested side receives `onCollide`; a one-way projectile mask therefore does not notify its target. Omitted fields retain the compatibility defaults `layer: 'default'` and `collidesWith: ['*']`, so two unconfigured Hitboxes still notify both sides.

Layers and masks are read while the collision-pair snapshot is consumed. A component can change them during `onUpdate` or one callback and affect later pairs in that Simulation Step. Pair order remains the original lexicographic Entity order, component callbacks remain in insertion order, and destroyed entities are still skipped between sides.

### Shipped taxonomy and migration

Waica's shipped prefabs use this directional policy:

| Hitbox owner | `layer` | `collidesWith` |
| --- | --- | --- |
| Player | `player` | `['*']` |
| Slime, blob, or orc / `Hazard` | `enemy` | `['player']` |
| Coin, potion, or crate / `Collectible` | `collectible` | `['player']` |
| Overlap `SceneTransition` | `scene-transition` | `['player']` |
| Platformer projectile | `projectile` | `['enemy']` |

`Collectible`, `Hazard`, overlap `SceneTransition`, and the example projectile trust those masks and no longer recheck the other Entity's role inside `onCollide`. Existing external projects using any of these handlers must explicitly migrate their sibling Hitboxes before relying on the new behavior. The defaults preserve engine-level callback delivery, but a wildcard-backed migrated handler can act on unintended default-layer entities.

1. Assign `player` / `['*']` to player Hitboxes.
2. Assign the relevant row above to each shipped handler carrier, or choose equivalent project-owned names.
3. Run MCP `validate_project`; malformed values are errors and duplicate mask entries are warnings.
4. Keep `trigger: 'interact'` Scene Transitions unchanged—their Hitbox mask is relevant only to overlap mode.

The editor and MCP author explicit categories for newly generated player/enemy identities. NPCs, custom or identity-less characters, generic objects, and existing external project files are not inferred or rewritten. `public/waica.params.json` may override either field with the same exact values, including a `string[]` mask.

## Collision broadphase

The Game uses fresh internal uniform grids to accelerate automatic Hitbox dispatch, Hitbox-backed `area`/`point` queries, and Solid-backed `ray` queries. Hitboxes and Solids stay in separate domains. `nearest`, `DynamicBody` physical-contact solving, Pointer picking, navigation, and unrelated scans remain linear or otherwise unchanged.

The grid changes candidate discovery only: existing exact geometry is still authoritative. Each operation observes candidates alive at its start, preserves Entity or Solid source order and tie behavior, and recomputes after scene swaps, spawns, movement, shape edits, or Tilemap-derived Solid changes. Oversized bodies and query regions fall back conservatively, so they may cost more but cannot lose results. Grid sizing, occupancy limits, indices, and rebuild controls are deliberately package-internal and have no public tuning API.

## Logical spatial queries

Every `Game` owns one stable `game.query` service. Queries use logical XY coordinates, including in isometric scenes, and return typed live engine objects:

```ts
import { Component, type CollisionBody, type Entity, type Game } from '@waica/engine'

declare const game: Game
declare const player: Entity

class Faction extends Component {
  name = 'neutral'
}

const search: CollisionBody = { x: 0, y: 0, width: 8, height: 6 }
const nearby = game.query.area(search, {
  with: [Faction] as const,
  exclude: player,
  where: (entity) => entity.get(Faction).name !== 'friendly',
})

// `with` makes this non-optional at compile time.
nearby[0]?.get(Faction).name
```

| Method | Spatial domain | Result |
| --- | --- | --- |
| `area(body, filter?)` | Hitbox collision outlines | All overlapping Hitbox owners |
| `point(x, y, filter?)` | Hitbox collision outlines | All strict point containers |
| `nearest(x, y, filter?)` | Entity logical transforms | The nearest Entity or `null` |
| `ray(x, y, dx, dy, maxDistance, filter?)` | Direct and source-derived Solids | The first `RayHit` or `null` |
| `Pointer` picking | Sprite visuals in projected/render space | The front-most visual owner |

Every filter can require all classes in `with`, reject any class in `without`, exclude one Entity, a readonly Entity array, or a `ReadonlySet` by identity, and apply a final `where` predicate. `nearest` also accepts inclusive `maxDistance` and passes `{ distance }` to `where`. Filters compose conjunctively. Ray filters apply to each Solid's owner; for example, a generated Tilemap Solid can match `with: [Tilemap]`, but only an owner with a direct Solid matches `with: [Solid]`.

Calls eagerly snapshot candidates that are alive at call start. Results preserve scene/source order, and ties keep the first candidate. Later spawns do not enter a result and later destruction does not remove it. Returned Entity, Component, and Solid references remain live; a `RayHit`'s distance, point, and normal are detached query-time values.

Invalid inputs fail closed without throwing: invalid `area` bodies and non-finite point coordinates return `[]`; invalid nearest coordinates or radii return `null`; and ray returns `null` for non-finite values, a zero direction, or a negative distance. Nearest permits positive `Infinity`; ray distance must be finite and may be zero. Zero-area candidate geometry never matches.

Area and point intentionally use the collision system's polygonally approximated circle/ellipse outline. Ray queries intersect circle-shaped Solids as analytic ellipses and return their exact outward unit normal. Collision Layers and Masks never filter `area` or `point`; use a query filter when category-like eligibility is needed.

## Component lifecycle

Waica keeps the lifecycle boundaries distinct:

1. `Entity.add()` mounts a component and calls its `onReady` immediately. This remains component insertion order so setup behavior does not silently move.
2. During each simulated frame, entities keep their existing entity order. When an entity's turn begins, `Game` snapshots and resolves that entity's component `onUpdate` schedule, then dispatches only that schedule.
3. Physical `onContact` hooks run from `DynamicBody` while it updates. Hitbox `onCollide` hooks run after all entity component updates. Their existing component dispatch order is unchanged.
4. `Game.onUpdate` callbacks run after component updates, collisions, and camera work; input end-of-frame handling follows them.
5. `Entity.destroy()` calls `onDestroy` in component insertion order.

Only classes whose prototype chain implements `onUpdate` participate in the update schedule. Passive components remain available to their siblings but receive no update position.

## Declaring update constraints

An updateable component can declare the sibling writes it must observe with inherited static `updateAfter` metadata:

```ts
import { Component, StateMachine } from '@waica/engine'

export class DamageFlash extends Component {
  static override componentName = 'DamageFlash'
  static override updateAfter: readonly string[] = ['StateMachine']

  override onUpdate(dt: number): void {
    const state = this.entity.get(StateMachine)?.current
    // This update observes StateMachine's state for the same frame.
    void state
    void dt
  }
}
```

The relation is conditional on co-presence. `DamageFlash` does not require a `StateMachine`; when that target is registered but absent from this entity, no edge and no issue are created. A subclass inherits `updateAfter` when it declares nothing and replaces the inherited list when it declares its own list.

Constraints always win over the tie-break. Whenever several components are ready simultaneously, Waica compares their case-sensitive `componentName` values in ascending Unicode code-unit order. It never uses locale collation, prefab order, scene order, or editor card grouping. Repeated names in one `updateAfter` list describe one edge.

## Invalid schedules fail closed

Component identity must be unique within an entity, and both sides of a present constraint must implement `onUpdate`. Waica rejects duplicate component names, unknown targets, passive declarers or present passive targets, self-edges, and multi-component cycles.

At runtime an invalid entity runs no partial update schedule and does not fall back to authored order. Other entities continue updating. The engine logs one diagnostic containing the entity and causes, then logs again only if that entity's composition changes.

Tools can inspect a composition without constructing components:

```ts
import { resolveComponentUpdateSchedule, type ComponentClass } from '@waica/engine'

const registry: Record<string, ComponentClass> = { DamageFlash, StateMachine }
const result = resolveComponentUpdateSchedule(
  ['DamageFlash', 'StateMachine'],
  registry,
)

if (result.ok) {
  console.log(result.order) // ['StateMachine', 'DamageFlash']
} else {
  console.error(result.issues)
}
```

The resolver is pure. Pass the effective component-name list and the complete class registry, including project-owned classes. A valid result contains `order` and no issues; an invalid result contains typed, actionable issues and no executable order.

## Runtime inspection

The engine owns Runtime Bridge protocol 1, but it is dormant during ordinary execution: there is no string-named global, network endpoint or per-frame bridge work. An MCP-owned browser context can install the symbol-keyed ephemeral activation hook before navigation. In that context `Game.start()` registers the fully constructed Game at a paused frame-zero baseline; `Game.dispose()` or page unload unregisters it.

Runtime Snapshots automatically inspect public own component fields and setter-backed accessors while excluding `_` fields, `entity`, `game` and functions. A component can replace automatic discovery with the optional public contract:

```ts
class PathFinder extends Component {
  inspectState(): unknown {
    return { target: this.target, remaining: this.path.length }
  }
}
```

The return value still passes through the bounded safe projector; it is not serialized with arbitrary `toJSON()`. The package root exports the Runtime Snapshot, projection marker, metadata, control and activation types plus `RUNTIME_BRIDGE_PROTOCOL_VERSION` and `RUNTIME_PROJECTION_LIMITS`.

## game.time: simulated timers and tweens

Every `Game` owns a `time: GameTime` service — `after`, `every`, a single-number `tween`, and a `now` reader — advanced only by Simulation Steps (ADR 0014), never by the wall clock:

```ts
const stun = game.time.after(0.3, () => fsm.goto('idle'), { owner: entity })
game.time.every(1, () => game.stats.set('clock', game.time.now), { scope: 'session' })
game.time.tween({
  from: 0, to: 1, seconds: 0.5, easing: 'quadOut',
  onUpdate: (v) => { overlay.opacity = v },
  onComplete: () => game.loadSceneByName('b'),
  owner: entity,
})
stun.remaining // seconds left, counting down
game.time.now  // seconds of Game Time since the Game started
```

- **`after(seconds, callback, options?)`** runs `callback` once, `seconds` of Game Time later (0 or a negative duration: the start of the next step). **`every(seconds, callback, options?)`** runs it every `max(seconds, 1/60)`, first one interval after creation, with no drift. **`tween(options)`** carries `from` to `to` over `seconds`, calling `onUpdate(value)` synchronously on creation and again on every later step, finishing with exactly `to` then `onComplete()`. Easing is `'linear'` (default), `'quadIn'`/`'quadOut'`/`'quadInOut'`, `'cubicIn'`/`'cubicOut'`/`'cubicInOut'`, `'sineInOut'`, or a custom `(t) => number`.
- All three return a `TimerHandle`: `cancel()`, `active`, `elapsed`, `remaining` (seconds of Game Time). `cancel()` — and owner/scene cancellation — leaves a tween's last applied value in place and never calls `onComplete`.
- **Step placement.** At the start of every Simulation Step, before the Component Update Schedule, `game.time` advances `now`, runs every due timer (due time, then creation order), then advances every tween that existed before that step (creation order). Work a callback creates is never run or advanced in that same step.
- **Scope.** A timer or tween is scene-scoped by default: `unloadScene()` and every scene load — including a Game's first — cancel it, running no callback. `{ scope: 'session' }` survives a scene change. `{ owner: entity }` cancels it immediately when that entity is destroyed, whatever its scope; an owner already dead at scheduling time yields an inactive handle. `game.dispose()` cancels everything in both scopes. This is the opposite default from `game.onUpdate`/`game.events` (ADR 0011), which survive a scene change by construction, and the same one `game.audio.play()` uses (ADR 0012) — see ADR 0017 for why timers follow audio's rule rather than the host-subscription one: a timer's callback almost always closes over the scene that scheduled it.
- **No Promises.** Nothing here returns one, and nothing is async — a `.then` continuation is not step-exact (it runs after the whole synchronous frame), which is exactly what `game.time` exists to avoid. Compose delays with `after`, not `await`.
