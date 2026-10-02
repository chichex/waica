// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('three', async (importOriginal) => {
  const actual = await importOriginal<typeof import('three')>()
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
})

import * as THREE from 'three'
import { FakeTextureBackend, flush } from './assets/test-helpers'
import { AnimatedSprite } from './components/animated-sprite'
import { Sprite } from './components/sprite'
import { Game } from './game'
import { loadScene, type SceneEntityJson, type SceneJson, type SceneRegistry } from './scene'
import { defined } from './test-support'

class ResizeObserverStub {
  observe(): void {}
  disconnect(): void {}
}

const REGISTRY: SceneRegistry = { components: { Sprite, AnimatedSprite } }

function makeGame(textures = new FakeTextureBackend()): Game {
  const canvas = document.createElement('canvas')
  Object.defineProperties(canvas, {
    clientWidth: { value: 640 },
    clientHeight: { value: 360 },
  })
  document.body.append(canvas)
  return new Game({ canvas, textures })
}

/** One rendered frame with no Simulation Step: the render pass only. */
function renderFrame(game: Game): void {
  ;(game as unknown as { runFrame(steps: number): void }).runFrame(0)
}

/** One Simulation Step, then the render pass. */
function stepFrame(game: Game): void {
  ;(game as unknown as { runFrame(steps: number): void }).runFrame(1)
}

type AnyMesh = THREE.Mesh<THREE.BufferGeometry, THREE.Material | THREE.Material[]>

/** Every mesh under the scene, and whether three may draw it (its whole ancestor chain visible). */
function meshes(game: Game): { mesh: AnyMesh; drawn: boolean }[] {
  const found: { mesh: AnyMesh; drawn: boolean }[] = []
  const walk = (object: THREE.Object3D, visible: boolean): void => {
    const drawn = visible && object.visible
    if ((object as Partial<AnyMesh>).isMesh === true) found.push({ mesh: object as AnyMesh, drawn })
    for (const child of object.children) walk(child, drawn)
  }
  walk(game.scene, true)
  return found
}

function drawnMeshes(game: Game): AnyMesh[] {
  return meshes(game).filter((entry) => entry.drawn).map((entry) => entry.mesh)
}

function runMeshes(game: Game): THREE.InstancedMesh[] {
  return drawnMeshes(game).filter((mesh): mesh is THREE.InstancedMesh => mesh instanceof THREE.InstancedMesh)
}

function onlyRun(game: Game): THREE.InstancedMesh {
  const runs = runMeshes(game)
  expect(runs).toHaveLength(1)
  return defined(runs[0], 'one Sprite Batch run')
}

/** Distinct materials referenced by any mesh in the scene, drawn or not. */
function materials(game: Game): Set<THREE.Material> {
  const found = new Set<THREE.Material>()
  for (const { mesh } of meshes(game)) {
    for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) found.add(material)
  }
  return found
}

function basic(material: THREE.Material | THREE.Material[]): THREE.MeshBasicMaterial {
  if (!(material instanceof THREE.MeshBasicMaterial)) throw new Error('expected one MeshBasicMaterial')
  return material
}

/** The linear RGB a run carries for its instance at `index`. */
function instanceColor(run: THREE.InstancedMesh, index: number): number[] {
  const color = new THREE.Color()
  run.getColorAt(index, color)
  return color.toArray()
}

/** The linear RGB of `hex` as a Float32 instance buffer holds it. */
function linear(hex: number): number[] {
  return new THREE.Color().setHex(hex).toArray().map(Math.fround)
}

function spriteEntity(name: string, props: Record<string, unknown>, position: [number, number] = [0, 0]): SceneEntityJson {
  return { name, position, components: [{ type: 'Sprite', props }] }
}

function scene(entities: SceneEntityJson[], render?: SceneJson['render']): SceneJson {
  return { waicaScene: 3, entities, ...(render ? { render } : {}) }
}

function spriteOf(game: Game, name: string): Sprite {
  return defined(defined(game.find(name), name).get(Sprite), `${name}'s Sprite`)
}

beforeEach(() => {
  document.body.innerHTML = ''
  vi.stubGlobal('ResizeObserver', ResizeObserverStub)
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('shared materials by key (CA-1)', () => {
  it('draws 100 sprites of one texture with one material in one run', async () => {
    const game = makeGame()
    const entities = Array.from({ length: 100 }, (_, i) => spriteEntity(`S${i}`, { texture: '/hero.png' }))
    loadScene(game, scene(entities), REGISTRY)
    await flush()
    renderFrame(game)

    expect(materials(game).size).toBe(1)
    expect(onlyRun(game).count).toBe(100)
    expect(basic(onlyRun(game).material).map).not.toBeNull()
    game.dispose()
  })

  it('tints one sprite through its instance color, never through a material', async () => {
    const game = makeGame()
    loadScene(game, scene([0, 1, 2].map((i) => spriteEntity(`S${i}`, { texture: '/hero.png' }))), REGISTRY)
    await flush()
    renderFrame(game)
    const before = materials(game)

    spriteOf(game, 'S1').color = 0xff0000
    renderFrame(game)

    expect(materials(game)).toEqual(before)
    expect(materials(game).size).toBe(1)
    const run = onlyRun(game)
    expect(instanceColor(run, 1)).toEqual(linear(0xff0000))
    expect(instanceColor(run, 0)).toEqual(linear(0xffffff))
    game.dispose()
  })

  it('shares the untextured entry of a shape across colors', async () => {
    const game = makeGame()
    loadScene(
      game,
      scene([
        spriteEntity('Red', { color: 0xff0000 }),
        spriteEntity('Blue', { color: 0x0000ff }),
        spriteEntity('Ball', { color: 0x00ff00, shape: 'circle' }),
        spriteEntity('Green', { color: 0x00ff00 }),
      ]),
      REGISTRY,
    )
    await flush()
    renderFrame(game)

    // One untextured rectangle entry and one untextured circle entry.
    expect(materials(game).size).toBe(2)
    const runs = runMeshes(game)
    expect(runs.map((run) => run.count)).toEqual([2, 1, 1])
    expect(runs.map((run) => basic(run.material).map)).toEqual([null, null, null])
    expect(instanceColor(defined(runs[0]), 1)).toEqual(linear(0x0000ff))
    game.dispose()
  })

  it('moves the sprites of a failed texture to the untextured entry and leaves the others', async () => {
    const textures = new FakeTextureBackend()
    textures.failUrl('/broken.png')
    const game = makeGame(textures)
    loadScene(
      game,
      scene([
        spriteEntity('Fine', { texture: '/hero.png', layer: 0 }),
        spriteEntity('Broken', { texture: '/broken.png', color: 0x336699, layer: 1 }),
        spriteEntity('AlsoFine', { texture: '/hero.png', layer: 2 }),
      ]),
      REGISTRY,
    )
    await flush()
    renderFrame(game)

    const [fine, broken, alsoFine] = runMeshes(game)
    expect(basic(defined(fine).material).map).not.toBeNull()
    expect(defined(alsoFine).material).toBe(defined(fine).material)
    expect(basic(defined(broken).material).map).toBeNull()
    expect(instanceColor(defined(broken), 0)).toEqual(linear(0x336699))
    game.dispose()
  })
})

describe('render.batch: false (CA-6)', () => {
  it('restores one mesh and one material per sprite, with no batch objects', async () => {
    const game = makeGame()
    const entities = Array.from({ length: 5 }, (_, i) => spriteEntity(`S${i}`, { texture: '/hero.png' }))
    loadScene(game, scene(entities, { batch: false }), REGISTRY)
    await flush()
    renderFrame(game)

    expect(drawnMeshes(game)).toHaveLength(5)
    expect(materials(game).size).toBe(5)
    expect(meshes(game).some(({ mesh }) => mesh instanceof THREE.InstancedMesh)).toBe(false)
    game.dispose()
  })

  it('batches when the render block omits batch or sets it true', async () => {
    for (const render of [undefined, { batch: true }] as const) {
      const game = makeGame()
      loadScene(game, scene([spriteEntity('A', {}), spriteEntity('B', {})], render), REGISTRY)
      await flush()
      renderFrame(game)
      expect(onlyRun(game).count).toBe(2)
      game.dispose()
    }
  })
})
