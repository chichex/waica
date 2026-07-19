import type { Entity } from './entity'
import type { Game } from './game'

/** Metadata for a parameter editable from the inspector. */
export interface ParamSpec {
  label?: string
  min?: number
  max?: number
  step?: number
}

export interface ComponentClass<T extends Component = Component> {
  new (): T
  /**
   * Stable component name (survives minification).
   * Used for `waica.params.json` overrides and the inspector.
   */
  componentName: string
  /** Which properties the inspector exposes, with their ranges. */
  params?: Record<string, ParamSpec>
}

/**
 * A pluggable piece of an entity. User behaviors and engine ones are the
 * same thing: Component subclasses with public props.
 */
export abstract class Component {
  static componentName = 'Component'
  static params?: Record<string, ParamSpec>

  entity!: Entity
  game!: Game

  /** Runs once the component is mounted on its entity. */
  onReady?(): void
  /** Runs once per frame. */
  onUpdate?(dt: number): void
  /** Runs when this entity's Hitbox overlaps another one's. */
  onCollide?(other: Entity): void
  /** Runs when the entity is destroyed or the component removed. */
  onDestroy?(): void
}
