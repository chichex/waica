import type { Entity } from './entity.js'
import type { Game } from './game.js'
import type { Solid } from './components/solid.js'

/** Metadata for a parameter editable from the inspector. */
export interface ParamSpec {
  label?: string
  min?: number
  max?: number
  step?: number
  /** Allowed values for a string param; rendered as a dropdown. Takes precedence over ref. */
  options?: string[]
  /** Project value this string param names; rendered and validated as a typed reference. */
  ref?: 'prefab' | 'stat' | 'action' | 'clip'
}

export interface ComponentClass<T extends Component = Component> {
  new (): T
  /**
   * Stable component name (survives minification).
   * Used for `waica.params.json` overrides and the inspector.
   */
  componentName: string
  /** Friendly name the inspector shows instead of componentName. */
  displayName?: string
  /** Which properties the inspector exposes, with their ranges. */
  params?: Record<string, ParamSpec>
}

/** Cardinal unit normal pointing away from the contacted Solid surface. */
export interface ContactNormal {
  readonly x: -1 | 0 | 1
  readonly y: -1 | 0 | 1
}

/** A physical DynamicBody contact, deliberately separate from Hitbox triggers. */
export interface SolidContact {
  /** Entity that owns the contacted Solid. */
  readonly entity: Entity
  readonly solid: Solid
  readonly axis: 'x' | 'y'
  readonly normal: ContactNormal
}

/**
 * A pluggable piece of an entity. User behaviors and engine ones are the
 * same thing: Component subclasses with public props.
 */
export abstract class Component {
  static componentName = 'Component'
  static displayName?: string
  static params?: Record<string, ParamSpec>

  entity!: Entity
  game!: Game

  /** Runs once the component is mounted on its entity. */
  onReady?(): void
  /** Runs once per frame. */
  onUpdate?(dt: number): void
  /** Runs when this entity's Hitbox overlaps another one's. */
  onCollide?(other: Entity): void
  /** Runs when this entity's DynamicBody physically contacts a Solid. */
  onContact?(contact: SolidContact): void
  /** Runs when the entity is destroyed or the component removed. */
  onDestroy?(): void
}
