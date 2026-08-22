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

import { authoringDefaults } from '../authoring-defaults'
import { Component, type SolidContact } from '../component'
import { DynamicBody } from './dynamic-body'
import { Tilemap } from './tilemap'
import { Game } from '../game'
import { isYSortParticipant } from '../render-sort'
import { loadScene } from '../scene'

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

function makeGame(): Game {
  const canvas = document.createElement('canvas')
  Object.defineProperties(canvas, {
    clientWidth: { value: 640 },
    clientHeight: { value: 360 },
  })
  document.body.append(canvas)
  return new Game({ canvas })
}

function geometryOf(tilemapEntity: ReturnType<Game['spawn']>) {
  const mesh = tilemapEntity.node.children[0] as import('three').Mesh<import('three').BufferGeometry>
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
  it('loads an inline component and resolves its texture through the registry', () => {
    const game = makeGame()
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
    game.dispose()
  })
})
