/**
 * Observes a task the engine starts without awaiting (a texture settling, an
 * AudioContext state change): its rejection is logged once as a `[waica]`
 * error instead of surfacing as an unhandled rejection. Internal; not part of
 * the package entry.
 */
export function reportRejection(task: Promise<unknown>, context: string): void {
  task.catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error)
    console.error(`[waica] ${context} failed: ${message}`)
  })
}
