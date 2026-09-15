import type { ValidationFinding } from './validation.js'

const COLLISION_LAYER_PATTERN = /^[a-z][a-z0-9-]*$/

function fieldRef(owner: string | undefined, field: string): string {
  return owner ? `${owner}:Hitbox.${field}` : `Hitbox.${field}`
}

/** Collision-category findings for one authored Hitbox props block. */
export function collisionCategoryFindings(
  value: unknown,
  file: string,
  owner?: string,
): ValidationFinding[] {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return []
  const props = value as Record<string, unknown>
  const findings: ValidationFinding[] = []
  if (
    Object.hasOwn(props, 'layer') &&
    (typeof props.layer !== 'string' || !COLLISION_LAYER_PATTERN.test(props.layer))
  ) {
    findings.push({
      severity: 'error',
      code: 'invalid-collision-layer',
      message:
        'Hitbox.layer must start with a lowercase letter and contain only lowercase letters, digits, or hyphens; "*" is mask-only.',
      file,
      ref: fieldRef(owner, 'layer'),
    })
  }
  if (!Object.hasOwn(props, 'collidesWith')) return findings
  if (!Array.isArray(props.collidesWith)) {
    findings.push({
      severity: 'error',
      code: 'invalid-collision-mask',
      message: 'Hitbox.collidesWith must be a list of strings.',
      file,
      ref: fieldRef(owner, 'collidesWith'),
    })
    return findings
  }

  const seen = new Set<string>()
  props.collidesWith.forEach((entry, index) => {
    const ref = fieldRef(owner, `collidesWith[${index}]`)
    if (typeof entry !== 'string') {
      findings.push({
        severity: 'error',
        code: 'invalid-collision-mask',
        message: `Hitbox.collidesWith entry ${index + 1} must be a string.`,
        file,
        ref,
      })
      return
    }
    if (entry !== '*' && !COLLISION_LAYER_PATTERN.test(entry)) {
      findings.push({
        severity: 'error',
        code: 'invalid-collision-mask',
        message: `Hitbox.collidesWith entry "${entry}" is invalid; use "*" or a valid Collision Layer.`,
        file,
        ref,
      })
      return
    }
    if (seen.has(entry)) {
      findings.push({
        severity: 'warning',
        code: 'duplicate-collision-mask-entry',
        message: `Duplicate Hitbox.collidesWith entry "${entry}" has no additional effect.`,
        file,
        ref,
      })
    }
    seen.add(entry)
  })
  return findings
}
