import { Component, Solid, THREE } from '@waica/engine'

/**
 * Character controller de plataformero con el game feel de fábrica que un
 * principiante no sabe que necesita: coyote time, jump buffering, jump cut
 * (soltar salta menos) y squash & stretch. Colisión AABB por ejes contra
 * los Solid de la escena — el estándar del género (Celeste-style), no
 * física "realista".
 */
export class PlatformerMovement extends Component {
  static override componentName = 'PlatformerMovement'
  static override params = {
    moveSpeed: { label: 'Velocidad', min: 1, max: 30, step: 0.5 },
    acceleration: { label: 'Aceleración', min: 5, max: 200, step: 5 },
    deceleration: { label: 'Frenado', min: 5, max: 200, step: 5 },
    jumpVelocity: { label: 'Impulso de salto', min: 2, max: 40, step: 0.5 },
    gravity: { label: 'Gravedad', min: 5, max: 120, step: 1 },
    maxFallSpeed: { label: 'Caída máxima', min: 5, max: 60, step: 1 },
    coyoteTime: { label: 'Coyote time (s)', min: 0, max: 0.4, step: 0.01 },
    jumpBuffer: { label: 'Jump buffer (s)', min: 0, max: 0.4, step: 0.01 },
    jumpCutStrength: { label: 'Corte de salto', min: 1, max: 6, step: 0.1 },
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
  /** >1 aplica gravedad extra mientras subís sin sostener el salto. */
  jumpCutStrength = 2.5
  squashStretch = true
  /** Hitbox AABB del personaje. */
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

    // Horizontal con aceleración y frenado separados.
    const dir = input.axis()
    const target = dir * this.moveSpeed
    const rate = dir !== 0 ? this.acceleration : this.deceleration
    this.vx = THREE.MathUtils.damp(this.vx, target, rate / this.moveSpeed, dt)
    if (dir !== 0) this.facing = dir

    // Timers de perdón: coyote (podés saltar justo después del borde)
    // y buffer (podés apretar salto justo antes de aterrizar).
    this.coyoteTimer = this.grounded ? this.coyoteTime : this.coyoteTimer - dt
    this.bufferTimer = input.justPressed('jump') ? this.jumpBuffer : this.bufferTimer - dt

    if (this.bufferTimer > 0 && this.coyoteTimer > 0) {
      this.vy = this.jumpVelocity
      this.coyoteTimer = 0
      this.bufferTimer = 0
      this.applySquash(0.8, 1.25)
    }

    // Gravedad, con jump cut: subir sin sostener el botón cae antes.
    const rising = this.vy > 0
    const cut = rising && !input.held('jump') ? this.jumpCutStrength : 1
    this.vy = Math.max(this.vy - this.gravity * cut * dt, -this.maxFallSpeed)

    // Mover y resolver por ejes (el orden importa: X, después Y).
    const wasAirborne = !this.grounded
    pos.x += this.vx * dt
    this.resolveAxis('x')
    this.grounded = false
    pos.y += this.vy * dt
    this.resolveAxis('y')
    if (wasAirborne && this.grounded) this.applySquash(1.25, 0.8)

    // Flip por dirección + squash & stretch decayendo a 1.
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
