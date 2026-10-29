import type { ComponentPropPatch } from './inspector/animator-blends-edit'
import type { ComponentProps } from 'react'
import type { SceneJson } from '@waica/engine'
import * as ops from '../scene/ops'
import type { EditorCore } from './editor-commits'
import type { ViewportAccess } from './use-viewport-handle'
import type { Inspector } from './Inspector'
import { setPrefabProp } from './prefab-commands'
import { validateShadowEdit } from './shadow-edit-capacity'

type InspectorProps = ComponentProps<typeof Inspector>

/**
 * Inspector edits on scene entities. Prop edits patch the live viewport
 * entity first and commit non-structurally; component and texture changes
 * rebuild the stage.
 */
export function entityPropHandlers(core: EditorCore, viewport: ViewportAccess) {
  const { scene } = core.scenes
  const [prefabLib] = core.library.prefabLib
  return {
    onMove: (name, position) => {
      if (!scene) return
      viewport()?.applyMove(name, position[0], position[1])
      core.commit(ops.moveEntity(scene, name, position), false, `move:${name}`)
    },
    onMultiProp: (...[names, componentType, key, value]) => {
      if (!scene) return
      let next = scene
      for (const name of names) {
        next = ops.setComponentProp(next, name, componentType, key, value, prefabLib)
      }
      validateShadowEdit(viewport, next, { prefabs: prefabLib, types: [componentType], names })
      for (const name of names) viewport()?.applyProp(name, componentType, key, value)
      core.commit(next, false, `multiprop:${names.join('|')}:${componentType}:${key}`)
    },
    onProp: (...[entity, componentType, key, value]) => {
      if (!scene) return
      viewport()?.applyProp(entity, componentType, key, value)
      core.commit(
        ops.setComponentProp(scene, entity, componentType, key, value, prefabLib),
        false,
        `prop:${entity}:${componentType}:${key}`,
      )
    },
    onPatchProps: (entity, patches) => applyEntityPatches(core, viewport, { entity, patches }),
    onSizeAppearance: (entity, componentType, patch) => applySizeAppearance(core, viewport, { entity, componentType, patch }),
  } satisfies Partial<InspectorProps>
}

/** A 3D scene's X/Y/Z, rotation and scale edits: patched onto the live entity, then committed. */
export function entityTransformHandlers(core: EditorCore, viewport: ViewportAccess) {
  const { scene } = core.scenes
  return {
    onTransform: (name, patch) => {
      if (!scene) return
      viewport()?.applyTransform(name, patch)
      core.commit(ops.setEntityTransform(scene, name, patch), false, `transform:${name}:${Object.keys(patch).join(',')}`)
    },
  } satisfies Partial<InspectorProps>
}

export function entityComponentHandlers(core: EditorCore, viewport: ViewportAccess) {
  const { scene } = core.scenes
  const [prefabLib] = core.library.prefabLib
  return {
    onAddComponent: (entity, type) => {
      if (scene) core.commit(ops.addComponent(scene, entity, type), true)
    },
    onRemoveComponent: (entity, type) => {
      if (scene) core.commit(ops.removeComponent(scene, entity, type, prefabLib), true)
    },
    onSetEntityCollision: (entity, type) => {
      if (!scene) return
      // Swap in one commit: chained handlers would each see a stale scene.
      let next = scene
      for (const t of ['Hitbox', 'Solid']) next = ops.removeComponent(next, entity, t, prefabLib)
      if (type) next = ops.addComponent(next, entity, type)
      core.commit(next, true)
    },
    onSetTexture: (entity, componentType, uri) => {
      if (!scene) return
      // Structural: sprite meshes are built in onReady, so a texture
      // change only shows up after a stage rebuild.
      core.commit(ops.setComponentProp(scene, entity, componentType, 'texture', uri, prefabLib), true)
    },
    onCameraProp: (key, value) => {
      if (scene) core.commit(ops.setCameraProp(scene, key, value), false, `camera:${key}`)
    },
    onRenderProp: (key, value) => {
      if (!scene) return
      const next = ops.setRenderProp(scene, key, value)
      // Reject an unsupported shadow request before recording or persisting it.
      if (key === 'shadows') viewport()?.game()?.shadows.loadScene(next.render?.shadows)
      // Projection and batching are chosen as entities spawn, lighting and
      // Post Effects as the scene loads: all rebuild the stage.
      const structural = ['projection', 'batch', 'lighting', 'post'].includes(key)
      core.commit(next, structural, `render:${key}`)
    },
  } satisfies Partial<InspectorProps>
}

/** Prefab overrides on an instance: reset back to the prefab, or apply to every instance. */
export function overrideHandlers(core: EditorCore, viewport: ViewportAccess) {
  const { scene } = core.scenes
  const [prefabLib] = core.library.prefabLib
  const instance = (entity: string) => {
    const target = scene ? ops.findEntity(scene, entity) : undefined
    const ref = target?.prefab
    return { target, ref, prefab: ref ? prefabLib[ref] : undefined }
  }
  return {
    onResetProp: (entity, componentType, key) => {
      if (!scene) return
      const next = ops.clearComponentOverride(scene, entity, componentType, key)
      validateShadowEdit(viewport, next, { prefabs: prefabLib, types: [componentType], names: [entity] })
      // Structural commit: the stage re-instantiates and re-resolves
      // the prop from the prefab (no single live value to patch back).
      core.commit(next, true)
    },
    onApplyProp: (entity, componentType, key) => applyOneOverride(core, { entity, componentType, key }, viewport),
    onResetAllProps: (entity) => {
      if (!scene) return
      const { target } = instance(entity)
      const count = target ? ops.countOverrides(target) : 0
      if (!count) return
      const next = ops.clearAllOverrides(scene, entity)
      validateShadowEdit(viewport, next, { prefabs: prefabLib, types: Object.keys(target?.overrides ?? {}), names: [entity] })
      const s = count === 1 ? '' : 's'
      if (!window.confirm(`Reset ${count} override${s} back to the prefab's values?`)) return
      core.commit(next, true)
    },
    onApplyAllProps: (entity) => applyAllOverrides(core, entity, viewport),
  } satisfies Partial<InspectorProps>
}

/** One instance value moves into the prefab, after validating every affected light. */
function applyOneOverride(core: EditorCore, target: { entity: string; componentType: string; key: string }, viewport: ViewportAccess): void {
  const { scene } = core.scenes
  const instance = scene ? overriddenInstance(core, scene, target.entity) : null
  if (!scene || !instance) return
  const { entity, componentType, key } = target
  const value = instance.overrides[componentType]?.[key]
  if (value === undefined) return
  const nextPrefab = setPrefabProp(instance.prefab, componentType, key, value)
  const nextScene = ops.clearComponentOverride(scene, entity, componentType, key)
  validateShadowEdit(viewport, nextScene, { prefabs: { ...core.library.prefabLib[0], [instance.ref]: nextPrefab }, types: [componentType], prefab: instance.ref })
  core.history.recordBatch(() => {
    core.commitPrefab(instance.ref, nextPrefab)
    core.commit(nextScene, true)
  })
}

/** Every override of the instance moves into its prefab, as one undo step. */
function applyAllOverrides(core: EditorCore, entity: string, viewport: ViewportAccess): void {
  const { scene } = core.scenes
  const instance = scene ? overriddenInstance(core, scene, entity) : null
  if (!scene || !instance) return
  const { ref, prefab, overrides, count } = instance
  let next = prefab
  for (const [type, props] of Object.entries(overrides)) {
    for (const [key, value] of Object.entries(props)) {
      next = setPrefabProp(next, type, key, value)
    }
  }
  const nextScene = ops.clearAllOverrides(scene, entity)
  validateShadowEdit(viewport, nextScene, { prefabs: { ...core.library.prefabLib[0], [ref]: next }, types: Object.keys(overrides), prefab: ref })
  const s = count === 1 ? '' : 's'
  if (!window.confirm(`Apply ${count} override${s} to ${ref}? Every instance gets these values.`)) return
  core.history.recordBatch(() => {
    core.commitPrefab(ref, next)
    core.commit(nextScene, true)
  })
}

/** The prefab instance `entity`, when it has overrides to apply; null otherwise. */
function overriddenInstance(core: EditorCore, scene: SceneJson, entity: string) {
  const [prefabLib] = core.library.prefabLib
  const target = ops.findEntity(scene, entity)
  const ref = target?.prefab
  const prefab = ref ? prefabLib[ref] : undefined
  const count = target ? ops.countOverrides(target) : 0
  if (!target || !ref || !prefab || !count) return null
  return { ref, prefab, overrides: target.overrides ?? {}, count }
}

function applyEntityPatches(
  core: EditorCore,
  viewport: ViewportAccess,
  target: { entity: string; patches: readonly ComponentPropPatch[] },
): void {
  const { scene } = core.scenes
  const [prefabLib] = core.library.prefabLib
  const { entity, patches } = target
  if (!scene || patches.length === 0) return
  let next = scene
  for (const { componentType, key, value } of patches) {
    if (componentType !== 'StateMachine') viewport()?.applyProp(entity, componentType, key, value)
    next = ops.setComponentProp(next, entity, componentType, key, value, prefabLib)
  }
  core.commit(next, patches.some((patch) => patch.componentType === 'StateMachine'))
}

function applySizeAppearance(
  core: EditorCore,
  viewport: ViewportAccess,
  target: { entity: string; componentType: string; patch: { width?: number; height?: number } },
): void {
  const { scene } = core.scenes
  const [prefabLib] = core.library.prefabLib
  const { entity, componentType, patch } = target
  if (!scene) return
  let next = scene
  for (const [key, value] of Object.entries(patch)) {
    if (typeof value !== 'number') continue
    viewport()?.applyProp(entity, componentType, key, value)
    next = ops.setComponentProp(next, entity, componentType, key, value, prefabLib)
  }
  core.commit(next)
}
