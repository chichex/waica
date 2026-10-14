import type { RoleDefinition } from '@waica/engine'
import { activeArchetypeId, discoverArchetypes, pickArchetype } from './archetypes.js'
import { WaicaToolError } from './project-path.js'

/** What scaffold_prefab reads from the project's active archetype: the roles a character may adopt, and whether its scenes are 3D. */
export interface ScaffoldArchetype {
  roles: Record<string, RoleDefinition>
  threeD: boolean
}

/** The active archetype (src/game.json), resolved; `unknown-archetype` when there is none to resolve. */
export async function activeArchetype(projectPath: string): Promise<ScaffoldArchetype> {
  const activeId = await activeArchetypeId(projectPath)
  const available = await discoverArchetypes(projectPath, undefined, [], activeId ? [activeId] : [])
  const { manifest } = pickArchetype(available, activeId, projectPath)
  // A 3D archetype is one whose demo scene is 3D (issue #181 inference 23).
  return { roles: manifest.bundle.roles, threeD: manifest.scene.render?.space === '3d' }
}

/**
 * Whether an object or a tile is scaffolded in 3D: the active archetype's
 * answer, or the 2D set when no archetype resolves (a missing src/game.json or
 * one without an archetype), which is what such a scaffold wrote before
 * issue #181. A character needs the archetype's roles and keeps the error.
 */
export async function scaffoldsIn3d(projectPath: string): Promise<boolean> {
  try {
    return (await activeArchetype(projectPath)).threeD
  } catch (error) {
    if (error instanceof WaicaToolError && error.body.code === 'unknown-archetype') return false
    throw error
  }
}
