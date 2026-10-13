import type { ExplorerView } from './Explorer'
import { isJsonObject, readJsonObject } from '../json-object'

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

/** The editor camera over a 3D scene (issue #173 CA-12): where it sits and the point it orbits. */
export interface CameraPose {
  position: [number, number, number]
  target: [number, number, number]
}

const keyFor = (project: string): string => `waica:workspace:${project}`

/** The project's stored workspace entry, or null when there is none, it is unreadable or storage throws. */
function readEntry(project: string): Record<string, unknown> | null {
  try {
    const text = localStorage.getItem(keyFor(project))
    const raw = text ? readJsonObject(text) : null
    return raw?.waicaWorkspace === 1 ? raw : null
  } catch {
    return null
  }
}

/** Writes the entry; a storage that throws costs only the memory, never the edit. */
function writeEntry(project: string, entry: Record<string, unknown>): void {
  try {
    localStorage.setItem(keyFor(project), JSON.stringify({ ...entry, waicaWorkspace: 1 }))
  } catch {
    // Storage unavailable: the project still opens, just at its default view.
  }
}

export function saveWorkspace(
  project: string,
  openScenePath: string | null,
  view: ExplorerView | null,
): void {
  // The camera poses ride along (CA-12): saving the view must not forget them.
  const cameras = readEntry(project)?.cameras
  writeEntry(project, {
    openScenePath,
    view: view && view.kind !== 'art' ? view : null,
    ...(cameras === undefined ? {} : { cameras }),
  })
}

/** Remembers the editor camera's pose for one scene of the project. */
export function saveCameraPose(project: string, scenePath: string, pose: CameraPose): void {
  const entry = readEntry(project) ?? { openScenePath: null, view: null }
  const cameras = isJsonObject(entry.cameras) ? entry.cameras : {}
  writeEntry(project, { ...entry, cameras: { ...cameras, [scenePath]: pose } })
}

function isVector3(value: unknown): value is [number, number, number] {
  return Array.isArray(value) && value.length === 3 && value.every((n) => typeof n === 'number' && Number.isFinite(n))
}

/** The editor camera's remembered pose for one scene, or null: none, malformed, or storage throws. */
export function loadCameraPose(project: string, scenePath: string): CameraPose | null {
  const cameras = readEntry(project)?.cameras
  const pose = isJsonObject(cameras) && Object.hasOwn(cameras, scenePath) ? cameras[scenePath] : undefined
  if (!isJsonObject(pose)) return null
  const { position, target } = pose
  return isVector3(position) && isVector3(target) ? { position: [...position], target: [...target] } : null
}

/** Everything read back is untrusted: unknown kinds and bad shapes drop to null. */
function sanitizeView(raw: unknown): WorkspaceView | null {
  if (typeof raw !== 'object' || raw === null) return null
  const view = raw as Record<string, unknown>
  switch (view.kind) {
    case 'scene':
    case 'stateFile':
    case 'componentFile':
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
    const raw = readJsonObject(text)
    if (raw?.waicaWorkspace !== 1) return null
    return {
      openScenePath: typeof raw.openScenePath === 'string' ? raw.openScenePath : null,
      view: sanitizeView(raw.view),
    }
  } catch {
    return null
  }
}
