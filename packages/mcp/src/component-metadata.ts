/** Narrows an unknown JSON value to a plain object; anything else (including arrays and null) becomes `{}`. */
export function objectRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}

/**
 * Deliberately mirrors the editor's classDefaults/CA-B2 contract: enumerable
 * own fields from a fresh instance. It is not a general public-property
 * reflection API; changing that model belongs to engine/editor design.
 */
export function classDefaults(Class: new () => object): Record<string, unknown> {
  try {
    return Object.fromEntries(
      Object.entries(new Class()).filter(([, value]) => value !== undefined),
    )
  } catch {
    return {}
  }
}
