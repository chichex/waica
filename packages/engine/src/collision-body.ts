import type { CollisionBody } from './collision-shape.js'
import type { Hitbox } from './components/hitbox.js'
import type { Solid } from './components/solid.js'

/** Package-internal conversion shared by trigger dispatch and spatial queries. */
export function collisionBody(component: Hitbox | Solid): CollisionBody {
  return {
    x: component.entity.position.x + component.offsetX,
    y: component.entity.position.y + component.offsetY,
    width: component.width,
    height: component.height,
    shape: component.shape,
    points: component.points,
  }
}
