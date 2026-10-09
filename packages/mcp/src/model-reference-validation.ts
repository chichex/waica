import type { ArchetypeArt, SceneComponentJson } from '@waica/engine'
import path from 'node:path'
import { objectRecord } from './component-metadata.js'
import { filesDirectlyIn, projectSoundRefs } from './param-reference-resolution.js'
import { add, type ValidationContext } from './validation-context.js'

/** glTF in its two forms (matches MODEL_RE in the editor's use-project-art.ts). */
const MODEL_FILE_RE = /\.(glb|gltf)$/i

/**
 * Every uri a `kind: 'model'` param (Model.src) may validly name (issue #154
 * CA-15): the archetype's own declared model art by its registry uri, plus
 * every `.glb` / `.gltf` file directly under the project's src/art/ by its
 * "src/art/<file>" path. Like sounds, deliberately not recursive and not
 * `public/`: the generated project resolves art through
 * `import.meta.glob('./art/*')`, which never crosses `/`.
 */
export async function projectModelRefs(
  projectPath: string,
  art: readonly ArchetypeArt[],
): Promise<ReadonlySet<string>> {
  const refs = new Set(art.filter((entry) => entry.kind === 'model').map((entry) => entry.uri))
  for (const file of await filesDirectlyIn(path.join(projectPath, 'src/art'))) {
    if (MODEL_FILE_RE.test(file)) refs.add(`src/art/${file}`)
  }
  return refs
}

/** The sound and model uris a project's reference params may validly name. */
export async function projectArtRefs(
  projectPath: string,
  art: readonly ArchetypeArt[],
): Promise<Pick<ValidationContext, 'soundRefs' | 'modelRefs'>> {
  return {
    soundRefs: await projectSoundRefs(projectPath, art),
    modelRefs: await projectModelRefs(projectPath, art),
  }
}

/** One `kind: 'model'` param of one component, as the reference walk meets it. */
export interface ModelParamCheck {
  componentType: string
  param: string
  /** The prop the scene or prefab wrote, else the component's default. */
  value: unknown
  file: string
}

/**
 * Checks one `kind: 'model'` param: empty means "use the shape" and is fine,
 * anything else must name a model the project ships. Reports `missing-model`.
 */
export function checkModelParam(check: ModelParamCheck, context: ValidationContext): void {
  const { componentType, param, value, file } = check
  if (typeof value !== 'string' || value === '' || context.modelRefs.has(value)) return
  add(
    context,
    'error',
    'missing-model',
    `Component "${componentType}" param "${param}" references missing model "${value}".`,
    file,
    `${componentType}.${param}`,
  )
}

/**
 * A Model that declares both a `src` and a non-default `shape` draws the glTF
 * and ignores the shape (inference 10): the shape is a leftover worth a
 * warning. The default `box` is not one: an editor writes `shape` as soon as
 * the dropdown is touched and has no way to remove the key, so only a value
 * the user can set back to the default counts, and setting it back clears
 * the warning.
 */
export function checkModelShapeIgnored(
  component: SceneComponentJson,
  { file, ref }: { file: string; ref: string },
  context: ValidationContext,
): void {
  if (component.type !== 'Model') return
  const props = objectRecord(component.props)
  if (typeof props.src !== 'string' || props.src === '' || props.shape === undefined || props.shape === 'box') return
  add(
    context,
    'warning',
    'model-shape-ignored',
    `Model on "${ref}" declares both src and shape "${String(props.shape)}"; src wins and the shape is ignored (set the shape back to box to clear this).`,
    file,
    ref,
  )
}
