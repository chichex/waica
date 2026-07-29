import { Component, DynamicBody } from '@waica/engine'
import { PlatformerMotor } from '@waica/behaviors'

/** Example project code: input plus runtime prefab spawn makes a simple gun. */
export class Gun extends Component {
  static override componentName = 'Gun'
  static override params = {
    projectileSpeed: { label: 'Bullet speed', min: 1, max: 40, step: 0.5 },
    cooldown: { label: 'Cooldown', min: 0, max: 2, step: 0.05 },
    muzzleOffset: { label: 'Muzzle offset', min: 0, max: 3, step: 0.1 },
  }

  projectileSpeed = 18
  cooldown = 0.2
  muzzleOffset = 0.9

  private remaining = 0
  private shots = 0

  override onUpdate(dt: number): void {
    this.remaining = Math.max(0, this.remaining - dt)
    const input = this.game.input
    // Deliberately not gated on `consumed`: consuming spends the press for
    // state-machine `input:shoot` transitions, but every Gun in the scene
    // still fires on the same press.
    if (!input.justPressed('shoot') || this.remaining > 0) return

    input.consume('shoot')
    const motor = this.entity.get(PlatformerMotor)
    const direction = motor?.facing ?? (this.entity.scale.x < 0 ? -1 : 1)
    const projectile = this.game.spawnPrefab('objects/bullet', {
      name: `Bullet-${++this.shots}`,
      position: [
        this.entity.position.x + direction * this.muzzleOffset,
        this.entity.position.y,
      ],
    })
    const body = projectile?.get(DynamicBody)
    if (!body) return
    body.vx = direction * this.projectileSpeed
    this.remaining = this.cooldown
  }
}
