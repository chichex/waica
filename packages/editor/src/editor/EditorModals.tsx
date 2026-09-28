import type { SceneComponentJson, StateJson } from '@waica/engine'
import { toAnimatedProps } from '../project/clips'
import { machineProps } from '../project/states'
import { reportRejection } from '../report-rejection'
import { AnimationEditor } from './AnimationEditor'
import { createStateFile } from './code-file-commands'
import type { EditorCore } from './editor-commits'
import type { AnimTarget } from './Inspector'
import { saveAnimationClips, saveStateMachinePatch } from './modal-commands'
import { spawnPrefab, suggestedIdentity } from './prefab-commands'
import { RolePickerModal, StateEditorModal, type StateTarget } from './StateMachinePanel'

/** The editor's modals: the clip editor, the state editor and the new-character role picker. */
export function EditorModals({ core }: { core: EditorCore }) {
  const [animTarget] = core.modals.animTarget
  const [stateTarget] = core.modals.stateTarget
  const [rolePicking, setRolePicking] = core.modals.rolePicking
  const [prefabLib] = core.library.prefabLib
  return (
    <>
      {animTarget && <AnimationModal core={core} target={animTarget} />}
      {stateTarget && <StateModal core={core} target={stateTarget} />}
      {rolePicking && (
        <RolePickerModal
          suggested={suggestedIdentity(prefabLib)}
          onPick={({ identity, role }) => {
            setRolePicking(false)
            spawnPrefab(core, 'character', { role, identity })
          }}
          onCancel={() => setRolePicking(false)}
        />
      )}
    </>
  )
}

/** The components of the prefab or scene entity a modal opened for. */
function targetComponents(core: EditorCore, target: AnimTarget | StateTarget): SceneComponentJson[] | undefined {
  const [prefabLib] = core.library.prefabLib
  if (target.kind === 'prefab') return prefabLib[target.ref]?.components
  return core.scenes.scene?.entities.find((e) => e.name === target.name)?.components
}

/**
 * A character's clip checklist is its state graph: every state plays the
 * clip of its own name (or its `clip` override) on enter.
 */
function requiredClips(components: SceneComponentJson[] | undefined): string[] {
  const machine = components?.find((c) => c.type === 'StateMachine')
  const states = (machine?.props?.states ?? {}) as Record<string, StateJson | undefined>
  return [
    ...new Set(
      Object.entries(states)
        .filter(([name]) => name !== '*')
        .map(([name, state]) => state?.clip ?? name),
    ),
  ]
}

function AnimationModal({ core, target }: { core: EditorCore; target: AnimTarget }) {
  const [, setAnimTarget] = core.modals.animTarget
  const components = targetComponents(core, target)
  const comp = components?.find((c) => c.type === 'AnimatedSprite')
  if (!comp) return null
  // Only a prefab carries the state graph the checklist comes from.
  const required = target.kind === 'prefab' ? requiredClips(components) : []
  return (
    <AnimationEditor
      title={target.kind === 'prefab' ? target.ref : target.name}
      initial={toAnimatedProps(comp.props)}
      contract={required.length ? { required, fallbacks: {} } : undefined}
      // The frame/sheet picker chooses a texture, never a sound.
      art={core.art.art.filter((item) => item.kind === 'image')}
      urlFor={core.art.urlFor}
      onImportArt={core.art.importArt}
      onSave={(next) => saveAnimationClips(core, next)}
      onCancel={() => setAnimTarget(null)}
    />
  )
}

function StateModal({ core, target }: { core: EditorCore; target: StateTarget }) {
  const [, setStateTarget] = core.modals.stateTarget
  const comps = targetComponents(core, target)
  const comp = comps?.find((c) => c.type === 'StateMachine')
  if (!comp) return null
  const sprite = comps?.find((c) => c.type === 'AnimatedSprite')
  const machine = machineProps(comp)
  return (
    <StateEditorModal
      title={target.kind === 'prefab' ? target.ref : target.name}
      machine={machine}
      state={target.state}
      clips={Object.keys((sprite?.props?.clips as Record<string, unknown>) ?? {})}
      inputActions={Object.keys(core.settings.controls ?? {})}
      stateFiles={core.code.stateFiles}
      onCreateFile={(state) => reportRejection(createStateFile(core, machine.role, state), 'create state file')}
      onSave={(patch) => saveStateMachinePatch(core, patch)}
      onCancel={() => setStateTarget(null)}
    />
  )
}
