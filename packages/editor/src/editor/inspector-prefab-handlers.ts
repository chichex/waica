import type { ComponentProps } from 'react'
import type { PrefabJson } from '@waica/engine'
import { setAppearanceShape, setAppearanceTexture, setCollisionEnabled, toggleAnimated } from '../project/chassis'
import type { EditorCore } from './editor-commits'
import type { ViewportAccess } from './use-viewport-handle'
import { refBase } from './Explorer'
import type { Inspector } from './Inspector'
import { setPrefabProp } from './prefab-commands'

type InspectorProps = ComponentProps<typeof Inspector>

/** Inspector edits on a prefab: they reach every instance. */
export function prefabPropHandlers(core: EditorCore, viewport: ViewportAccess) {
  const [prefabLib] = core.library.prefabLib
  return {
    onPrefabProp: (ref, componentType, key, value) => {
      const prefab = prefabLib[ref]
      if (!prefab) return
      const structural = componentType === 'Tilemap' && key === 'texture'
      // Stored asset paths need registry resolution, so a Tilemap
      // texture swap recreates the stage instead of patching the URI.
      if (!structural) viewport()?.applyProp(refBase(ref), componentType, key, value)
      core.commitPrefab(ref, setPrefabProp(prefab, componentType, key, value), structural, `prop:${componentType}:${key}`)
    },
    onPrefabSizeAppearance: (ref, componentType, size) => {
      const prefab = prefabLib[ref]
      if (!prefab) return
      viewport()?.applyProp(refBase(ref), componentType, 'width', size.width)
      viewport()?.applyProp(refBase(ref), componentType, 'height', size.height)
      const next = setPrefabProp(prefab, componentType, 'width', size.width)
      core.commitPrefab(ref, setPrefabProp(next, componentType, 'height', size.height))
    },
    onPrefabAddComponent: (ref, type) => {
      const prefab = prefabLib[ref]
      if (!prefab || prefab.components.some((c) => c.type === type)) return
      core.commitPrefab(ref, { ...prefab, components: [...prefab.components, { type, props: {} }] }, true)
    },
    onPrefabRemoveComponent: (ref, type) => {
      const prefab = prefabLib[ref]
      if (!prefab) return
      core.commitPrefab(ref, { ...prefab, components: prefab.components.filter((c) => c.type !== type) }, true)
    },
  } satisfies Partial<InspectorProps>
}

/** The prefab's appearance and collision switches, which rebuild the stage. */
export function prefabAppearanceHandlers(core: EditorCore) {
  const [prefabLib] = core.library.prefabLib
  const [, setAnimTarget] = core.modals.animTarget
  return {
    onPrefabToggleAnimated: (ref) => {
      const prefab = prefabLib[ref]
      if (!prefab) return
      const anim = prefab.components.find((c) => c.type === 'AnimatedSprite')
      if (anim && !confirmsDiscardingClips(prefab, 'Switching to static')) return
      const next = toggleAnimated(prefab)
      if (!next) return
      core.commitPrefab(ref, next, true)
      // Going animated drops you straight into the clip editor.
      if (next.components.some((c) => c.type === 'AnimatedSprite')) {
        setAnimTarget({ kind: 'prefab', ref })
      }
    },
    onPrefabSetTexture: (ref, uri) => {
      const prefab = prefabLib[ref]
      if (prefab) core.commitPrefab(ref, setAppearanceTexture(prefab, uri), true)
    },
    onPrefabSetShape: (ref) => {
      const prefab = prefabLib[ref]
      if (!prefab || !confirmsDiscardingClips(prefab, 'Switching to a shape')) return
      core.commitPrefab(ref, setAppearanceShape(prefab), true)
    },
    onPrefabSetCollision: (ref, enabled) => {
      const prefab = prefabLib[ref]
      if (prefab) core.commitPrefab(ref, setCollisionEnabled(prefab, enabled), true)
    },
  } satisfies Partial<InspectorProps>
}

/** True when the prefab has no animation clips to lose, or the user accepts losing them. */
function confirmsDiscardingClips(prefab: PrefabJson, action: string): boolean {
  const anim = prefab.components.find((c) => c.type === 'AnimatedSprite')
  const clipCount = Object.keys((anim?.props?.clips as object | undefined) ?? {}).length
  return clipCount === 0 || window.confirm(`${action} discards ${clipCount} animation clip(s).`)
}
