import path from 'node:path'
import type { SceneComponentJson } from '@waica/engine'
import { objectRecord } from './component-metadata.js'
import { clipNamesOf, readModelDocument } from './glb-document.js'
import { filesDirectlyIn } from './param-reference-resolution.js'
import { add, type ValidationContext } from './validation-context.js'

/** glTF in its two forms, directly under src/art (the same set `projectModelRefs` lists). */
const MODEL_FILE_RE = /\.(glb|gltf)$/i

/**
 * The clip names of every model file directly under the project's src/art/,
 * by its `src/art/<file>` path, read from each file's JSON chunk (issue #166
 * CA-9). A file that cannot be read is absent from the map, so the clip checks
 * stay quiet and only `missing-model` speaks for it. A `waica:` uri names an
 * archetype's own model, whose file is not read here: its clips are unknown.
 */
export async function projectModelClips(projectPath: string): Promise<ReadonlyMap<string, readonly string[]>> {
  const clips = new Map<string, readonly string[]>()
  for (const file of await filesDirectlyIn(path.join(projectPath, 'src/art'))) {
    if (!MODEL_FILE_RE.test(file)) continue
    const document = await readModelDocument(path.join(projectPath, 'src/art', file))
    if (document) clips.set(`src/art/${file}`, clipNamesOf(document))
  }
  return clips
}

/** The `src` of the entity's Model, when it names a file; undefined for a primitive or no Model. */
export function modelSrcOf(components: readonly SceneComponentJson[]): string | undefined {
  const model = components.find((component) => component.type === 'Model')
  const src = objectRecord(model?.props).src
  return typeof src === 'string' && src ? src : undefined
}

/**
 * The clips an Animator can play, from the glb its sibling Model names:
 * undefined when the entity has no Animator, no Model file, or a file whose
 * clips are unknown (absent, unreadable, or an archetype's own).
 */
export function animatorClips(components: readonly SceneComponentJson[], context: Pick<ValidationContext, 'modelClips'>): ReadonlySet<string> | undefined {
  if (!components.some((component) => component.type === 'Animator')) return undefined
  const src = modelSrcOf(components)
  const clips = src === undefined ? undefined : context.modelClips.get(src)
  return clips ? new Set(clips) : undefined
}

/** Whether each clip of the glb loops under the Animator's `clips` overrides: everything loops unless an override says `loop: false`. */
export function animatorClipLoops(components: readonly SceneComponentJson[], context: Pick<ValidationContext, 'modelClips'>): ReadonlyMap<string, boolean> | undefined {
  const clips = animatorClips(components, context)
  if (!clips) return undefined
  const animator = components.find((component) => component.type === 'Animator')
  const overrides = objectRecord(objectRecord(animator?.props).clips)
  return new Map([...clips].map((name) => [name, objectRecord(overrides[name]).loop !== false]))
}

/** One place an Animator is checked: a prefab or a scene entity, by the file and the ref findings cite. */
interface AnimatorScope {
  readonly file: string
  readonly ref: string
  readonly context: ValidationContext
}

/**
 * An entity's Animator (issue #166 CA-9): it needs a Model with a src beside
 * it (`animator-without-model`), and its `initialClip` and every key of its
 * `clips` overrides must be clips of that file (`missing-clip`, errors: both
 * are explicit names). A sibling StateMachine's state clips are checked by
 * validateStateMachines through the same clip set.
 */
export function validateAnimator(components: readonly SceneComponentJson[], scope: AnimatorScope): void {
  const animator = components.find((component) => component.type === 'Animator')
  if (!animator) return
  const { file, ref, context } = scope
  if (modelSrcOf(components) === undefined) {
    add(context, 'error', 'animator-without-model', `Entity "${ref}" has an Animator but no Model with a src beside it; nothing plays.`, file, ref)
    return
  }
  const clips = animatorClips(components, context)
  if (!clips) return
  const props = objectRecord(animator.props)
  const initial = props.initialClip
  if (typeof initial === 'string' && initial && !clips.has(initial)) {
    add(context, 'error', 'missing-clip', `Animator initialClip names missing animation clip "${initial}".`, file, 'Animator.initialClip')
  }
  for (const name of Object.keys(objectRecord(props.clips))) {
    if (clips.has(name)) continue
    add(context, 'error', 'missing-clip', `Animator clips override names missing animation clip "${name}".`, file, `Animator.clips.${name}`)
  }
}
