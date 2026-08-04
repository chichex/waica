import {
  Component,
  Hitbox,
  resolveSolidAxis,
  type CollisionBody,
  type Entity,
  type RoleDefinition,
  type RoleGraph,
} from '@waica/engine'
import { isPlayer } from './player-identity.js'

export type ChaserMode = 'walker' | 'ghost' | 'flyer'

/**
 * Pursuit toward the player while they are within sight range, in one of
 * three modes: a walker paces the ground (X only, gravity, blocked by
 * Solids), a ghost floats straight at them through everything, a flyer
 * floats straight at them but walls and ceilings stop it.
 * Passive like a motor: no onUpdate of its own — the 'chaser' logic set's
 * chase state calls step(dt), so the StateMachine stays the single owner
 * of the frame.
 */
export class Chaser extends Component {
  static override componentName = 'Chaser'
  static override params = {
    mode: { label: 'Mode', options: ['walker', 'ghost', 'flyer'] },
    range: { label: 'Sight range', min: 1, max: 30, step: 0.5 },
    speed: { label: 'Speed', min: 0.5, max: 15, step: 0.5 },
    gravity: { label: 'Gravity (walker)', min: 5, max: 120, step: 1 },
  }

  mode: ChaserMode = 'walker'
  range = 6
  speed = 3
  gravity = 42

  private vy = 0
  private target: Entity | undefined

  /** The player is the live entity whose StateMachine declares that role. */
  private findTarget(): Entity | undefined {
    if (!this.target?.alive || !isPlayer(this.target)) {
      this.target = this.entity.game.entities.find(isPlayer)
    }
    return this.target
  }

  /** One chase step in the current mode, flipping the sprite toward prey. */
  step(dt: number): void {
    if (this.mode === 'walker') this.stepWalker(dt)
    else this.stepAirborne(dt)
  }

  /** Ground pursuit: chase on X when in sight; gravity and Solids always rule. */
  private stepWalker(dt: number): void {
    const pos = this.entity.position
    const target = this.findTarget()
    const dx = target ? target.position.x - pos.x : 0
    if (target && Math.abs(dx) <= this.range && Math.abs(dx) > 0.05) {
      const dir = dx > 0 ? 1 : -1
      const previous = pos.x
      pos.x += dir * Math.min(this.speed * dt, Math.abs(dx))
      this.resolveAxis('x', previous)
      this.entity.scale.x = dir
    }
    // Gravity applies in and out of sight — a walker spawned midair lands.
    this.vy = Math.max(this.vy - this.gravity * dt, -22)
    const previous = pos.y
    pos.y += this.vy * dt
    this.resolveAxis('y', previous)
  }

  /** Straight-line pursuit; the flyer sweeps against Solids, the ghost doesn't. */
  private stepAirborne(dt: number): void {
    const pos = this.entity.position
    const target = this.findTarget()
    if (!target) return
    const dx = target.position.x - pos.x
    const dy = target.position.y - pos.y
    const dist = Math.hypot(dx, dy)
    // The inner deadband keeps it from jittering on top of the player.
    if (dist > this.range || dist < 0.1) return
    const move = Math.min(this.speed * dt, dist)
    const solid = this.mode === 'flyer'
    const previousX = pos.x
    pos.x += (dx / dist) * move
    if (solid) this.resolveAxis('x', previousX)
    const previousY = pos.y
    pos.y += (dy / dist) * move
    if (solid) this.resolveAxis('y', previousY)
    if (Math.abs(dx) > 0.05) this.entity.scale.x = dx > 0 ? 1 : -1
  }

  /** Resolves this mode's body through the engine's shared Solid solver. */
  private resolveAxis(axis: 'x' | 'y', previous: number): void {
    const collided = resolveSolidAxis({
      entity: this.entity,
      axis,
      previous,
      body: () => this.collisionBody(),
    })
    if (collided && axis === 'y') this.vy = 0
  }

  /** AABB sized by the sibling Hitbox (chassis default if none). */
  private collisionBody(): CollisionBody {
    const box = this.entity.get(Hitbox)
    return {
      x: this.entity.position.x + (box?.offsetX ?? 0),
      y: this.entity.position.y + (box?.offsetY ?? 0),
      width: box?.width ?? 0.9,
      height: box?.height ?? 0.95,
      shape: 'rectangle',
    }
  }
}

/** The state graph new chasing characters start with, as prefab data. */
export const CHASER_STATE_GRAPH: RoleGraph = {
  initial: 'chase',
  states: { chase: {} },
}

// The pursuer role. One state out of the box; give chasing characters more
// states by registering on top (defineStates('chaser', { flee: {...} }))
// plus prefab data.
export const CHASER_ROLE: RoleDefinition = {
  description:
    'Hunts the player when they come within sight range. Its Mode picks ' +
    'the body: a walker paces the ground with gravity, a ghost floats ' +
    'through walls, a flyer floats but walls stop it. Its states move Chaser.',
  driver: 'Chaser',
  graph: CHASER_STATE_GRAPH,
  states: {
    chase: {
      onUpdate({ entity }, dt) {
        entity.get(Chaser)?.step(dt)
      },
    },
  },
}
