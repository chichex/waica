import { reportRejection } from '../report-rejection'
import { ArchetypeContext } from '../project/archetype'
import type { ProjectFS } from '../fs/project-fs'
import { createCommits, type EditorCore } from './editor-commits'
import { useEditorState } from './editor-state'
import { EditorCenter } from './EditorCenter'
import { EditorCrumbs } from './EditorCrumbs'
import { EditorExplorer } from './EditorExplorer'
import { EditorInspector } from './EditorInspector'
import { EditorModals } from './EditorModals'
import { EditorToolbar } from './EditorToolbar'
import { stepHistory } from './history-commands'
import { duplicateSelection, groupSelection } from './scene-tree-commands'
import { useEditorShortcuts, type EditorShortcut } from './use-editor-shortcuts'
import { useViewportHandle } from './use-viewport-handle'

/**
 * The project editor: the Explorer on the left, the open scene, prefab or
 * file in the center, the Inspector on the right. The state lives in
 * domain hooks (editor-state.ts); every edit goes through the commit points
 * in editor-commits.ts, and the panels below only wire them to the UI.
 */
export function Editor({ fs, onClose }: { fs: ProjectFS; onClose(): void }) {
  const state = useEditorState(fs)
  const core: EditorCore = { ...state, ...createCommits(state) }
  const [viewportRef, viewport] = useViewportHandle()
  useEditorShortcuts((shortcut) => runShortcut(core, shortcut))

  if (core.code.archetypeFailed) {
    return <ArchetypeFailure message={core.code.archetypeFailed} onClose={onClose} />
  }

  const { view } = core.view
  return (
    <ArchetypeContext.Provider value={core.code.editorArchetype}>
      <div className="ed-root">
        <EditorToolbar core={core} onClose={onClose} />
        <div className="ed-body">
          <aside className="ed-left">
            <EditorExplorer core={core} />
          </aside>
          <main className={`ed-center ${view ? '' : 'is-empty'}`}>
            <EditorCrumbs core={core} />
            <div className={`ed-stage ${view?.kind === 'prefab' ? 'is-prefab' : ''}`}>
              <EditorCenter core={core} viewportRef={viewportRef} />
            </div>
          </main>
          <aside className="ed-right">
            <EditorInspector core={core} viewport={viewport} />
          </aside>
        </div>
        <EditorModals core={core} />
      </div>
    </ArchetypeContext.Provider>
  )
}

/** The project names an archetype this editor cannot load: say so, and offer the way back. */
function ArchetypeFailure({ message, onClose }: { message: string; onClose: () => void }) {
  return (
    <div className="ed-root">
      <div className="ed-vp-hint" role="alert">
        ⚠️ {message}
      </div>
      <button className="ed-mini" onClick={onClose}>
        ← projects
      </button>
    </div>
  )
}

function runShortcut(core: EditorCore, shortcut: EditorShortcut): void {
  if (shortcut === 'duplicate') duplicateSelection(core)
  else if (shortcut === 'group') groupSelection(core)
  else reportRejection(stepHistory(core, shortcut), 'undo or redo')
}
