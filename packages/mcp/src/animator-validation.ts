import path from 'node:path'
import type { SceneComponentJson } from '@waica/engine'
import { objectRecord } from './component-metadata.js'
import { clipNamesOf, readModelDocument } from './glb-document.js'
import { add, type ValidationContext, type ValidationFinding } from './validation-context.js'

/**
 * The clip names of the given model files directly under the project's
 * src/art/ (the set `projectModelRefs` lists), by their `src/art/<file>`
 * path, read from each file's JSON chunk (issue #166 CA-9). A file that
 * cannot be read is absent from the map, so the clip checks stay quiet and
 * only `missing-model` speaks for it. A `waica:` uri names an archetype's own
 * model, whose file is not read here: its clips are unknown.
 */
export async function projectModelClips(projectPath: string, modelFiles: readonly string[]): Promise<ReadonlyMap<string, readonly string[]>> {
  const clips = new Map<string, readonly string[]>()
  for (const file of modelFiles) {
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
 * The composition an Animator needs, judged per scene entity like the physics
 * composition (`physicsCompositionFindings`): a Model with a src beside it,
 * from the entity or its prefab, else `animator-without-model`. Never judged
 * on the prefab alone: an instance can complete it with a `Model.src`
 * override or an inline Model (review of PR #168).
 */
export function animatorCompositionFindings(components: readonly SceneComponentJson[], file: string, ref: string): ValidationFinding[] {
  if (!components.some((component) => component.type === 'Animator') || modelSrcOf(components) !== undefined) return []
  return [{ severity: 'error', code: 'animator-without-model', message: `Entity "${ref}" has an Animator but no Model with a src beside it; nothing plays.`, file, ref }]
}

/** The override keys of an Animator's siblings that change which clips it can play and how; any other override keeps the prefab's result. */
const ANIMATOR_CLIP_KEYS: Readonly<Record<string, readonly string[]>> = { Model: ['src'], Animator: ['initialClip', 'clips'] }

/**
 * Whether a scene entity changes the clips its Animator plays against its
 * prefab: an inline Model or Animator, or an override of a key in
 * ANIMATOR_CLIP_KEYS. Otherwise the prefab-level clip findings stand alone.
 */
export function changesAnimatorClips(inline: readonly SceneComponentJson[], overrides: Record<string, unknown>): boolean {
  return (
    inline.some((component) => Object.hasOwn(ANIMATOR_CLIP_KEYS, component.type)) ||
    Object.entries(overrides).some(([type, patch]) => (ANIMATOR_CLIP_KEYS[type] ?? []).some((key) => Object.hasOwn(objectRecord(patch), key)))
  )
}

/**
 * An Animator's clip references (issue #166 CA-9): its `initialClip` and
 * every key of its `clips` overrides must be clips of the file its Model
 * names (`missing-clip`, errors: both are explicit names). Checked on a
 * prefab, and on a scene entity only when it changes those clips
 * (`changesAnimatorClips`). A sibling StateMachine's state clips are checked
 * by validateStateMachines through the same clip set.
 */
export function validateAnimatorClips(components: readonly SceneComponentJson[], scope: AnimatorScope): void {
  const animator = components.find((component) => component.type === 'Animator')
  if (!animator) return
  const { file, context } = scope
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
