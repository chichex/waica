import { Collider, Component, type Entity } from '@waica/engine'
import { logicalDirection } from './facing.js'
import { Health } from './health.js'
import { knockBackFrom } from './knockback-3d.js'
import { meleeArea2d } from './melee-area-2d.js'

/** Whether a collision mask names a layer: `'*'` names every one. */
const maskNames = (mask: readonly string[], layer: string): boolean => mask.includes('*') || mask.includes(layer)

/**
 * A short frontal strike. Passive like a motor: state code decides when it
 * happens (the player's `attack` state) and calls strike(); this only knows
 * where the blow lands and who can be hurt by it. In a 2D scene the hit area
 * is a `range` × `width` rectangle in logical space, laid along the facing
 * the caller names from the attacker's hitbox — under the isometric
 * projection that is the diamond diagonal screen-east maps to, so "in front"
 * matches the screen. In a 3D scene (issue #181) it is a `range` × `height`
 * × `width` box in front of the attacker's yaw, centred on its Collider
 * (its origin without one), whatever the prefab's origin convention,
 * against every collider whose layer the attacker's Collider mask names, and
 * each body it hurts is pushed away at `knockbackSpeed` for 0.15 s.
 */
export class MeleeAttack extends Component {
  static override componentName = 'MeleeAttack'
  // No space marker: it strikes in both spaces (issue #181 CA-16), as the neutral behaviors declare nothing.
  static override displayName = 'Melee attack'
  static override params = {
    damage: { label: 'Damage', min: 0, max: 20, step: 1 },
    range: { label: 'Range', min: 0.5, max: 5, step: 0.5 },
    width: { label: 'Width', min: 0.5, max: 5, step: 0.5 },
    height: { label: 'Height (3D)', min: 0.5, max: 5, step: 0.5 },
    knockbackSpeed: { label: 'Knockback speed (3D)', min: 0, max: 30, step: 0.5 },
    swingSound: { label: 'Swing sound', ref: 'sound' as const },
  }

  damage = 1
  /** How far in front of the attacker the blow reaches, in world units. */
  range = 1
  /** How wide the blow is, across the facing. */
  width = 1
  /** How tall the blow is in a 3D scene, centred on the attacker's Collider. */
  height = 2
  /** How fast a 3D hit pushes the body it hurts away, in units per second, for 0.15 s. */
  knockbackSpeed = 8
  /** Sound played on every swing. Empty plays nothing (CA-12). */
  swingSound = ''

  /**
   * Lands one blow: every other living entity with a Health inside the
   * strike area takes `damage` once, with this entity as the source. In 2D
   * the area lies along `facing` and reads Hitboxes; an unknown or absent
   * facing strikes nothing. In 3D `facing` is ignored: the area lies along
   * the yaw. Returns the entities whose health actually dropped — a target
   * still inside its invulnerability window is not counted.
   */
  strike(facing?: string): Entity[] {
    if (this.game.space === '3d') return this.strike3d()
    const direction = facing === undefined ? null : logicalDirection(facing, this.game.projection)
    if (!direction) return []
    // Positional like Health's hurtSound (CA-8): an off-camera NPC's swing
    // should attenuate and pan like the hit it causes, not play flat and
    // dead-centre while the damage it lands sounds correctly placed.
    if (this.swingSound) this.game.audio.play(this.swingSound, { at: this.entity })
    const area = meleeArea2d(this.entity, direction, { range: this.range, width: this.width })
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

  /** The 3D blow (issue #181 CA-16, CA-17): the box in front of the yaw, the mask, and the push on every body it hurt. */
  private strike3d(): Entity[] {
    if (this.swingSound) this.game.audio.play(this.swingSound, { at: this.entity })
    const yaw = this.entity.node.rotation.y
    const { x, y, z } = colliderCentre(this.entity, yaw)
    const half = this.range / 2
    const mask = this.entity.get(Collider)?.collidesWith ?? ['*']
    const targets = this.game.query.area(
      {
        shape: 'box',
        center: { x: x + Math.sin(yaw) * half, y, z: z + Math.cos(yaw) * half },
        size: { x: this.width, y: this.height, z: this.range },
        yaw: (yaw * 180) / Math.PI,
        colliders: 'all',
      },
      { with: [Health] as const, exclude: this.entity, where: (other) => maskNames(mask, other.get(Collider)?.layer ?? 'default') },
    )
    const struck: Entity[] = []
    for (const other of targets) {
      if (!other.alive) continue
      const health = other.get(Health)
      const before = health.current
      health.damage(this.damage, this.entity)
      if (health.current >= before) continue
      struck.push(other)
      knockBackFrom(other, this.entity, this.knockbackSpeed)
    }
    return struck
  }
}

/**
 * Where the attacker's Collider sits in the world, for anchoring the 3D blow
 * (issue #181, maintainer decision): its origin plus the Collider's `offset`,
 * scaled and turned by the entity's yaw; the origin itself with no Collider.
 */
function colliderCentre(entity: Entity, yaw: number): { x: number; y: number; z: number } {
  const { x, y, z } = entity.position
  const offset = entity.get(Collider)?.offset ?? [0, 0, 0]
  const [ox, oy, oz] = [offset[0] * entity.scale.x, offset[1] * entity.scale.y, offset[2] * entity.scale.z]
  return { x: x + ox * Math.cos(yaw) + oz * Math.sin(yaw), y: y + oy, z: z - ox * Math.sin(yaw) + oz * Math.cos(yaw) }
}
