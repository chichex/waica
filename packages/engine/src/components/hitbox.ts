import { Component } from '../component'

/**
 * Caja de trigger (no sólida): el Game detecta superposiciones entre
 * Hitboxes y llama onCollide(other) en los componentes de ambas
 * entidades. Para colisión física estática ver Solid.
 */
export class Hitbox extends Component {
  static override componentName = 'Hitbox'

  width = 1
  height = 1
}
