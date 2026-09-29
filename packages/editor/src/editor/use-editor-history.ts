import { useCallback, useRef } from 'react'
import { EditorHistory, type AtomicEntry, type HistoryEntry } from '../history/history'

/** The editor's undo stack: what commits record, and how a step comes back out. */
export interface EditorHistoryApi {
  record: (entry: AtomicEntry, coalesceKey?: string) => void
  /** Everything committed inside fn undoes and redoes as ONE step. */
  recordBatch: (fn: () => void) => void
  /** Pops the next entry to undo or redo, or null when there is none. */
  step: (dir: 'undo' | 'redo') => HistoryEntry | null
}

export function useEditorHistory(): EditorHistoryApi {
  const history = useRef(new EditorHistory())
  /** Non-null while recordBatch collects commits into one undo step. */
  const batchEntries = useRef<AtomicEntry[] | null>(null)

  const record = useCallback((entry: AtomicEntry, coalesceKey?: string): void => {
    if (batchEntries.current) {
      batchEntries.current.push(entry)
      return
    }
    history.current.push(entry, Date.now(), coalesceKey)
  }, [])

  const recordBatch = useCallback((fn: () => void): void => {
    batchEntries.current = []
    try {
      fn()
    } finally {
      const entries = batchEntries.current
      batchEntries.current = null
      if (entries && entries.length === 1 && entries[0]) history.current.push(entries[0], Date.now())
      else if (entries && entries.length > 1) {
        history.current.push({ kind: 'group', entries }, Date.now())
      }
    }
  }, [])

  const step = useCallback(
    (dir: 'undo' | 'redo'): HistoryEntry | null =>
      dir === 'undo' ? history.current.undo() : history.current.redo(),
    [],
  )

  return { record, recordBatch, step }
}
