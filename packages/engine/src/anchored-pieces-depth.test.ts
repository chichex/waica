// @vitest-environment happy-dom
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

vi.mock('three/webgpu', async (importOriginal) =>
  (await import('./test-renderer.js')).withFakeRenderer(await importOriginal()),
)

import type { AnchoredPieceHandle } from './anchored-pieces'
import { Game } from './game'
import { loadScene, type SceneJson } from './scene'
import { defined } from './test-support'

// Issue #181 CA-22: in a perspective scene each Anchored Piece's --waica-unit is measured at its own anchor's depth.

const games: Game[] = []

function makeGame(scene: SceneJson): Game {
  const host = document.createElement('div')
  const canvas = document.createElement('canvas')
  Object.defineProperties(canvas, { clientWidth: { value: 800 }, clientHeight: { value: 600 } })
  host.append(canvas)
  document.body.append(host)
  const game = new Game({ canvas })
  games.push(game)
  game.ui.define('bar', '<div class="bar" style="width: calc(1 * var(--waica-unit))"></div>')
  loadScene(game, scene, { components: {} })
  return game
}

const PERSPECTIVE: SceneJson = {
  waicaScene: 3,
  render: { space: '3d' },
  camera: { kind: 'perspective', position: [0, 0, 10], target: [0, 0, 0], fov: 60 },
  entities: [],
}

function frame(game: Game): void {
  ;(game as unknown as { runFrame(steps: number): void }).runFrame(0)
}

function unitOf(handle: AnchoredPieceHandle): number {
  const host = (defined(handle.element).getRootNode() as ShadowRoot).host as HTMLElement
  return Number.parseFloat(host.style.getPropertyValue('--waica-unit'))
}

beforeEach(() => {
  document.body.innerHTML = ''
  vi.stubGlobal('ResizeObserver', class {
    observe(): void {}
    disconnect(): void {}
  })
})

afterEach(() => {
  for (const game of games.splice(0)) game.dispose()
  vi.unstubAllGlobals()
})

it('makes a piece twice as far from the camera half as wide (CA-22)', () => {
  const game = makeGame(PERSPECTIVE)
  const near = game.ui.attach('bar', game.spawn('Near'))
  const farEntity = game.spawn('Far')
  farEntity.position.set(3, 0, -10)
  const far = game.ui.attach('bar', farEntity)

  frame(game)

  // 600 px cover 2 * depth * tan(30°) world units: 10 deep for Near, 20 for Far.
  expect(unitOf(near)).toBeCloseTo(600 / (2 * 10 * Math.tan(Math.PI / 6)), 3)
  expect(unitOf(far)).toBeCloseTo(unitOf(near) / 2, 3)
})

it('follows its anchor’s depth as the entity moves (CA-22)', () => {
  const game = makeGame(PERSPECTIVE)
  const orc = game.spawn('Orc')
  const bar = game.ui.attach('bar', orc)
  frame(game)
  const atTen = unitOf(bar)

  orc.position.set(0, 0, 5)
  frame(game)

  expect(unitOf(bar)).toBeCloseTo(atTen * 2, 3)
})

it('leaves the orthographic unit on the layer alone, with no per-piece override (CA-22)', () => {
  const game = makeGame({ waicaScene: 3, entities: [] })
  const near = game.ui.attach('bar', game.spawn('Near'))
  frame(game)

  expect(Number.isNaN(unitOf(near))).toBe(true)
  const layer = defined(document.querySelector<HTMLElement>('[style*="--waica-unit"]'))
  expect(Number.parseFloat(layer.style.getPropertyValue('--waica-unit'))).toBeCloseTo(600 / 10, 3)
})
