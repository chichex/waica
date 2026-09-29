// Test support, shared by every package's tests and excluded from builds.
import { expect, type MockResult } from 'vitest'

/**
 * The value a test expects to exist, or a failure that says what was
 * missing. Tests use it instead of a `!` non-null assertion, which would only
 * surface later as an unrelated TypeError.
 */
export function defined<T>(value: T, what = 'a value'): NonNullable<T> {
  if (value === undefined || value === null) {
    throw new Error(`expected ${what}, got ${value === null ? 'null' : 'undefined'}`)
  }
  return value
}

/** What a mocked call returned, failing the test if it threw or is still running. */
export function returnedValue<T>(result: MockResult<T> | undefined): T {
  if (result?.type !== 'return') throw new Error(`expected a returned call, got ${result?.type ?? 'no call'}`)
  return result.value
}

/**
 * Vitest's asymmetric matchers, typed `unknown` instead of `any`: they only
 * ever stand inside an expected value, so nothing may read them as data.
 */
export const match = {
  any: (constructor: unknown): unknown => expect.any(constructor),
  anything: (): unknown => expect.anything(),
  stringMatching: (pattern: string | RegExp): unknown => expect.stringMatching(pattern),
  stringContaining: (text: string): unknown => expect.stringContaining(text),
  objectContaining: (object: object): unknown => expect.objectContaining(object),
  arrayContaining: (items: unknown[]): unknown => expect.arrayContaining(items),
}
