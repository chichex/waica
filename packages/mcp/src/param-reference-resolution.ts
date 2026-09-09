import type { ArchetypeArt, DirectionalAnimation, ParamSpec } from '@waica/engine'
import { readdir } from 'node:fs/promises'
import path from 'node:path'
import { isPlayableClip } from './clip-resolution.js'
import type { FindingCode, FindingSeverity } from './validation.js'

/**
 * Split out of validation.ts (already at the 950-line generation-policy
 * cap): the whole `ParamSpec.ref` resolution switch, called once per
 * declared ref param from validation.ts's own component-walking loops,
 * which already carry the file/field context this needs.
 */

/** Whether `action` has at least one real binding — an own key, since bindings is keyed by an untrusted string. */
export function isBoundAction(bindings: Record<string, string[]>, action: string): boolean {
  return Object.hasOwn(bindings, action) && (bindings[action]?.length ?? 0) > 0
}

export interface ParamReferenceCheck {
  componentType: string
  param: string
  ref: NonNullable<ParamSpec['ref']>
  value: string
  /** Clip names declared by the sibling AnimatedSprite, or undefined when there is none. */
  clips: ReadonlySet<string> | undefined
  file: string
  /** `${componentType}.${param}` — reported as the finding's `ref`. */
  field: string
}

export interface ParamReferenceResolutionContext {
  prefabRefs: ReadonlySet<string>
  animation: DirectionalAnimation | undefined
  bindings: Record<string, string[]>
  declaredStats: ReadonlySet<string>
  /** Every sound uri a `ref: 'sound'` param may validly name — see projectSoundRefs. */
  soundRefs: ReadonlySet<string>
}

export interface ParamReferenceFinding {
  severity: FindingSeverity
  code: FindingCode
  message: string
  file: string
  ref: string
}

/** Resolves one declared ref param; returns undefined when the value is valid. */
export function resolveParamReference(
  check: ParamReferenceCheck,
  context: ParamReferenceResolutionContext,
): ParamReferenceFinding | undefined {
  const { componentType, param, ref, value, clips, file, field } = check
  switch (ref) {
    case 'prefab':
      if (context.prefabRefs.has(value)) return undefined
      return {
        severity: 'error',
        code: 'broken-prefab-ref',
        message: `Component "${componentType}" param "${param}" references missing prefab "${value}".`,
        file,
        ref: field,
      }
    case 'clip':
      if (!clips || isPlayableClip(clips, value, context.animation)) return undefined
      return {
        severity: 'error',
        code: 'missing-clip',
        message: `Component "${componentType}" param "${param}" references missing animation clip "${value}".`,
        file,
        ref: field,
      }
    case 'action':
      if (isBoundAction(context.bindings, value)) return undefined
      return {
        // Consistent with the pre-existing state-transition check for the
        // same condition: an unbound action is a real gap the agent should
        // look at, but not one that flips ok:false.
        severity: 'warning',
        code: 'input-action-unbound',
        message: `Component "${componentType}" param "${param}" references unbound input action "${value}".`,
        file,
        ref: field,
      }
    case 'stat':
      if (context.declaredStats.has(value)) return undefined
      return {
        severity: 'warning',
        code: 'undeclared-stat',
        message: `Component "${componentType}" param "${param}" references undeclared stat "${value}"; runtime writes may still create it.`,
        file,
        ref: field,
      }
    case 'sound':
      if (context.soundRefs.has(value)) return undefined
      return {
        severity: 'error',
        code: 'missing-sound',
        message: `Component "${componentType}" param "${param}" references missing sound "${value}".`,
        file,
        ref: field,
      }
  }
}

async function filesBelow(directory: string, prefix = ''): Promise<string[]> {
  let entries
  try {
    entries = await readdir(directory, { withFileTypes: true })
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []
    throw error
  }
  const files: string[] = []
  for (const entry of entries) {
    const relative = prefix ? `${prefix}/${entry.name}` : entry.name
    if (entry.isDirectory()) {
      files.push(...(await filesBelow(path.join(directory, entry.name), relative)))
    } else if (entry.isFile()) {
      files.push(relative)
    }
  }
  return files
}

/**
 * Every uri a `ref: 'sound'` param may validly name (CA-13): the
 * archetype's own declared sound art, by its registry uri (e.g.
 * "waica:iso-hurt" — resolvable even when a project component references it
 * directly, without going through create_project's uri-to-path rewrite),
 * plus every file actually present under the project's src/art/ (recursive,
 * so a project-authored sound in a subfolder resolves too), matched by its
 * "src/art/<relative>" project path — the form create_project and the
 * editor rewrite a demo project's own JSON to (CA-11).
 */
export async function projectSoundRefs(
  projectPath: string,
  art: readonly ArchetypeArt[],
): Promise<ReadonlySet<string>> {
  const refs = new Set(art.filter((entry) => entry.kind === 'sound').map((entry) => entry.uri))
  for (const relative of await filesBelow(path.join(projectPath, 'src/art'))) {
    refs.add(`src/art/${relative}`)
  }
  return refs
}
