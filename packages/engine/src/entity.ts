import * as THREE from 'three'
import type { Component, ComponentClass } from './component'
import type { Game } from './game'

/**
 * Nodo vivo de la escena: un transform (three Group) + componentes.
 * Se crea con `game.spawn(name)`.
 */
export class Entity {
  readonly node = new THREE.Group()
  readonly components: Component[] = []
  private destroyed = false

  get alive(): boolean {
    return !this.destroyed
  }

  constructor(
    readonly game: Game,
    readonly name: string,
  ) {}

  get position(): THREE.Vector3 {
    return this.node.position
  }

  get scale(): THREE.Vector3 {
    return this.node.scale
  }

  add<T extends Component>(Class: ComponentClass<T>, props?: Partial<T>): T {
    const component = new Class()
    component.entity = this
    component.game = this.game
    if (props) Object.assign(component, props)
    this.game.applyParamOverrides(this, component)
    this.components.push(component)
    component.onReady?.()
    return component
  }

  get<T extends Component>(Class: ComponentClass<T>): T | undefined {
    return this.components.find((c) => c instanceof Class) as T | undefined
  }

  has<T extends Component>(Class: ComponentClass<T>): boolean {
    return this.components.some((c) => c instanceof Class)
  }

  destroy(): void {
    if (this.destroyed) return
    this.destroyed = true
    for (const c of [...this.components]) c.onDestroy?.()
    this.components.length = 0
    this.node.removeFromParent()
    this.game.removeEntity(this)
  }
}
