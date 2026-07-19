import { Component } from '../component'

/**
 * Trigger box (not solid): the Game detects overlaps between Hitboxes
 * and calls onCollide(other) on both entities' components. For static
 * physical collision see Solid.
 */
export class Hitbox extends Component {
  static override componentName = 'Hitbox'

  width = 1
  height = 1
}
