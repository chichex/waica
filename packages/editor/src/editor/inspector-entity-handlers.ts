import type { ComponentProps } from 'react'
import type { SceneJson } from '@waica/engine'
import * as ops from '../scene/ops'
import type { EditorCore } from './editor-commits'
import type { ViewportAccess } from './use-viewport-handle'
import type { Inspector } from './Inspector'
import { setPrefabProp } from './prefab-commands'

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
    onMultiProp: (names, componentType, key, value) => {
      if (!scene) return
      let next = scene
      for (const name of names) {
        viewport()?.applyProp(name, componentType, key, value)
        next = ops.setComponentProp(next, name, componentType, key, value, prefabLib)
      }
      core.commit(next, false, `multiprop:${names.join('|')}:${componentType}:${key}`)
    },
    onProp: (entity, componentType, key, value) => {
      if (!scene) return
      viewport()?.applyProp(entity, componentType, key, value)
      core.commit(
        ops.setComponentProp(scene, entity, componentType, key, value, prefabLib),
        false,
        `prop:${entity}:${componentType}:${key}`,
      )
    },
    onSizeAppearance: (entity, componentType, patch) => {
      if (!scene) return
      // One commit for the whole patch: chained onProp calls would
      // each read this render's scene and clobber one another.
      let next = scene
      for (const [key, value] of Object.entries(patch)) {
        if (typeof value !== 'number') continue
        viewport()?.applyProp(entity, componentType, key, value)
        next = ops.setComponentProp(next, entity, componentType, key, value, prefabLib)
      }
      core.commit(next)
    },
  } satisfies Partial<InspectorProps>
}

export function entityComponentHandlers(core: EditorCore) {
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
      if (scene) core.commit(ops.setRenderProp(scene, key, value), key === 'projection', `render:${key}`)
    },
  } satisfies Partial<InspectorProps>
}

/** Prefab overrides on an instance: reset back to the prefab, or apply to every instance. */
export function overrideHandlers(core: EditorCore) {
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
      // Structural commit: the stage re-instantiates and re-resolves
      // the prop from the prefab (no single live value to patch back).
      core.commit(ops.clearComponentOverride(scene, entity, componentType, key), true)
    },
    onApplyProp: (entity, componentType, key) => {
      if (!scene) return
      const { target, ref, prefab } = instance(entity)
      const value = target?.overrides?.[componentType]?.[key]
      if (!ref || !prefab || value === undefined) return
      // The prefab takes the instance's value; the override becomes
      // redundant and goes away. Other instances' own overrides stay.
      core.history.recordBatch(() => {
        core.commitPrefab(ref, setPrefabProp(prefab, componentType, key, value))
        core.commit(ops.clearComponentOverride(scene, entity, componentType, key), true)
      })
    },
    onResetAllProps: (entity) => {
      if (!scene) return
      const { target } = instance(entity)
      const count = target ? ops.countOverrides(target) : 0
      if (!count) return
      const s = count === 1 ? '' : 's'
      if (!window.confirm(`Reset ${count} override${s} back to the prefab's values?`)) return
      core.commit(ops.clearAllOverrides(scene, entity), true)
    },
    onApplyAllProps: (entity) => applyAllOverrides(core, entity),
  } satisfies Partial<InspectorProps>
}

/** Every override of the instance moves into its prefab, as one undo step. */
function applyAllOverrides(core: EditorCore, entity: string): void {
  const { scene } = core.scenes
  const instance = scene ? overriddenInstance(core, scene, entity) : null
  if (!scene || !instance) return
  const { ref, prefab, overrides, count } = instance
  const s = count === 1 ? '' : 's'
  if (!window.confirm(`Apply ${count} override${s} to ${ref}? Every instance gets these values.`)) {
    return
  }
  let next = prefab
  for (const [type, props] of Object.entries(overrides)) {
    for (const [key, value] of Object.entries(props)) {
      next = setPrefabProp(next, type, key, value)
    }
  }
  core.history.recordBatch(() => {
    core.commitPrefab(ref, next)
    core.commit(ops.clearAllOverrides(scene, entity), true)
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
