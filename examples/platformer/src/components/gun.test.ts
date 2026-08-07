import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  DynamicBody,
  StateMachine,
  THREE,
  defineStates,
  resetRegistries,
  resolveComponentUpdateSchedule,
  type Component,
  type ComponentClass,
  type Entity,
  type Game,
} from '@waica/engine'
import { PLATFORMER_REGISTRY } from '@waica/archetype-platformer'
import { PlatformerMotor } from '@waica/behaviors'
import player from '../characters/player.character.json'
import bullet from '../objects/bullet.object.json'
import { Gun } from './gun'
import { Projectile } from './projectile'

beforeEach(() => resetRegistries())

describe('Gun update scheduling', () => {
  it('keeps the extended example prefabs valid under reversed component arrays', () => {
    const registry = { ...PLATFORMER_REGISTRY.components, Gun, Projectile }
    for (const [prefab, expected] of [
      [player, ['StateMachine', 'AnimatedSprite', 'Gun', 'Health', 'OutOfBounds']],
      [bullet, ['DynamicBody', 'Lifetime']],
    ] as const) {
      const names = prefab.components.map((component) => component.type)
      for (const source of [names, names.slice().reverse()]) {
        expect(resolveComponentUpdateSchedule(source, registry)).toEqual({
          ok: true,
          order: expected,
          issues: [],
        })
      }
    }
  })

  it('fires with the same-frame StateMachine facing under reversed source order', () => {
    defineStates('aim-left', {
      idle: {
        onUpdate({ entity }) {
          const motor = entity.get(PlatformerMotor)
          if (motor) motor.facing = -1
        },
      },
    })
    const body = new DynamicBody()
    const bullet = {
      get(Class: ComponentClass) {
        return Class === DynamicBody ? body : undefined
      },
    } as unknown as Entity
    const game = {
      input: {
        justPressed: (action: string) => action === 'shoot',
        consume: vi.fn(),
        consumed: () => false,
      },
      spawnPrefab: vi.fn(() => bullet),
    } as unknown as Game
    const components: Component[] = []
    const entity = {
      name: 'Shooter',
      game,
      alive: true,
      position: new THREE.Vector3(),
      scale: new THREE.Vector3(1, 1, 1),
      get<T extends Component>(Class: ComponentClass<T>): T | undefined {
        return components.find((component) => component instanceof Class) as T | undefined
      },
    } as unknown as Entity
    const add = <T extends Component>(component: T): T => {
      component.entity = entity
      component.game = game
      components.push(component)
      return component
    }

    const gun = add(new Gun())
    const machine = add(new StateMachine())
    machine.role = 'aim-left'
    machine.initial = 'idle'
    machine.states = { idle: {} }
    const motor = add(new PlatformerMotor())
    machine.onReady()
    const registry = { Gun, PlatformerMotor, StateMachine }
    const sourceNames = components.map(
      (component) => (component.constructor as unknown as ComponentClass).componentName,
    )
    const result = resolveComponentUpdateSchedule(sourceNames, registry)
    if (!result.ok) throw new Error(result.issues.map((issue) => issue.cause).join(' '))
    const byName = new Map(
      components.map((component) => [
        (component.constructor as unknown as ComponentClass).componentName,
        component,
      ]),
    )

    for (const name of result.order) byName.get(name)?.onUpdate?.(0.016)

    expect(Gun.updateAfter).toEqual(['StateMachine'])
    expect(result.order).toEqual(['StateMachine', 'Gun'])
    expect(motor.facing).toBe(-1)
    expect(body.vx).toBe(-18)
  })
})
