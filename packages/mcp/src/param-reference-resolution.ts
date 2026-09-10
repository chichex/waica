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

/** Files directly inside `directory` — not recursive, and never a directory entry. */
async function filesDirectlyIn(directory: string): Promise<string[]> {
  let entries
  try {
    entries = await readdir(directory, { withFileTypes: true })
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []
    throw error
  }
  return entries.filter((entry) => entry.isFile()).map((entry) => entry.name)
}

/** The one shipped audio format (matches AUDIO_RE in the editor's use-project-art.ts). */
const SOUND_FILE_RE = /\.ogg$/i

/**
 * Every uri a `ref: 'sound'` param may validly name (CA-13): the
 * archetype's own declared sound art, by its registry uri (e.g.
 * "waica:iso-hurt" — resolvable even when a project component references it
 * directly, without going through create_project's uri-to-path rewrite),
 * plus every `.ogg` file directly under the project's src/art/, matched by
 * its "src/art/<file>" project path — the form create_project and the
 * editor rewrite a demo project's own JSON to (CA-11).
 *
 * Deliberately NOT recursive and NOT extension-agnostic: the generated
 * project's main.ts (create_project reuses packages/editor/template/src
 * verbatim) resolves art through `import.meta.glob('./art/*')`, and Vite's
 * `*` never crosses `/` — a sound one folder deeper than src/art/ 404s at
 * runtime exactly like a non-.ogg file would never decode as one, so this
 * validator must not bless either.
 *
 * Deliberately excludes `public/` too, even though the editor's own asset
 * scan lists `public/*.ogg` in the `ref: 'sound'` picker (useProjectArt
 * scans [src/art, public], inherited from the pre-audio image scan) and its
 * live Play-mode preview resolves it through a browser blob URL. The
 * *shipped* project's resolveAsset — the one create_project and every
 * example's main.ts actually run — only maps `src/art/*`; a `public/*` uri
 * falls through unresolved and 404s once the project is exported or built,
 * so flagging it here is correct. This is a pre-existing gap one level up
 * (the same picker already offers unreachable `public/*` images for
 * texture props, entirely unvalidated — there is no `ref: 'texture'`
 * check), not something this validator should paper over.
 */
export async function projectSoundRefs(
  projectPath: string,
  art: readonly ArchetypeArt[],
): Promise<ReadonlySet<string>> {
  const refs = new Set(art.filter((entry) => entry.kind === 'sound').map((entry) => entry.uri))
  for (const file of await filesDirectlyIn(path.join(projectPath, 'src/art'))) {
    if (SOUND_FILE_RE.test(file)) refs.add(`src/art/${file}`)
  }
  return refs
}
