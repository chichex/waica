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

import { dispatchCollisions } from './collision-dispatch.js'
import { Component, type Entity } from './index.js'
import { Hitbox } from './components/hitbox.js'
import { Game } from './game.js'

class ResizeObserverStub {
  observe(): void {}
  disconnect(): void {}
}

class CollisionProbe extends Component {
  label = ''
  log: string[] = []
  action?: (other: Entity) => void

  override onCollide(other: Entity): void {
    this.log.push(`${this.label}->${other.name}`)
    this.action?.(other)
  }
}

class EnableEnemyMaskOnUpdate extends Component {
  static override componentName = 'EnableEnemyMaskOnUpdate'
  override onUpdate(): void {
    this.entity.get(Hitbox)?.collidesWith.push('enemy')
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

function spawnBox(
  game: Game,
  name: string,
  properties: Partial<Hitbox> = {},
  x = 0,
): { entity: Entity; hitbox: Hitbox; probe: CollisionProbe } {
  const entity = game.spawn(name)
  entity.position.x = x
  const hitbox = entity.add(Hitbox, properties)
  const probe = entity.add(CollisionProbe, { label: name })
  return { entity, hitbox, probe }
}

beforeEach(() => {
  document.body.innerHTML = ''
  vi.stubGlobal('ResizeObserver', ResizeObserverStub)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('directional collision dispatch', () => {
  it('runs narrowphase when either side is interested and notifies only interested sides', () => {
    const game = makeGame()
    const player = spawnBox(game, 'Player', { layer: 'player', collidesWith: ['enemy'] })
    const enemy = spawnBox(game, 'Enemy', { layer: 'enemy', collidesWith: [] })

    const stats = dispatchCollisions(game)

    expect(stats).toEqual({ candidatePairs: 1, narrowphaseCalls: 1 })
    expect(player.probe.log).toEqual(['Player->Enemy'])
    expect(enemy.probe.log).toEqual([])

    player.probe.log.length = 0
    player.hitbox.collidesWith = []
    enemy.hitbox.collidesWith = ['player']
    dispatchCollisions(game)
    expect(player.probe.log).toEqual([])
    expect(enemy.probe.log).toEqual(['Enemy->Player'])

    enemy.probe.log.length = 0
    player.hitbox.collidesWith = ['enemy']
    dispatchCollisions(game)
    expect(player.probe.log).toEqual(['Player->Enemy'])
    expect(enemy.probe.log).toEqual(['Enemy->Player'])
    game.dispose()
  })

  it('rejects incompatible masks before exact geometry and reports no callback without overlap', () => {
    const game = makeGame()
    const first = spawnBox(game, 'First', {
      layer: 'collectible',
      collidesWith: ['player'],
      width: 0.1,
      height: 0.1,
    }, 0.1)
    const second = spawnBox(game, 'Second', {
      layer: 'enemy',
      collidesWith: ['projectile'],
      width: 0.1,
      height: 0.1,
    }, 0.8)

    expect(dispatchCollisions(game)).toEqual({ candidatePairs: 1, narrowphaseCalls: 0 })
    expect(first.probe.log).toEqual([])
    expect(second.probe.log).toEqual([])

    first.hitbox.collidesWith = ['enemy']
    expect(dispatchCollisions(game)).toEqual({ candidatePairs: 1, narrowphaseCalls: 1 })
    expect(first.probe.log).toEqual([])
    expect(second.probe.log).toEqual([])
    game.dispose()
  })

  it('lets an invalid-layer Hitbox express valid outgoing interest but never be targeted', () => {
    const game = makeGame()
    const invalid = spawnBox(game, 'Invalid', {
      layer: 'Enemy',
      collidesWith: ['enemy'],
    })
    const enemy = spawnBox(game, 'Enemy', {
      layer: 'enemy',
      collidesWith: ['*'],
    })

    expect(dispatchCollisions(game).narrowphaseCalls).toBe(1)
    expect(invalid.probe.log).toEqual(['Invalid->Enemy'])
    expect(enemy.probe.log).toEqual([])
    game.dispose()
  })

  it('restores canonical pair and component insertion order', () => {
    const game = makeGame()
    const log: string[] = []
    const entities = ['A', 'B', 'C'].map((name) => {
      const entity = game.spawn(name)
      entity.add(Hitbox)
      entity.add(CollisionProbe, { label: `${name}1`, log })
      entity.add(CollisionProbe, { label: `${name}2`, log })
      return entity
    })

    dispatchCollisions(game)

    expect(log).toEqual([
      'A1->B', 'A2->B', 'B1->A', 'B2->A',
      'A1->C', 'A2->C', 'C1->A', 'C2->A',
      'B1->C', 'B2->C', 'C1->B', 'C2->B',
    ])
    expect(entities.every((entity) => entity.alive)).toBe(true)
    game.dispose()
  })

  it('finishes the first-side component snapshot before liveness suppresses the second side', () => {
    const game = makeGame()
    const log: string[] = []
    const first = game.spawn('First')
    first.add(Hitbox)
    first.add(CollisionProbe, {
      label: 'destroyer',
      log,
      action: (other) => other.destroy(),
    })
    first.add(CollisionProbe, { label: 'after-destroy', log })
    const second = game.spawn('Second')
    second.add(Hitbox)
    second.add(CollisionProbe, { label: 'second', log })

    dispatchCollisions(game)

    expect(log).toEqual(['destroyer->Second', 'after-destroy->Second'])
    expect(second.alive).toBe(false)
    game.dispose()
  })

  it('freezes current-pair interest while in-place mutation controls later canonical pairs', () => {
    const game = makeGame()
    const log: string[] = []
    const a = spawnBox(game, 'A', { layer: 'a', collidesWith: ['b'] })
    const b = spawnBox(game, 'B', { layer: 'b', collidesWith: ['a'] })
    const c = spawnBox(game, 'C', { layer: 'c', collidesWith: [] })
    a.probe.log = log
    b.probe.log = log
    c.probe.log = log
    a.probe.action = (other) => {
      if (other !== b.entity) return
      b.hitbox.collidesWith.splice(0)
      a.hitbox.collidesWith.push('c')
    }

    dispatchCollisions(game)

    expect(log).toEqual(['A->B', 'B->A', 'A->C'])
    game.dispose()
  })

  it('observes an in-place mask mutation from onUpdate in the same Simulation Step', () => {
    const game = makeGame()
    const player = spawnBox(game, 'Player', { layer: 'player', collidesWith: [] })
    const enemy = spawnBox(game, 'Enemy', { layer: 'enemy', collidesWith: [] })
    player.entity.add(EnableEnemyMaskOnUpdate)

    ;(game as unknown as { simulateStep(): void }).simulateStep()

    expect(player.probe.log).toEqual(['Player->Enemy'])
    expect(enemy.probe.log).toEqual([])
    game.dispose()
  })
})
