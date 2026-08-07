import { describe, expect, it, vi } from 'vitest'
import {
  StateMachine,
  THREE,
  authoringDefaults,
  resolveComponentUpdateSchedule,
  type Component,
  type ComponentClass,
  type Entity,
  type Game,
} from '@waica/engine'
import { Health, declaresDeathHandling } from './health'

interface StubEntity extends Entity {
  addStub(component: Component): void
}

function makeGame(): Game {
  return {
    entities: [],
    stats: { add: vi.fn() },
    events: { emit: vi.fn() },
  } as unknown as Game
}

function makeEntity(game: Game, name: string): StubEntity {
  const components: Component[] = []
  const entity = {
    name,
    game,
    alive: true,
    position: new THREE.Vector3(),
    scale: new THREE.Vector3(1, 1, 1),
    destroy: vi.fn(),
    get(Class: new () => Component) {
      return components.find((component) => component instanceof Class)
    },
    has(Class: new () => Component) {
      return components.some((component) => component instanceof Class)
    },
    addStub(component: Component) {
      component.entity = entity as unknown as Entity
      component.game = game
      components.push(component)
    },
  } as unknown as StubEntity
  game.entities.push(entity)
  return entity
}

/** A ready Health on a bare entity — no machine, so death destroys. */
function makeHealth(props: Partial<Pick<Health, 'max' | 'invulnerability'>> = {}) {
  const game = makeGame()
  const entity = makeEntity(game, 'Subject')
  const health = new Health()
  Object.assign(health, props)
  entity.addStub(health)
  health.onReady()
  return { game, entity, health }
}

describe('Health arithmetic', () => {
  it('starts at max once ready, whatever max was authored to', () => {
    const { health } = makeHealth({ max: 5 })

    expect(health.current).toBe(5)
  })

  it('dies on ready when authored with a non-positive max, instead of becoming permanently invulnerable', () => {
    // damage() early-returns while current <= 0, and onReady used to set
    // current = max verbatim: an authored max of 0 (the inspector has no
    // min clamp) left current at 0 forever without ever calling die(), so
    // the entity could never be damaged, never emitted 'death', and was
    // never destroyed or routed through the graph's death policy.
    const { entity, health } = makeHealth({ max: 0 })

    expect(health.current).toBe(0)
    expect(entity.destroy).toHaveBeenCalledOnce()
  })

  it('subtracts the damage taken and reports it on the event bus', () => {
    const { game, entity, health } = makeHealth({ max: 3 })
    const source = makeEntity(game, 'Spike')

    health.damage(1, source)

    expect(health.current).toBe(2)
    expect(game.events.emit).toHaveBeenCalledWith('damage', {
      entity,
      amount: 1,
      current: 2,
      source,
    })
  })

  it('ignores zero and negative damage instead of healing through it', () => {
    const { game, health } = makeHealth({ max: 3 })

    health.damage(0)
    health.damage(-2)

    expect(health.current).toBe(3)
    expect(game.events.emit).not.toHaveBeenCalled()
  })

  it('clamps at zero rather than going negative', () => {
    const { health } = makeHealth({ max: 3 })

    health.damage(10)

    expect(health.current).toBe(0)
  })

  it('ignores NaN instead of poisoning current — every NaN comparison is false', () => {
    const { game, health } = makeHealth({ max: 3 })

    health.damage(NaN)

    expect(health.current).toBe(3)
    expect(game.events.emit).not.toHaveBeenCalled()
    // A poisoned current would make every future guard false too: still
    // damageable, never dying.
    health.damage(3)
    expect(health.current).toBe(0)
  })

  it('dies from repeated fractional damage that leaves a floating-point residual instead of exact zero', () => {
    const { entity, health } = makeHealth({ max: 1 })

    for (let i = 0; i < 10; i++) health.damage(0.1)

    expect(health.current).toBe(0)
    expect(entity.destroy).toHaveBeenCalledOnce()
  })

  it('treats Infinity as lethal, with no separate kill path', () => {
    const { entity, health } = makeHealth({ max: 100 })

    health.damage(Infinity)

    expect(health.current).toBe(0)
    expect(entity.destroy).toHaveBeenCalledOnce()
  })

  it('dies exactly once: damage on an already-dead entity does and emits nothing', () => {
    const { game, entity, health } = makeHealth({ max: 1 })
    health.damage(1)
    vi.mocked(game.events.emit).mockClear()

    health.damage(1)

    expect(health.current).toBe(0)
    expect(game.events.emit).not.toHaveBeenCalled()
    expect(entity.destroy).toHaveBeenCalledOnce()
  })

  it('heals up to max and no further', () => {
    const { health } = makeHealth({ max: 3 })
    health.damage(2)

    health.heal(5)

    expect(health.current).toBe(3)
  })

  it('ignores zero and negative heals instead of draining health', () => {
    const { health } = makeHealth({ max: 3 })
    health.damage(1)

    health.heal(0)
    health.heal(-1)

    expect(health.current).toBe(2)
  })

  it('restores a dead entity to full on heal(Infinity), symmetric with damage(Infinity)', () => {
    const { health } = makeHealth({ max: 3 })
    health.damage(Infinity)

    health.heal(Infinity)

    expect(health.current).toBe(3)
  })

  it('lets a revived entity die again — the once-only guard is not permanent', () => {
    const { game, entity, health } = makeHealth({ max: 3 })
    health.damage(Infinity)
    health.heal(Infinity)
    vi.mocked(game.events.emit).mockClear()

    health.damage(Infinity)

    expect(health.current).toBe(0)
    expect(game.events.emit).toHaveBeenCalledWith('death', { entity })
    expect(entity.destroy).toHaveBeenCalledTimes(2)
  })
})

describe('Health invulnerability window', () => {
  it('takes nothing while the window is open', () => {
    const { health } = makeHealth({ max: 5, invulnerability: 1 })

    health.damage(1)
    health.damage(1)
    health.damage(1)

    expect(health.current).toBe(4)
  })

  it('takes damage again once the window has been ticked away', () => {
    const { health } = makeHealth({ max: 5, invulnerability: 1 })
    health.damage(1)

    health.onUpdate(0.6)
    health.damage(1)
    expect(health.current).toBe(4)

    health.onUpdate(0.5)
    health.damage(1)

    expect(health.current).toBe(3)
  })

  it('does not shield anything at the default of zero seconds', () => {
    const { health } = makeHealth({ max: 5 })

    health.damage(1)
    health.damage(1)

    expect(health.current).toBe(3)
  })

  it('keeps runtime state out of the authoring surface', () => {
    expect(Health.transient).toContain('current')
    expect(Object.keys(Health.params ?? {}).sort()).toEqual(['invulnerability', 'max'])
  })
})

describe('declaresDeathHandling', () => {
  const deathEdge = { on: 'signal:death', to: 'dead' }

  it('finds the edge on the current state', () => {
    expect(declaresDeathHandling({ hurt: { transitions: [deathEdge] } }, 'hurt')).toBe(true)
  })

  it("finds the edge on '*', the same merge nextTransition performs", () => {
    expect(declaresDeathHandling({ idle: {}, '*': { transitions: [deathEdge] } }, 'idle')).toBe(
      true,
    )
  })

  it('ignores an edge declared only on some other state', () => {
    expect(
      declaresDeathHandling({ idle: {}, hurt: { transitions: [deathEdge] } }, 'idle'),
    ).toBe(false)
  })

  it('says no when the state declares transitions but none for death', () => {
    expect(
      declaresDeathHandling({ idle: { transitions: [{ on: 'signal:move', to: 'run' }] } }, 'idle'),
    ).toBe(false)
  })

  it('says no for a state with no transitions at all, or one that does not exist', () => {
    expect(declaresDeathHandling({ idle: {} }, 'idle')).toBe(false)
    expect(declaresDeathHandling({}, 'nowhere')).toBe(false)
  })
})

describe('Health death policy', () => {
  function makeWithMachine(states: StateMachine['states'], current: string) {
    const game = makeGame()
    const entity = makeEntity(game, 'Character')
    const machine = new StateMachine()
    machine.states = states
    machine.current = current
    const signal = vi.spyOn(machine, 'signal').mockImplementation(() => {})
    entity.addStub(machine)
    const health = new Health()
    health.max = 1
    entity.addStub(health)
    health.onReady()
    return { game, entity, health, signal }
  }

  it('hands death to a graph that declares it, and leaves the entity alive', () => {
    const { entity, health, signal } = makeWithMachine(
      { idle: {}, '*': { transitions: [{ on: 'signal:death', to: 'dead' }] }, dead: {} },
      'idle',
    )

    health.damage(1)

    expect(signal).toHaveBeenCalledExactlyOnceWith('death')
    expect(entity.destroy).not.toHaveBeenCalled()
  })

  it('destroys the entity when the graph has a machine but no death edge', () => {
    const { entity, health, signal } = makeWithMachine({ idle: {} }, 'idle')

    health.damage(1)

    expect(signal).not.toHaveBeenCalled()
    expect(entity.destroy).toHaveBeenCalledOnce()
  })

  it('destroys an entity with no StateMachine at all', () => {
    const { entity, health } = makeHealth({ max: 1 })

    health.damage(1)

    expect(entity.destroy).toHaveBeenCalledOnce()
  })

  it('announces the death on the event bus before deciding what to do about it', () => {
    const { game, entity, health } = makeHealth({ max: 1 })

    health.damage(1)

    expect(game.events.emit).toHaveBeenCalledWith('death', { entity })
  })
})

describe('Health deferred death fallback', () => {
  /**
   * A real StateMachine over a real graph — the point of these tests is what
   * the machine actually does with the signal, which a stubbed signal() by
   * definition cannot show.
   */
  function makeGraphed(states: StateMachine['states'], initial: string) {
    const game = makeGame()
    ;(game as unknown as { input: unknown }).input = {
      justPressed: () => false,
      consumed: () => false,
      consume: vi.fn(),
      axis: () => 0,
    }
    const entity = makeEntity(game, 'Character')
    const health = new Health()
    health.max = 1
    entity.addStub(health)
    health.onReady()
    const machine = new StateMachine()
    machine.states = states
    machine.initial = initial
    entity.addStub(machine)
    machine.onReady()
    // Deliberately authored in the wrong order: the public resolver, not this
    // source array, puts StateMachine before Health on every frame.
    const source = [health, machine]
    const registry: Record<string, ComponentClass> = { Health, StateMachine }
    const byName = new Map(source.map((component) => [
      (component.constructor as unknown as ComponentClass).componentName,
      component,
    ]))
    const frame = (dt = 0.016) => {
      const result = resolveComponentUpdateSchedule([...byName.keys()], registry)
      if (!result.ok) throw new Error(result.issues.map((issue) => issue.cause).join(' '))
      for (const name of result.order) byName.get(name)?.onUpdate?.(dt)
    }
    return { game, entity, health, machine, frame }
  }

  const DEATH_EDGE = { on: 'signal:death', to: 'dead' }

  it('destroys the entity when a declared death edge loses the race and the signal is dropped', () => {
    // 'signal:move' is listed first, so nextTransition picks it and the queued
    // 'death' is cleared unhandled — the exact hole declaresDeathHandling
    // cannot see statically.
    const { entity, health, machine, frame } = makeGraphed(
      {
        idle: { transitions: [{ on: 'signal:move', to: 'run' }, DEATH_EDGE] },
        run: {},
        dead: {},
      },
      'idle',
    )
    machine.signal('move')

    health.damage(1)
    frame()

    expect(machine.current).toBe('run')
    expect(entity.destroy).toHaveBeenCalledOnce()
  })

  it('leaves the entity alone when the graph really did take the death', () => {
    const { entity, health, machine, frame } = makeGraphed(
      { idle: {}, dead: {}, '*': { transitions: [DEATH_EDGE] } },
      'idle',
    )

    health.damage(1)
    frame()
    frame()
    frame()

    expect(machine.current).toBe('dead')
    expect(entity.destroy).not.toHaveBeenCalled()
  })

  it('does not destroy a player sitting out a long death beat at 0 health', () => {
    // The shipped player stays in `dead` for 0.8s at 0 HP before onExit heals
    // it. A fallback that merely re-checked "still at 0 HP" would kill it here.
    const { entity, health, machine, frame } = makeGraphed(
      { idle: {}, dead: { transitions: [{ on: 'timer:0.8', to: 'idle' }] }, '*': { transitions: [DEATH_EDGE] } },
      'idle',
    )

    health.damage(1)
    for (let i = 0; i < 40; i++) frame()

    expect(machine.current).toBe('dead')
    expect(health.current).toBe(0)
    expect(entity.destroy).not.toHaveBeenCalled()
  })

  it('spares an entity something revived before the grace ran out, graph or no graph', () => {
    // A project that resurrects on the 'death' event rather than through a
    // state: the death was resolved, just not by moving the machine. The
    // fallback must not undo that by destroying the entity anyway.
    const { entity, health, machine, frame } = makeGraphed(
      { idle: { transitions: [{ on: 'signal:move', to: 'run' }, DEATH_EDGE] }, run: {}, dead: {} },
      'idle',
    )
    machine.signal('move')

    health.damage(1)
    health.heal(Infinity)
    frame()
    frame()
    frame()

    expect(machine.current).toBe('run')
    expect(health.current).toBe(1)
    expect(entity.destroy).not.toHaveBeenCalled()
  })

  it('still destroys immediately when the graph declares no death edge at all', () => {
    const { entity, health } = makeGraphed({ idle: {} }, 'idle')

    health.damage(1)

    expect(entity.destroy).toHaveBeenCalledOnce()
  })

  it('keeps the deferred bookkeeping out of the authoring surface', () => {
    expect(authoringDefaults(Health)).toEqual({ max: 3, invulnerability: 0 })
  })
})
