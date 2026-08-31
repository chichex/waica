// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// @waica/engine resolves its own nested `three` copy, so the mock has to
// target that exact module (bare-specifier `vi.mock('three', ...)` only
// intercepts this test file's own resolution) — same technique as
// examples/isometric/src/demo-combat.test.ts.
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

import { Game, Solid, Tilemap } from '@waica/engine'
import { buildNavigationGrid } from './navigation-grid'

class ResizeObserverStub {
  observe(): void {}
  disconnect(): void {}
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

beforeEach(() => {
  document.body.innerHTML = ''
  vi.stubGlobal('ResizeObserver', ResizeObserverStub)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('buildNavigationGrid — Tilemap alignment (CA-2)', () => {
  it('aligns to the Tilemap and marks its solid tiles unwalkable', () => {
    const game = makeGame()
    const ground = game.spawn('Ground')
    ground.position.set(0, 0, 0)
    ground.add(Tilemap, {
      texture: '',
      cols: 1,
      rows: 1,
      cellWidth: 16,
      cellHeight: 16,
      mapWidth: 4,
      mapHeight: 4,
      cellSize: 1,
      cells: [0, 0, 0, 0, 0, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      solidTiles: [1],
    })

    const grid = buildNavigationGrid(game, [{ x: 0.5, y: 0.5 }])

    expect(grid.columns).toBe(4)
    expect(grid.rows).toBe(4)
    // Row 1 (index 4..7 in `cells`) has solid tiles at columns 1 and 2.
    expect(grid.isWalkable({ column: 1, row: 1 })).toBe(false)
    expect(grid.isWalkable({ column: 2, row: 1 })).toBe(false)
    expect(grid.isWalkable({ column: 0, row: 1 })).toBe(true)
    expect(grid.isWalkable({ column: 0, row: 0 })).toBe(true)
    game.dispose()
  })

  it('also blocks cells covered by an entity Solid, on top of the Tilemap', () => {
    const game = makeGame()
    const ground = game.spawn('Ground')
    ground.position.set(0, 0, 0)
    ground.add(Tilemap, {
      texture: '',
      cols: 1,
      rows: 1,
      cellWidth: 16,
      cellHeight: 16,
      mapWidth: 4,
      mapHeight: 4,
      cellSize: 1,
      cells: new Array(16).fill(0),
      solidTiles: [],
    })
    const rock = game.spawn('Rock')
    rock.position.set(2.5, 2.5, 0)
    rock.add(Solid, { width: 0.8, height: 0.8 })

    const grid = buildNavigationGrid(game, [{ x: 0.5, y: 0.5 }])

    expect(grid.isWalkable({ column: 2, row: 2 })).toBe(false)
    expect(grid.isWalkable({ column: 0, row: 0 })).toBe(true)
    game.dispose()
  })

  it('excludes the mover’s own entity from the blocking Solids', () => {
    const game = makeGame()
    const ground = game.spawn('Ground')
    ground.position.set(0, 0, 0)
    ground.add(Tilemap, {
      texture: '',
      cols: 1,
      rows: 1,
      cellWidth: 16,
      cellHeight: 16,
      mapWidth: 4,
      mapHeight: 4,
      cellSize: 1,
      cells: new Array(16).fill(0),
      solidTiles: [],
    })
    const mover = game.spawn('Mover')
    mover.position.set(1.5, 1.5, 0)
    mover.add(Solid, { width: 0.8, height: 0.8 })

    const grid = buildNavigationGrid(game, [{ x: 1.5, y: 1.5 }], mover)

    expect(grid.isWalkable({ column: 1, row: 1 })).toBe(true)
    game.dispose()
  })

  it('resolves cell centers and cell-at through the same spec the Tilemap uses', () => {
    const game = makeGame()
    const ground = game.spawn('Ground')
    ground.position.set(0, 0, 0)
    ground.add(Tilemap, {
      texture: '',
      cols: 1,
      rows: 1,
      cellWidth: 16,
      cellHeight: 16,
      mapWidth: 4,
      mapHeight: 4,
      cellSize: 1,
      cells: new Array(16).fill(0),
      solidTiles: [],
    })

    const grid = buildNavigationGrid(game, [{ x: 0.5, y: 0.5 }])

    expect(grid.cellAt({ x: 2.2, y: 1.9 })).toEqual({ column: 2, row: 1 })
    expect(grid.cellCenter({ column: 2, row: 1 })).toEqual({ x: 2.5, y: 1.5 })
    game.dispose()
  })
})

describe('buildNavigationGrid — AABB fallback without a Tilemap (CA-2)', () => {
  it('covers the AABB of the supplied points and every Solid, with a 1-cell margin', () => {
    const game = makeGame()
    const wall = game.spawn('Wall')
    wall.position.set(5, 0, 0)
    wall.add(Solid, { width: 1, height: 1 })

    const grid = buildNavigationGrid(game, [
      { x: 0, y: 0 },
      { x: 3, y: 2 },
    ])

    // AABB of points (0,0)-(3,2) and the wall's bounds (4.5..5.5, -0.5..0.5),
    // expanded by a 1-cell margin on every side.
    expect(grid.spec.originX).toBeLessThanOrEqual(-1)
    expect(grid.spec.originY).toBeLessThanOrEqual(-1.5)
    expect(grid.columns).toBeGreaterThanOrEqual(7)
    game.dispose()
  })

  it('blocks the cell a Solid overlaps, in AABB mode', () => {
    const game = makeGame()
    const crate = game.spawn('Crate')
    crate.position.set(1.5, 1.5, 0)
    crate.add(Solid, { width: 0.8, height: 0.8 })

    const grid = buildNavigationGrid(game, [
      { x: 0.5, y: 0.5 },
      { x: 2.5, y: 2.5 },
    ])

    const blockedCell = grid.cellAt({ x: 1.5, y: 1.5 })
    expect(blockedCell).not.toBeNull()
    expect(grid.isWalkable(blockedCell!)).toBe(false)
    const openCell = grid.cellAt({ x: 0.5, y: 0.5 })
    expect(grid.isWalkable(openCell!)).toBe(true)
    game.dispose()
  })
})
