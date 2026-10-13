import { Component, THREE } from '@waica/engine'
import { CharacterMotor } from './character-motor.js'
import { PlatformerMotor } from './platformer-motor.js'

/**
 * Remembers where the entity started — or the last Checkpoint it touched
 * (issue #181) — and puts it back there on demand, halting its motor: a
 * PlatformerMotor in 2D, a CharacterMotor in 3D, whose kinematic body the
 * character controller then teleports. That is all: what counts as death,
 * and whether death leads to a respawn at all, belongs to Health and to the
 * role's state graph. The `killY` lower bound this used to author moved to
 * OutOfBounds (docs/adr/0003).
 */
export class Respawnable extends Component {
  static override componentName = 'Respawnable'
  static override displayName = 'Respawn'
  static override transient = ['spawn']

  private spawn = new THREE.Vector3()

  override onReady(): void {
    this.spawn.copy(this.entity.position)
  }

  /** Moves the respawn point (a Checkpoint the entity touched). */
  setSpawn(point: { x: number; y: number; z: number }): void {
    this.spawn.set(point.x, point.y, point.z)
  }

  respawn(): void {
    this.entity.position.copy(this.spawn)
    this.entity.get(PlatformerMotor)?.halt()
    this.entity.get(CharacterMotor)?.halt()
  }
}
