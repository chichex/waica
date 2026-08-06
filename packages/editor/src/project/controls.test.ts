import { describe, expect, it } from 'vitest'
import { PLATFORMER_BINDINGS } from '@waica/archetype-platformer'
import templateControlsJson from '../../template/src/controls.json?raw'
import {
  actionLabel,
  deriveActionLabel,
  keyLabel,
  parseControlLabels,
  parseControls,
  serializeControls,
} from './controls'

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

describe('parseControlLabels', () => {
  it('returns no labels for a missing file', () => {
    expect(parseControlLabels(null)).toEqual({})
  })

  it('reads the labels the project declares', () => {
    const text = JSON.stringify({
      waicaControls: 1,
      bindings: { shoot: ['KeyF'] },
      labels: { shoot: 'Shoot' },
    })
    expect(parseControlLabels(text)).toEqual({ shoot: 'Shoot' })
  })

  it('is as tolerant as parseControls: bad JSON, a non-object key and junk entries yield no labels', () => {
    expect(parseControlLabels('{not json')).toEqual({})
    expect(parseControlLabels(JSON.stringify({ waicaControls: 1, bindings: {} }))).toEqual({})
    expect(parseControlLabels(JSON.stringify({ waicaControls: 1, labels: 'Shoot' }))).toEqual({})
    expect(parseControlLabels(JSON.stringify({ waicaControls: 1, labels: ['Shoot'] }))).toEqual({})
    expect(
      parseControlLabels(
        JSON.stringify({ waicaControls: 1, labels: { shoot: 3, dash: null, slide: 'Slide' } }),
      ),
    ).toEqual({ slide: 'Slide' })
  })
})

describe('serializeControls', () => {
  it('round-trips through parseControls', () => {
    const bindings = { ...structuredClone(PLATFORMER_BINDINGS), jump: ['KeyJ'] }
    expect(parseControls(serializeControls(bindings, {}), PLATFORMER_BINDINGS)).toEqual(bindings)
  })

  // A project that never named an action keeps the file it already has: the
  // labels key does not appear just because the editor rewrote controls.json.
  it('writes a label-less project byte-identically to the file it already had', () => {
    const bindings = parseControls(templateControlsJson, PLATFORMER_BINDINGS)
    const labels = parseControlLabels(templateControlsJson)

    expect(labels).toEqual({})
    expect(serializeControls(bindings, labels)).toBe(
      JSON.stringify({ waicaControls: 1, bindings }, null, 2) + '\n',
    )
    expect(serializeControls(bindings, labels)).not.toContain('labels')
  })

  it('writes labels as a sibling of bindings when the project named an action', () => {
    const text = serializeControls({ shoot: ['KeyF'] }, { shoot: 'Shoot' })

    expect(JSON.parse(text)).toEqual({
      waicaControls: 1,
      bindings: { shoot: ['KeyF'] },
      labels: { shoot: 'Shoot' },
    })
    expect(parseControlLabels(text)).toEqual({ shoot: 'Shoot' })
  })
})

describe('actionLabel', () => {
  const archetypeLabels = { left: 'Move left', jump: 'Jump' }

  it('prefers the project label over the archetype one', () => {
    expect(actionLabel('jump', { jump: 'Leap' }, archetypeLabels)).toBe('Leap')
  })

  it('falls back to the archetype label', () => {
    expect(actionLabel('jump', { shoot: 'Shoot' }, archetypeLabels)).toBe('Jump')
  })

  it('falls back to the raw action name when nobody labelled it', () => {
    expect(actionLabel('shoot', {}, archetypeLabels)).toBe('shoot')
  })
})

describe('deriveActionLabel', () => {
  it('reads an action name as a sentence', () => {
    expect(deriveActionLabel('shoot')).toBe('Shoot')
    expect(deriveActionLabel('double-jump')).toBe('Double jump')
    expect(deriveActionLabel('double_jump')).toBe('Double jump')
    expect(deriveActionLabel('doubleJump')).toBe('Double jump')
  })

  it('keeps a name it cannot read as words', () => {
    expect(deriveActionLabel('!!')).toBe('!!')
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
