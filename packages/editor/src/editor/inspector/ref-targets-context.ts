import { createContext } from 'react'
import type { InputBindings, PrefabJson, SceneComponentJson } from '@waica/engine'
import type { ProjectStats } from '../../project/stats'
import { resolveComponents } from '../../scene/ops'
import type { RefEntityContext, RefProjectState, RefTarget } from '../ref-targets'
import type { ArtItem } from '../use-project-art'
import { intersectedClipComponents } from './component-meta'
import type { InspectorSelection } from './inspector-props'

export interface RefTargetContext {
  project: RefProjectState
  entity?: RefEntityContext
}

export const RefTargetsContext = createContext<RefTargetContext>({
  project: { prefabs: {}, stats: {}, actions: {}, sounds: [], uiPieces: [] },
})

/** The components whose values constrain the selection's typed references (e.g. its clips). */
function referenceComponentsOf(
  selection: InspectorSelection,
  prefabs: Record<string, PrefabJson>,
): SceneComponentJson[] | undefined {
  return selection?.kind === 'entity'
    ? resolveComponents(selection.entity, prefabs)
    : selection?.kind === 'prefab'
      ? selection.prefab.components
      : selection?.kind === 'multi'
        ? intersectedClipComponents(selection.entities, prefabs)
        : undefined
}

/** What the selection's typed-reference pickers may offer: project targets plus its own components. */
export function referenceContextFor(project: {
  selection: InspectorSelection
  prefabs: Record<string, PrefabJson>
  stats: ProjectStats
  actions: InputBindings
  art: readonly ArtItem[]
  uiPieces?: readonly string[]
}): RefTargetContext {
  const referenceComponents = referenceComponentsOf(project.selection, project.prefabs)
  const sounds: RefTarget[] = project.art
    .filter((item) => item.kind === 'sound')
    .map((item) => ({ value: item.uri, label: item.label }))
  return {
    project: {
      prefabs: project.prefabs,
      stats: project.stats,
      actions: project.actions,
      sounds,
      uiPieces: project.uiPieces ?? [],
    },
    ...(referenceComponents ? { entity: { components: referenceComponents } } : {}),
  }
}
