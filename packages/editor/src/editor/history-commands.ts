import type { AtomicEntry, HistoryEntry } from '../history/history'
import type { EditorCore } from './editor-commits'
import type { ExplorerView } from './Explorer'
import { applyPrefabState, applySceneFile, applySceneState, applyUiState } from './history-restore'

type Direction = 'undo' | 'redo'

/** The value a step puts back: what was there before (undo) or after (redo). */
function valueFor<T>(entry: { before: T; after: T }, dir: Direction): T {
  return dir === 'undo' ? entry.before : entry.after
}

/** Undo or redo one step, then jump to where the change happened. */
export async function stepHistory(core: EditorCore, dir: Direction): Promise<void> {
  const [animTarget] = core.modals.animTarget
  // Play mode and the animation modal own the keyboard and the data.
  if (core.view.mode !== 'edit' || animTarget) return
  const entry = core.history.step(dir)
  if (!entry) return
  await applyEntry(core, entry, dir)
  revealEntry(core.view.openView, entry, dir)
}

async function applyEntry(core: EditorCore, entry: HistoryEntry, dir: Direction): Promise<void> {
  switch (entry.kind) {
    case 'group':
      for (const atom of inStepOrder(entry.entries, dir)) await applyEntry(core, atom, dir)
      return
    case 'scene':
      applySceneState(core, entry.path, valueFor(entry, dir))
      return
    case 'sceneFile':
      await applySceneFile(core, entry.path, valueFor(entry, dir))
      return
    case 'prefab':
      applyPrefabState(core, entry.ref, valueFor(entry, dir))
      return
    case 'ui':
      applyUiState(core, entry.name, valueFor(entry, dir))
      return
    case 'controls':
      core.settings.applyControls(valueFor(entry, dir))
      return
    case 'stats':
      core.settings.applyStats(valueFor(entry, dir))
      return
    case 'game':
      core.settings.applyGameSettings(valueFor(entry, dir))
      return
  }
}

/** Undo unwinds a grouped action back-to-front. */
function inStepOrder<T>(entries: T[], dir: Direction): T[] {
  return dir === 'undo' ? [...entries].reverse() : entries
}

/** Jumps to where the change happened so the revert is visible. */
function revealEntry(openView: (next: ExplorerView) => void, entry: HistoryEntry, dir: Direction): void {
  // A grouped action reveals its last commit (e.g. prefab+scene → the scene).
  const target = entry.kind === 'group' ? entry.entries[entry.entries.length - 1] : entry
  // A step that removed a file has nothing left to show.
  if (!target || valueFor<unknown>(target, dir) == null) return
  openView(viewOf(target))
}

/** Where an atomic change is visible. */
function viewOf(target: AtomicEntry): ExplorerView {
  switch (target.kind) {
    case 'scene':
    case 'sceneFile':
      return { kind: 'scene', path: target.path }
    case 'prefab':
      return { kind: 'prefab', ref: target.ref }
    case 'ui':
      return { kind: 'ui', name: target.name }
    case 'controls':
    case 'stats':
    case 'game':
      return { kind: target.kind }
  }
}
