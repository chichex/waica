import { Component, type Entity } from '@waica/engine'
import { Health } from './health.js'
import { PlatformerMotor } from './platformer-motor.js'
import { isPlayer } from './player-identity.js'
import { Respawnable } from './respawnable.js'

export type HazardTouch = 'stomp' | 'hurt'

/**
 * Touching a hazard by stomping it from above (falling, with the feet
 * above its center) squashes it; any other contact hurts.
 * Pure, so the decision is testable without the engine.
 */
export function resolveHazardTouch(
  playerVy: number,
  playerBottom: number,
  hazardY: number,
  stompable: boolean,
): HazardTouch {
  if (stompable && playerVy < 0 && playerBottom > hazardY) return 'stomp'
  return 'hurt'
}

/**
 * Hurts the player on contact. If stompable (Mario-style), stomping it
 * bounces the player. Requires Hitbox on both entities.
 *
 * "Hurts on touch" is all this means — being able to take a hit is Health's
 * job, so a spike is a Hazard alone and an enemy is Hazard + Health. Either
 * side of the interaction falls back to its pre-Health behavior (destroy
 * itself on a stomp, respawn the player on contact) when there is no Health
 * to route the damage through.
 */
export class Hazard extends Component {
  static override componentName = 'Hazard'
  static override params = {
    stompable: { label: 'Stompable' },
    bounce: { label: 'Stomp bounce', min: 0, max: 30, step: 0.5 },
    stompDamage: { label: 'Stomp damage', min: 0, max: 20, step: 1 },
    contactDamage: { label: 'Contact damage', min: 0, max: 20, step: 1 },
  }
  static override transient = ['bouncing']

  stompable = true
  bounce = 10
  /**
   * Dealt to this entity when the player stomps it. Only read on the
   * Health path — with no Health on this entity, a stomp always destroys
   * it outright (the legacy behavior), whatever this is set to. Setting it
   * to 0 does not make a Health-less hazard survive a stomp.
   */
  stompDamage = 1
  /**
   * Dealt to whoever touches it any other way. Only read on the Health
   * path — with no Health on the other entity, contact always respawns it
   * (the legacy behavior), whatever this is set to. Setting it to 0 does
   * not make contact harmless for a Health-less target.
   */
  contactDamage = 1

  /**
   * Set once a stomp bounces the player, until it stops rising. The bounce
   * (motor.vy = this.bounce) can leave the hitboxes still overlapping on
   * the very next check, and with vy no longer < 0 resolveHazardTouch reads
   * that as 'hurt' — a survivor would otherwise hurt the player it is still
   * bouncing away from.
   */
  private bouncing = false

  override onCollide(other: Entity): void {
    if (!isPlayer(other)) return
    const motor = other.get(PlatformerMotor)
    if (motor) {
      const playerBottom = other.position.y - motor.hitboxHeight / 2
      const touch = resolveHazardTouch(
        motor.vy,
        playerBottom,
        this.entity.position.y,
        this.stompable,
      )
      if (touch === 'stomp') {
        const health = this.entity.get(Health)
        if (health) health.damage(this.stompDamage, other)
        else this.entity.destroy()
        motor.vy = this.bounce
        this.bouncing = true
        return
      }
      if (this.bouncing) {
        if (motor.vy > 0) return
        this.bouncing = false
      }
    }
    const health = other.get(Health)
    if (health) health.damage(this.contactDamage, this.entity)
    else other.get(Respawnable)?.respawn()
  }
}
