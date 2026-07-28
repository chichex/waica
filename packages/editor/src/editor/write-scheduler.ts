/**
 * One debounce clock for every durable write. Each key keeps only its latest
 * write, and flushAll() lands whatever is pending right now — so the page can
 * hide, close or unmount the editor without losing the last moments of edits.
 */
export const WRITE_DELAY_MS = 600

interface Pending {
  timer: ReturnType<typeof setTimeout>
  run: () => void
}

export class WriteScheduler {
  private readonly pending = new Map<string, Pending>()

  constructor(private readonly delayMs: number = WRITE_DELAY_MS) {}

  /** Replaces any pending write under the same key and restarts its clock. */
  schedule(key: string, run: () => void): void {
    const entry = this.pending.get(key)
    if (entry) clearTimeout(entry.timer)
    this.pending.set(key, { timer: setTimeout(() => this.fire(key), this.delayMs), run })
  }

  /** Drops a pending write without running it (deletes and renames). */
  cancel(key: string): void {
    const entry = this.pending.get(key)
    if (!entry) return
    clearTimeout(entry.timer)
    this.pending.delete(key)
  }

  /** Runs every pending write now: the page is hiding or the editor is closing. */
  flushAll(): void {
    for (const key of [...this.pending.keys()]) this.fire(key)
  }

  private fire(key: string): void {
    const entry = this.pending.get(key)
    if (!entry) return
    clearTimeout(entry.timer)
    this.pending.delete(key)
    entry.run()
  }
}
