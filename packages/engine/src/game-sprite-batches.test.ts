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
    /** Lets a test observe the scene at the moment three would draw it. */
    render(scene: unknown): void {
      ;(globalThis as { onTestRender?: (scene: unknown) => void }).onTestRender?.(scene)
    }
    setAnimationLoop(): void {}
    dispose(): void {}
  }
  return { ...actual, WebGLRenderer }
})

import * as THREE from 'three'
import { FakeTextureBackend, flush } from './assets/test-helpers'
import { AnimatedSprite } from './components/animated-sprite'
import { ParticleEmitter } from './components/particle-emitter'
import { Sprite } from './components/sprite'
import { Tilemap } from './components/tilemap'
import { Game } from './game'
import { StateMachine } from './state/state-machine'
import { loadScene, type SceneEntityJson, type SceneJson, type SceneRegistry } from './scene'
import { defined } from './test-support'

class ResizeObserverStub {
  observe(): void {}
  disconnect(): void {}
}

// AnimatedSprite updates after StateMachine, which must be resolvable.
const REGISTRY: SceneRegistry = { components: { Sprite, AnimatedSprite, StateMachine } }

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
  delete (globalThis as { onTestRender?: unknown }).onTestRender
})

/** A Float32 view of what three would upload as the mesh's modelViewMatrix. */
function modelView(game: Game, mesh: THREE.Object3D): number[] {
  return Array.from(new Float32Array(new THREE.Matrix4().multiplyMatrices(game.camera.matrixWorldInverse, mesh.matrixWorld).elements))
}

interface InstanceRecord {
  matrix: number[]
  color: number[]
  uv: number[]
  map: THREE.Texture | null
}

/** Every instance the frame's runs carry, in draw order (run renderOrder, then index). */
function instances(game: Game): InstanceRecord[] {
  const records: InstanceRecord[] = []
  const runs = [...runMeshes(game)].sort((a, b) => a.renderOrder - b.renderOrder)
  for (const run of runs) {
    const uv = run.geometry.getAttribute('instanceUv') as THREE.InstancedBufferAttribute
    const colors = defined(run.instanceColor, 'instance colors')
    for (let index = 0; index < run.count; index += 1) {
      records.push({
        matrix: Array.from(run.instanceMatrix.array.slice(index * 16, index * 16 + 16)),
        color: Array.from(colors.array.slice(index * 3, index * 3 + 3)),
        uv: Array.from(uv.array.slice(index * 4, index * 4 + 4)),
        map: basic(run.material).map,
      })
    }
  }
  return records
}

/** What the per-sprite mesh draws, in the same Float32 terms as an instance. */
function meshRecord(game: Game, mesh: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>): Omit<InstanceRecord, 'map'> {
  const map = mesh.material.map
  return {
    matrix: modelView(game, mesh),
    color: mesh.material.color.toArray().map(Math.fround),
    uv: map ? [map.repeat.x, map.repeat.y, map.offset.x, map.offset.y].map(Math.fround) : [1, 1, 0, 0],
  }
}

const SHEET = '/sheet.png'
const WALK = { frames: [0, 1, 2, 3, 4, 5], fps: 10 }

function animatedEntity(name: string, props: Record<string, unknown>, position: [number, number] = [0, 0]): SceneEntityJson {
  return {
    name,
    position,
    components: [{ type: 'AnimatedSprite', props: { texture: SHEET, cols: 4, rows: 2, clips: { walk: WALK }, initialClip: 'walk', ...props } }],
  }
}

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

describe('AnimatedSprite in Sprite Batches (CA-1, CA-5)', () => {
  it('draws many animated sprites of one sheet with one material in one run', async () => {
    const game = makeGame()
    loadScene(game, scene(Array.from({ length: 20 }, (_, i) => animatedEntity(`A${i}`, {}))), REGISTRY)
    await flush()
    stepFrame(game)

    expect(materials(game).size).toBe(1)
    expect(onlyRun(game).count).toBe(20)
    game.dispose()
  })

  it("writes each frame's UV offset and repeat into its instance by the next rendered frame", async () => {
    const game = makeGame()
    loadScene(game, scene([animatedEntity('Walker', {})]), REGISTRY)
    await flush()
    renderFrame(game)
    // 64×64 fake image, 4×2 grid: 16×32 cells, frame 0 at the top-left.
    expect(defined(instances(game)[0]).uv).toEqual([0.25, 0.5, 0, 0.5])

    for (let step = 0; step < 9; step += 1) stepFrame(game)
    // 0.15 s at 10 fps: frame 1 (second cell of the top row).
    expect(defined(instances(game)[0]).uv).toEqual([0.25, 0.5, 0.25, 0.5])
    game.dispose()
  })

  it('mirrors a flipped sprite through its instance matrix, like its own mesh', async () => {
    const game = makeGame()
    loadScene(game, scene([animatedEntity('Walker', { width: 2 })]), REGISTRY)
    await flush()
    const sprite = defined(defined(game.find('Walker')).get(AnimatedSprite))
    renderFrame(game)
    expect(defined(instances(game)[0]).matrix[0]).toBe(2)

    sprite.setFlipX(true)
    renderFrame(game)
    expect(defined(instances(game)[0]).matrix[0]).toBe(-2)
    game.dispose()
  })

  it("moves to the run of another sheet's key when its frame lands on that sheet", async () => {
    const game = makeGame()
    const extraSheets = [{ texture: '/second.png', cols: 1, rows: 1 }]
    const clips = { both: { frames: [0, 8], fps: 10 } }
    loadScene(game, scene([animatedEntity('Walker', { extraSheets, clips, initialClip: 'both' })]), REGISTRY)
    await flush()
    renderFrame(game)
    const first = defined(instances(game)[0]).map

    for (let step = 0; step < 9; step += 1) stepFrame(game)
    const second = defined(instances(game)[0]).map

    expect(first).not.toBeNull()
    expect(second).not.toBeNull()
    expect(second).not.toBe(first)
    expect(runMeshes(game)).toHaveLength(1)
    game.dispose()
  })
})

describe('instance data matches the per-sprite mesh (CA-3)', () => {
  const variety: SceneEntityJson[] = [
    spriteEntity('Plain', { texture: '/hero.png' }, [-3, 2]),
    spriteEntity('Sized', { texture: '/hero.png', width: 2, height: 3, offsetX: 0.5, offsetY: -0.25 }, [1, 1]),
    spriteEntity('Anchored', { texture: '/hero.png', anchorX: 0, anchorY: 0, layer: 2 }, [2, -1]),
    spriteEntity('Tinted', { color: 0x3366cc, layer: -1 }, [-1, -2]),
    spriteEntity('Ball', { color: 0xcc3366, shape: 'circle', width: 0.5 }, [3, 3]),
    spriteEntity('Pixel', { texture: '/hero.png', pixelArt: true }, [0, -3]),
    animatedEntity('Walker', {}, [-2, 0]),
    animatedEntity('Mirrored', { flipX: true, width: 2, anchorY: 0 }, [4, -2]),
    animatedEntity('Packed', {
      cells: [
        { x: 0, y: 0, width: 16, height: 32 },
        { x: 16, y: 0, width: 8, height: 16 },
      ],
      clips: { walk: { frames: [0, 1], fps: 10 } },
    }, [-4, -3]),
  ]

  for (const render of [{}, { sort: 'y' }, { projection: 'isometric', sort: 'y' }] as const) {
    it(`reproduces matrix, color and UV sprite by sprite under ${JSON.stringify(render)}`, async () => {
      const batched = makeGame()
      const unbatched = makeGame()
      loadScene(batched, scene(variety, render), REGISTRY)
      loadScene(unbatched, scene(variety, { ...render, batch: false }), REGISTRY)
      for (const game of [batched, unbatched]) {
        const rotated = defined(game.find('Sized'))
        rotated.node.rotation.z = 0.3
        rotated.scale.set(1.5, 0.5, 1)
      }
      await flush()
      for (let step = 0; step < 4; step += 1) {
        stepFrame(batched)
        stepFrame(unbatched)
      }
      // The mocked render never updates matrices; three's render would.
      unbatched.scene.updateMatrixWorld()
      unbatched.camera.updateMatrixWorld()

      const drawn = instances(batched)
      const expected = drawnMeshes(unbatched).map((mesh) =>
        meshRecord(unbatched, mesh as THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>),
      )
      expect(drawn).toHaveLength(variety.length)
      expect(expected).toHaveLength(variety.length)
      for (const record of expected) {
        const matches = drawn.filter((instance) => instance.matrix.every((value, i) => value === record.matrix[i]))
        expect(matches).toHaveLength(1)
        const [match] = matches
        expect(defined(match).color).toEqual(record.color)
        expect(defined(match).uv).toEqual(record.uv)
      }
      batched.dispose()
      unbatched.dispose()
    })
  }

  it('keeps runs interleaved with a tilemap and a particle batch exactly where they draw today', async () => {
    const game = makeGame()
    loadScene(
      game,
      scene([
        spriteEntity('Back', { texture: '/hero.png', layer: 0 }),
        spriteEntity('Middle', { texture: '/hero.png', layer: 2 }),
        spriteEntity('Front', { texture: '/hero.png', layer: 4 }),
      ]),
      REGISTRY,
    )
    const tiles = game.spawn('Tiles').add(Tilemap, { layer: 1, mapWidth: 2, mapHeight: 1, cells: [0, 0] })
    const dust = game.spawn('Dust').add(ParticleEmitter, { layer: 3 })
    dust.emit(2)
    await flush()
    const tileMesh = defined(defined(game.find('Tiles')).node.children[0])
    const particleMesh = defined(drawnMeshes(game).find((mesh) => mesh.parent === game.scene && !(mesh instanceof THREE.InstancedMesh) && mesh !== tileMesh))
    let atRender: { runs: number[]; tiles: number; particles: number } | null = null
    ;(globalThis as { onTestRender?: () => void }).onTestRender = () => {
      // View z of each run's only instance tells back (layer 0) from front (layer 4).
      const runs = runMeshes(game)
        .sort((a, b) => a.instanceMatrix.array[14]! - b.instanceMatrix.array[14]!)
        .map((run) => run.renderOrder)
      atRender = { runs, tiles: tileMesh.renderOrder, particles: particleMesh.renderOrder }
    }

    renderFrame(game)

    expect(tiles.layer).toBe(1)
    const seen = defined(atRender as { runs: number[]; tiles: number; particles: number } | null, 'a render')
    const [back, middle, front] = seen.runs
    expect(seen.runs).toHaveLength(3)
    expect(defined(back)).toBeLessThan(seen.tiles)
    expect(seen.tiles).toBeLessThan(defined(middle))
    expect(defined(middle)).toBeLessThan(seen.particles)
    expect(seen.particles).toBeLessThan(defined(front))
    // The pinned order is undone once three has drawn.
    expect(tileMesh.renderOrder).toBe(0)
    expect(particleMesh.renderOrder).toBe(0)
    game.dispose()
  })
})

describe('reusable slots (CA-4)', () => {
  function spawnSprites(game: Game, count: number, prefix: string): void {
    for (let i = 0; i < count; i += 1) game.spawn(`${prefix}${i}`).add(Sprite, { texture: '/hero.png' })
  }

  it('reuses freed slots: spawn 100, destroy 50, spawn 50 keeps the capacity and every GPU object', async () => {
    const game = makeGame()
    spawnSprites(game, 100, 'A')
    await flush()
    renderFrame(game)
    const run = onlyRun(game)
    const geometry = run.geometry
    const before = materials(game)
    expect(run.instanceMatrix.count).toBe(128)

    for (const entity of game.entities.slice(0, 50)) entity.destroy()
    spawnSprites(game, 50, 'B')
    renderFrame(game)

    expect(onlyRun(game)).toBe(run)
    expect(onlyRun(game).geometry).toBe(geometry)
    expect(onlyRun(game).instanceMatrix.count).toBe(128)
    expect(onlyRun(game).count).toBe(100)
    expect(materials(game)).toEqual(before)
    game.dispose()
  })

  it('grows exactly once when a spawn passes the capacity', async () => {
    const game = makeGame()
    spawnSprites(game, 16, 'A')
    await flush()
    renderFrame(game)
    const first = onlyRun(game)
    expect(first.instanceMatrix.count).toBe(16)
    const disposeGeometry = vi.spyOn(first.geometry, 'dispose')

    spawnSprites(game, 1, 'B')
    renderFrame(game)
    const grown = onlyRun(game)
    renderFrame(game)

    expect(grown).not.toBe(first)
    expect(grown.instanceMatrix.count).toBe(32)
    expect(onlyRun(game)).toBe(grown)
    expect(disposeGeometry).toHaveBeenCalledTimes(1)
    game.dispose()
  })

  it('starts every buffer at 16 slots and never shrinks during the scene', async () => {
    const game = makeGame()
    spawnSprites(game, 3, 'A')
    await flush()
    renderFrame(game)
    expect(onlyRun(game).instanceMatrix.count).toBe(16)

    spawnSprites(game, 40, 'B')
    renderFrame(game)
    for (const entity of game.entities.slice(0, 40)) entity.destroy()
    renderFrame(game)

    expect(onlyRun(game).instanceMatrix.count).toBe(64)
    expect(onlyRun(game).count).toBe(3)
    game.dispose()
  })

  for (const release of ['unloadScene', 'dispose'] as const) {
    it(`releases every batch resource at ${release}`, async () => {
      const game = makeGame()
      loadScene(game, scene([spriteEntity('A', { texture: '/hero.png' }), spriteEntity('B', { layer: 1 })]), REGISTRY)
      await flush()
      renderFrame(game)
      const runs = runMeshes(game)
      expect(runs).toHaveLength(2)
      const spies = runs.flatMap((run) => [
        vi.spyOn(run, 'dispose'),
        vi.spyOn(run.geometry, 'dispose'),
        vi.spyOn(basic(run.material), 'dispose'),
      ])
      const map = vi.spyOn(defined(basic(defined(runs[0]).material).map), 'dispose')

      game[release]()

      for (const spy of [...spies, map]) expect(spy).toHaveBeenCalledTimes(1)
      expect(meshes(game)).toEqual([])
      if (release === 'unloadScene') game.dispose()
    })
  }
})

describe('live props (CA-5)', () => {
  it('updates its instance after width, height, offset, anchor, color and layer change', async () => {
    const game = makeGame()
    loadScene(game, scene([spriteEntity('Live', {})]), REGISTRY)
    await flush()
    const sprite = spriteOf(game, 'Live')
    renderFrame(game)
    // Camera at z 10 looking down -z: view z = scene z - 10.
    expect(defined(instances(game)[0]).matrix).toEqual([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, -10, 1])

    sprite.width = 2
    sprite.height = 4
    sprite.offsetX = 1
    sprite.offsetY = -1
    sprite.anchorY = 0
    sprite.color = 0x00ff00
    sprite.layer = 3
    renderFrame(game)

    const live = defined(instances(game)[0])
    // Bottom anchor: the quad's centre sits half its height above offsetY.
    expect(live.matrix).toEqual([2, 0, 0, 0, 0, 4, 0, 0, 0, 0, 1, 0, 1, 1, Math.fround(0.03 - 10), 1])
    expect(live.color).toEqual(linear(0x00ff00))
    game.dispose()
  })

  it('moves to the circle entry when its shape changes', async () => {
    const game = makeGame()
    loadScene(game, scene([spriteEntity('Shape', { color: 0xff0000 })]), REGISTRY)
    await flush()
    renderFrame(game)
    const rectangle = onlyRun(game).geometry.getAttribute('position').count

    spriteOf(game, 'Shape').shape = 'circle'
    renderFrame(game)

    expect(onlyRun(game).geometry.getAttribute('position').count).not.toBe(rectangle)
    expect(defined(instances(game)[0]).color).toEqual(linear(0xff0000))
    game.dispose()
  })
})
