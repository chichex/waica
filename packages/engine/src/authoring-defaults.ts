import type { ComponentClass } from './component.js'

const EXCLUDED_KEYS = new Set(['entity', 'game'])

function isSerializable(value: unknown): boolean {
  if (value === null) return true
  const kind = typeof value
  if (kind === 'string' || kind === 'number' || kind === 'boolean') return true
  if (kind !== 'object') return false
  if (Array.isArray(value)) return true
  const proto = Object.getPrototypeOf(value)
  return proto === Object.prototype || proto === null
}

/**
 * The public authoring surface of a component class: own enumerable fields
 * plus setter-backed accessors (walking the whole prototype chain, so a
 * getter/setter pair inherited from a base class counts), read through the
 * getter so the value is the public one. Excludes `_`-prefixed keys, the
 * base Component wiring (`entity`, `game`), anything the class (or an
 * ancestor) declares `transient`, and values that are `undefined` or not
 * JSON-serializable (`Map`, `Set`, functions, class instances).
 */
export function authoringDefaults(
  Class: ComponentClass,
  onError?: (error: unknown) => void,
): Record<string, unknown> {
  let instance: Record<string, unknown>
  try {
    instance = new Class() as unknown as Record<string, unknown>
  } catch (error) {
    onError?.(error)
    return {}
  }

  const transient = new Set(Class.transient ?? [])
  const keys = new Set(Object.keys(instance))
  for (
    let proto: object | null = Object.getPrototypeOf(instance);
    proto && proto !== Object.prototype;
    proto = Object.getPrototypeOf(proto)
  ) {
    for (const [key, descriptor] of Object.entries(Object.getOwnPropertyDescriptors(proto))) {
      if (descriptor.set) keys.add(key)
    }
  }

  const result: Record<string, unknown> = {}
  for (const key of keys) {
    if (EXCLUDED_KEYS.has(key) || key.startsWith('_') || transient.has(key)) continue
    const value = instance[key]
    if (value === undefined || !isSerializable(value)) continue
    result[key] = value
  }
  return result
}
