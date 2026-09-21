// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from 'vitest'
import { GameTime, GameUi, Stats, THREE, type Entity } from '@waica/engine'
// The package entry on purpose: these pieces are public surface (CA-20).
import { ANCHORED_UI_PIECES, HEALTH_UI, INTERACTABLE_UI } from './index.js'

/** The four Anchored Pieces the behaviors ship (issue #72, CA-18). */
function anchoredStockPieces(): Record<string, string | undefined> {
  return {
    'npc-bubble': INTERACTABLE_UI['npc-bubble'],
    'interact-prompt': INTERACTABLE_UI['interact-prompt'],
    'damage-number': HEALTH_UI['damage-number'],
    'health-bar': HEALTH_UI['health-bar'],
  }
}

/** A live entity GameUi.attach accepts: attach without `seconds` never reads game.time. */
function anchorEntity(): Entity {
  return {
    name: 'Orc',
    alive: true,
    position: new THREE.Vector3(),
    game: { time: new GameTime() },
  } as unknown as Entity
}

/** What a player reads: the instance's text, without its <style>. */
function visibleText(element: HTMLElement | null): string {
  const copy = element!.cloneNode(true) as HTMLElement
  for (const style of copy.querySelectorAll('style')) style.remove()
  return (copy.textContent ?? '').replace(/\s+/g, ' ').trim()
}

let ui: GameUi

beforeEach(() => {
  document.body.innerHTML = ''
  const host = document.createElement('div')
  document.body.append(host)
  ui = new GameUi(new Stats(), () => host)
  ui.defineAll({ ...INTERACTABLE_UI, ...HEALTH_UI })
})

describe('stock Anchored Pieces (issue #72, CA-18, CA-20)', () => {
  it('ships the speech bubble and the interact prompt next to npc-line, and the Health pieces on their own', () => {
    expect(Object.keys(INTERACTABLE_UI)).toEqual(['npc-line', 'npc-bubble', 'interact-prompt'])
    expect(Object.keys(HEALTH_UI)).toEqual(['damage-number', 'health-bar'])
  })

  it('names exactly the four stock Anchored Pieces, and not the npc-line screen piece', () => {
    expect([...ANCHORED_UI_PIECES].sort()).toEqual([
      'damage-number',
      'health-bar',
      'interact-prompt',
      'npc-bubble',
    ])
  })

  it('renders each instance from its own values', () => {
    const orc = anchorEntity()

    const bubble = ui.attach('npc-bubble', orc, { values: { line: 'The water sparkles.' } })
    const prompt = ui.attach('interact-prompt', orc, { values: { key: 'E' } })
    const hit = ui.attach('damage-number', orc, { values: { amount: 3 } })
    const bar = ui.attach('health-bar', orc, { values: { current: 1, max: 2 } })

    expect(visibleText(bubble.element)).toBe('The water sparkles.')
    expect(visibleText(prompt.element)).toBe('Press E')
    expect(visibleText(hit.element)).toBe('-3')
    // Deviation D1: the bar draws from --current/--max alone, no text.
    expect(visibleText(bar.element)).toBe('')
  })

  it('draws every Anchored Piece above its anchor point, centred on it, without catching the pointer', () => {
    for (const [name, html] of Object.entries(anchoredStockPieces())) {
      expect(html, name).toMatch(/position:\s*absolute/)
      expect(html, name).toMatch(/bottom:\s*0/)
      expect(html, name).toMatch(/translate\(-50%/)
      expect(html, name).toMatch(/pointer-events:\s*none/)
      expect(html, name).toMatch(/user-select:\s*none/)
    }
  })

  it('caps the bubble width so a long line wraps instead of running off screen', () => {
    expect(INTERACTABLE_UI['npc-bubble']).toMatch(/max-width:\s*\d+px/)
  })

  it('makes the damage number rise and fade out over 0.8 s', () => {
    const html = HEALTH_UI['damage-number']

    expect(html).toContain('-{{amount}}')
    expect(html).toMatch(/animation:[^;]*\b0\.8s\b/)
    expect(html).toMatch(/opacity:\s*0\s*;/)
  })

  it('sizes the health bar in world units and fills it from --current / --max, with no text bindings', () => {
    const html = HEALTH_UI['health-bar']

    expect(html).not.toContain('{{')
    expect(html).toMatch(/var\(--waica-unit/)
    expect(html).toMatch(/calc\(var\(--current\)\s*\/\s*var\(--max\)\s*\*\s*100%\)/)
  })
})
