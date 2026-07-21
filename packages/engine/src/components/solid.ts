import { Component } from '../component'

/**
 * Static collision box (AABB). Platforms, floors and walls.
 * Character motors (e.g. PlatformerMotor) collide against
 * every Solid in the scene.
 *
 * TODO(H1): general dynamic bodies via Rapier; genre character
 * controllers stay hand-rolled AABB, as the genre standard dictates
 * ("realistic" physics doesn't make good platformers).
 */
export class Solid extends Component {
  static override componentName = 'Solid'

  width = 1
  height = 1

  get left(): number {
    return this.entity.position.x - this.width / 2
  }
  get right(): number {
    return this.entity.position.x + this.width / 2
  }
  get top(): number {
    return this.entity.position.y + this.height / 2
  }
  get bottom(): number {
    return this.entity.position.y - this.height / 2
  }
}
