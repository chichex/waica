import type { PrefabJson } from '@waica/engine'
import { ACTIVE_ARCHETYPE } from '../project/archetype'
import type { ProjectFS, TreeNode } from './project-fs'

/** Prefab directory under src/ -> prefab category (the file suffix). */
export const PREFAB_DIRS = {
  characters: 'character',
  objects: 'object',
  tiles: 'tile',
  ui: 'ui',
} as const

function findDir(nodes: TreeNode[] | undefined, name: string): TreeNode | undefined {
  return nodes?.find((n) => n.kind === 'dir' && n.name === name)
}

/**
 * Loads the project's prefab library: src/<dir>/*.<cat>.json files merged
 * OVER the archetype defaults, so project files win and defaults fill the
 * gaps (old projects without prefab dirs keep working).
 */
export async function loadPrefabLib(fs: ProjectFS): Promise<Record<string, PrefabJson>> {
  const lib: Record<string, PrefabJson> = { ...ACTIVE_ARCHETYPE.prefabs }
  const src = findDir(await fs.tree(), 'src')
  for (const [dir, cat] of Object.entries(PREFAB_DIRS)) {
    const files = findDir(src?.children, dir)?.children ?? []
    const suffix = `.${cat}.json`
    for (const file of files) {
      if (file.kind !== 'file' || !file.name.endsWith(suffix)) continue
      const text = await fs.readText(file.path)
      if (text == null) continue
      try {
        lib[`${dir}/${file.name.slice(0, -suffix.length)}`] = JSON.parse(text) as PrefabJson
      } catch {
        // malformed prefab file: skip it, the archetype default (if any) stays
      }
    }
  }
  return lib
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
