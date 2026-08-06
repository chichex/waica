import { authoringDefaults, type ComponentClass } from '@waica/engine'

/**
 * A component class's authorable field defaults — the public surface
 * authoringDefaults exposes, read by instantiating the class (unset params
 * show what the game actually runs, so their value AND type match reality).
 *
 * The registry now carries project-owned classes, i.e. arbitrary user code,
 * and the inspector reads these during React render where an uncaught throw
 * unmounts the whole editor. A class that throws costs its own defaults and
 * nothing else.
 */
export function classDefaults(
  Class: ComponentClass | undefined,
  type: string,
  onError: (message: string) => void = console.error,
): Record<string, unknown> {
  if (!Class) return {}
  return authoringDefaults(Class, (error) => {
    const message = error instanceof Error ? error.message : String(error)
    onError(`[waica] component "${type}" failed to construct: ${message}`)
  })
}
