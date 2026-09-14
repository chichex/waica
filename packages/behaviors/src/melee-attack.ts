import {
  Component,
  Hitbox,
  type CollisionBody,
  type CollisionPoint,
  type Entity,
} from '@waica/engine'
import { logicalDirection } from './facing.js'
import { Health } from './health.js'

/**
 * A short frontal strike. Passive like a motor: state code decides when it
 * happens (the player's `attack` state) and calls strike(facing); this only
 * knows where the blow lands and who can be hurt by it. The hit area is a
 * `range` × `width` rectangle in logical space, laid along the facing from
 * the attacker's hitbox — under the isometric projection that is the
 * diamond diagonal screen-east maps to, so "in front" matches the screen.
 */
export class MeleeAttack extends Component {
  static override componentName = 'MeleeAttack'
  static override displayName = 'Melee attack'
  static override params = {
    damage: { label: 'Damage', min: 0, max: 20, step: 1 },
    range: { label: 'Range', min: 0.5, max: 5, step: 0.5 },
    width: { label: 'Width', min: 0.5, max: 5, step: 0.5 },
    swingSound: { label: 'Swing sound', ref: 'sound' as const },
  }

  damage = 1
  /** How far in front of the attacker the blow reaches, in world units. */
  range = 1
  /** How wide the blow is, across the facing. */
  width = 1
  /** Sound played on every swing. Empty plays nothing (CA-12). */
  swingSound = ''

  /**
   * Lands one blow along `facing`: every other living entity with a Hitbox
   * and a Health inside the strike area takes `damage` once, with this
   * entity as the source. Returns the entities whose health actually
   * dropped — a target still inside its invulnerability window is not
   * counted. An unknown facing strikes nothing.
   */
  strike(facing: string): Entity[] {
    const direction = logicalDirection(facing, this.game.projection)
    if (!direction) return []
    // Positional like Health's hurtSound (CA-8): an off-camera NPC's swing
    // should attenuate and pan like the hit it causes, not play flat and
    // dead-centre while the damage it lands sounds correctly placed.
    if (this.swingSound) this.game.audio.play(this.swingSound, { at: this.entity })
    const area = this.strikeArea(direction.x, direction.y)
    const struck: Entity[] = []
    const targets = this.game.query.area(area, {
      with: [Health] as const,
      exclude: this.entity,
    })
    for (const other of targets) {
      // Query results are eager live references: an earlier target can destroy
      // a later one while this strike is still consuming its snapshot.
      if (!other.alive) continue
      const health = other.get(Health)
      const before = health.current
      health.damage(this.damage, this.entity)
      if (health.current < before) struck.push(other)
    }
    return struck
  }

  /**
   * The oriented rectangle in front of the attacker, as a unit-scaled polygon.
   * Anchored on the attacker's own Hitbox — the same offset every target is
   * read through — so an offset body swings from where it stands, not from
   * its transform. An attacker without one keeps swinging from its position.
   */
  private strikeArea(dx: number, dy: number): CollisionBody {
    const box = this.entity.get(Hitbox)
    const along = { x: (dx * this.range) / 2, y: (dy * this.range) / 2 }
    const across = { x: (-dy * this.width) / 2, y: (dx * this.width) / 2 }
    const points: CollisionPoint[] = [
      [-along.x - across.x, -along.y - across.y],
      [along.x - across.x, along.y - across.y],
      [along.x + across.x, along.y + across.y],
      [-along.x + across.x, -along.y + across.y],
    ]
    return {
      x: this.entity.position.x + (box?.offsetX ?? 0) + along.x,
      y: this.entity.position.y + (box?.offsetY ?? 0) + along.y,
      width: 1,
      height: 1,
      shape: 'polygon',
      points,
    }
  }
}
