import { Component, THREE } from '@waica/engine'
import { PlatformerMotor } from './platformer-motor.js'

/**
 * Remembers where the entity started and puts it back there on demand.
 * That is all: what counts as death, and whether death leads to a respawn
 * at all, belongs to Health and to the role's state graph.
 *
 * Used to also author a `killY` lower bound (moved to OutOfBounds, see
 * docs/adr/0003). A scene JSON authored before that split that still
 * declares `killY` on this component keeps loading — Entity.add assigns
 * unknown props onto the instance without validation — but the prop is
 * inert: nothing reads it, and the entity no longer dies from falling
 * unless it also gets an OutOfBounds component.
 */
export class Respawnable extends Component {
  static override componentName = 'Respawnable'
  static override displayName = 'Respawn'
  static override transient = ['spawn']

  private spawn = new THREE.Vector3()

  override onReady(): void {
    this.spawn.copy(this.entity.position)
  }

  respawn(): void {
    this.entity.position.copy(this.spawn)
    this.entity.get(PlatformerMotor)?.halt()
  }
}
