import { Component, type Entity, type SolidContact } from '@waica/engine'

/** Contact policy for the example projectile; DynamicBody owns physical motion. */
export class Projectile extends Component {
  static override componentName = 'Projectile'

  override onContact(_contact: SolidContact): void {
    this.entity.destroy()
  }

  override onCollide(other: Entity): void {
    other.destroy()
    this.entity.destroy()
  }
}
