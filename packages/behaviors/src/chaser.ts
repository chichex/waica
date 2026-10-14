import { Component, type Entity, type RoleDefinition, type RoleGraph } from '@waica/engine'
import { resolveChaserAxis } from './chaser-2d-body.js'
import { drive3d } from './mover-3d.js'
import { isPlayer } from './player-identity.js'

export type ChaserMode = 'walker' | 'ghost' | 'flyer'

/**
 * Pursuit toward the player while they are within sight range. In 2D, in
 * one of three modes: a walker paces the ground (X only, gravity, blocked by
 * Solids), a ghost floats straight at them through everything, a flyer
 * floats straight at them but walls and ceilings stop it. In 3D (issue #181),
 * with a kinematic RigidBody, it walks straight at them on the ground plane
 * through the body's desired velocity, whatever its mode: gravity, steps and
 * walls are the character controller's.
 * Passive like a motor: no onUpdate of its own — the 'chaser' logic set's
 * chase state calls step(dt), so the StateMachine stays the single owner
 * of the frame.
 */
export class Chaser extends Component {
  static override componentName = 'Chaser'
  // No space marker: it chases in both spaces (issue #181 CA-19).
  static override params = {
    mode: { label: 'Mode', options: ['walker', 'ghost', 'flyer'] },
    range: { label: 'Sight range', min: 1, max: 30, step: 0.5 },
    speed: { label: 'Speed', min: 0.5, max: 15, step: 0.5 },
    gravity: { label: 'Gravity (walker)', min: 5, max: 120, step: 1 },
  }
  static override transient = ['vy', 'target']

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

  /** One chase step in the current mode, flipping the sprite toward prey; in 3D, a straight walk on xz. */
  step(dt: number): void {
    if (this.game.space === '3d') this.step3d(dt)
    else if (this.mode === 'walker') this.stepWalker(dt)
    else this.stepAirborne(dt)
  }

  /** The live player within `range` on the ground plane (a 3D scene's xz), or undefined. */
  inSight(): Entity | undefined {
    const target = this.findTarget()
    if (!target) return undefined
    const dx = target.position.x - this.entity.position.x
    const dz = target.position.z - this.entity.position.z
    return Math.hypot(dx, dz) <= this.range ? target : undefined
  }

  /** 3D pursuit: straight at the player on xz while in sight, still otherwise (and within 0.1 of it). */
  private step3d(dt: number): void {
    const target = this.inSight()
    const dx = target ? target.position.x - this.entity.position.x : 0
    const dz = target ? target.position.z - this.entity.position.z : 0
    const distance = Math.hypot(dx, dz)
    const speed = distance < 0.1 ? 0 : this.speed / distance
    drive3d(this.entity, { x: dx * speed, z: dz * speed }, dt)
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
    if (resolveChaserAxis(this.entity, axis, previous) && axis === 'y') this.vy = 0
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
