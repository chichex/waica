// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { loadScene, type SceneJson } from './scene'
import { Stats } from './stats'
import { GameUi } from './ui'

const COUNTER = '<style>.c{color:gold}</style><div class="c">🪙 {{points}}</div>'

function makeUi(initial: Record<string, number | boolean | string> = { points: 0 }) {
  const host = document.createElement('div')
  document.body.append(host)
  const stats = new Stats(initial)
  const ui = new GameUi(stats, () => host)
  return { ui, stats, host }
}

function pieceText(ui: GameUi, name: string): string {
  const root = ui.element(name)
  if (!root) return ''
  const clone = root.cloneNode(true) as HTMLElement
  for (const tag of clone.querySelectorAll('style, script')) tag.remove()
  return clone.textContent?.trim() ?? ''
}

beforeEach(() => {
  document.body.innerHTML = ''
})

describe('GameUi', () => {
  it('mounts a piece into a shadow root and renders the stat value', () => {
    const { ui, host } = makeUi({ points: 7 })
    ui.define('coin-counter', COUNTER)
    ui.show('coin-counter')
    expect(ui.isVisible('coin-counter')).toBe(true)
    expect(pieceText(ui, 'coin-counter')).toBe('🪙 7')
    // Content lives behind a shadow root: invisible to page-level selectors.
    expect(host.querySelector('.c')).toBeNull()
  })

  it('updates bindings when the stat changes, and on reset', () => {
    const { ui, stats } = makeUi({ points: 0 })
    ui.define('coin-counter', COUNTER)
    ui.show('coin-counter')
    stats.add('points')
    stats.add('points')
    expect(pieceText(ui, 'coin-counter')).toBe('🪙 2')
    stats.reset()
    expect(pieceText(ui, 'coin-counter')).toBe('🪙 0')
  })

  it('renders booleans as ✓/✕ and unknown stats as empty', () => {
    const { ui, stats } = makeUi({ ready: false })
    ui.define('hud', '<div>{{ready}}|{{missing}}</div>')
    ui.show('hud')
    expect(pieceText(ui, 'hud')).toBe('✕|')
    stats.set('ready', true)
    expect(pieceText(ui, 'hud')).toBe('✓|')
    stats.set('missing', 'now-here')
    expect(pieceText(ui, 'hud')).toBe('✓|now-here')
  })

  it('binds several stats in one text run', () => {
    const { ui } = makeUi({ lives: 3, maxLives: 5 })
    ui.define('lives', '<div>❤️ {{lives}} / {{ maxLives }}</div>')
    ui.show('lives')
    expect(pieceText(ui, 'lives')).toBe('❤️ 3 / 5')
  })

  it('leaves braces inside <style> alone', () => {
    const { ui } = makeUi()
    ui.define('styled', '<style>.x{color:red}</style><div class="x">hi</div>')
    ui.show('styled')
    const root = ui.element('styled')
    expect(root?.querySelector('style')?.textContent).toBe('.x{color:red}')
  })

  it('show/hide/toggle drive per-piece visibility', () => {
    const { ui } = makeUi()
    ui.define('hud', '<div>hud</div>')
    ui.show('hud')
    ui.hide('hud')
    expect(ui.isVisible('hud')).toBe(false)
    ui.toggle('hud')
    expect(ui.isVisible('hud')).toBe(true)
  })

  it('element() mounts hidden so code can wire behaviour before showing', () => {
    const { ui } = makeUi()
    ui.define('menu', '<button class="resume">resume</button>')
    const root = ui.element('menu')
    expect(root).not.toBeNull()
    expect(ui.isVisible('menu')).toBe(false)
    const clicks = vi.fn()
    root?.querySelector('.resume')?.addEventListener('click', clicks)
    root?.querySelector<HTMLButtonElement>('.resume')?.click()
    expect(clicks).toHaveBeenCalledOnce()
  })

  it('warns on unknown pieces and stays null', () => {
    const { ui } = makeUi()
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect(ui.element('nope')).toBeNull()
    ui.show('nope')
    expect(ui.isVisible('nope')).toBe(false)
    expect(warn).toHaveBeenCalled()
    warn.mockRestore()
  })

  it('hides the whole overlay while inactive (pause), keeping piece state', () => {
    const { ui, host } = makeUi()
    ui.define('hud', '<div>hud</div>')
    ui.show('hud')
    ui.setActive(false)
    const overlay = host.firstElementChild as HTMLElement
    expect(overlay.style.display).toBe('none')
    expect(ui.isVisible('hud')).toBe(true)
    ui.setActive(true)
    expect(overlay.style.display).toBe('')
  })

  it('loadScene registers the registry catalog and shows the scene list', () => {
    const { ui } = makeUi({ points: 3 })
    const game = { ui, setSceneCamera: () => {} } as unknown as Parameters<typeof loadScene>[0]
    const scene: SceneJson = { waicaScene: 2, entities: [], ui: ['coin-counter'] }
    loadScene(game, scene, { components: {}, ui: { 'coin-counter': COUNTER, 'pause-menu': '<div/>' } })
    expect(ui.isVisible('coin-counter')).toBe(true)
    expect(ui.isVisible('pause-menu')).toBe(false)
    expect(pieceText(ui, 'coin-counter')).toBe('🪙 3')
  })

  it('dispose removes the overlay and detaches stat subscriptions', () => {
    const { ui, stats, host } = makeUi({ points: 0 })
    ui.define('coin-counter', COUNTER)
    ui.show('coin-counter')
    ui.dispose()
    expect(host.children.length).toBe(0)
    expect(() => stats.add('points')).not.toThrow()
  })
})
