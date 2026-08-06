import { Component } from '@waica/engine'
import { Health } from './health.js'

/**
 * Kills whatever falls out of the world. The damage is not configurable
 * because leaving the level is lethal by nature — being hurt by a hard
 * landing is a different mechanic, measured on ground contact, and project
 * code can write it with Health.damage and the motor's readable velocity.
 *
 * "Lethal" still goes through Health.damage, which means invulnerability
 * frames delay it: an entity that falls right after taking a hit keeps
 * falling until its i-frames lapse. That is deliberate — damage() has no
 * bypass, by design — and it resolves itself because this check re-runs
 * every frame. An entity with no Health is destroyed outright instead;
 * unlike Hazard, this does NOT fall back to Respawnable.
 */
export class OutOfBounds extends Component {
  static override componentName = 'OutOfBounds'
  static override displayName = 'Out of bounds'
  static override params = {
    minY: { label: 'Floor height', min: -50, max: 0, step: 1 },
  }

  /** Falling below this height is fatal. */
  minY = -12

  override onUpdate(): void {
    // The frame that destroys the entity still iterates a copy of its
    // components: stop checking instead of destroying twice.
    if (!this.entity.alive) return
    if (this.entity.position.y >= this.minY) return
    const health = this.entity.get(Health)
    if (health) health.damage(Infinity, this.entity)
    else this.entity.destroy()
  }
}
