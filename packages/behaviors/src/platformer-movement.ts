import { Component, Solid, THREE } from '@waica/engine'

/**
 * Platformer character controller with the out-of-the-box game feel a
 * beginner doesn't know they need: coyote time, jump buffering, jump cut
 * (releasing jumps shorter) and squash & stretch. Per-axis AABB collision
 * against the scene's Solids — the genre standard (Celeste-style), not
 * "realistic" physics.
 */
export class PlatformerMovement extends Component {
  static override componentName = 'PlatformerMovement'
  static override params = {
    moveSpeed: { label: 'Speed', min: 1, max: 30, step: 0.5 },
    acceleration: { label: 'Acceleration', min: 5, max: 200, step: 5 },
    deceleration: { label: 'Deceleration', min: 5, max: 200, step: 5 },
    jumpVelocity: { label: 'Jump impulse', min: 2, max: 40, step: 0.5 },
    gravity: { label: 'Gravity', min: 5, max: 120, step: 1 },
    maxFallSpeed: { label: 'Max fall speed', min: 5, max: 60, step: 1 },
    coyoteTime: { label: 'Coyote time (s)', min: 0, max: 0.4, step: 0.01 },
    jumpBuffer: { label: 'Jump buffer (s)', min: 0, max: 0.4, step: 0.01 },
    jumpCutStrength: { label: 'Jump cut', min: 1, max: 6, step: 0.1 },
    squashStretch: { label: 'Squash & stretch' },
  }

  moveSpeed = 9
  acceleration = 60
  deceleration = 80
  jumpVelocity = 14
  gravity = 42
  maxFallSpeed = 22
  coyoteTime = 0.1
  jumpBuffer = 0.12
  /** >1 applies extra gravity while rising without holding jump. */
  jumpCutStrength = 2.5
  squashStretch = true
  /** The character's AABB hitbox. */
  hitboxWidth = 0.9
  hitboxHeight = 0.95

  vx = 0
  vy = 0
  grounded = false

  private facing = 1
  private coyoteTimer = 0
  private bufferTimer = 0
  private squashX = 1
  private squashY = 1

  override onUpdate(dt: number): void {
    const input = this.game.input
    const pos = this.entity.position

    // Horizontal movement with separate acceleration and deceleration.
    const dir = input.axis()
    const target = dir * this.moveSpeed
    const rate = dir !== 0 ? this.acceleration : this.deceleration
    this.vx = THREE.MathUtils.damp(this.vx, target, rate / this.moveSpeed, dt)
    if (dir !== 0) this.facing = dir

    // Forgiveness timers: coyote (you can jump right after leaving a ledge)
    // and buffer (you can press jump right before landing).
    this.coyoteTimer = this.grounded ? this.coyoteTime : this.coyoteTimer - dt
    this.bufferTimer = input.justPressed('jump') ? this.jumpBuffer : this.bufferTimer - dt

    if (this.bufferTimer > 0 && this.coyoteTimer > 0) {
      this.vy = this.jumpVelocity
      this.coyoteTimer = 0
      this.bufferTimer = 0
      this.applySquash(0.8, 1.25)
    }

    // Gravity, with jump cut: rising without holding the button falls sooner.
    const rising = this.vy > 0
    const cut = rising && !input.held('jump') ? this.jumpCutStrength : 1
    this.vy = Math.max(this.vy - this.gravity * cut * dt, -this.maxFallSpeed)

    // Move and resolve per axis (order matters: X, then Y).
    const wasAirborne = !this.grounded
    pos.x += this.vx * dt
    this.resolveAxis('x')
    this.grounded = false
    pos.y += this.vy * dt
    this.resolveAxis('y')
    if (wasAirborne && this.grounded) this.applySquash(1.25, 0.8)

    // Facing flip + squash & stretch decaying back to 1.
    this.squashX = THREE.MathUtils.damp(this.squashX, 1, 12, dt)
    this.squashY = THREE.MathUtils.damp(this.squashY, 1, 12, dt)
    this.entity.scale.set(this.facing * this.squashX, this.squashY, 1)
  }

  private applySquash(x: number, y: number): void {
    if (!this.squashStretch) return
    this.squashX = x
    this.squashY = y
  }

  private resolveAxis(axis: 'x' | 'y'): void {
    const pos = this.entity.position
    const halfW = this.hitboxWidth / 2
    const halfH = this.hitboxHeight / 2
    for (const other of this.game.entities) {
      const solid = other.get(Solid)
      if (!solid || other === this.entity) continue
      const overlaps =
        pos.x + halfW > solid.left &&
        pos.x - halfW < solid.right &&
        pos.y + halfH > solid.bottom &&
        pos.y - halfH < solid.top
      if (!overlaps) continue
      if (axis === 'x') {
        pos.x = this.vx > 0 ? solid.left - halfW : solid.right + halfW
        this.vx = 0
      } else if (this.vy <= 0) {
        pos.y = solid.top + halfH
        this.vy = 0
        this.grounded = true
      } else {
        pos.y = solid.bottom - halfH
        this.vy = 0
      }
    }
  }
}
