// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// @waica/engine resolves its own nested `three` copy, so the mock has to
// target that exact module — same technique as navigation-grid.test.ts.
vi.mock(
  new URL('../../engine/node_modules/three/build/three.module.js', import.meta.url).pathname,
  async (importOriginal) => {
    const actual = await importOriginal<Record<string, unknown>>()
    class WebGLRenderer {
      readonly domElement: HTMLCanvasElement
      constructor({ canvas }: { canvas: HTMLCanvasElement }) {
        this.domElement = canvas
      }
      setPixelRatio(): void {}
      setSize(): void {}
      setViewport(): void {}
      setScissor(): void {}
      setScissorTest(): void {}
      setClearColor(): void {}
      clear(): void {}
      render(): void {}
      setAnimationLoop(): void {}
      dispose(): void {}
    }
    return { ...actual, WebGLRenderer }
  },
)

import {
  Component,
  Game,
  RUNTIME_BRIDGE_SYMBOL,
  Sprite,
  StateMachine,
  installArchetype,
  resetRegistries,
  type Entity,
  type InputBindings,
  type RuntimeBridge,
  type RuntimeBridgeActivation,
  type RuntimeSnapshotUi,
} from '@waica/engine'
import { ClickToMove } from './click-to-move'
import { INTERACTABLE_UI, Interactable } from './interactable'
import { IsoMotor } from './iso-motor'
import { ISO_PLAYER_ROLE, ISO_PLAYER_STATE_GRAPH } from './iso-player-states'

class ResizeObserverStub {
  observe(): void {}
  disconnect(): void {}
}

/** Records who interacted with its entity: the observable face of fireInteract. */
class Listener extends Component {
  static override componentName = 'Listener'
  heard: string[] = []
  override onInteract(initiator: Entity): void {
    this.heard.push(initiator.name)
  }
}

interface HarnessOptions {
  /** Anchored Interactable pieces the project defines; npc-line is always defined. */
  pieces?: Array<'npc-bubble' | 'interact-prompt'>
  bindings?: InputBindings
}

interface Harness {
  game: Game
  player: Entity
  /** The live Anchored Pieces, as the Runtime Snapshot reports them. */
  anchored(): RuntimeSnapshotUi['anchored']
  /** Runs `frames` render frames of one Simulation Step each. */
  step(frames?: number): void
  /** Presses interact for the next Simulation Step, and runs it. */
  interact(): void
  /** Clicks a logical point, as the Runtime Bridge (and a real pointerdown) does. */
  click(x: number, y: number): void
  /** Moves the player; the next step's lookup sees it there. */
  moveTo(x: number, y: number): void
}

const games: Game[] = []

/**
 * A real Game on a 640×360 canvas at viewHeight 10 — 36 CSS px per world
 * unit, the camera at (0, 0) framing y ∈ [-5, 5] — with a player running
 * the real isometric player role (its '*' hook runs interactUpdate, its
 * body update drives ClickToMove), driven and inspected through the
 * Runtime Bridge as the browser e2e does.
 */
function makeHarness({ pieces = [], bindings = { interact: ['KeyE', 'Space'] } }: HarnessOptions = {}): Harness {
  const registered: RuntimeBridge[] = []
  const activation: RuntimeBridgeActivation = {
    protocolVersion: 1,
    register: (bridge) => registered.push(bridge),
    unregister: () => {},
  }
  Object.defineProperty(globalThis, RUNTIME_BRIDGE_SYMBOL, { configurable: true, value: activation })
  const canvas = document.createElement('canvas')
  Object.defineProperties(canvas, {
    clientWidth: { value: 640 },
    clientHeight: { value: 360 },
  })
  document.body.append(canvas)
  const game = new Game({ canvas, bindings })
  games.push(game)
  game.ui.define('npc-line', INTERACTABLE_UI['npc-line']!)
  for (const piece of pieces) game.ui.define(piece, INTERACTABLE_UI[piece]!)
  const player = game.spawn('Player')
  player.add(IsoMotor)
  player.add(ClickToMove)
  player.add(StateMachine, {
    role: 'player',
    initial: ISO_PLAYER_STATE_GRAPH.initial,
    states: structuredClone(ISO_PLAYER_STATE_GRAPH.states),
  })
  game.start()
  const bridge = registered[0]!
  const step = (frames = 1): void => {
    bridge.control({ operation: 'step', frames })
  }
  return {
    game,
    player,
    anchored: () => bridge.inspect().ui.anchored,
    step,
    interact() {
      bridge.control({ operation: 'press', action: 'interact' })
      step()
    },
    click(x, y) {
      bridge.control({ operation: 'click', x, y })
    },
    moveTo(x, y) {
      player.position.set(x, y, 0)
    },
  }
}

/**
 * An NPC whose sprite box is 2 tall, anchored at its feet: its Anchored
 * Pieces sit 2.2 world units up (CA-14), which for one at (0, 0) is
 * (320, 101) — y = (5 − 2.2) × 36 ≈ 101 px from the viewport's top.
 */
function spawnNpc(
  game: Game,
  name: string,
  x: number,
  y: number,
  props: Partial<Pick<Interactable, 'line' | 'radius'>> = {},
): { npc: Entity; listener: Listener } {
  const npc = game.spawn(name)
  npc.position.set(x, y, 0)
  npc.add(Sprite, { width: 1, height: 2, anchorY: 0 })
  npc.add<Interactable>(Interactable, props)
  return { npc, listener: npc.add(Listener) }
}

function pieces(harness: Harness, piece: string): RuntimeSnapshotUi['anchored'] {
  return harness.anchored().filter((instance) => instance.piece === piece)
}

const LINE = 'The water sparkles, but it blocks the trail.'

beforeEach(() => {
  document.body.innerHTML = ''
  vi.stubGlobal('ResizeObserver', ResizeObserverStub)
  installArchetype({ roles: { player: ISO_PLAYER_ROLE } })
})

afterEach(() => {
  for (const game of games.splice(0)) game.dispose()
  delete (globalThis as Record<PropertyKey, unknown>)[RUNTIME_BRIDGE_SYMBOL]
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  resetRegistries()
})

describe('Interactable speech bubble (issue #72, CA-11)', () => {
  it('anchors an npc-bubble with the line to the NPC instead of showing npc-line', () => {
    const harness = makeHarness({ pieces: ['npc-bubble'] })
    const { listener } = spawnNpc(harness.game, 'Villager', 0, 0, { line: LINE, radius: 1.5 })
    harness.moveTo(1, 0)

    harness.interact()

    expect(harness.anchored()).toEqual([
      { piece: 'npc-bubble', entity: 'Villager', x: 320, y: 101, clipped: false, values: { line: LINE } },
    ])
    expect(harness.game.ui.isVisible('npc-line')).toBe(false)
    expect(harness.game.stats.get('npcLine')).toBe(LINE)
    expect(listener.heard).toEqual(['Player'])
  })

  it('falls back to the npc-line screen piece when the project does not define npc-bubble', () => {
    const harness = makeHarness()
    const { listener } = spawnNpc(harness.game, 'Villager', 0, 0, { line: LINE, radius: 1.5 })
    harness.moveTo(1, 0)

    harness.interact()

    expect(harness.game.ui.isVisible('npc-line')).toBe(true)
    expect(harness.anchored()).toEqual([])
    expect(harness.game.stats.get('npcLine')).toBe(LINE)
    expect(listener.heard).toEqual(['Player'])
  })

  it('keeps at most one bubble: interacting again replaces it', () => {
    const harness = makeHarness({ pieces: ['npc-bubble'] })
    const attach = vi.spyOn(harness.game.ui, 'attach')
    const { listener } = spawnNpc(harness.game, 'Villager', 0, 0, { line: LINE, radius: 1.5 })
    harness.moveTo(1, 0)

    harness.interact()
    harness.interact()

    expect(pieces(harness, 'npc-bubble')).toHaveLength(1)
    expect(attach.mock.results.map((result) => result.value.alive)).toEqual([false, true])
    expect(listener.heard).toEqual(['Player', 'Player'])
  })

  it('removes the bubble once its NPC stops being the nearest Interactable in range', () => {
    const harness = makeHarness({ pieces: ['npc-bubble'] })
    spawnNpc(harness.game, 'Villager', 0, 0, { line: LINE, radius: 3 })
    spawnNpc(harness.game, 'Fisher', 3, 0, { line: 'Quiet, please.', radius: 3 })
    harness.moveTo(1, 0)
    harness.interact()
    expect(pieces(harness, 'npc-bubble').map((instance) => instance.entity)).toEqual(['Villager'])

    harness.moveTo(2.5, 0) // still within both radii, now nearer the Fisher
    harness.step()

    expect(harness.anchored()).toEqual([])
  })

  it('removes the bubble when the player leaves every radius', () => {
    const harness = makeHarness({ pieces: ['npc-bubble'] })
    spawnNpc(harness.game, 'Villager', 0, 0, { line: LINE, radius: 1.5 })
    harness.moveTo(1, 0)
    harness.interact()
    expect(pieces(harness, 'npc-bubble')).toHaveLength(1)

    harness.moveTo(4, 0)
    harness.step()

    expect(harness.anchored()).toEqual([])
  })

  it('hides the npc-line fallback when the player leaves every radius, as before', () => {
    const harness = makeHarness()
    spawnNpc(harness.game, 'Villager', 0, 0, { line: LINE, radius: 1.5 })
    harness.moveTo(1, 0)
    harness.interact()
    expect(harness.game.ui.isVisible('npc-line')).toBe(true)

    harness.moveTo(4, 0)
    harness.step()

    expect(harness.game.ui.isVisible('npc-line')).toBe(false)
  })
})

describe('ClickToMove arrival at an NPC (issue #72, CA-11, grill S8)', () => {
  it('anchors the same bubble, publishes npcLine and fires onInteract, with no key pressed', () => {
    const harness = makeHarness({ pieces: ['npc-bubble'] })
    const { listener } = spawnNpc(harness.game, 'Villager', 0, 0, { line: LINE, radius: 1.5 })
    harness.moveTo(1, 0)

    harness.click(0, 1) // on the Villager's sprite box
    harness.step()

    expect(harness.player.get(ClickToMove)!.order).toBeNull() // arrived: one trigger per arrival
    expect(harness.anchored()).toEqual([
      { piece: 'npc-bubble', entity: 'Villager', x: 320, y: 101, clipped: false, values: { line: LINE } },
    ])
    expect(harness.game.ui.isVisible('npc-line')).toBe(false)
    expect(harness.game.stats.get('npcLine')).toBe(LINE)
    expect(listener.heard).toEqual(['Player'])
  })

  it('falls back to npc-line without npc-bubble, as before', () => {
    const harness = makeHarness()
    const { listener } = spawnNpc(harness.game, 'Villager', 0, 0, { line: LINE, radius: 1.5 })
    harness.moveTo(1, 0)

    harness.click(0, 1)
    harness.step()

    expect(harness.game.ui.isVisible('npc-line')).toBe(true)
    expect(harness.anchored()).toEqual([])
    expect(harness.game.stats.get('npcLine')).toBe(LINE)
    expect(listener.heard).toEqual(['Player'])
  })

  it('shares the one bubble with the interact key: a press replaces it, leaving removes it', () => {
    const harness = makeHarness({ pieces: ['npc-bubble'] })
    spawnNpc(harness.game, 'Villager', 0, 0, { line: LINE, radius: 1.5 })
    harness.moveTo(1, 0)
    harness.click(0, 1)
    harness.step()

    harness.interact()
    expect(pieces(harness, 'npc-bubble')).toHaveLength(1)

    harness.moveTo(4, 0)
    harness.step()
    expect(harness.anchored()).toEqual([])
  })
})
