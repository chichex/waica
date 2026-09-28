import { useState, type Dispatch, type SetStateAction } from 'react'
import type { ExplorerView } from './Explorer'
import type { EntitySelection } from './use-entity-selection'
import type { OpenScene } from './use-open-scene'

export type EditorMode = 'edit' | 'play'

/** What the center pane shows, and whether the scene there is being played. */
export interface EditorView {
  view: ExplorerView | null
  setView: Dispatch<SetStateAction<ExplorerView | null>>
  mode: EditorMode
  setMode: Dispatch<SetStateAction<EditorMode>>
  /** Natural size of the art shown in the center, once its image loaded. */
  artDims: [number, number] | null
  setArtDims: Dispatch<SetStateAction<[number, number] | null>>
  /** Centers `next`, back in edit mode; another scene drops the entity selection. */
  openView: (next: ExplorerView) => void
}

export function useEditorView(
  scenes: Pick<OpenScene, 'openScenePath' | 'setOpenScenePath'>,
  selection: Pick<EntitySelection, 'clear'>,
): EditorView {
  const [view, setView] = useState<ExplorerView | null>(null)
  const [mode, setMode] = useState<EditorMode>('edit')
  const [artDims, setArtDims] = useState<[number, number] | null>(null)

  const openView = (next: ExplorerView): void => {
    setMode('edit')
    setView(next)
    if (next.kind === 'art') setArtDims(null)
    if (next.kind === 'scene' && next.path !== scenes.openScenePath) {
      selection.clear()
      scenes.setOpenScenePath(next.path)
    }
  }

  return { view, setView, mode, setMode, artDims, setArtDims, openView }
}
