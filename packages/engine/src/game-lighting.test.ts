// @vitest-environment happy-dom
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

vi.mock('three/webgpu', async (importOriginal) =>
  (await import('./test-renderer.js')).withFakeRenderer(await importOriginal()),
)

import { authoringDefaults } from './authoring-defaults'
import { Light } from './components/light'
import { SIMULATION_STEP } from './fixed-step'
import { Game } from './game'
import { loadScene, type SceneJson, type SceneRegistry } from './scene'
import { frameMs } from './fixed-step-test-support'
import { lastFakeRenderer, resetFakeRendering } from './test-renderer'

class ResizeObserverStub {
  observe(): void {}
  disconnect(): void {}
}

beforeEach(() => {
  resetFakeRendering()
  document.body.innerHTML = ''
  vi.stubGlobal('ResizeObserver', ResizeObserverStub)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

const registry: SceneRegistry = { components: { Light } }

function makeGame(): Game {
  const canvas = document.createElement('canvas')
  Object.defineProperties(canvas, { clientWidth: { value: 640 }, clientHeight: { value: 360 } })
  document.body.append(canvas)
  return new Game({ canvas })
}

const UNLIT: SceneJson = { waicaScene: 3, entities: [] }
const DUSK: SceneJson = {
  waicaScene: 3,
  render: { lighting: { ambient: { color: '#203040', intensity: 0.3 } } },
  entities: [],
}
const GRADED: SceneJson = {
  waicaScene: 3,
  render: { post: { vignette: { intensity: 0.5, radius: 0.4 }, colorGrade: { saturation: 0.5 } } },
  entities: [],
}

/** Starts the Game's own frame loop and returns a driver that runs whole Simulation Steps. */
async function stepper(game: Game): Promise<(steps: number) => void> {
  game.start()
  await game.ready()
  const loop = lastFakeRenderer().loop
  if (!loop) throw new Error('Game.start() did not install a frame callback')
  let clock = 0
  loop(clock)
  return (steps) => {
    for (let index = 0; index < steps; index += 1) {
      clock += frameMs(60)
      loop(clock)
    }
  }
}

it('game.lighting — Ambient Light (CA-2, CA-3): is full white light and off for a scene that declares no lighting', () => {
  const game = makeGame()
  loadScene(game, UNLIT, registry)
  expect(game.lighting.ambient).toEqual({ color: '#ffffff', intensity: 1 })
  expect(game.lighting.active).toBe(false)
})

it('game.lighting — Ambient Light (CA-2, CA-3): starts from the scene’s declared ambient, and the scene is lit', () => {
  const game = makeGame()
  loadScene(game, DUSK, registry)
  expect(game.lighting.ambient).toEqual({ color: '#203040', intensity: 0.3 })
  expect(game.lighting.active).toBe(true)
})

it('game.lighting — Ambient Light (CA-2, CA-3): changes at runtime, field by field, clamped, without exposing its own state', () => {
  const game = makeGame()
  loadScene(game, DUSK, registry)
  game.lighting.ambient = { intensity: 0.8 }
  expect(game.lighting.ambient).toEqual({ color: '#203040', intensity: 0.8 })
  game.lighting.ambient = { color: '#FFAA00', intensity: 7 }
  expect(game.lighting.ambient).toEqual({ color: '#ffaa00', intensity: 1 })
  const read = game.lighting.ambient
  read.intensity = 0
  expect(game.lighting.ambient.intensity).toBe(1)
})

it('game.lighting — Ambient Light (CA-2, CA-3): lights a scene that declared nothing once a value is set at runtime', () => {
  const game = makeGame()
  loadScene(game, UNLIT, registry)
  game.lighting.ambient = { intensity: 0.5 }
  expect(game.lighting.active).toBe(true)
})

it('game.lighting — Ambient Light (CA-2, CA-3): is tweenable with game.time.tween, one Simulation Step at a time (day/night)', async () => {
  const game = makeGame()
  loadScene(game, DUSK, registry)
  const stepGame = await stepper(game)
  game.time.tween({
    from: 1,
    to: 0,
    seconds: 10 * SIMULATION_STEP,
    onUpdate: (value) => {
      game.lighting.ambient = { intensity: value }
    },
  })
  stepGame(5)
  expect(game.lighting.ambient.intensity).toBeCloseTo(0.5, 6)
  stepGame(5)
  expect(game.lighting.ambient.intensity).toBe(0)
})

it('game.lighting — Ambient Light (CA-2, CA-3): dies with its scene: a swap takes the next scene’s value, an unload the default', () => {
  const game = makeGame()
  loadScene(game, DUSK, registry)
  game.lighting.ambient = { intensity: 0.05 }
  loadScene(game, UNLIT, registry)
  expect(game.lighting.ambient).toEqual({ color: '#ffffff', intensity: 1 })
  expect(game.lighting.active).toBe(false)
  loadScene(game, DUSK, registry)
  expect(game.lighting.ambient).toEqual({ color: '#203040', intensity: 0.3 })
  game.unloadScene()
  expect(game.lighting.ambient).toEqual({ color: '#ffffff', intensity: 1 })
  expect(game.lighting.active).toBe(false)
})

it('Light component (CA-4): declares its inspector params with their ranges', () => {
  expect(Light.componentName).toBe('Light')
  expect(Object.keys(Light.params)).toEqual([
    'radius', 'color', 'intensity', 'bands', 'softness', 'castShadows', 'offsetX', 'offsetY',
  ])
  expect(Light.params.color.kind).toBe('color')
  expect(Light.params.bands).toMatchObject({ min: 0, max: 16, step: 1 })
  expect(Light.params.softness).toMatchObject({ min: 0, max: 1 })
  expect(Light.params.intensity).toMatchObject({ min: 0 })
})

it('Light component (CA-4): defaults to a white, smooth, hard-shadowed light of radius 4', () => {
  expect(authoringDefaults(Light)).toEqual({
    radius: 4,
    color: 0xffffff,
    intensity: 1,
    bands: 0,
    softness: 0,
    castShadows: true,
    offsetX: 0,
    offsetY: 0,
  })
})

it('Light component (CA-4): lights the scene while its entity lives, and stops when the entity is destroyed', () => {
  const game = makeGame()
  loadScene(game, {
    waicaScene: 3,
    entities: [{ name: 'Torch', position: [2, 3], components: [{ type: 'Light', props: { radius: 5 } }] }],
  }, registry)
  const torch = game.find('Torch')
  expect(game.lighting.active).toBe(true)
  expect(game.lighting.lights.map((light) => light.entity.name)).toEqual(['Torch'])
  torch?.destroy()
  expect(game.lighting.lights).toEqual([])
  expect(game.lighting.active).toBe(false)
})

it('Light component (CA-4): sits at its entity’s logical position plus its offset, with its params clamped', () => {
  const game = makeGame()
  loadScene(game, {
    waicaScene: 3,
    entities: [{
      name: 'Torch',
      position: [2, 3],
      components: [{
        type: 'Light',
        props: { offsetX: 0.5, offsetY: -1, color: 0xff8000, intensity: -2, bands: 40.6, softness: 3, radius: -1 },
      }],
    }],
  }, registry)
  const light = game.lighting.lights[0]
  expect(light?.field()).toEqual({
    x: 2.5,
    y: 2,
    radius: 0,
    color: [1, 128 / 255, 0],
    intensity: 0,
    bands: 16,
    softness: 1,
    castShadows: true,
  })
})

it('game.post — Post Effects (CA-2, CA-11): has every effect off for a scene that declares none', () => {
  const game = makeGame()
  loadScene(game, UNLIT, registry)
  expect(game.post.vignette).toBeNull()
  expect(game.post.colorGrade).toBeNull()
  expect(game.post.active).toBe(false)
})

it('game.post — Post Effects (CA-2, CA-11): starts from the scene’s declared effects and changes them at runtime', () => {
  const game = makeGame()
  loadScene(game, GRADED, registry)
  expect(game.post.vignette).toEqual({ intensity: 0.5, radius: 0.4 })
  expect(game.post.colorGrade).toEqual({ tint: '#ffffff', contrast: 1, saturation: 0.5 })
  expect(game.post.active).toBe(true)
  game.post.vignette = null
  // Merged over the scene's grade, field by field like game.lighting.ambient (review): saturation 0.5 stays.
  game.post.colorGrade = { contrast: 3 }
  expect(game.post.vignette).toBeNull()
  expect(game.post.colorGrade).toEqual({ tint: '#ffffff', contrast: 2, saturation: 0.5 })
  game.post.colorGrade = null
  expect(game.post.active).toBe(false)
})

it('game.post — Post Effects (CA-11): a partial vignette merges over the current one, and turns one on from defaults', () => {
  const game = makeGame()
  loadScene(game, GRADED, registry)
  game.post.vignette = { intensity: 0.9 }
  expect(game.post.vignette).toEqual({ intensity: 0.9, radius: 0.4 })
  game.post.vignette = null
  game.post.vignette = { radius: 0.2 }
  expect(game.post.vignette).toEqual({ intensity: 0.5, radius: 0.2 })
  game.post.colorGrade = null
  game.post.colorGrade = { tint: '#ff0000' }
  expect(game.post.colorGrade).toEqual({ tint: '#ff0000', contrast: 1, saturation: 1 })
})

it('game.lighting — Ambient Light (CA-3): an unreadable intensity is ignored, keeping the current one (review)', () => {
  const game = makeGame()
  loadScene(game, DUSK, registry)
  game.lighting.ambient = { intensity: Number.NaN }
  expect(game.lighting.ambient.intensity).toBe(0.3)
  game.lighting.ambient = { intensity: Number.POSITIVE_INFINITY }
  expect(game.lighting.ambient.intensity).toBe(0.3)
})

it('game.post — Post Effects (CA-2, CA-11): dies with its scene', () => {
  const game = makeGame()
  loadScene(game, UNLIT, registry)
  game.post.vignette = { intensity: 1, radius: 0.2 }
  loadScene(game, UNLIT, registry)
  expect(game.post.vignette).toBeNull()
  loadScene(game, GRADED, registry)
  game.unloadScene()
  expect(game.post.vignette).toBeNull()
  expect(game.post.colorGrade).toBeNull()
})
