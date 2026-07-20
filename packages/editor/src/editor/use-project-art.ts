import { useCallback, useEffect, useRef, useState } from 'react'
import { ACTIVE_ARCHETYPE } from '../project/archetype'
import type { ProjectFS, TreeNode } from '../fs/project-fs'

export interface ArtItem {
  label: string
  /** Displayable URL: a bundled asset URL or an object URL over project bytes. */
  url: string
  /** What texture props store: 'waica:dog' or a project path like 'src/art/foo.png'. */
  uri: string
  /** Project file path; absent for built-in archetype art (which can't be deleted). */
  path?: string
}

export interface ProjectArt {
  art: ArtItem[]
  /** Re-scans src/art and public (after an import or delete). */
  refresh(): void
  /** Writes image files to src/art and re-scans. */
  importArt(files: File[]): Promise<void>
  /** Displayable URL for a stored texture uri (art match, then archetype assets). */
  urlFor(uri: string): string
}

export const IMAGE_RE = /\.(png|jpe?g)$/i

const resolveArchetypeAsset = ACTIVE_ARCHETYPE.registry.resolveAsset ?? ((uri: string) => uri)

const BUILTIN_ART: ArtItem[] = [
  { label: 'waica-dog.png', uri: 'waica:dog', url: resolveArchetypeAsset('waica:dog') },
  { label: 'waica-coin.png', uri: 'waica:coin', url: resolveArchetypeAsset('waica:coin') },
  { label: 'waica-slime.png', uri: 'waica:slime', url: resolveArchetypeAsset('waica:slime') },
]

function findDir(nodes: TreeNode[] | undefined, name: string): TreeNode | undefined {
  return nodes?.find((n) => n.kind === 'dir' && n.name === name)
}

/**
 * The project's image library, shared by the Explorer panel, the viewport
 * registry (texture resolution) and the animation editor.
 */
export function useProjectArt(fs: ProjectFS): ProjectArt {
  const [art, setArt] = useState<ArtItem[]>(BUILTIN_ART)
  const [artEpoch, setArtEpoch] = useState(0)
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
      setArt([...BUILTIN_ART, ...items])
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
    async (files: File[]): Promise<void> => {
      const images = files.filter((f) => IMAGE_RE.test(f.name))
      for (const file of images) {
        await fs.writeFile(`src/art/${file.name}`, new Uint8Array(await file.arrayBuffer()))
      }
      if (images.length) setArtEpoch((e) => e + 1)
    },
    [fs],
  )

  const urlFor = useCallback(
    (uri: string): string => art.find((a) => a.uri === uri)?.url ?? resolveArchetypeAsset(uri),
    [art],
  )

  return { art, refresh, importArt, urlFor }
}
