import { createContext } from 'react'
import type { InputBindings, PrefabJson, SceneComponentJson } from '@waica/engine'
import type { ProjectStats } from '../../project/stats'
import { resolveComponents } from '../../scene/ops'
import type { RefEntityContext, RefProjectState, RefTarget } from '../ref-targets'
import type { ArtItem, DroppedFile } from '../use-project-art'
import { intersectedClipComponents } from './component-meta'
import type { InspectorSelection } from './inspector-props'

export interface RefTargetContext {
  project: RefProjectState
  entity?: RefEntityContext
  texture: {
    art: readonly ArtItem[]
    urlFor: (uri: string) => string
    onImport: (files: DroppedFile[]) => Promise<void>
  }
}

export const RefTargetsContext = createContext<RefTargetContext>({
  project: { prefabs: {}, stats: {}, actions: {}, sounds: [], uiPieces: [] },
  texture: { art: [], urlFor: (uri) => uri, onImport: async () => {} },
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
  urlFor: (uri: string) => string
  onImportArt: (files: DroppedFile[]) => Promise<void>
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
    texture: {
      art: project.art,
      urlFor: project.urlFor,
      onImport: project.onImportArt,
    },
    ...(referenceComponents ? { entity: { components: referenceComponents } } : {}),
  }
}
