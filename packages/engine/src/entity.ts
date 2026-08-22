import * as THREE from 'three'
import type { Component, ComponentClass } from './component.js'
import type { Game } from './game.js'

/**
 * A live scene node: a transform (three Group) + components.
 * Created with `game.spawn(name)`.
 */
export class Entity {
  readonly node = new THREE.Group()
  readonly components: Component[] = []
  private logicalPosition: THREE.Vector3 | null = null
  private destroyed = false

  get alive(): boolean {
    return !this.destroyed
  }

  constructor(
    readonly game: Game,
    readonly name: string,
  ) {}

  get position(): THREE.Vector3 {
    return this.logicalPosition ?? this.node.position
  }

  /** Keeps identity scenes zero-copy while projected scenes own a logical transform. */
  setProjected(projected: boolean): void {
    if (projected === (this.logicalPosition !== null)) return
    if (projected) {
      this.logicalPosition = this.node.position.clone()
      return
    }
    this.node.position.copy(this.logicalPosition!)
    this.logicalPosition = null
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
