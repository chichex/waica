type Handler = (...args: unknown[]) => void

/** The game's minimal event bus (e.g. 'collect' when picking up a coin). */
export class Emitter {
  private readonly handlers = new Map<string, Set<Handler>>()

  on(event: string, handler: Handler): () => void {
    let set = this.handlers.get(event)
    if (!set) {
      set = new Set()
      this.handlers.set(event, set)
    }
    set.add(handler)
    return () => set.delete(handler)
  }

  emit(event: string, ...args: unknown[]): void {
    const set = this.handlers.get(event)
    if (!set) return
    for (const handler of [...set]) handler(...args)
  }
}
