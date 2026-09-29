/** A parsed JSON object: not null, not an array. */
export function isJsonObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** The JSON object in `text`, or null when it is not valid JSON or not an object. */
export function readJsonObject(text: string): Record<string, unknown> | null {
  try {
    const parsed: unknown = JSON.parse(text)
    return isJsonObject(parsed) ? parsed : null
  } catch {
    return null
  }
}

export function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string')
}
