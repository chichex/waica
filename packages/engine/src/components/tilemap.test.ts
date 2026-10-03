// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('three/webgpu', async (importOriginal) =>
  (await import('../test-renderer.js')).withFakeRenderer(await importOriginal()),
)

import * as THREE from 'three'
import { FakeTextureBackend, flush } from '../assets/test-helpers'
import { authoringDefaults } from '../authoring-defaults'
import { Component, type SolidContact } from '../component'
import { DynamicBody } from './dynamic-body'
import { Tilemap } from './tilemap'
import { Game } from '../game'
import { isYSortParticipant } from '../render-sort'
import { loadScene } from '../scene'
import { defined } from '../test-support'

class ResizeObserverStub {
  observe(): void {}
  disconnect(): void {}
}

class ContactProbe extends Component {
  readonly contacts: SolidContact[] = []
  override onContact(contact: SolidContact): void {
    this.contacts.push(contact)
  }
}

function makeGame(textures?: FakeTextureBackend): Game {
  const canvas = document.createElement('canvas')
  Object.defineProperties(canvas, {
    clientWidth: { value: 640 },
    clientHeight: { value: 360 },
  })
  document.body.append(canvas)
  return new Game(textures ? { canvas, textures } : { canvas })
}

function geometryOf(tilemapEntity: ReturnType<Game['spawn']>) {
  const mesh = tilemapEntity.node.children[0] as THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>
  const positions = [...mesh.geometry.getAttribute('position').array]
  const uvs = [...mesh.geometry.getAttribute('uv').array]
  return { mesh, positions, uvs }
}

beforeEach(() => {
  document.body.innerHTML = ''
  vi.stubGlobal('ResizeObserver', ResizeObserverStub)
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('Tilemap authoring surface', () => {
  it('lists exactly the flat authorable props and stays outside y-sort', () => {
    expect(authoringDefaults(Tilemap)).toEqual({
      texture: '',
      color: 0xffffff,
      cols: 1,
      rows: 1,
      gridOffsetX: 0,
      gridOffsetY: 0,
      spacingX: 0,
      spacingY: 0,
      cellWidth: 0,
      cellHeight: 0,
      pixelArt: true,
      mapWidth: 1,
      mapHeight: 1,
      cellSize: 1,
      cells: [],
      solidTiles: [],
      layer: 0,
    })
    expect(isYSortParticipant(new Tilemap())).toBe(false)
  })
})

describe('Tilemap merged rendering', () => {
  const layerZ = Math.fround(0.03)

  it.each([
    {
      name: 'identity',
      projection: undefined,
      positions: [0, 0, layerZ, 1, 0, layerZ, 1, 1, layerZ, 0, 1, layerZ],
    },
    {
      name: 'isometric',
      projection: 'isometric' as const,
      positions: [-1, -1, layerZ, 1, -1, layerZ, 1, 0, layerZ, -1, 0, layerZ],
    },
  ])('builds one exact quad for a 2x1 map in $name mode', ({ projection, positions }) => {
    const game = makeGame()
    if (projection) game.setSceneRender({ projection })
    const entity = game.spawn('Map')
    const tilemap = entity.add(Tilemap, {
      cols: 2,
      rows: 1,
      mapWidth: 2,
      mapHeight: 1,
      cells: [1, -1],
      layer: 3,
    })

    const geometry = geometryOf(entity)
    expect(geometry.positions).toEqual(positions)
    expect(geometry.uvs).toEqual([0.5, 0, 1, 0, 1, 1, 0.5, 1])
    expect(geometry.mesh.geometry.getIndex()?.array).toEqual(new Uint32Array([0, 1, 2, 0, 2, 3]))

    tilemap.cells = [-1, 0]
    expect(geometryOf(entity).positions).toHaveLength(12)
    expect(geometryOf(entity).positions.slice(0, 2)).toEqual(
      projection ? [0, -1.5] : [1, 0],
    )
    game.dispose()
  })

  it('rebuilds existing geometry when projection mode changes', () => {
    const game = makeGame()
    const entity = game.spawn('Map')
    entity.add(Tilemap, { mapWidth: 1, mapHeight: 1, cells: [0] })

    expect(geometryOf(entity).positions.slice(0, 2)).toEqual([0, 0])

    game.setSceneRender({ projection: 'isometric' })
    expect(geometryOf(entity).positions.slice(0, 2)).toEqual([-1, -1])

    game.setSceneRender()
    expect(geometryOf(entity).positions.slice(0, 2)).toEqual([0, 0])
    game.dispose()
  })

  it('empty-pads short cell arrays and ignores values past the map area', () => {
    const game = makeGame()
    const entity = game.spawn('Map')
    const tilemap = entity.add(Tilemap, {
      mapWidth: 2,
      mapHeight: 2,
      cells: [0, -1, 0, -1, 0, 0],
    })

    expect(geometryOf(entity).positions).toHaveLength(8 * 3)
    tilemap.cells = [0]
    expect(geometryOf(entity).positions).toHaveLength(4 * 3)
    game.dispose()
  })
})

describe('Tilemap derived collision', () => {
  it('rebuilds one owner-bound Solid per solid tile', () => {
    const game = makeGame()
    const entity = game.spawn('Map')
    entity.position.set(5, -2, 0)
    const tilemap = entity.add(Tilemap, {
      mapWidth: 2,
      mapHeight: 1,
      cellSize: 2,
      cells: [3, 4],
      solidTiles: [4],
    })

    expect(tilemap.solids()).toHaveLength(1)
    expect(tilemap.solids()[0]).toMatchObject({
      entity,
      width: 2,
      height: 2,
      offsetX: 3,
      offsetY: 1,
    })
    expect(tilemap.solids()[0]?.left).toBe(7)
    expect(tilemap.solids()[0]?.right).toBe(9)

    tilemap.solidTiles = [3, 4]
    expect(tilemap.solids()).toHaveLength(2)
    game.dispose()
  })

  it('stops a DynamicBody flush, slides along adjacent cells and reports the Tilemap entity', () => {
    const game = makeGame()
    const mapEntity = game.spawn('Map')
    mapEntity.position.set(2, 0, 0)
    mapEntity.add(Tilemap, {
      mapWidth: 1,
      mapHeight: 2,
      cells: [0, 0],
      solidTiles: [0],
    })
    const mover = game.spawn('Mover')
    mover.position.set(0, 0.5, 0)
    const body = mover.add(DynamicBody, { vx: 10, vy: 4 })
    const probe = mover.add(ContactProbe)

    body.onUpdate(0.2)

    expect(mover.position.x).toBeCloseTo(1.5, 3)
    expect(mover.position.y).toBeCloseTo(1.3, 3)
    expect(probe.contacts[0]?.entity).toBe(mapEntity)
    expect(probe.contacts[0]?.solid).toBe(mapEntity.get(Tilemap)?.solids()[0])
    game.dispose()
  })
})

describe('Tilemap scene loading', () => {
  it('loads an inline component and resolves its texture through the registry', async () => {
    const backend = new FakeTextureBackend()
    const game = makeGame(backend)
    loadScene(
      game,
      {
        waicaScene: 3,
        entities: [
          {
            name: 'Map',
            components: [
              {
                type: 'Tilemap',
                props: { texture: 'waica:tiles', mapWidth: 1, mapHeight: 1, cells: [0] },
              },
            ],
          },
        ],
      },
      {
        components: { Tilemap },
        resolveAsset: (uri) => (uri === 'waica:tiles' ? '/tiles.png' : uri),
      },
    )

    expect(game.find('Map')?.get(Tilemap)?.texture).toBe('/tiles.png')
    // The component asks game.assets for exactly what resolveProps gave it (CA-2).
    await game.assets.ready()
    expect(backend.loadCalls).toEqual(['/tiles.png'])
    game.dispose()
  })
})

describe('Tilemap textures through game.assets (CA-5)', () => {
  /** A 2x1 tileset with a 2 px gap: the UVs only come out right once the image's pixel size is known. */
  const spaced = { cols: 2, rows: 1, spacingX: 2, mapWidth: 1, mapHeight: 1, cells: [0] }

  it('rebuilds its geometry from the image size once its texture settles, on a cache hit too', async () => {
    const backend = new FakeTextureBackend()
    backend.imageSize('/tiles.png', 64, 32)
    const game = makeGame(backend)
    const first = game.spawn('Map')
    first.add(Tilemap, { ...spaced, texture: '/tiles.png' })
    // Before the image: cell width from `cols` alone, the whole half.
    expect(geometryOf(first).uvs.slice(0, 4)).toEqual([0, 0, 0.5, 0])

    await game.assets.ready()
    // 64 px wide, 2 px gap, 2 columns: a 31 px cell.
    expect(geometryOf(first).uvs.slice(0, 4)).toEqual([0, 0, 31 / 64, 0])
    expect(backend.loadCalls).toEqual(['/tiles.png'])

    const second = game.spawn('Map-2')
    second.add(Tilemap, { ...spaced, texture: '/tiles.png' })
    await flush()
    expect(backend.loadCalls).toEqual(['/tiles.png'])
    expect(geometryOf(second).uvs.slice(0, 4)).toEqual([0, 0, 31 / 64, 0])
    game.dispose()
  })

  it('ignores a settlement for a texture that is no longer the current one', async () => {
    const backend = new FakeTextureBackend()
    backend.imageSize('/old.png', 64, 32)
    backend.imageSize('/new.png', 128, 32)
    backend.hold('/old.png')
    const game = makeGame(backend)
    const entity = game.spawn('Map')
    const tilemap = entity.add(Tilemap, { ...spaced, texture: '/old.png' })

    tilemap.texture = '/new.png'
    await flush()
    expect(geometryOf(entity).uvs.slice(0, 4)).toEqual([0, 0, 63 / 128, 0])

    backend.release('/old.png')
    await game.assets.ready()
    expect(geometryOf(entity).uvs.slice(0, 4)).toEqual([0, 0, 63 / 128, 0])
    game.dispose()
  })

  it('rebuildMaterial and onDestroy dispose only their own clone, never the cached base', async () => {
    const backend = new FakeTextureBackend()
    const game = makeGame(backend)
    const entity = game.spawn('Map')
    const tilemap = entity.add(Tilemap, { ...spaced, texture: '/tiles.png' })
    await game.assets.ready()
    const firstClone = geometryOf(entity).mesh.material.map
    expect(firstClone).toBeInstanceOf(THREE.Texture)
    const dispose = vi.spyOn(THREE.Texture.prototype, 'dispose')

    tilemap.pixelArt = false
    expect(dispose.mock.instances).toEqual([firstClone])
    const secondClone = geometryOf(entity).mesh.material.map
    expect(secondClone).not.toBe(firstClone)
    expect(secondClone?.source).toBe(firstClone?.source)

    entity.destroy()
    expect(dispose.mock.instances).toEqual([firstClone, secondClone])
    expect(game.assets.status).toEqual({ pending: 0, loaded: 1, failed: 0 })
    game.dispose()
  })
})

describe('Tilemap failure rule (CA-4)', () => {
  const spaced = { cols: 2, rows: 1, spacingX: 2, mapWidth: 1, mapHeight: 1, cells: [0] }

  it('drops a texture that fails to load and renders its flat colour again', async () => {
    const backend = new FakeTextureBackend()
    backend.failUrl('/missing.png')
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const game = makeGame(backend)
    const entity = game.spawn('Map')
    entity.add(Tilemap, { ...spaced, texture: '/missing.png', color: 0x336699 })
    const { mesh } = geometryOf(entity)
    const clone = mesh.material.map
    expect(clone).toBeInstanceOf(THREE.Texture)
    const cloneDispose = vi.spyOn(defined(clone), 'dispose')
    const versionBefore = mesh.material.version
    expect(mesh.material.color.getHex()).toBe(0xffffff)

    await game.assets.ready()

    expect(mesh.material.map).toBeNull()
    expect(cloneDispose).toHaveBeenCalledTimes(1)
    expect(mesh.material.color.getHex()).toBe(0x336699)
    expect(mesh.material.version).toBeGreaterThan(versionBefore)
    // The clone is gone from the component, so destroying it disposes nothing twice.
    entity.destroy()
    expect(cloneDispose).toHaveBeenCalledTimes(1)
    expect(game.assets.status).toEqual({ pending: 0, loaded: 0, failed: 1 })
    game.dispose()
  })

  it('ignores a failure for a texture that is no longer the current one', async () => {
    const backend = new FakeTextureBackend()
    backend.hold('/old.png')
    backend.failUrl('/old.png')
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const game = makeGame(backend)
    const entity = game.spawn('Map')
    const tilemap = entity.add(Tilemap, { ...spaced, texture: '/old.png', color: 0x336699 })

    tilemap.texture = '/new.png'
    await flush()
    const current = geometryOf(entity).mesh.material.map
    expect(current).toBeInstanceOf(THREE.Texture)

    backend.release('/old.png')
    await game.assets.ready()

    const { mesh } = geometryOf(entity)
    expect(mesh.material.map).toBe(current)
    expect(mesh.material.color.getHex()).toBe(0xffffff)
    game.dispose()
  })
})
