/**
 * The single source of truth for the archetypes this MCP server knows how
 * to bundle, resolve and scaffold. Adding an archetype package means adding
 * one row here — the bundled-specifier set, the built-entry map and the
 * workspace alias maps all derive from this list.
 */
export interface KnownArchetype {
  id: string
  /** npm package name, e.g. '@waica/archetype-platformer'. */
  packageName: string
  /** Directory under packages/ in the waica workspace. */
  directory: string
}

export const DEFAULT_ARCHETYPE_ID = 'platformer'

export const KNOWN_ARCHETYPES: readonly KnownArchetype[] = [
  {
    id: 'platformer',
    packageName: '@waica/archetype-platformer',
    directory: 'archetype-platformer',
  },
]

export function knownArchetype(id: string): KnownArchetype | undefined {
  return KNOWN_ARCHETYPES.find((archetype) => archetype.id === id)
}

export function knownArchetypeIds(): string[] {
  return KNOWN_ARCHETYPES.map((archetype) => archetype.id)
}
