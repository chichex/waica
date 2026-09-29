import type { AnimatedProps } from '../project/clips'
import type { MachineProps } from '../project/states'
import * as ops from '../scene/ops'
import type { EditorCore } from './editor-commits'
import { prefabMachinePatch } from './prefab-commands'

/** What the animation and state modals save, on the prefab or scene entity they opened for. */

export function entityMachinePatch(core: EditorCore, name: string, patch: Partial<MachineProps>): void {
  const { scene } = core.scenes
  if (!scene) return
  const [prefabLib] = core.library.prefabLib
  let next = scene
  for (const [key, value] of Object.entries(patch)) {
    next = ops.setComponentProp(next, name, 'StateMachine', key, value, prefabLib)
  }
  core.commit(next, true)
}

/** The animation modal's Save: its clips land on the prefab or scene entity it opened for. */
export function saveAnimationClips(core: EditorCore, next: AnimatedProps): void {
  const [animTarget, setAnimTarget] = core.modals.animTarget
  const [prefabLib] = core.library.prefabLib
  const { scene } = core.scenes
  const props: Record<string, unknown> = { ...next }
  const prefab = animTarget?.kind === 'prefab' ? prefabLib[animTarget.ref] : undefined
  if (animTarget?.kind === 'prefab' && prefab) {
    const components = prefab.components.map((c) => (c.type === 'AnimatedSprite' ? { ...c, props } : c))
    core.commitPrefab(animTarget.ref, { ...prefab, components }, true)
  } else if (animTarget?.kind === 'entity' && scene) {
    core.commit(ops.setComponentProps(scene, animTarget.name, 'AnimatedSprite', props), true)
  }
  setAnimTarget(null)
}

/** The state modal's Save: the machine patch lands on the prefab or scene entity it opened for. */
export function saveStateMachinePatch(core: EditorCore, patch: Partial<MachineProps>): void {
  const [stateTarget, setStateTarget] = core.modals.stateTarget
  if (stateTarget?.kind === 'prefab') prefabMachinePatch(core, stateTarget.ref, patch)
  else if (stateTarget) entityMachinePatch(core, stateTarget.name, patch)
  setStateTarget(null)
}
