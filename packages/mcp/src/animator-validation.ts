import path from 'node:path'
import { glbClipNames, type SceneComponentJson } from '@waica/engine'
import { blendNamesOf, validateBlendClips, validateBlendShapes, validateClipFades } from './animator-blend-validation.js'
import { objectRecord } from './component-metadata.js'
import { clipNamesOf, readGlbHead, readModelDocument } from './glb-document.js'
import { add, type ValidationContext, type ValidationFinding } from './validation-context.js'

/** A model file's clip names: a `.glb`'s through the engine's reader of its JSON chunk (issue #173 CA-3), a `.gltf`'s from its document; null when unreadable. */
async function modelClipNames(file: string): Promise<readonly string[] | null> {
  if (/\.glb$/i.test(file)) {
    const head = await readGlbHead(file)
    return head && glbClipNames(head)
  }
  const document = await readModelDocument(file)
  return document && clipNamesOf(document)
}

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
    const names = await modelClipNames(path.join(projectPath, 'src/art', file))
    if (names) clips.set(`src/art/${file}`, names)
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
 * The clips of the glb an Animator's sibling Model names: undefined when the
 * entity has no Animator, no Model file, or a file whose clips are unknown
 * (absent, unreadable, or an archetype's own).
 */
function animatorGlbClips(components: readonly SceneComponentJson[], context: Pick<ValidationContext, 'modelClips'>): ReadonlySet<string> | undefined {
  if (!components.some((component) => component.type === 'Animator')) return undefined
  const src = modelSrcOf(components)
  const clips = src === undefined ? undefined : context.modelClips.get(src)
  return clips ? new Set(clips) : undefined
}

/** The Animator's own props, an empty record without one. */
function animatorProps(components: readonly SceneComponentJson[]): Record<string, unknown> {
  return objectRecord(components.find((component) => component.type === 'Animator')?.props)
}

/** The clips an Animator can play (issue #205): the glb's, then its blends, which `play` and a state's `clip` accept like clips. */
export interface AnimatorPlayable {
  /** Each of them and whether it loops: a glb clip unless its `clips` override says `loop: false`, a blend always (it never ends). */
  readonly loops: ReadonlyMap<string, boolean>
  /** The blends among them; a blend named like a clip of the glb is that clip. */
  readonly blends: ReadonlySet<string>
}

/** What an Animator can play; undefined when the glb's clips are unknown (see animatorGlbClips). */
export function animatorPlayable(components: readonly SceneComponentJson[], context: Pick<ValidationContext, 'modelClips'>): AnimatorPlayable | undefined {
  const glb = animatorGlbClips(components, context)
  if (!glb) return undefined
  const props = animatorProps(components)
  const overrides = objectRecord(props.clips)
  const blends = new Set(blendNamesOf(props).filter((name) => !glb.has(name)))
  const loops = new Map([...glb].map((name) => [name, objectRecord(overrides[name]).loop !== false]))
  for (const blend of blends) loops.set(blend, true)
  return { loops, blends }
}

/** One place an Animator is checked: a prefab or a scene entity, by the file and the ref findings cite. */
interface AnimatorScope {
  readonly file: string
  readonly ref: string
  readonly context: ValidationContext
  /** On a scene entity, which of its own props it changes (see animatorPropsChanged); a prefab checks them all. */
  readonly changed?: AnimatorPropsChanged
}

/** Which of the Animator's own props a scene entity changes against its prefab: the checks that read only those props rerun only for them. */
export interface AnimatorPropsChanged {
  readonly clips: boolean
  readonly blends: boolean
}

/** A prefab, or an entity with an Animator of its own: every prop is checked. */
const EVERY_PROP: AnimatorPropsChanged = { clips: true, blends: true }

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
const ANIMATOR_CLIP_KEYS: Readonly<Record<string, readonly string[]>> = { Model: ['src'], Animator: ['initialClip', 'clips', 'blends'] }

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
 * Which of the Animator's own props a scene entity changes: both with an
 * inline Animator (its prefab never checked this one), else the ones its
 * overrides name.
 */
export function animatorPropsChanged(inline: readonly SceneComponentJson[], overrides: Record<string, unknown>): AnimatorPropsChanged {
  if (inline.some((component) => component.type === 'Animator')) return EVERY_PROP
  const patch = objectRecord(overrides.Animator)
  return { clips: Object.hasOwn(patch, 'clips'), blends: Object.hasOwn(patch, 'blends') }
}

/**
 * An Animator's clip references (issue #166 CA-9): its `initialClip` and
 * every key of its `clips` overrides must be clips of the file its Model
 * names or blends of its own (`missing-clip`, errors: both are explicit
 * names); its per-clip fades and its blends are checked too (issue #205).
 * Checked on a prefab, and on a scene entity only when it changes those
 * clips (`changesAnimatorClips`), where the fades rerun only for a changed
 * `clips` and the blends' shapes only for changed `blends` (`changed`). A
 * sibling StateMachine's state clips are checked by validateStateMachines.
 */
export function validateAnimatorClips(components: readonly SceneComponentJson[], scope: AnimatorScope): void {
  if (!components.some((component) => component.type === 'Animator')) return
  const props = animatorProps(components)
  const changed = scope.changed ?? EVERY_PROP
  if (changed.clips) validateClipFades(props, scope)
  if (changed.blends) validateBlendShapes(props, scope)
  const glb = animatorGlbClips(components, scope.context)
  if (glb) validateClipReferences(props, glb, scope)
}

/** The Animator's names against the glb's clips: its blends' points, its `initialClip` and its `clips` keys (`missing-clip`). */
function validateClipReferences(props: Record<string, unknown>, glb: ReadonlySet<string>, scope: AnimatorScope): void {
  const { file, context } = scope
  validateBlendClips(props, glb, scope)
  const clips = new Set([...glb, ...blendNamesOf(props)])
  const initial = props.initialClip
  if (typeof initial === 'string' && initial && !clips.has(initial)) {
    add(context, 'error', 'missing-clip', `Animator initialClip names missing animation clip "${initial}".`, file, 'Animator.initialClip')
  }
  for (const name of Object.keys(objectRecord(props.clips))) {
    if (clips.has(name)) continue
    add(context, 'error', 'missing-clip', `Animator clips override names missing animation clip "${name}".`, file, `Animator.clips.${name}`)
  }
}
