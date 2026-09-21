// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, expectTypeOf, it, vi } from 'vitest'

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

import { Game } from './game'
import type { AnchoredPieceHandle } from './anchored-pieces'
import {
  Game as EntryGame,
  GameUi,
  type AnchoredPieceHandle as EntryHandle,
  type AttachOptions,
  type RuntimeSnapshot,
  type RuntimeSnapshotUi,
} from './index'
import type { StatValue } from './stats'

class ResizeObserverStub {
  observe(): void {}
  disconnect(): void {}
}

/** A Game on an 800×600 canvas inside its own host element (the overlay's parent). */
function makeGame(stats: Record<string, StatValue> = {}): { game: Game; host: HTMLElement } {
  const host = document.createElement('div')
  const canvas = document.createElement('canvas')
  Object.defineProperties(canvas, {
    clientWidth: { value: 800 },
    clientHeight: { value: 600 },
  })
  host.append(canvas)
  document.body.append(host)
  return { game: new Game({ canvas, stats }), host }
}

/** The instance's shadow host: where its position and custom properties live. */
function shadowHost(handle: AnchoredPieceHandle): HTMLElement {
  return (handle.element!.getRootNode() as ShadowRoot).host as HTMLElement
}

/** Rendered text of a piece root, ignoring <style>/<script>. */
function text(root: HTMLElement | null): string {
  if (!root) return ''
  const clone = root.cloneNode(true) as HTMLElement
  for (const tag of clone.querySelectorAll('style, script')) tag.remove()
  return clone.textContent?.trim() ?? ''
}

/** The overlay GameUi mounted on the host, if any (the canvas is the host's first child). */
function overlayOf(host: HTMLElement): HTMLElement | null {
  return host.children.length > 1 ? (host.lastElementChild as HTMLElement) : null
}

beforeEach(() => {
  document.body.innerHTML = ''
  vi.stubGlobal('ResizeObserver', ResizeObserverStub)
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('game.ui.attach — independent instances (CA-1)', () => {
  it('creates a new instance per call: two handles, two shadow roots, two DOM subtrees', () => {
    const { game } = makeGame()
    game.ui.define('hp', '<div class="hp">hp</div>')
    const orc = game.spawn('Orc')

    const first = game.ui.attach('hp', orc)
    const second = game.ui.attach('hp', orc)

    expect(first.alive).toBe(true)
    expect(second.alive).toBe(true)
    expect(first.element).not.toBeNull()
    expect(second.element).not.toBeNull()
    expect(first.element).not.toBe(second.element)
    const firstRoot = first.element!.getRootNode()
    const secondRoot = second.element!.getRootNode()
    expect(firstRoot).toBeInstanceOf(ShadowRoot)
    expect(secondRoot).toBeInstanceOf(ShadowRoot)
    expect(firstRoot).not.toBe(secondRoot)
    first.element!.querySelector('.hp')!.textContent = 'changed'
    expect(text(first.element)).toBe('changed')
    expect(text(second.element)).toBe('hp')
  })

  it('never mounts, shows or changes the screen-space piece of the same name', () => {
    const { game, host } = makeGame()
    game.ui.define('hp', '<div class="hp">hp</div>')
    const orc = game.spawn('Orc')

    const instance = game.ui.attach('hp', orc)
    game.ui.attach('hp', orc)

    expect(game.ui.isVisible('hp')).toBe(false)
    expect(game.ui.names()).toEqual(['hp'])
    // Only the anchored layer lives in the overlay: no screen-piece shell.
    expect(overlayOf(host)!.children).toHaveLength(1)

    const screen = game.ui.element('hp')
    expect(screen).not.toBeNull()
    expect(screen).not.toBe(instance.element)
    expect(overlayOf(host)!.children).toHaveLength(2)
    expect(game.ui.isVisible('hp')).toBe(false)
    game.ui.show('hp')
    expect(game.ui.isVisible('hp')).toBe(true)
    game.ui.hide('hp')
    expect(game.ui.isVisible('hp')).toBe(false)
    game.ui.toggle('hp')
    expect(game.ui.isVisible('hp')).toBe(true)
    expect(instance.alive).toBe(true)
    expect(text(instance.element)).toBe('hp')
  })
})

describe('the anchored layer (CA-6)', () => {
  it('is one element kept first in the overlay, with its own stacking context, even when a screen piece created the overlay', () => {
    const { game, host } = makeGame()
    game.ui.define('hud', '<div>hud</div>')
    game.ui.define('menu', '<div>menu</div>')
    game.ui.define('hp', '<div>hp</div>')
    const orc = game.spawn('Orc')
    game.ui.show('hud')

    const first = game.ui.attach('hp', orc)
    const second = game.ui.attach('hp', game.spawn('Slime'))
    game.ui.show('menu')

    const overlay = overlayOf(host)!
    const layer = shadowHost(first).parentElement!
    expect(shadowHost(second).parentElement).toBe(layer)
    expect(overlay.firstElementChild).toBe(layer)
    expect(overlay.children).toHaveLength(3)
    expect(layer.style.zIndex).toBe('0')
    expect(layer.style.overflow).toBe('hidden')
  })
})

describe('game.ui.attach — per-instance values (CA-4)', () => {
  const PIECE = '<style>.x{color:red}</style><b>{{amount}}</b>|<i>{{points}}</i>|{{flag}}|{{missing}}'

  it('renders the instance value first and falls back to the Game stat', () => {
    const { game } = makeGame({ points: 3, amount: 100 })
    game.ui.define('hit', PIECE)
    const orc = game.spawn('Orc')

    const a = game.ui.attach('hit', orc, { values: { amount: 5, flag: true } })
    const b = game.ui.attach('hit', orc, { values: { amount: 9, flag: false } })
    const c = game.ui.attach('hit', orc)

    expect(text(a.element)).toBe('5|3|✓|')
    expect(text(b.element)).toBe('9|3|✕|')
    expect(text(c.element)).toBe('100|3||')
  })

  it('set() updates the text in place, and a stat change still updates placeholders with no instance value', () => {
    const { game } = makeGame({ points: 3 })
    game.ui.define('hit', PIECE)
    const orc = game.spawn('Orc')
    const a = game.ui.attach('hit', orc, { values: { amount: 5 } })
    const b = game.ui.attach('hit', orc, { values: { amount: 9 } })
    const bold = a.element!.querySelector('b')

    a.set('amount', 6)
    game.stats.set('points', 4)

    expect(text(a.element)).toBe('6|4||')
    expect(text(b.element)).toBe('9|4||')
    expect(a.element!.querySelector('b')).toBe(bold)

    // An instance value now shadows the stat for this instance only.
    a.set('points', 10)
    game.stats.set('points', 11)
    expect(text(a.element)).toBe('6|10||')
    expect(text(b.element)).toBe('9|11||')
  })

  it('publishes numbers verbatim and booleans as 1/0 as custom properties on the shadow host; strings stay text-only', () => {
    const { game } = makeGame()
    game.ui.define('bar', '<div>{{label}}</div>')
    const orc = game.spawn('Orc')

    const bar = game.ui.attach('bar', orc, {
      values: { current: 7, max: 10, open: true, shut: false, label: 'Orc' },
    })
    const style = shadowHost(bar).style

    expect(style.getPropertyValue('--current')).toBe('7')
    expect(style.getPropertyValue('--max')).toBe('10')
    expect(style.getPropertyValue('--open')).toBe('1')
    expect(style.getPropertyValue('--shut')).toBe('0')
    expect(style.getPropertyValue('--label')).toBe('')
    expect(text(bar.element)).toBe('Orc')

    bar.set('current', 6)
    bar.set('open', false)
    expect(style.getPropertyValue('--current')).toBe('6')
    expect(style.getPropertyValue('--open')).toBe('0')

    // A value that becomes a string stops publishing its custom property.
    bar.set('max', 'ten')
    expect(style.getPropertyValue('--max')).toBe('')
  })

  it('stops following stats once the instance is removed', () => {
    const { game } = makeGame({ points: 1 })
    game.ui.define('score', '<span>{{points}}</span>')
    const orc = game.spawn('Orc')
    const score = game.ui.attach('score', orc)
    const root = score.element!

    score.remove()
    game.stats.set('points', 2)

    expect(text(root)).toBe('1')
  })
})

describe('game.ui.attach — invalid attach never throws (CA-7)', () => {
  function expectInert(handle: AnchoredPieceHandle): void {
    expect(handle.alive).toBe(false)
    expect(handle.element).toBeNull()
    expect(() => handle.set('amount', 1)).not.toThrow()
    expect(() => handle.remove()).not.toThrow()
    expect(handle.alive).toBe(false)
  }

  it('warns once per undefined piece name per Game and returns an inert handle, mounting nothing', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { game, host } = makeGame()
    const orc = game.spawn('Orc')

    const handles = [
      game.ui.attach('ghost', orc),
      game.ui.attach('ghost', orc, { values: { amount: 1 } }),
      game.ui.attach('phantom', orc),
    ]

    for (const handle of handles) expectInert(handle)
    expect(warn).toHaveBeenCalledTimes(2)
    expect(String(warn.mock.calls[0]![0])).toMatch(/^\[waica\].*"ghost"/)
    expect(String(warn.mock.calls[1]![0])).toMatch(/^\[waica\].*"phantom"/)
    expect(overlayOf(host)).toBeNull()

    // Per Game: another Game warns about the same name again, once.
    const other = makeGame().game
    other.ui.attach('ghost', other.spawn('Orc'))
    other.ui.attach('ghost', other.spawn('Orc'))
    expect(warn).toHaveBeenCalledTimes(3)
  })

  it('warns once per call when the entity is no longer alive, returning an inert handle', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { game, host } = makeGame()
    game.ui.define('hp', '<div>hp</div>')
    const orc = game.spawn('Orc')
    orc.destroy()

    const handles = [game.ui.attach('hp', orc), game.ui.attach('hp', orc)]

    for (const handle of handles) expectInert(handle)
    expect(warn).toHaveBeenCalledTimes(2)
    for (const [message] of warn.mock.calls) expect(String(message)).toMatch(/^\[waica\].*"Orc"/)
    expect(overlayOf(host)).toBeNull()
  })
})

describe('the package entry (CA-20)', () => {
  it('exports the Anchored Piece types, with GameUi.attach reachable from game.ui', () => {
    expectTypeOf<Parameters<GameUi['attach']>[2]>().toEqualTypeOf<AttachOptions | undefined>()
    expectTypeOf<ReturnType<GameUi['attach']>>().toEqualTypeOf<EntryHandle>()
    expectTypeOf<RuntimeSnapshot['ui']>().toEqualTypeOf<RuntimeSnapshotUi>()
    expectTypeOf<EntryGame['ui']>().toEqualTypeOf<GameUi>()
    expect(typeof GameUi.prototype.attach).toBe('function')
  })
})
