import { useState } from 'react'

const NONE: ReadonlySet<string> = new Set()

/** Which folders of the open scene's tree are expanded, and how to change that. */
export interface SceneFolders {
  readonly expanded: ReadonlySet<string>
  toggle(name: string): void
  open(name: string): void
  setAll(names: readonly string[]): void
}

/**
 * Expanded scene folders, owned per scene file: another scene is another
 * tree, so it starts with every folder shut. The set is keyed by the scene
 * path it belongs to and derived during render — no effect resets it.
 */
export function useSceneFolders(scenePath: string | null): SceneFolders {
  const [state, setState] = useState<{ scene: string | null; open: ReadonlySet<string> }>({
    scene: scenePath,
    open: NONE,
  })
  const expanded = state.scene === scenePath ? state.open : NONE
  const update = (change: (current: ReadonlySet<string>) => ReadonlySet<string>): void => {
    setState((previous) => ({
      scene: scenePath,
      open: change(previous.scene === scenePath ? previous.open : NONE),
    }))
  }
  return {
    expanded,
    toggle: (name) =>
      update((current) => {
        const next = new Set(current)
        if (next.has(name)) next.delete(name)
        else next.add(name)
        return next
      }),
    open: (name) => update((current) => (current.has(name) ? current : new Set(current).add(name))),
    setAll: (names) => update(() => new Set(names)),
  }
}
