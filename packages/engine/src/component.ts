import type { Entity } from './entity'
import type { Game } from './game'

/** Metadata de un parámetro editable desde el inspector. */
export interface ParamSpec {
  label?: string
  min?: number
  max?: number
  step?: number
}

export interface ComponentClass<T extends Component = Component> {
  new (): T
  /**
   * Nombre estable del componente (sobrevive a la minificación).
   * Se usa para los overrides de `waica.params.json` y el inspector.
   */
  componentName: string
  /** Qué propiedades expone el inspector, con sus rangos. */
  params?: Record<string, ParamSpec>
}

/**
 * Pieza enchufable de una entidad. Los behaviors del usuario y los del
 * motor son la misma cosa: subclases de Component con props públicas.
 */
export abstract class Component {
  static componentName = 'Component'
  static params?: Record<string, ParamSpec>

  entity!: Entity
  game!: Game

  /** Corre cuando el componente ya está montado en su entidad. */
  onReady?(): void
  /** Corre una vez por frame. */
  onUpdate?(dt: number): void
  /** Corre cuando la Hitbox de esta entidad se superpone con la de otra. */
  onCollide?(other: Entity): void
  /** Corre al destruir la entidad o remover el componente. */
  onDestroy?(): void
}
