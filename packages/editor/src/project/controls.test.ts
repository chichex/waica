import { describe, expect, it } from 'vitest'
import { PLATFORMER_BINDINGS } from '@waica/archetype-platformer'
import { keyLabel, parseControls, serializeControls } from './controls'

describe('parseControls', () => {
  it('returns the resolved archetype defaults for a missing file', () => {
    expect(parseControls(null, PLATFORMER_BINDINGS)).toEqual(PLATFORMER_BINDINGS)
  })

  it('overrides only the actions the file mentions', () => {
    const parsed = parseControls(
      JSON.stringify({ waicaControls: 1, bindings: { jump: ['KeyJ'] } }),
      PLATFORMER_BINDINGS,
    )
    expect(parsed.jump).toEqual(['KeyJ'])
    expect(parsed.left).toEqual(PLATFORMER_BINDINGS.left)
    expect(parsed.right).toEqual(PLATFORMER_BINDINGS.right)
  })

  it('keeps custom actions beyond the archetype defaults', () => {
    const parsed = parseControls(
      JSON.stringify({ waicaControls: 1, bindings: { dash: ['ShiftLeft'] } }),
      PLATFORMER_BINDINGS,
    )
    expect(parsed.dash).toEqual(['ShiftLeft'])
  })

  it('falls back to the archetype defaults on invalid JSON or junk entries', () => {
    expect(parseControls('{not json', PLATFORMER_BINDINGS)).toEqual(PLATFORMER_BINDINGS)
    const junk = parseControls(
      JSON.stringify({ waicaControls: 1, bindings: { jump: 'Space', left: [1, 2] } }),
      PLATFORMER_BINDINGS,
    )
    expect(junk).toEqual(PLATFORMER_BINDINGS)
  })

  it('never shares arrays with the archetype defaults', () => {
    const parsed = parseControls(null, PLATFORMER_BINDINGS)
    parsed.jump?.push('KeyZ')
    expect(PLATFORMER_BINDINGS.jump).toEqual(['Space', 'ArrowUp', 'KeyW'])
  })
})

describe('serializeControls', () => {
  it('round-trips through parseControls', () => {
    const bindings = { ...structuredClone(PLATFORMER_BINDINGS), jump: ['KeyJ'] }
    expect(parseControls(serializeControls(bindings), PLATFORMER_BINDINGS)).toEqual(bindings)
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
