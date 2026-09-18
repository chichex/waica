import { describe, expect, it, vi } from 'vitest'
import {
  THREE,
  type Entity,
  type Game,
  type NearestSpatialQueryFilter,
  type StateContext,
} from '@waica/engine'
import {
  INTERACTABLE_UI,
  INTERACTABLE_UI_PIECE,
  Interactable,
  interactUpdate,
} from './interactable'

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
  // No Anchored Pieces defined: every interaction takes the npc-line path
  // (the bubble and prompt run on a real Game in interactable-anchored-pieces.test.ts).
  const ui = { show: vi.fn(), hide: vi.fn(), names: () => [] }
  const game = { entities, input, stats, ui } as unknown as Game
  const nearest = vi.fn((
    x: number,
    y: number,
    filter?: NearestSpatialQueryFilter,
  ): Entity | null => {
    let result: Entity | null = null
    let bestDistance = Infinity
    for (const candidate of entities) {
      if (candidate === filter?.exclude) continue
      if (filter?.with?.some((component) => !candidate.get(component))) continue
      if (filter?.without?.some((component) => candidate.get(component))) continue
      const distance = Math.hypot(candidate.position.x - x, candidate.position.y - y)
      if (filter?.where && !filter.where(candidate, { distance })) continue
      if (distance < bestDistance) {
        result = candidate
        bestDistance = distance
      }
    }
    return result
  })
  Object.defineProperty(game, 'query', {
    configurable: true,
    value: { nearest },
  })
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
        // fireInteract walks every sibling component (e.g. SceneTransition).
        components: [interactable],
      } as unknown as Entity
      interactable.entity = npc
      interactable.game = game
      entities.push(npc)
      return interactable
    },
  }
}

describe('Interactable', () => {
  it('delegates winner discovery to query.nearest with a target-owned inclusive radius', () => {
    const world = makeWorld()
    const interactable = world.addNpc(3, 0, { line: 'Indexed NPC', radius: 1 })
    const npc = interactable.entity
    world.ctx.game.entities.splice(world.ctx.game.entities.indexOf(npc), 1)
    const nearest = vi.fn((
      _x: number,
      _y: number,
      filter: NearestSpatialQueryFilter<readonly [typeof Interactable]>,
    ) => filter.where?.(npc, { distance: 1 }) ? npc : null)
    Object.defineProperty(world.ctx.game, 'query', { value: { nearest } })
    world.press()

    interactUpdate(world.ctx)

    expect(nearest).toHaveBeenCalledOnce()
    expect(nearest).toHaveBeenCalledWith(0, 0, {
      with: [Interactable],
      exclude: world.ctx.entity,
      where: expect.any(Function),
    })
    expect(world.stats.set).toHaveBeenCalledWith('npcLine', 'Indexed NPC')
  })

  it('ships the UI pieces its behavior addresses', () => {
    expect(Object.keys(INTERACTABLE_UI)).toEqual(['npc-line', 'npc-bubble', 'interact-prompt'])
    expect(INTERACTABLE_UI['npc-line']).toContain('{{npcLine}}')
    expect(INTERACTABLE_UI['npc-bubble']).toContain('{{line}}')
    expect(INTERACTABLE_UI['interact-prompt']).toContain('{{key}}')
  })

  it('shows the line when interact is pressed within the radius', () => {
    const world = makeWorld()
    world.addNpc(1, 0, { line: 'Nice day for fishing!', radius: 1.5 })
    world.press()

    interactUpdate(world.ctx)

    expect(world.stats.set).toHaveBeenCalledWith('npcLine', 'Nice day for fishing!')
    expect(world.ui.show).toHaveBeenCalledWith('npc-line', { scope: 'scene' })
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

  it('shows the prompt scene-scoped so a swap takes it down', () => {
    const world = makeWorld()
    world.addNpc(1, 0)
    world.press()

    interactUpdate(world.ctx)

    // The scan that hides this prompt dies with the scene. Unscoped, the
    // prompt would outlive the swap in a map where nothing hides it, still
    // showing the previous map's line (grill decision 8).
    expect(world.ui.show).toHaveBeenCalledWith(INTERACTABLE_UI_PIECE, { scope: 'scene' })
  })

  it('declares authorable defaults for the inspector', () => {
    const interactable = new Interactable()
    expect(Interactable.componentName).toBe('Interactable')
    expect(interactable.line.length).toBeGreaterThan(0)
    expect(interactable.radius).toBeGreaterThan(0)
  })
})
