import {
  Component,
  Hitbox,
  StateMachine,
  resolveSolidAxis,
  type CollisionBody,
  type Entity,
} from '@waica/engine'

/** Straight-line motion and contact policy for the example projectile prefab. */
export class Projectile extends Component {
  static override componentName = 'Projectile'
  static override params = {
    speed: { label: 'Speed', min: 1, max: 40, step: 0.5 },
  }

  speed = 18
  direction = 1

  override onUpdate(dt: number): void {
    const previous = this.entity.position.x
    this.entity.position.x += this.direction * this.speed * dt
    if (
      resolveSolidAxis({
        entity: this.entity,
        axis: 'x',
        previous,
        body: () => this.body(),
      })
    ) {
      this.entity.destroy()
    }
  }

  override onCollide(other: Entity): void {
    const role = other.get(StateMachine)?.role
    if (role !== 'patroller' && role !== 'chaser') return
    other.destroy()
    this.entity.destroy()
  }

  private body(): CollisionBody {
    const hitbox = this.entity.get(Hitbox)
    return {
      x: this.entity.position.x + (hitbox?.offsetX ?? 0),
      y: this.entity.position.y + (hitbox?.offsetY ?? 0),
      width: hitbox?.width ?? 0.3,
      height: hitbox?.height ?? 0.2,
      shape: hitbox?.shape ?? 'rectangle',
      points: hitbox?.points,
    }
  }
}
