import type { ValidationFinding } from './validation.js'

const COLLISION_LAYER_PATTERN = /^[a-z][a-z0-9-]*$/

/** Which component's props a check reads, and who owns the block: the words and refs a finding uses. */
interface CategoryScope {
  component: string
  owner: string | undefined
  file: string
}

function fieldRef({ owner, component }: CategoryScope, field: string): string {
  return owner ? `${owner}:${component}.${field}` : `${component}.${field}`
}

/** Collision-category findings for one authored Hitbox props block. */
export function collisionCategoryFindings(value: unknown, file: string, owner?: string): ValidationFinding[] {
  return categoryFindings(value, { component: 'Hitbox', owner, file })
}

/** The same findings for a Collider's props block, which reuses the Hitbox's layer and mask (ADR 0016). */
export function colliderCategoryFindings(value: unknown, file: string, owner?: string): ValidationFinding[] {
  return categoryFindings(value, { component: 'Collider', owner, file })
}

function categoryFindings(value: unknown, scope: CategoryScope): ValidationFinding[] {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return []
  const { component, file } = scope
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
        `${component}.layer must start with a lowercase letter and contain only lowercase letters, digits, or hyphens; "*" is mask-only.`,
      file,
      ref: fieldRef(scope, 'layer'),
    })
  }
  if (!Object.hasOwn(props, 'collidesWith')) return findings
  if (!Array.isArray(props.collidesWith)) {
    findings.push({
      severity: 'error',
      code: 'invalid-collision-mask',
      message: `${component}.collidesWith must be a list of strings.`,
      file,
      ref: fieldRef(scope, 'collidesWith'),
    })
    return findings
  }

  findings.push(...collisionMaskEntryFindings(props.collidesWith, scope))
  return findings
}

/** Findings for each entry of an authored collidesWith list, in list order. */
function collisionMaskEntryFindings(entries: readonly unknown[], scope: CategoryScope): ValidationFinding[] {
  const { component, file } = scope
  const findings: ValidationFinding[] = []
  const seen = new Set<string>()
  entries.forEach((entry, index) => {
    const ref = fieldRef(scope, `collidesWith[${index}]`)
    if (typeof entry !== 'string') {
      findings.push({
        severity: 'error',
        code: 'invalid-collision-mask',
        message: `${component}.collidesWith entry ${index + 1} must be a string.`,
        file,
        ref,
      })
      return
    }
    if (entry !== '*' && !COLLISION_LAYER_PATTERN.test(entry)) {
      findings.push({
        severity: 'error',
        code: 'invalid-collision-mask',
        message: `${component}.collidesWith entry "${entry}" is invalid; use "*" or a valid Collision Layer.`,
        file,
        ref,
      })
      return
    }
    if (seen.has(entry)) {
      findings.push({
        severity: 'warning',
        code: 'duplicate-collision-mask-entry',
        message: `Duplicate ${component}.collidesWith entry "${entry}" has no additional effect.`,
        file,
        ref,
      })
    }
    seen.add(entry)
  })
  return findings
}
