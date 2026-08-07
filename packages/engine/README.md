# `@waica/engine`

Waica's public engine core: entities and components, the game loop, scene and prefab loading, state machines, input, collisions, sprites, camera, stats, and UI.

```ts
import { Component, Game, loadScene } from '@waica/engine'
```

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
