import { useCallback, useEffect, useRef, useState } from 'react'
import { ACTIVE_ARCHETYPE } from '../project/archetype'
import type { ProjectFS, TreeNode } from '../fs/project-fs'

export interface ArtItem {
  label: string
  /** Displayable URL: an object URL over the project file's bytes. */
  url: string
  /** What texture props store: the project path, e.g. 'src/art/foo.png'. */
  uri: string
  /** Project file path. */
  path: string
}

/** A folder of art, grouped by the path the source files were dropped under. */
export interface ArtFolder {
  /** Empty for the implicit root folder. */
  name: string
  /** Full folder key ('Sprites/Player'), stable across re-scans — used as UI state id. */
  path: string
  folders: ArtFolder[]
  items: ArtItem[]
}

/** A file about to be imported, carrying the folder path it was dropped under (if any). */
export interface DroppedFile {
  file: File
  /** Path relative to the drop root, folders preserved with '/'. Equals file.name for loose files. */
  relativePath: string
}

export interface ProjectArt {
  art: ArtItem[]
  /** Re-scans src/art and public (after an import or delete). */
  refresh(): void
  /** Writes image files to src/art (preserving each one's relativePath) and re-scans. */
  importArt(files: DroppedFile[]): Promise<void>
  /** Displayable URL for a stored texture uri (art match, then archetype assets). */
  urlFor(uri: string): string
  /** Live progress while importArt is writing files; null when idle. */
  importProgress: { done: number; total: number } | null
}

export const IMAGE_RE = /\.(png|jpe?g)$/i

async function readDirectoryEntries(
  reader: FileSystemDirectoryReader,
): Promise<FileSystemEntry[]> {
  const entries: FileSystemEntry[] = []
  for (;;) {
    const batch = await new Promise<FileSystemEntry[]>((resolve, reject) =>
      reader.readEntries(resolve, reject),
    )
    if (batch.length === 0) break
    entries.push(...batch)
  }
  return entries
}

async function collectEntry(entry: FileSystemEntry, basePath: string): Promise<DroppedFile[]> {
  const relativePath = basePath ? `${basePath}/${entry.name}` : entry.name
  if (entry.isFile) {
    const file = await new Promise<File>((resolve, reject) =>
      (entry as FileSystemFileEntry).file(resolve, reject),
    )
    return [{ file, relativePath }]
  }
  if (entry.isDirectory) {
    const children = await readDirectoryEntries(
      (entry as FileSystemDirectoryEntry).createReader(),
    )
    const nested = await Promise.all(children.map((child) => collectEntry(child, relativePath)))
    return nested.flat()
  }
  return []
}

/**
 * Reads a drop's files, recursing into dropped folders via the
 * webkitGetAsEntry entry API (supported by every current browser despite the
 * prefix) and preserving each file's path within the drop. Falls back to the
 * flat file list when entries aren't available, e.g. in tests that only stub
 * `dataTransfer.files`.
 */
export async function collectDroppedFiles(dataTransfer: DataTransfer): Promise<DroppedFile[]> {
  const items = [...dataTransfer.items].filter((item) => item.kind === 'file')
  const entries = items.map((item) =>
    typeof item.webkitGetAsEntry === 'function' ? item.webkitGetAsEntry() : null,
  )
  if (entries.length === 0 || entries.some((entry) => entry == null)) {
    return [...dataTransfer.files].map((file) => ({ file, relativePath: file.name }))
  }
  const lists = await Promise.all(
    entries.map((entry) => collectEntry(entry as FileSystemEntry, '')),
  )
  return lists.flat()
}

// Fallback for non-project URIs (e.g. 'waica:dog' in old projects): the
// archetype's own resolver. The panel itself lists project files ONLY.
const resolveArchetypeAsset = ACTIVE_ARCHETYPE.registry.resolveAsset ?? ((uri: string) => uri)

function findDir(nodes: TreeNode[] | undefined, name: string): TreeNode | undefined {
  return nodes?.find((n) => n.kind === 'dir' && n.name === name)
}

/** Path shown in the folder tree: art's own two scan roots collapsed away. */
export function artDisplayPath(item: ArtItem): string {
  if (item.path.startsWith('src/art/')) return item.path.slice('src/art/'.length)
  if (item.path.startsWith('public/')) return item.path.slice('public/'.length)
  return item.path
}

/** Groups flat art items into the folder tree their paths imply, sorted folders-then-files. */
export function buildArtTree(art: ArtItem[]): ArtFolder {
  const root: ArtFolder = { name: '', path: '', folders: [], items: [] }
  for (const item of art) {
    const segments = artDisplayPath(item).split('/')
    segments.pop() // the filename itself — item.label already carries it
    let node = root
    let path = ''
    for (const segment of segments) {
      path = path ? `${path}/${segment}` : segment
      let child = node.folders.find((f) => f.name === segment)
      if (!child) {
        child = { name: segment, path, folders: [], items: [] }
        node.folders.push(child)
      }
      node = child
    }
    node.items.push(item)
  }
  const sortNode = (node: ArtFolder): void => {
    node.folders.sort((a, b) => a.name.localeCompare(b.name))
    node.items.sort((a, b) => a.label.localeCompare(b.label))
    node.folders.forEach(sortNode)
  }
  sortNode(root)
  return root
}

/**
 * The project's image library, shared by the Explorer panel, the viewport
 * registry (texture resolution) and the animation editor.
 */
export function useProjectArt(fs: ProjectFS): ProjectArt {
  const [art, setArt] = useState<ArtItem[]>([])
  const [artEpoch, setArtEpoch] = useState(0)
  const [importProgress, setImportProgress] = useState<{ done: number; total: number } | null>(
    null,
  )
  // Object URLs backing the current `art`: revoked only AFTER a fresh batch
  // is committed, so images never break mid-scan.
  const owned = useRef<string[]>([])

  useEffect(() => {
    let cancelled = false
    const load = async (): Promise<{ items: ArtItem[]; created: string[] }> => {
      const created: string[] = []
      const tree = await fs.tree()
      const roots = [findDir(findDir(tree, 'src')?.children, 'art'), findDir(tree, 'public')]
      const files: TreeNode[] = []
      const walk = (nodes?: TreeNode[]): void => {
        for (const node of nodes ?? []) {
          if (node.kind === 'dir') walk(node.children)
          else if (IMAGE_RE.test(node.name)) files.push(node)
        }
      }
      for (const root of roots) walk(root?.children)
      const items: ArtItem[] = []
      for (const file of files) {
        const bytes = await fs.readFile(file.path)
        if (!bytes) continue
        const type = /\.png$/i.test(file.name) ? 'image/png' : 'image/jpeg'
        const url = URL.createObjectURL(new Blob([bytes], { type }))
        created.push(url)
        items.push({ label: file.name, url, uri: file.path, path: file.path })
      }
      return { items, created }
    }
    void load().then(({ items, created }) => {
      if (cancelled) {
        for (const url of created) URL.revokeObjectURL(url)
        return
      }
      for (const url of owned.current) URL.revokeObjectURL(url)
      owned.current = created
      setArt(items)
    })
    return () => {
      cancelled = true
    }
  }, [fs, artEpoch])

  useEffect(
    () => () => {
      for (const url of owned.current) URL.revokeObjectURL(url)
    },
    [],
  )

  const refresh = useCallback((): void => setArtEpoch((e) => e + 1), [])

  const importArt = useCallback(
    async (files: DroppedFile[]): Promise<void> => {
      const images = files.filter((f) => IMAGE_RE.test(f.file.name))
      if (!images.length) return
      setImportProgress({ done: 0, total: images.length })
      let done = 0
      for (const { file, relativePath } of images) {
        await fs.writeFile(`src/art/${relativePath}`, new Uint8Array(await file.arrayBuffer()))
        done += 1
        setImportProgress({ done, total: images.length })
      }
      setArtEpoch((e) => e + 1)
      setImportProgress(null)
    },
    [fs],
  )

  const urlFor = useCallback(
    (uri: string): string => art.find((a) => a.uri === uri)?.url ?? resolveArchetypeAsset(uri),
    [art],
  )

  return { art, refresh, importArt, urlFor, importProgress }
}
