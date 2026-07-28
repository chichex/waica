import type { ExplorerView } from './Explorer'

/**
 * Where the user was in a project — open scene and centered view — kept in
 * localStorage per project name, so reopening the project lands there.
 * Art views hold blob object URLs that die with the session: they round-trip
 * as null.
 */
export type WorkspaceView = Exclude<ExplorerView, { kind: 'art' }>

export interface WorkspaceState {
  openScenePath: string | null
  view: WorkspaceView | null
}

const keyFor = (project: string): string => `waica:workspace:${project}`

export function saveWorkspace(
  project: string,
  openScenePath: string | null,
  view: ExplorerView | null,
): void {
  try {
    localStorage.setItem(
      keyFor(project),
      JSON.stringify({
        waicaWorkspace: 1,
        openScenePath,
        view: view && view.kind !== 'art' ? view : null,
      }),
    )
  } catch {
    // Storage unavailable: the project still opens, just at its default view.
  }
}

/** Everything read back is untrusted: unknown kinds and bad shapes drop to null. */
function sanitizeView(raw: unknown): WorkspaceView | null {
  if (typeof raw !== 'object' || raw === null) return null
  const view = raw as Record<string, unknown>
  switch (view.kind) {
    case 'scene':
    case 'stateFile':
      return typeof view.path === 'string' ? { kind: view.kind, path: view.path } : null
    case 'prefab':
      return typeof view.ref === 'string' ? { kind: 'prefab', ref: view.ref } : null
    case 'ui':
    case 'script':
      return typeof view.name === 'string' ? { kind: view.kind, name: view.name } : null
    case 'controls':
    case 'stats':
    case 'game':
      return { kind: view.kind }
    default:
      return null
  }
}

export function loadWorkspace(project: string): WorkspaceState | null {
  try {
    const text = localStorage.getItem(keyFor(project))
    if (!text) return null
    const raw = JSON.parse(text) as Record<string, unknown> | null
    if (raw?.waicaWorkspace !== 1) return null
    return {
      openScenePath: typeof raw.openScenePath === 'string' ? raw.openScenePath : null,
      view: sanitizeView(raw.view),
    }
  } catch {
    return null
  }
}
