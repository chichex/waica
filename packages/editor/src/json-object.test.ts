import { describe, expect, it } from 'vitest'
import { isJsonObject, isStringArray, readJsonObject } from './json-object'

describe('json-object', () => {
  it('accepts plain objects only', () => {
    expect(isJsonObject({ a: 1 })).toBe(true)
    expect(isJsonObject(null)).toBe(false)
    expect(isJsonObject([])).toBe(false)
    expect(isJsonObject('x')).toBe(false)
  })

  it('reads an object from text and degrades anything else to null', () => {
    expect(readJsonObject('{"stats":{"lives":3}}')).toEqual({ stats: { lives: 3 } })
    expect(readJsonObject('null')).toBeNull()
    expect(readJsonObject('[1]')).toBeNull()
    expect(readJsonObject('{')).toBeNull()
  })

  it('recognises string arrays', () => {
    expect(isStringArray(['a', 'b'])).toBe(true)
    expect(isStringArray(['a', 1])).toBe(false)
    expect(isStringArray('ab')).toBe(false)
  })
})
