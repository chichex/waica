// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const renderer = vi.hoisted(() => ({
  loop: null as ((time: number) => void) | null,
}))

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
    setAnimationLoop(loop: ((time: number) => void) | null): void {
      renderer.loop = loop
    }
    dispose(): void {}
  }
  return { ...actual, WebGLRenderer }
})

import { Component, type SolidContact } from './component'
import { DynamicBody } from './components/dynamic-body'
import { Hitbox } from './components/hitbox'
import { Solid } from './components/solid'
import type { Entity } from './entity'
import { Game } from './game'

class ResizeObserverStub {
  observe(): void {}
  disconnect(): void {}
}

const calls: string[] = []

class Producer extends Component {
  static override componentName = 'Producer'
  override onUpdate(): void {
    calls.push('Producer')
  }
}

class Consumer extends Component {
  static override componentName = 'Consumer'
  static override updateAfter = ['Producer'] as const
  override onUpdate(): void {
    calls.push('Consumer')
  }
}

class AddedDuringTurn extends Component {
  static override componentName = 'AddedDuringTurn'
  override onUpdate(): void {
    calls.push('AddedDuringTurn')
  }
}

class AddsDuringTurn extends Component {
  static override componentName = 'AddsDuringTurn'
  private added = false
  override onUpdate(): void {
    calls.push('AddsDuringTurn')
    if (this.added) return
    this.added = true
    this.entity.add(AddedDuringTurn)
  }
}

class LaterAnchor extends Component {
  static override componentName = 'LaterAnchor'
  override onUpdate(): void {
    calls.push('LaterAnchor')
  }
}

class AddedBeforeLaterTurn extends Component {
  static override componentName = 'AddedBeforeLaterTurn'
  override onUpdate(): void {
    calls.push('AddedBeforeLaterTurn')
  }
}

class AddsToLaterEntity extends Component {
  static override componentName = 'AddsToLaterEntity'
  target!: Entity
  private added = false
  override onUpdate(): void {
    calls.push('AddsToLaterEntity')
    if (this.added) return
    this.added = true
    this.target.add(AddedBeforeLaterTurn)
  }
}

class EntityProbe extends Component {
  static override componentName = 'EntityProbe'
  override onUpdate(): void {
    calls.push(this.entity.name)
  }
}

class BrokenConstraint extends Component {
  static override componentName = 'BrokenConstraint'
  static override updateAfter = ['MissingComponent'] as const
  override onUpdate(): void {
    calls.push('broken must not run')
  }
}

class PassiveMarker extends Component {
  static override componentName = 'PassiveMarker'
}

class FrameLifecycleProbe extends Component {
  static override componentName = 'FrameLifecycleProbe'
  override onUpdate(): void {
    calls.push(`${this.entity.name}:update`)
  }
  override onCollide(other: Entity): void {
    calls.push(`${this.entity.name}:collide:${other.name}`)
  }
}

class EarlierCollisionProbe extends Component {
  static override componentName = 'EarlierCollisionProbe'
  override onCollide(other: Entity): void {
    calls.push(`${this.entity.name}:earlier-collide:${other.name}`)
  }
}

class LifecycleB extends Component {
  static override componentName = 'LifecycleB'
  override onReady(): void {
    calls.push('B:ready')
  }
  override onDestroy(): void {
    calls.push('B:destroy')
  }
}

class LifecycleA extends Component {
  static override componentName = 'LifecycleA'
  override onReady(): void {
    calls.push('A:ready')
  }
  override onDestroy(): void {
    calls.push('A:destroy')
  }
}

class ContactB extends Component {
  static override componentName = 'ContactB'
  override onContact(_contact: SolidContact): void {
    calls.push('B:contact')
  }
}

class ContactA extends Component {
  static override componentName = 'ContactA'
  override onContact(_contact: SolidContact): void {
    calls.push('A:contact')
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

function frame(time = 16): void {
  if (!renderer.loop) throw new Error('Game.start() did not install a frame callback')
  renderer.loop(time)
}

beforeEach(() => {
  calls.length = 0
  renderer.loop = null
  document.body.innerHTML = ''
  vi.stubGlobal('ResizeObserver', ResizeObserverStub)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('Game component update scheduling', () => {
  it('dispatches the resolved schedule instead of component insertion order', () => {
    const game = makeGame()
    const entity = game.spawn('Subject')
    entity.add(Consumer)
    entity.add(Producer)

    game.start()
    frame()

    expect(calls).toEqual(['Producer', 'Consumer'])
    game.dispose()
  })

  it('snapshots each entity at its turn boundary', () => {
    const game = makeGame()
    const current = game.spawn('Current')
    current.add(AddsDuringTurn)
    const later = game.spawn('Later')
    later.add(LaterAnchor)
    const mutator = game.spawn('Mutator')
    // Put the mutator before the later entity without changing the entity API.
    game.entities.splice(game.entities.indexOf(mutator), 1)
    game.entities.unshift(mutator)
    mutator.add(AddsToLaterEntity, { target: later })

    game.start()
    frame()

    expect(calls).toEqual(['AddsToLaterEntity', 'AddsDuringTurn', 'AddedBeforeLaterTurn', 'LaterAnchor'])

    calls.length = 0
    frame(32)
    expect(calls).toEqual([
      'AddsToLaterEntity',
      'AddedDuringTurn',
      'AddsDuringTurn',
      'AddedBeforeLaterTurn',
      'LaterAnchor',
    ])
    game.dispose()
  })

  it('preserves entity order, collision timing, Game.onUpdate, and input end-of-frame', () => {
    const game = makeGame()
    const first = game.spawn('First')
    first.add(Hitbox)
    first.add(EarlierCollisionProbe)
    first.add(FrameLifecycleProbe)
    const second = game.spawn('Second')
    second.add(Hitbox)
    second.add(FrameLifecycleProbe)
    game.onUpdate(() => calls.push('Game.onUpdate'))
    vi.spyOn(game.input, 'endFrame').mockImplementation(() => calls.push('input.endFrame'))

    game.start()
    frame()

    expect(calls).toEqual([
      'First:update',
      'Second:update',
      'First:earlier-collide:Second',
      'First:collide:Second',
      'Second:collide:First',
      'Game.onUpdate',
      'input.endFrame',
    ])
    game.dispose()
  })

  it('keeps onReady and onDestroy in component insertion order', () => {
    const game = makeGame()
    const entity = game.spawn('Lifecycle')

    entity.add(LifecycleB)
    entity.add(LifecycleA)
    entity.destroy()

    expect(calls).toEqual(['B:ready', 'A:ready', 'B:destroy', 'A:destroy'])
    game.dispose()
  })

  it('keeps onContact dispatch in component insertion order', () => {
    const game = makeGame()
    const mover = game.spawn('Mover')
    mover.add(ContactB)
    mover.add(ContactA)
    const body = mover.add(DynamicBody)
    const wall = game.spawn('Wall')
    wall.add(Solid)

    body.onUpdate(0)

    expect(calls).toEqual(['B:contact', 'A:contact'])
    game.dispose()
  })

  it('fails one invalid entity closed, isolates its neighbors, and diagnoses only composition changes', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    const game = makeGame()
    game.spawn('Before').add(EntityProbe)
    const broken = game.spawn('Broken entity')
    broken.add(EntityProbe)
    broken.add(BrokenConstraint)
    game.spawn('After').add(EntityProbe)

    game.start()
    frame()
    frame(32)

    expect(calls).toEqual(['Before', 'After', 'Before', 'After'])
    expect(error).toHaveBeenCalledOnce()
    expect(error.mock.calls[0]?.[0]).toMatch(/Broken entity.*BrokenConstraint.*MissingComponent/)

    broken.add(PassiveMarker)
    frame(48)

    expect(calls.slice(-2)).toEqual(['Before', 'After'])
    expect(error).toHaveBeenCalledTimes(2)
    error.mockRestore()
    game.dispose()
  })
})
