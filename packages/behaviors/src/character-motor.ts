import { Component, RigidBody, SIMULATION_TIME_EPSILON, type ComponentSpace, type Input } from '@waica/engine'
import { turnYawToward } from './facing-3d.js'
import { Health } from './health.js'
import { clearKnockback, knockbackVelocity, type PlanarVelocity } from './knockback-3d.js'

const DEGREES = Math.PI / 180

/**
 * Walks and jumps a 3D character (ADR 0028): beside a kinematic `RigidBody`
 * and its `Collider`, it turns the player's actions into the body's desired
 * velocity and a jump. The engine's character controller does the moving
 * (walls, steps, slopes, gravity); this only asks. With `relativeTo` 'world'
 * movement is on the world axes, `-z` forward; with 'camera' (issue #181) the
 * input turns by the yaw of the scene's orbit camera, so forward walks away
 * from it — and on the world axes again while no camera follows. A diagonal
 * is normalized, so it moves at `speed` like a cardinal direction; holding
 * the run Action on the ground moves at `runSpeed`. The jump press is
 * consumed only when the body jumped, so a press in the air stays readable
 * (a double jump, a glide). It faces where it walks (issue #166 CA-14): each
 * step with a non-zero desired velocity turns the entity's yaw toward it by
 * at most `turnSpeed` degrees per second (0 snaps); with no input the yaw
 * holds. The body is unaffected: a kinematic body keeps the rotation it
 * spawned with, so give it a Collider that looks the same from every side —
 * a capsule or a sphere with no x/z `offset`. A dodge press on the ground
 * rolls (issue #181 CA-14): `dodgeDuration` seconds at `dodgeSpeed` along the
 * input, or the facing with none, ignoring other movement and opening a
 * beside `Health`'s invulnerability for as long, then `dodgeCooldown` seconds
 * before the next. A melee hit pushes it (knockBackFrom). With no
 * kinematic body beside it, it does nothing (`validate_project` reports it).
 * Actions with no binding read 0, so a Game without bindings stands still.
 */
export class CharacterMotor extends Component {
  static override componentName = 'CharacterMotor'
  static override space: ComponentSpace = '3d'
  static override params = {
    speed: { label: 'Speed', min: 0, max: 30, step: 0.5 },
    jumpSpeed: { label: 'Jump speed', min: 0, max: 30, step: 0.5 },
    leftAction: { label: 'Left action' },
    rightAction: { label: 'Right action' },
    forwardAction: { label: 'Forward action' },
    backAction: { label: 'Back action' },
    jumpAction: { label: 'Jump action' },
    turnSpeed: { label: 'Turn speed (deg/s)', min: 0, max: 1440, step: 30 },
    relativeTo: { label: 'Relative to', options: ['world', 'camera'] },
    runAction: { label: 'Run action' },
    runSpeed: { label: 'Run speed', min: 0, max: 30, step: 0.5 },
    dodgeAction: { label: 'Dodge action' },
    dodgeSpeed: { label: 'Dodge speed', min: 0, max: 30, step: 0.5 },
    dodgeDuration: { label: 'Dodge duration (s)', min: 0, max: 2, step: 0.05 },
    dodgeCooldown: { label: 'Dodge cooldown (s)', min: 0, max: 5, step: 0.05 },
    attackAction: { label: 'Attack action' },
  }
  static override transient = ['acting', 'rollLeft', 'cooldownLeft', 'rollDirection', 'runningNow']

  /** Walking speed in units per second. */
  speed = 6
  /** Launch speed of a jump in units per second. */
  jumpSpeed = 6
  leftAction = 'left'
  rightAction = 'right'
  /** Walks toward -z, or away from a following camera with `relativeTo` 'camera'. */
  forwardAction = 'up'
  /** Walks toward +z, or toward a following camera. */
  backAction = 'down'
  jumpAction = 'jump'
  /** How fast it turns to face its walk, in degrees per second; 0 snaps. */
  turnSpeed = 540
  /** What the movement Actions are relative to: the world axes, or the scene's orbit camera. */
  relativeTo: 'world' | 'camera' = 'world'
  /** Held on the ground, it walks at `runSpeed`. */
  runAction = 'run'
  runSpeed = 10
  /** Pressed on the ground, it rolls. */
  dodgeAction = 'dodge'
  dodgeSpeed = 10
  dodgeDuration = 0.5
  dodgeCooldown = 0.8
  /** The Action the character role attacks on (it needs a MeleeAttack beside it). */
  attackAction = 'attack'
  /** Set by a state that holds the character in place (the character role's attack): no walk, jump or roll. */
  acting = false

  private rollLeft = 0
  private cooldownLeft = 0
  private rollDirection: PlanarVelocity = { x: 0, z: 0 }
  private runningNow = false

  /** True while a roll lasts. */
  get rolling(): boolean {
    return this.rollLeft > 0
  }

  /** True while it walks at `runSpeed` on the ground. */
  get running(): boolean {
    return this.runningNow
  }

  /** Stops dead (issue #181 CA-21, a respawn): no walk, no roll, no push until new input. */
  halt(): void {
    this.rollLeft = 0
    this.runningNow = false
    clearKnockback(this.entity)
    const body = this.entity.get(RigidBody)
    if (body) body.desiredVelocity = { x: 0, z: 0 }
  }

  override onUpdate(dt: number): void {
    const body = this.entity.get(RigidBody)
    if (body?.type !== 'kinematic') return
    this.cooldownLeft = Math.max(0, this.cooldownLeft - dt)
    this.runningNow = false
    const push = knockbackVelocity(this.entity)
    if (push) {
      body.desiredVelocity = { ...push }
      return
    }
    const wish = this.wishDirection(this.game.input)
    if (this.rollLeft <= 0 && !this.startsRoll(body, wish)) {
      this.walk(body, wish, dt)
      return
    }
    this.roll(body, dt)
  }

  /** The movement Actions as a planar direction, turned by the camera yaw with `relativeTo` 'camera' (CA-12). */
  private wishDirection(input: Input): PlanarVelocity {
    const right = input.axis(this.leftAction, this.rightAction)
    const forward = input.axis(this.backAction, this.forwardAction)
    const yaw = this.relativeTo === 'camera' ? this.game.cameraYaw : null
    if (yaw === null) return { x: right, z: -forward }
    const cos = Math.cos(yaw * DEGREES)
    const sin = Math.sin(yaw * DEGREES)
    return { x: right * cos + forward * sin, z: right * sin - forward * cos }
  }

  /** Walks (or runs) along `wish`, faces the walk and jumps on a press. */
  private walk(body: RigidBody, wish: PlanarVelocity, dt: number): void {
    const { input } = this.game
    const { x, z } = this.acting ? { x: 0, z: 0 } : wish
    this.runningNow = body.grounded && (x !== 0 || z !== 0) && input.held(this.runAction)
    const speed = this.runningNow ? this.runSpeed : this.speed
    // Like TopDownMotor: diagonals match the cardinal speed.
    const length = Math.hypot(x, z)
    const scale = length > 1 ? speed / length : speed
    body.desiredVelocity = { x: x * scale, z: z * scale }
    // Toward the velocity it asked for, not the raw input: a speed of 0 walks nowhere and turns nowhere.
    turnYawToward(this.entity.node, body.desiredVelocity.x, body.desiredVelocity.z, this.turnSpeed, dt)
    if (this.acting) return
    if (input.justPressed(this.jumpAction) && body.jump(this.jumpSpeed)) input.consume(this.jumpAction)
  }

  /** A fresh dodge press on the ground, out of cooldown: the roll starts along `wish`, or the facing (CA-14). */
  private startsRoll(body: RigidBody, wish: PlanarVelocity): boolean {
    const { input } = this.game
    if (this.acting || this.cooldownLeft > 0 || !body.grounded || !input.justPressed(this.dodgeAction)) return false
    input.consume(this.dodgeAction)
    const length = Math.hypot(wish.x, wish.z)
    const yaw = this.entity.node.rotation.y
    this.rollDirection = length > 0 ? { x: wish.x / length, z: wish.z / length } : { x: Math.sin(yaw), z: Math.cos(yaw) }
    this.rollLeft = this.dodgeDuration
    this.entity.get(Health)?.guard(this.dodgeDuration)
    return true
  }

  /** One step of the roll; its end starts the cooldown. */
  private roll(body: RigidBody, dt: number): void {
    const { x, z } = this.rollDirection
    body.desiredVelocity = { x: x * this.dodgeSpeed, z: z * this.dodgeSpeed }
    turnYawToward(this.entity.node, x, z, this.turnSpeed, dt)
    this.rollLeft -= dt
    if (this.rollLeft > SIMULATION_TIME_EPSILON) return
    this.rollLeft = 0
    this.cooldownLeft = this.dodgeCooldown
  }
}
