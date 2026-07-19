import { Component } from '../component'

/**
 * Caja de colisión estática (AABB). Plataformas, pisos y paredes.
 * Los character controllers (p. ej. PlatformerMovement) colisionan
 * contra todos los Solid de la escena.
 *
 * TODO(H1): cuerpos dinámicos generales via Rapier; los controllers de
 * personaje del género siguen siendo AABB a mano, como en el estándar
 * del género (la física "realista" no hace buenos plataformeros).
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
