import type { PrefabJson } from '@waica/engine'
import { PREFAB_DIRS, prefabPath } from '../fs/prefab-fs'
import { newPrefabComponents, type CharacterIdentity } from '../project/chassis'
import type { MachineProps } from '../project/states'
import type { EditorCore } from './editor-commits'
import { refBase } from './Explorer'

/** Prefab files: creating, duplicating and deleting them, and patching their props. */

export function setPrefabProp(
  prefab: PrefabJson,
  componentType: string,
  key: string,
  value: unknown,
): PrefabJson {
  return {
    ...prefab,
    components: prefab.components.map((c) =>
      c.type === componentType ? { ...c, props: { ...c.props, [key]: value } } : c,
    ),
  }
}

/** Creates a prefab of `type` and opens it; a character is born with its identity. */
export function spawnPrefab(
  core: EditorCore,
  type: PrefabJson['type'],
  character?: { role?: string; identity?: CharacterIdentity },
): void {
  const [prefabLib] = core.library.prefabLib
  const dir = Object.entries(PREFAB_DIRS).find(([, cat]) => cat === type)?.[0]
  if (!dir) return
  let n = 1
  while (prefabLib[`${dir}/${type}-${n}`]) n++
  const ref = `${dir}/${type}-${n}`
  core.commitPrefab(
    ref,
    { waicaPrefab: 1, type, components: newPrefabComponents(type, character?.role, character?.identity) },
    true,
  )
  core.view.openView({ kind: 'prefab', ref })
}

// Characters pick their identity at birth (the RolePickerModal) and are
// born whole — graph, driver and identity extras installed. Objects and
// tiles create directly.
export function createPrefab(core: EditorCore, type: PrefabJson['type']): void {
  const [, setRolePicking] = core.modals.rolePicking
  if (type === 'character') setRolePicking(true)
  else spawnPrefab(core, type)
}

/** Preselect 'player' until the project has one, then 'enemy'. */
export function suggestedIdentity(prefabLib: Record<string, PrefabJson>): CharacterIdentity {
  return Object.values(prefabLib).some(
    (p) =>
      p.type === 'character' &&
      p.components.some((c) => c.type === 'StateMachine' && c.props?.role === 'player'),
  )
    ? 'enemy'
    : 'player'
}

export function duplicatePrefab(core: EditorCore, ref: string): void {
  const [prefabLib] = core.library.prefabLib
  const prefab = prefabLib[ref]
  if (!prefab) return
  const dir = ref.slice(0, ref.indexOf('/'))
  const base = refBase(ref)
  let copyRef = `${dir}/${base}-copy`
  for (let n = 2; prefabLib[copyRef]; n++) copyRef = `${dir}/${base}-copy-${n}`
  core.commitPrefab(copyRef, structuredClone(prefab), true)
  core.view.openView({ kind: 'prefab', ref: copyRef })
}

export async function deletePrefab(core: EditorCore, ref: string): Promise<void> {
  const [prefabLib, setPrefabLib] = core.library.prefabLib
  const prefab = prefabLib[ref]
  if (!prefab) return
  if (!window.confirm(`Delete ${refBase(ref)}? Entities using it will lose its components.`)) {
    return
  }
  core.persistence.cancel(`prefab:${ref}`)
  // The file may not exist yet (debounced save cancelled above): ignore.
  await core.fs.deleteFile(prefabPath(ref)).catch(() => {})
  core.history.record({ kind: 'prefab', ref, before: prefab, after: null })
  setPrefabLib((lib) => withoutKey(lib, ref))
  core.bumpEpoch()
  const { view } = core.view
  if (view?.kind === 'prefab' && view.ref === ref) core.view.setView(null)
}

export function prefabMachinePatch(core: EditorCore, ref: string, patch: Partial<MachineProps>): void {
  const [prefabLib] = core.library.prefabLib
  const prefab = prefabLib[ref]
  if (!prefab) return
  let next = prefab
  for (const [key, value] of Object.entries(patch)) {
    next = setPrefabProp(next, 'StateMachine', key, value)
  }
  // Structural: the stage re-instantiates so machines pick up the new graph.
  core.commitPrefab(ref, next, true)
}

/** A copy of `lib` without `key`. */
export function withoutKey<T>(lib: Record<string, T>, key: string): Record<string, T> {
  const next = { ...lib }
  delete next[key]
  return next
}
