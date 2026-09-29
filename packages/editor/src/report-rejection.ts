/**
 * Observes a task an event handler or effect starts without awaiting (a save,
 * a file import, a session write): a rejection is logged with its context and
 * the original error instead of surfacing as an unhandled rejection.
 */
export function reportRejection(task: Promise<unknown>, context: string): void {
  task.catch((error: unknown) => {
    console.error(`[waica editor] ${context} failed:`, error)
  })
}
