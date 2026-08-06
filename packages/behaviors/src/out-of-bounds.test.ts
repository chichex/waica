import { describe, expect, it, vi } from 'vitest'
import { THREE, type Component, type Entity, type Game } from '@waica/engine'
import { Health } from './health'
import { OutOfBounds } from './out-of-bounds'

function makeSubject(y: number, options: { health?: number } = {}) {
  const components: Component[] = []
  const game = { entities: [], events: { emit: vi.fn() } } as unknown as Game
  let alive = true
  const entity = {
    name: 'Faller',
    game,
    get alive() {
      return alive
    },
    position: new THREE.Vector3(0, y, 0),
    destroy: vi.fn(() => {
      alive = false
    }),
    get(Class: new () => Component) {
      return components.find((component) => component instanceof Class)
    },
    addStub(component: Component) {
      component.entity = entity as unknown as Entity
      component.game = game
      components.push(component)
    },
  } as unknown as Entity & { addStub(component: Component): void }

  let health: Health | undefined
  if (options.health !== undefined) {
    health = new Health()
    health.max = options.health
    entity.addStub(health)
    health.onReady()
  }
  const bounds = new OutOfBounds()
  entity.addStub(bounds)
  return { entity, bounds, health, game }
}

describe('OutOfBounds', () => {
  it('leaves an entity above the bound alone', () => {
    const { entity, bounds, health } = makeSubject(-11.9, { health: 3 })

    bounds.onUpdate()

    expect(health!.current).toBe(3)
    expect(entity.destroy).not.toHaveBeenCalled()
  })

  it('leaves an entity exactly at the bound alone — below it is the trigger', () => {
    const { entity, bounds, health } = makeSubject(-12, { health: 3 })

    bounds.onUpdate()

    expect(health!.current).toBe(3)
    expect(entity.destroy).not.toHaveBeenCalled()
  })

  it('is always fatal below the bound, whatever health was left', () => {
    const { bounds, health, entity } = makeSubject(-12.1, { health: 99 })

    bounds.onUpdate()

    expect(health!.current).toBe(0)
    expect(entity.game.events.emit).toHaveBeenCalledWith('death', { entity })
  })

  it('names the falling entity as the source of its own death', () => {
    const { bounds, entity } = makeSubject(-20, { health: 3 })

    bounds.onUpdate()

    expect(entity.game.events.emit).toHaveBeenCalledWith('damage', {
      entity,
      amount: Infinity,
      current: 0,
      source: entity,
    })
  })

  it('destroys an entity that cannot be hurt', () => {
    const { entity, bounds } = makeSubject(-20)

    bounds.onUpdate()

    expect(entity.destroy).toHaveBeenCalledOnce()
  })

  it('stops checking once the entity is dead, instead of destroying it twice', () => {
    const { entity, bounds } = makeSubject(-20)
    bounds.onUpdate()

    bounds.onUpdate()

    expect(entity.destroy).toHaveBeenCalledOnce()
  })

  it('authors its bound and nothing else — leaving the world is lethal by nature', () => {
    expect(new OutOfBounds().minY).toBe(-12)
    expect(Object.keys(OutOfBounds.params ?? {})).toEqual(['minY'])
  })
})
