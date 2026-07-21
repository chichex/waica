import type { InputBindings, PrefabJson, SceneJson } from '@waica/engine'
import type { GameSettings } from '../project/game'
import type { ProjectStats } from '../project/stats'

/**
 * Session-wide undo/redo over everything the editor commits: scene edits,
 * prefab and UI-piece edits, project settings, and file-level operations
 * (create/duplicate/delete of scenes, prefabs and UI pieces).
 *
 * Every entry carries the full before/after value of the one document it
 * touched: undo applies `before`, redo applies `after`, both through the
 * editor's regular save paths. A null side on file-shaped entries means
 * "the file does not exist" (so create is null→value, delete value→null).
 */
export type AtomicEntry =
  | { kind: 'scene'; path: string; before: SceneJson; after: SceneJson }
  | { kind: 'sceneFile'; path: string; before: string | null; after: string | null }
  | { kind: 'prefab'; ref: string; before: PrefabJson | null; after: PrefabJson | null }
  | { kind: 'ui'; name: string; before: string | null; after: string | null }
  | { kind: 'controls'; before: InputBindings; after: InputBindings }
  | { kind: 'stats'; before: ProjectStats; after: ProjectStats }
  | { kind: 'game'; before: GameSettings; after: GameSettings }

/** One user action that committed several documents undoes as one step. */
export type HistoryEntry = AtomicEntry | { kind: 'group'; entries: AtomicEntry[] }

/** Steps sharing a coalesce key merge while they arrive within this window. */
export const COALESCE_WINDOW_MS = 1000

const CAPACITY = 200

interface Step {
  entry: HistoryEntry
  at: number
  coalesceKey?: string
}

export class EditorHistory {
  private past: Step[] = []
  private future: Step[] = []

  get canUndo(): boolean {
    return this.past.length > 0
  }

  get canRedo(): boolean {
    return this.future.length > 0
  }

  /**
   * Records a step and discards any redoable ones. Input streams (typing in
   * a field, dragging a slider) pass a coalesce key naming their target:
   * consecutive steps with the same key inside the window collapse into one
   * (keeping the first `before` and the latest `after`).
   */
  push(entry: HistoryEntry, at: number, coalesceKey?: string): void {
    this.future = []
    const last = this.past[this.past.length - 1]
    if (
      last &&
      coalesceKey != null &&
      last.coalesceKey === coalesceKey &&
      at - last.at <= COALESCE_WINDOW_MS &&
      entry.kind !== 'group' &&
      last.entry.kind === entry.kind
    ) {
      last.entry = { ...last.entry, after: entry.after } as HistoryEntry
      last.at = at
      return
    }
    this.past.push({ entry, at, coalesceKey })
    if (this.past.length > CAPACITY) this.past.shift()
  }

  /** The step to revert (apply its `before`), or null when at the beginning. */
  undo(): HistoryEntry | null {
    const step = this.past.pop()
    if (!step) return null
    this.future.push(step)
    return step.entry
  }

  /** The step to replay (apply its `after`), or null when at the latest. */
  redo(): HistoryEntry | null {
    const step = this.future.pop()
    if (!step) return null
    this.past.push(step)
    return step.entry
  }
}
