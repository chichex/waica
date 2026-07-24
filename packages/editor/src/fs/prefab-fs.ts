import type { PrefabJson } from '@waica/engine'
import { ACTIVE_ARCHETYPE } from '../project/archetype'
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

export interface PrefabLib {
  /** Every resolvable prefab: project files merged OVER the archetype defaults. */
  prefabs: Record<string, PrefabJson>
  /**
   * Refs backed by a real project file — the only ones the Explorer lists.
   * Defaults outside this set still resolve scene refs (old projects without
   * prefab dirs keep working) but stay out of sight: a blank project IS blank.
   */
  projectRefs: Set<string>
}

/** Loads the project's prefab library: src/<dir>/*.<cat>.json files. */
export async function loadPrefabLib(fs: ProjectFS): Promise<PrefabLib> {
  const prefabs: Record<string, PrefabJson> = { ...ACTIVE_ARCHETYPE.prefabs }
  const projectRefs = new Set<string>()
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
        projectRefs.add(ref)
      } catch {
        // malformed prefab file: skip it, the archetype default (if any) stays
      }
    }
  }
  return { prefabs, projectRefs }
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
