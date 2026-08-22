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

import type { CameraVelocity, CameraVelocityProvider } from './camera'
import { Component } from './component'
import { DynamicBody } from './components/dynamic-body'
import { Solid } from './components/solid'
import { Sprite } from './components/sprite'
import { Game } from './game'
import { projectIsometric } from './projection'
import { loadScene, type SceneRegistry } from './scene'

class ResizeObserverStub {
  observe(): void {}
  disconnect(): void {}
}

class VelocityProbe extends Component implements CameraVelocityProvider {
  vx = 0
  vy = 0
  getCameraVelocity(): CameraVelocity {
    return { vx: this.vx, vy: this.vy }
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

function step(game: Game, dt = 1 / 60): void {
  ;(game as unknown as { runFrame(value: number): void }).runFrame(dt)
}

beforeEach(() => {
  document.body.innerHTML = ''
  vi.stubGlobal('ResizeObserver', ResizeObserverStub)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('projected entity render seam', () => {
  it('keeps scene positions logical and projects every frame without touching node z', () => {
    const game = makeGame()
    loadScene(
      game,
      {
        waicaScene: 3,
        render: { projection: 'isometric' },
        entities: [{ name: 'Projected', position: [2, 1] }],
      },
      { components: {} },
    )
    const entity = game.find('Projected')!
    entity.node.position.z = 7

    step(game)

    expect(game.projection).toBe('isometric')
    expect(entity.position).not.toBe(entity.node.position)
    expect(entity.position.toArray()).toEqual([2, 1, 0])
    expect(entity.node.position.toArray()).toEqual([1, -1.5, 7])

    entity.position.set(0, 0, 0)
    step(game)
    expect(entity.node.position.toArray()).toEqual([0, 0, 7])
    game.dispose()
  })

  it('converts existing entities in place when projection mode changes', () => {
    const game = makeGame()
    const entity = game.spawn('Existing')
    entity.position.set(3, -2, 4)

    game.setSceneRender({ projection: 'isometric' })

    expect(entity.position).not.toBe(entity.node.position)
    expect(entity.position.toArray()).toEqual([3, -2, 4])
    step(game)
    expect(entity.node.position.toArray()).toEqual([5, -0.5, 4])

    game.setSceneRender()
    expect(game.projection).toBeNull()
    expect(entity.position).toBe(entity.node.position)
    expect(entity.position.toArray()).toEqual([3, -2, 4])
    game.dispose()
  })
})

describe('projected y-sort', () => {
  const registry: SceneRegistry = { components: { Sprite } }
  const zOf = (game: Game, name: string): number =>
    game.find(name)!.node.children[0]!.position.z

  it('sorts on render-space Y after projection and flips after logical positions swap', () => {
    const game = makeGame()
    loadScene(
      game,
      {
        waicaScene: 3,
        render: { projection: 'isometric', sort: 'y' },
        entities: [
          { name: 'Origin', position: [0, 0], components: [{ type: 'Sprite' }] },
          { name: 'Lower', position: [1, 1], components: [{ type: 'Sprite' }] },
        ],
      },
      registry,
    )

    step(game)
    expect(game.find('Lower')!.node.position.y).toBe(-1)
    expect(zOf(game, 'Lower')).toBeGreaterThan(zOf(game, 'Origin'))

    game.find('Origin')!.position.set(1, 1, 0)
    game.find('Lower')!.position.set(0, 0, 0)
    step(game)
    expect(zOf(game, 'Origin')).toBeGreaterThan(zOf(game, 'Lower'))
    game.dispose()
  })
})

describe('projection-invariant simulation', () => {
  function trajectory(
    projected: boolean,
    walls: Array<{ x: number; y: number; width: number; height: number }>,
    velocity: { x: number; y: number },
  ): Array<[number, number]> {
    const game = makeGame()
    if (projected) game.setSceneRender({ projection: 'isometric' })
    const mover = game.spawn('Mover')
    const body = mover.add(DynamicBody, { vx: velocity.x, vy: velocity.y })
    walls.forEach((wall, index) => {
      const entity = game.spawn(`Wall-${index}`)
      entity.position.set(wall.x, wall.y, 0)
      entity.add(Solid, { width: wall.width, height: wall.height })
    })
    const result: Array<[number, number]> = []
    for (let frame = 0; frame < 8; frame++) {
      body.onUpdate(0.25)
      result.push([mover.position.x, mover.position.y])
    }
    game.dispose()
    return result
  }

  it('produces identical logical trajectories at a face and while sliding along a wall', () => {
    const faceWalls = [{ x: 2, y: 0, width: 1, height: 3 }]
    const identityFace = trajectory(false, faceWalls, { x: 2, y: 0 })
    const projectedFace = trajectory(true, faceWalls, { x: 2, y: 0 })
    expect(projectedFace).toEqual(identityFace)
    expect(identityFace.at(-1)?.[0]).toBeCloseTo(1, 3)

    const longWall = [
      { x: 2, y: 0, width: 1, height: 1 },
      { x: 2, y: 1, width: 1, height: 1 },
    ]
    const identitySlide = trajectory(false, longWall, { x: 2, y: 1 })
    const projectedSlide = trajectory(true, longWall, { x: 2, y: 1 })
    expect(projectedSlide).toEqual(identitySlide)
    expect(identitySlide.at(-1)?.[0]).toBeCloseTo(1, 3)
    expect(identitySlide.at(-1)?.[1]).toBeGreaterThan(1)
  })
})

describe('projected camera', () => {
  function cameraRun(projected: boolean): Array<[number, number]> {
    const game = makeGame()
    if (projected) game.setSceneRender({ projection: 'isometric' })
    const target = game.spawn('Player')
    const logicalTarget = { x: 3, y: 1 }
    const logicalVelocity = { x: 4, y: 2 }
    const targetPoint = projected
      ? logicalTarget
      : projectIsometric(logicalTarget.x, logicalTarget.y)
    const velocity = projected
      ? logicalVelocity
      : projectIsometric(logicalVelocity.x, logicalVelocity.y)
    target.position.set(targetPoint.x, targetPoint.y, 0)
    target.add(VelocityProbe, { vx: velocity.x, vy: velocity.y })
    game.setSceneCamera({
      follow: 'Player',
      deadzoneWidth: 0,
      deadzoneHeight: 0,
      lookahead: 2,
      lookaheadY: 2,
      smoothing: 8,
    })
    const centers: Array<[number, number]> = [[game.camera.position.x, game.camera.position.y]]
    for (let frame = 0; frame < 5; frame++) {
      ;(game as unknown as { updateSceneCamera(dt: number): void }).updateSceneCamera(0.1)
      centers.push([game.camera.position.x, game.camera.position.y])
    }
    game.dispose()
    return centers
  }

  it('matches an identity camera fed the projected target and velocity', () => {
    expect(cameraRun(true)).toEqual(cameraRun(false))
  })
})
