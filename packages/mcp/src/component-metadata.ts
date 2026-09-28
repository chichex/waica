/** A parsed JSON object: not null, not an array. */
export function isJsonObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** Narrows an unknown JSON value to a plain object; anything else (including arrays and null) becomes `{}`. */
export function objectRecord(value: unknown): Record<string, unknown> {
  return isJsonObject(value) ? value : {}
}

/**
 * Own enumerable fields of a fresh instance — the raw internal-state model,
 * superseded for the public authoring surface by @waica/engine's
 * authoringDefaults (list_components/CA-3, editor classDefaults/CA-4; see
 * `.sdd/specs/waica-mcp.md` CA-B2 and issue #21). Still correct for its
 * remaining callers here: validating a component's own declared param
 * defaults and describing project-owned components, neither of which is
 * the public-authoring-surface question authoringDefaults answers.
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
