import { Component, Entity, ParticleEmitter } from '@waica/engine'

/**
 * Example project code: a puff from this entity's ParticleEmitter wherever
 * damage lands. Health announces every accepted hit on `game.events` as
 * 'damage'; this moves its own (sprite-less) entity to the entity that took
 * it and bursts there. The emitter should be in `space: 'world'`, so the
 * puffs already in flight stay where they started when the next hit moves
 * the source elsewhere. One of these serves every Health in the scene.
 */
export class DamagePuff extends Component {
  static override componentName = 'DamagePuff'
  static override displayName = 'Damage puff'
  static override params = {
    count: { label: 'Particles', min: 1, max: 64, step: 1 },
  }

  /** Particles per hit. */
  count = 10

  private unsubscribe?: () => void

  override onReady(): void {
    this.unsubscribe = this.game.events.on('damage', (payload) => this.puffAt(payload))
  }

  override onDestroy(): void {
    this.unsubscribe?.()
    this.unsubscribe = undefined
  }

  private puffAt(payload: unknown): void {
    const target = damagedEntity(payload)
    const puff = this.entity.get(ParticleEmitter)
    if (!target || !puff) return
    this.entity.position.set(target.position.x, target.position.y, this.entity.position.z)
    puff.emit(this.count)
  }
}

/** The entity a 'damage' event names, if the payload really carries one. */
function damagedEntity(payload: unknown): Entity | undefined {
  if (typeof payload !== 'object' || payload === null || !('entity' in payload)) return undefined
  return payload.entity instanceof Entity ? payload.entity : undefined
}
