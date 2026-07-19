type Handler = (...args: unknown[]) => void

/** Bus de eventos mínimo del juego (p. ej. 'collect' al juntar una moneda). */
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
