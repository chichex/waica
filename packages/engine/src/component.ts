import type { Entity } from './entity.js'
import type { Game } from './game.js'
import type { Solid } from './components/solid.js'

/** Metadata for a parameter editable from the inspector. */
export interface ParamSpec {
  label?: string
  min?: number
  max?: number
  step?: number
  /** Specialized editor control for values that are otherwise plain JSON. */
  kind?: 'string-list' | 'vector2' | 'vector3' | 'color' | 'texture' | 'model'
  /** Allowed values for a string param; rendered as a dropdown. Takes precedence over ref. */
  options?: string[]
  /** Project value this string param names; rendered and validated as a typed reference. */
  ref?: 'prefab' | 'stat' | 'action' | 'clip' | 'sound' | 'ui'
}

/**
 * The scene space a component belongs to (ADR 0027): `'2d'` components draw,
 * collide or light the orthographic world, `'3d'` ones need a perspective
 * camera, `'both'` run anywhere. A component that declares nothing is `'both'`.
 */
export type ComponentSpace = '2d' | '3d' | 'both'

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
  /** Sibling component updates that must complete before this one when present. */
  updateAfter?: readonly string[]
  /** The scene space this component belongs to; absent means both. */
  space?: ComponentSpace
  /**
   * Instance fields holding runtime state rather than authorable defaults.
   * Excluded from authoringDefaults(); a subclass that does not redeclare
   * this inherits its base's list.
   */
  transient?: readonly string[]
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

/** A 3D contact between two entities' solid Colliders, read after the physics step. */
export interface BodyContact {
  /** The entity whose component receives the hook. */
  readonly entity: Entity
  /** The entity it is in contact with. */
  readonly other: Entity
  /** Unit normal in world space, pointing from `entity` to `other`. */
  readonly normal: { readonly x: number; readonly y: number; readonly z: number }
  /** A world-space point on the contact. */
  readonly point: { readonly x: number; readonly y: number; readonly z: number }
}

/**
 * A pluggable piece of an entity. User behaviors and engine ones are the
 * same thing: Component subclasses with public props.
 */
export abstract class Component {
  static componentName = 'Component'
  static displayName?: string
  static params?: Record<string, ParamSpec>
  static updateAfter?: readonly string[]
  static space?: ComponentSpace
  static transient?: readonly string[]

  entity!: Entity
  game!: Game

  /** Replaces automatic runtime-state discovery for Runtime Snapshots. */
  inspectState?(): unknown

  /** Runs once the component is mounted on its entity. */
  onReady?(): void
  /** Runs once per frame. */
  onUpdate?(dt: number): void
  /** Runs after the scene changes between identity and projected rendering. */
  onProjectionChange?(projection: 'isometric' | null): void
  /**
   * Runs on overlap when this entity's Hitbox (2D) or sensor Collider (3D)
   * mask names the other's layer.
   */
  onCollide?(other: Entity): void
  /** Runs once per Simulation Step for each entity this entity's solid Collider is in contact with (3D, issue #159). */
  onBodyContact?(contact: BodyContact): void
  /** Runs when this entity's DynamicBody physically contacts a Solid. */
  onContact?(contact: SolidContact): void
  /**
   * Runs when this entity wins the nearest-Interactable scan and the
   * initiator interacts with it (a keypress or a click-to-move NPC order).
   */
  onInteract?(initiator: Entity): void
  /** Runs when the entity is destroyed or the component removed. */
  onDestroy?(): void
}
