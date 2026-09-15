export interface ParamDiagnostic {
  readonly severity: 'error' | 'warning'
  readonly message: string
  readonly entry?: number
}

const COLLISION_LAYER_PATTERN = /^[a-z][a-z0-9-]*$/

export function collisionLayerDiagnostics(value: unknown): ParamDiagnostic[] {
  if (typeof value === 'string' && COLLISION_LAYER_PATTERN.test(value)) return []
  return [{
    severity: 'error',
    message:
      'A Collision Layer must start with a lowercase letter and contain only lowercase letters, digits, or hyphens; "*" is mask-only.',
  }]
}

export function collisionMaskDiagnostics(value: unknown): ParamDiagnostic[] {
  if (!Array.isArray(value)) {
    return [{ severity: 'error', message: 'Collision Mask must be a list of strings.' }]
  }
  const diagnostics: ParamDiagnostic[] = []
  const seen = new Set<string>()
  value.forEach((entry, index) => {
    if (typeof entry !== 'string') {
      diagnostics.push({
        severity: 'error',
        entry: index,
        message: `Collision Mask entry ${index + 1} must be a string.`,
      })
      return
    }
    if (entry !== '*' && !COLLISION_LAYER_PATTERN.test(entry)) {
      diagnostics.push({
        severity: 'error',
        entry: index,
        message: `Collision Mask entry "${entry}" is invalid; use "*" or a valid Collision Layer.`,
      })
      return
    }
    if (seen.has(entry)) {
      diagnostics.push({
        severity: 'warning',
        entry: index,
        message: `Duplicate Collision Mask entry "${entry}" has no additional effect.`,
      })
    }
    seen.add(entry)
  })
  return diagnostics
}

export function collisionParamDiagnostics(
  componentType: string,
  param: string,
  value: unknown,
): ParamDiagnostic[] | undefined {
  if (componentType !== 'Hitbox') return undefined
  if (param === 'layer') return collisionLayerDiagnostics(value)
  if (param === 'collidesWith') return collisionMaskDiagnostics(value)
  return undefined
}
