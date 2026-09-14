# `@waica/engine`

Waica's public engine core: entities and components, the game loop, scene and prefab loading, state machines, input, collisions, sprites, camera, stats, and UI.

```ts
import { Component, Game, loadScene } from '@waica/engine'
```

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

Area and point intentionally use the collision system's polygonally approximated circle/ellipse outline. Ray queries intersect circle-shaped Solids as analytic ellipses and return their exact outward unit normal.

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
