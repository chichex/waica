import { describe, expect, it, vi } from 'vitest'
import { SIMULATION_STEP, type Entity } from '@waica/engine'
import { Lifetime } from './lifetime'

/** Stands in for a real Entity: destroy() is idempotent and flips `alive`. */
function makeEntity(): { entity: Entity; destroy: ReturnType<typeof vi.fn> } {
  let alive = true
  const destroy = vi.fn(() => {
    alive = false
  })
  const entity = {
    destroy,
    get alive() {
      return alive
    },
  } as unknown as Entity
  return { entity, destroy }
}

describe('Lifetime', () => {
  it('keeps its entity alive before the threshold and destroys it when accumulated dt reaches seconds', () => {
    const { entity, destroy } = makeEntity()
    const lifetime = new Lifetime()
    lifetime.entity = entity
    lifetime.seconds = 1

    lifetime.onUpdate(0.4)
    lifetime.onUpdate(0.59)
    expect(destroy).not.toHaveBeenCalled()

    lifetime.onUpdate(0.01)
    expect(destroy).toHaveBeenCalledOnce()
  })

  it('stops counting once its entity is gone instead of destroying it twice', () => {
    // The frame that destroys an entity still iterates a copy of its
    // components, so onUpdate can run again on a dead entity.
    const { entity, destroy } = makeEntity()
    const lifetime = new Lifetime()
    lifetime.entity = entity
    lifetime.seconds = 0.1

    lifetime.onUpdate(0.2)
    lifetime.onUpdate(0.2)

    expect(destroy).toHaveBeenCalledOnce()
  })

  it('destroys on the Simulation Step that reaches seconds, not one step late (regression)', () => {
    // this.elapsed is a sum of SIMULATION_STEP-sized dts: float error can
    // leave it a hair under an exact multiple (e.g. 0.24999999999999997
    // instead of 0.25), which a bare `>=` fires one whole step late.
    const { entity, destroy } = makeEntity()
    const lifetime = new Lifetime()
    lifetime.entity = entity
    lifetime.seconds = 0.25

    for (let step = 1; step < 15; step += 1) lifetime.onUpdate(SIMULATION_STEP)
    expect(destroy).not.toHaveBeenCalled()

    lifetime.onUpdate(SIMULATION_STEP)
    expect(destroy).toHaveBeenCalledOnce()
  })

  it('declares seconds as an inspector-tunable parameter', () => {
    expect(Lifetime.componentName).toBe('Lifetime')
    expect(Lifetime.params.seconds).toMatchObject({
      label: expect.any(String),
      min: expect.any(Number),
      max: expect.any(Number),
      step: expect.any(Number),
    })
  })
})
