import { describe, expect, it, vi } from 'vitest'
import { THREE, type Component, type Entity, type Game } from '@waica/engine'
import { PlatformerMotor } from './platformer-motor'
import { Respawnable } from './respawnable'

function makeEntity(x: number, y: number) {
  const components: Component[] = []
  const game = { entities: [], events: { emit: vi.fn() } } as unknown as Game
  const entity = {
    name: 'Player',
    game,
    alive: true,
    position: new THREE.Vector3(x, y, 0),
    destroy: vi.fn(),
    get(Class: new () => Component) {
      return components.find((component) => component instanceof Class)
    },
    addStub(component: Component) {
      component.entity = entity as unknown as Entity
      component.game = game
      components.push(component)
    },
  } as unknown as Entity & { addStub(component: Component): void }
  return entity
}

describe('Respawnable', () => {
  it('puts the entity back where it started', () => {
    const entity = makeEntity(3, 4)
    const respawnable = new Respawnable()
    entity.addStub(respawnable)
    respawnable.onReady()
    entity.position.set(50, -30, 0)

    respawnable.respawn()

    expect(entity.position.x).toBe(3)
    expect(entity.position.y).toBe(4)
  })

  it('stops the motor so the entity does not arrive still falling', () => {
    const entity = makeEntity(0, 0)
    const respawnable = new Respawnable()
    entity.addStub(respawnable)
    const motor = new PlatformerMotor()
    entity.addStub(motor)
    respawnable.onReady()
    const halt = vi.spyOn(motor, 'halt')

    respawnable.respawn()

    expect(halt).toHaveBeenCalledOnce()
  })

  it('respawns fine without a motor', () => {
    const entity = makeEntity(1, 2)
    const respawnable = new Respawnable()
    entity.addStub(respawnable)
    respawnable.onReady()
    entity.position.set(9, 9, 0)

    expect(() => respawnable.respawn()).not.toThrow()
    expect(entity.position.x).toBe(1)
  })

  it('watches nothing per frame — falling out of the world is OutOfBounds now', () => {
    expect(new Respawnable().onUpdate).toBeUndefined()
  })

  it('no longer authors a kill height, so no prefab can declare an orphan one', () => {
    expect(Object.keys(Respawnable.params ?? {})).toEqual([])
    expect(new Respawnable()).not.toHaveProperty('killY')
  })

  it('keeps the remembered spawn out of the authoring surface', () => {
    expect(Respawnable.transient).toContain('spawn')
  })
})
