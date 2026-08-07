import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  DynamicBody,
  StateMachine,
  THREE,
  defineStates,
  resetRegistries,
  resolveComponentUpdateSchedule,
  type Component,
  type Entity,
  type Game,
} from '@waica/engine'
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

beforeEach(() => resetRegistries())

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

  it('observes a same-frame StateMachine write even when authored before the machine', () => {
    defineStates('falling-probe', {
      idle: {
        onUpdate({ entity }) {
          entity.position.y = -20
        },
      },
    })
    const { entity, bounds } = makeSubject(0)
    const machine = new StateMachine()
    machine.role = 'falling-probe'
    machine.initial = 'idle'
    machine.states = { idle: {} }
    entity.addStub(machine)
    machine.onReady()
    const result = resolveComponentUpdateSchedule(
      ['OutOfBounds', 'StateMachine'],
      { DynamicBody, Health, OutOfBounds, StateMachine },
    )
    if (!result.ok) throw new Error(result.issues.map((issue) => issue.cause).join(' '))
    const byName = new Map<string, Component>([
      ['OutOfBounds', bounds],
      ['StateMachine', machine],
    ])

    for (const name of result.order) byName.get(name)?.onUpdate?.(0.016)

    expect(result.order).toEqual(['StateMachine', 'OutOfBounds'])
    expect(entity.destroy).toHaveBeenCalledOnce()
  })

  it('authors its bound and nothing else — leaving the world is lethal by nature', () => {
    expect(new OutOfBounds().minY).toBe(-12)
    expect(Object.keys(OutOfBounds.params ?? {})).toEqual(['minY'])
  })
})
