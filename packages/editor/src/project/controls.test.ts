import { describe, expect, it } from 'vitest'
import { DEFAULT_BINDINGS } from '@waica/engine'
import { keyLabel, parseControls, serializeControls } from './controls'

describe('parseControls', () => {
  it('returns the engine defaults for a missing file', () => {
    expect(parseControls(null)).toEqual(DEFAULT_BINDINGS)
  })

  it('overrides only the actions the file mentions', () => {
    const parsed = parseControls(
      JSON.stringify({ waicaControls: 1, bindings: { jump: ['KeyJ'] } }),
    )
    expect(parsed.jump).toEqual(['KeyJ'])
    expect(parsed.left).toEqual(DEFAULT_BINDINGS.left)
    expect(parsed.right).toEqual(DEFAULT_BINDINGS.right)
  })

  it('keeps custom actions beyond the defaults', () => {
    const parsed = parseControls(
      JSON.stringify({ waicaControls: 1, bindings: { dash: ['ShiftLeft'] } }),
    )
    expect(parsed.dash).toEqual(['ShiftLeft'])
  })

  it('falls back to the defaults on invalid JSON or junk entries', () => {
    expect(parseControls('{not json')).toEqual(DEFAULT_BINDINGS)
    const junk = parseControls(
      JSON.stringify({ waicaControls: 1, bindings: { jump: 'Space', left: [1, 2] } }),
    )
    expect(junk).toEqual(DEFAULT_BINDINGS)
  })

  it('never shares arrays with the defaults (mutation safety)', () => {
    const parsed = parseControls(null)
    parsed.jump?.push('KeyZ')
    expect(DEFAULT_BINDINGS.jump).toEqual(['Space', 'ArrowUp', 'KeyW'])
  })
})

describe('serializeControls', () => {
  it('round-trips through parseControls', () => {
    const bindings = { ...structuredClone(DEFAULT_BINDINGS), jump: ['KeyJ'] }
    expect(parseControls(serializeControls(bindings))).toEqual(bindings)
  })
})

describe('keyLabel', () => {
  it('humanizes common codes', () => {
    expect(keyLabel('KeyA')).toBe('A')
    expect(keyLabel('Digit3')).toBe('3')
    expect(keyLabel('ArrowLeft')).toBe('←')
    expect(keyLabel('Space')).toBe('Space')
    expect(keyLabel('Numpad5')).toBe('Num 5')
    expect(keyLabel('ShiftLeft')).toBe('Shift')
    expect(keyLabel('F5')).toBe('F5')
  })
})
