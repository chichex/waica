import {
  Component,
  Hitbox,
  Solid,
  StateMachine,
  collisionOverlap,
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

  override onReady(): void {
    // Firing point-blank puts the muzzle inside the wall. resolveSolidAxis
    // deliberately ignores solids it already overlaps (the spawn-inside-wall
    // bail), so such a bullet would sail straight through for its whole
    // flight: count spawning inside a Solid as an immediate hit.
    if (this.insideSolid()) this.entity.destroy()
  }

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

  private insideSolid(): boolean {
    const body = this.body()
    return this.game.entities.some((other) => {
      if (other === this.entity) return false
      const solid = other.get(Solid)
      if (!solid) return false
      return collisionOverlap(body, {
        x: other.position.x + solid.offsetX,
        y: other.position.y + solid.offsetY,
        width: solid.width,
        height: solid.height,
        shape: solid.shape,
        points: solid.points,
      })
    })
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
