import type { PrefabJson } from '@waica/engine'
import type { ProjectFS, TreeNode } from './project-fs'

/** Prefab directory under src/ -> prefab category (the file suffix). */
export const PREFAB_DIRS = {
  characters: 'character',
  objects: 'object',
  tiles: 'tile',
} as const

function findDir(nodes: TreeNode[] | undefined, name: string): TreeNode | undefined {
  return nodes?.find((n) => n.kind === 'dir' && n.name === name)
}

/**
 * The project's prefabs, keyed by ref ('characters/slime') — its own files and
 * nothing else. The archetype's catalog is a starting point that `projectFiles`
 * writes to disk when a project is created, never a hidden layer underneath: a
 * prefab the Explorer doesn't list does not exist, and a name it doesn't show
 * is free to take.
 */
export async function loadPrefabLib(fs: ProjectFS): Promise<Record<string, PrefabJson>> {
  const prefabs: Record<string, PrefabJson> = {}
  const src = findDir(await fs.tree(), 'src')
  for (const [dir, cat] of Object.entries(PREFAB_DIRS)) {
    const files = findDir(src?.children, dir)?.children ?? []
    const suffix = `.${cat}.json`
    for (const file of files) {
      if (file.kind !== 'file' || !file.name.endsWith(suffix)) continue
      const text = await fs.readText(file.path)
      if (text == null) continue
      const ref = `${dir}/${file.name.slice(0, -suffix.length)}`
      try {
        prefabs[ref] = JSON.parse(text) as PrefabJson
      } catch {
        // malformed prefab file: skip it — entities referencing it keep their
        // own components and the Explorer simply won't list it.
      }
    }
  }
  return prefabs
}

/** File path for a prefab ref, e.g. 'characters/slime' -> 'src/characters/slime.character.json'. */
export function prefabPath(ref: string): string {
  const [dir, base] = ref.split('/')
  const cat = PREFAB_DIRS[dir as keyof typeof PREFAB_DIRS]
  if (!cat || !base) throw new Error(`invalid prefab ref: ${ref}`)
  return `src/${dir}/${base}.${cat}.json`
}

export async function savePrefab(fs: ProjectFS, ref: string, prefab: PrefabJson): Promise<void> {
  await fs.writeText(prefabPath(ref), JSON.stringify(prefab, null, 2) + '\n')
}

/** Paths of every src/scenes/*.scene.json in the project. */
export async function listScenes(fs: ProjectFS): Promise<string[]> {
  const src = findDir(await fs.tree(), 'src')
  const files = findDir(src?.children, 'scenes')?.children ?? []
  return files.filter((n) => n.kind === 'file' && n.name.endsWith('.scene.json')).map((n) => n.path)
}
