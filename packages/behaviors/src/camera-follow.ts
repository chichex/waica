import { Component, THREE } from '@waica/engine'
import { PlatformerMovement } from './platformer-movement'

/**
 * Camera that follows its entity with a deadzone (dead area where it
 * doesn't move), lookahead toward where you're going and exponential
 * smoothing.
 */
export class CameraFollow extends Component {
  static override componentName = 'CameraFollow'
  static override params = {
    deadzoneWidth: { label: 'Deadzone width', min: 0, max: 10, step: 0.25 },
    deadzoneHeight: { label: 'Deadzone height', min: 0, max: 10, step: 0.25 },
    lookahead: { label: 'Lookahead', min: 0, max: 6, step: 0.25 },
    smoothing: { label: 'Smoothing', min: 1, max: 20, step: 0.5 },
  }

  deadzoneWidth = 2
  deadzoneHeight = 2.5
  lookahead = 1.5
  smoothing = 6

  override onUpdate(dt: number): void {
    const cam = this.game.camera.position
    const target = this.entity.position
    const movement = this.entity.get(PlatformerMovement)

    let wantX = cam.x
    let wantY = cam.y

    const dx = target.x - cam.x
    const dy = target.y - cam.y
    const halfW = this.deadzoneWidth / 2
    const halfH = this.deadzoneHeight / 2
    if (Math.abs(dx) > halfW) wantX = target.x - Math.sign(dx) * halfW
    if (Math.abs(dy) > halfH) wantY = target.y - Math.sign(dy) * halfH

    if (movement && Math.abs(movement.vx) > 1) {
      wantX += Math.sign(movement.vx) * this.lookahead
    }

    cam.x = THREE.MathUtils.damp(cam.x, wantX, this.smoothing, dt)
    cam.y = THREE.MathUtils.damp(cam.y, wantY, this.smoothing, dt)
  }
}
