import { describe, expect, it, vi } from 'vitest'
import { THREE, type Entity, type Game, type StateContext } from '@waica/engine'
import { INTERACTABLE_UI, Interactable, interactUpdate } from './interactable'

interface WorldHarness {
  ctx: StateContext
  stats: { set: ReturnType<typeof vi.fn> }
  ui: { show: ReturnType<typeof vi.fn>; hide: ReturnType<typeof vi.fn> }
  press(): void
  addNpc(x: number, y: number, props?: Partial<Interactable>): Interactable
}

function makeWorld(): WorldHarness {
  const entities: Entity[] = []
  let pressed = false
  const used = new Set<string>()
  const input = {
    justPressed: (action: string) => pressed && action === 'interact',
    consumed: (action: string) => used.has(action),
    consume: (action: string) => used.add(action),
  }
  const stats = { set: vi.fn() }
  const ui = { show: vi.fn(), hide: vi.fn() }
  const game = { entities, input, stats, ui } as unknown as Game
  const player = {
    game,
    position: new THREE.Vector3(0, 0, 0),
    get: () => undefined,
  } as unknown as Entity
  entities.push(player)

  return {
    ctx: { entity: player, game, fsm: null as never },
    stats,
    ui,
    press() {
      pressed = true
    },
    addNpc(x, y, props = {}) {
      const interactable = new Interactable()
      Object.assign(interactable, props)
      const npc = {
        game,
        position: new THREE.Vector3(x, y, 0),
        get(Class: unknown) {
          return Class === Interactable ? interactable : undefined
        },
      } as unknown as Entity
      interactable.entity = npc
      interactable.game = game
      entities.push(npc)
      return interactable
    },
  }
}

describe('Interactable', () => {
  it('ships the UI piece its behavior addresses', () => {
    expect(Object.keys(INTERACTABLE_UI)).toEqual(['npc-line'])
    expect(INTERACTABLE_UI['npc-line']).toContain('{{npcLine}}')
  })

  it('shows the line when interact is pressed within the radius', () => {
    const world = makeWorld()
    world.addNpc(1, 0, { line: 'Nice day for fishing!', radius: 1.5 })
    world.press()

    interactUpdate(world.ctx)

    expect(world.stats.set).toHaveBeenCalledWith('npcLine', 'Nice day for fishing!')
    expect(world.ui.show).toHaveBeenCalledWith('npc-line')
    expect(world.ui.hide).not.toHaveBeenCalled()
  })

  it('does nothing within the radius until the press arrives', () => {
    const world = makeWorld()
    world.addNpc(1, 0)

    interactUpdate(world.ctx)

    expect(world.stats.set).not.toHaveBeenCalled()
    expect(world.ui.show).not.toHaveBeenCalled()
    expect(world.ui.hide).not.toHaveBeenCalled()
  })

  it('hides the line once the player walks out of the radius', () => {
    const world = makeWorld()
    world.addNpc(9, 9, { radius: 1.5 })
    world.press()

    interactUpdate(world.ctx)

    expect(world.ui.hide).toHaveBeenCalledWith('npc-line')
    expect(world.stats.set).not.toHaveBeenCalled()
    expect(world.ui.show).not.toHaveBeenCalled()
  })

  it('spends the press so an input: edge cannot double-fire on it', () => {
    const world = makeWorld()
    world.addNpc(1, 0)
    world.press()

    interactUpdate(world.ctx)
    world.stats.set.mockClear()
    interactUpdate(world.ctx)

    // The second frame sees the same (now consumed) press: no re-trigger.
    expect(world.stats.set).not.toHaveBeenCalled()
  })

  it('picks the nearest interactable when several are in range', () => {
    const world = makeWorld()
    world.addNpc(1.2, 0, { line: 'far', radius: 3 })
    world.addNpc(0.5, 0, { line: 'near', radius: 3 })
    world.press()

    interactUpdate(world.ctx)

    expect(world.stats.set).toHaveBeenCalledWith('npcLine', 'near')
  })

  it('declares authorable defaults for the inspector', () => {
    const interactable = new Interactable()
    expect(Interactable.componentName).toBe('Interactable')
    expect(interactable.line.length).toBeGreaterThan(0)
    expect(interactable.radius).toBeGreaterThan(0)
  })
})
