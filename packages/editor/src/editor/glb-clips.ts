// The clip names of the glb files a project's Models draw, read in the editor
// (issue #173 CA-4): once per project path through ProjectFS, kept for the
// session, and read again after the editor writes that path. What the
// Animator rows, the state list and the state modal offer and check.
import { glbClipNames, type SceneComponentJson } from '@waica/engine'
import { createContext, useContext, useEffect, useState, useSyncExternalStore } from 'react'
import type { ProjectFS } from '../fs/project-fs'
import { reportRejection } from '../report-rejection'
import { knownClips, modelSrcOf } from './inspector/component-meta'

/**
 * The project file a Model's `src` names (`src/art/hero.glb`), or null for
 * anything the editor does not read from the project: no src, a uri with a
 * scheme (`https:`, `blob:`, `data:`, an archetype's own `waica:` model) or
 * an absolute url path.
 */
export function projectModelPath(src: unknown): string | null {
  if (typeof src !== 'string' || src === '') return null
  if (/^[a-z][a-z0-9+.-]*:/i.test(src) || src.startsWith('/')) return null
  return src
}

/** A path's read: in flight, or done with its clip names (null when the file is missing or not a glb). */
type ClipRead = { readonly state: 'reading' } | { readonly state: 'read'; readonly names: readonly string[] | null }

/** The glb clip names of project files by path, each read once until the path is written again (issue #173 inference 4). */
export class GlbClipCache {
  private readonly reads = new Map<string, ClipRead>()
  /** The names a path's last settled read gave, shown while it is read again so the UI does not flicker. */
  private readonly previous = new Map<string, readonly string[] | null>()
  /** Bumped by every invalidation, so a hook rereads a path whose visible clips did not change. */
  private readonly versions = new Map<string, number>()
  private readonly listeners = new Set<() => void>()

  constructor(private readonly fs: Pick<ProjectFS, 'readFile'>) {}

  /** For useSyncExternalStore: `listener` runs whenever a read settles or a path is invalidated. */
  readonly subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  /** The clip names read for `path` (the previous read's while it is read again); null while unread, or unreadable. */
  peek(path: string): readonly string[] | null {
    const read = this.reads.get(path)
    if (read?.state === 'read') return read.names
    return this.previous.get(path) ?? null
  }

  /** How many times `path` was invalidated. */
  version(path: string): number {
    return this.versions.get(path) ?? 0
  }

  /** Starts reading `path` unless it is read or being read. */
  load(path: string): void {
    if (this.reads.has(path)) return
    const reading: ClipRead = { state: 'reading' }
    this.reads.set(path, reading)
    const settle = (names: readonly string[] | null): void => {
      // A write while reading dropped this read: its bytes may be stale.
      if (this.reads.get(path) !== reading) return
      this.reads.set(path, { state: 'read', names })
      this.previous.delete(path)
      this.notify()
    }
    reportRejection(
      this.fs.readFile(path).then(
        (bytes) => settle(bytes && glbClipNames(bytes)),
        () => settle(null),
      ),
      `read the clips of ${path}`,
    )
  }

  /** Forgets `path`'s read, so the next `load` reads the file again. */
  invalidate(path: string): void {
    const read = this.reads.get(path)
    if (!read) return
    if (read.state === 'read') this.previous.set(path, read.names)
    this.reads.delete(path)
    this.versions.set(path, this.version(path) + 1)
    this.notify()
  }

  private notify(): void {
    for (const listener of this.listeners) listener()
  }
}

/**
 * `fs` with every write and delete reported to `onWrite` once it is done:
 * the Editor works through it, so a glb the editor writes is read again.
 */
export function observeWrites(fs: ProjectFS, onWrite: (path: string) => void): ProjectFS {
  const reported =
    <A extends unknown[]>(write: (path: string, ...rest: A) => Promise<void>) =>
    async (path: string, ...rest: A): Promise<void> => {
      await write(path, ...rest)
      onWrite(path)
    }
  return {
    name: fs.name,
    kind: fs.kind,
    readText: (path) => fs.readText(path),
    readFile: (path) => fs.readFile(path),
    tree: () => fs.tree(),
    writeText: reported((path, content: string) => fs.writeText(path, content)),
    writeFile: reported((path, bytes: Uint8Array<ArrayBuffer>) => fs.writeFile(path, bytes)),
    deleteFile: reported((path) => fs.deleteFile(path)),
  }
}

/** One project's clip cache, and that project's files with every write reported to it. */
interface GlbClipSession {
  readonly source: ProjectFS
  readonly fs: ProjectFS
  readonly cache: GlbClipCache
}

function glbClipSession(source: ProjectFS): GlbClipSession {
  const cache = new GlbClipCache(source)
  return { source, cache, fs: observeWrites(source, (path) => cache.invalidate(path)) }
}

/**
 * The Editor's clip cache over `fs`, and the `fs` the Editor works through
 * so its own writes refresh the cache; a new one when another project opens.
 */
export function useGlbClipSession(fs: ProjectFS): GlbClipSession {
  const [session, setSession] = useState(() => glbClipSession(fs))
  if (session.source === fs) return session
  const next = glbClipSession(fs)
  setSession(next)
  return next
}

/** The Editor's clip cache; null outside an Editor, where every glb's clips are unknown. */
export const GlbClipsContext = createContext<GlbClipCache | null>(null)

const NO_SUBSCRIPTION = (): (() => void) => () => {}

/**
 * The clip names of the glb a Model's `src` names, read through the Editor's
 * cache: null while they are unknown (no project file, still reading, a
 * missing file or bytes that are not a glb).
 */
export function useGlbClips(src: unknown): readonly string[] | null {
  const cache = useContext(GlbClipsContext)
  const path = projectModelPath(src)
  const clips = useSyncExternalStore(
    cache?.subscribe ?? NO_SUBSCRIPTION,
    () => (cache && path ? cache.peek(path) : null),
    // Rendered to a string (no effects ever run), nothing has been read.
    () => null,
  )
  const version = useSyncExternalStore(
    cache?.subscribe ?? NO_SUBSCRIPTION,
    () => (cache && path ? cache.version(path) : 0),
    () => 0,
  )
  // Read on first sight and again after a write invalidated the path, even when what it showed did not change; load() skips a read in flight or done.
  useEffect(() => {
    if (cache && path) cache.load(path)
  }, [cache, path, version])
  return clips
}

/**
 * The clip names an entity's or prefab's states can be checked against
 * (issue #173 CA-7): its Model's glb clips when it names a file (null while
 * unknown), else its sprite's.
 */
export function useKnownClips(appearance: SceneComponentJson | null, components: readonly SceneComponentJson[]): readonly string[] | null {
  return knownClips(appearance, components, useGlbClips(modelSrcOf(components)))
}
