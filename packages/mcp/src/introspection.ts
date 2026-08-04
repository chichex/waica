import type {
  ComponentClass,
  RoleDefinition,
  SceneComponentJson,
} from '@waica/engine'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import {
  activeArchetypeId,
  discoverArchetypes,
  pickArchetype,
} from './archetypes.js'
import {
  PackageResolver,
  mixedSourceWarnings,
  provenanceRows,
  type Provenance,
} from './package-resolver.js'
import { directFiles, requireWaicaProject } from './project-path.js'

export interface ComponentDescription {
  componentName: string
  displayName?: string
  params: Record<string, unknown>
  defaults: Record<string, unknown>
  sourcePackage: string
}

function ownDefaults(Class: ComponentClass): Record<string, unknown> {
  try {
    return Object.fromEntries(Object.entries(new Class()).filter(([, value]) => value !== undefined))
  } catch {
    return {}
  }
}

function sourcePackage(
  Class: ComponentClass,
  engineModule: Record<string, unknown>,
  behaviorModule: Record<string, unknown>,
  archetypePackage: string,
): string {
  if (Object.values(engineModule).includes(Class)) return '@waica/engine'
  if (Object.values(behaviorModule).includes(Class)) return '@waica/behaviors'
  return archetypePackage
}

export async function listComponents(projectPath: string): Promise<{
  components: ComponentDescription[]
  projectOwned: Array<{ path: string; validated: false }>
  notes: string[]
  provenance: Provenance[]
  warnings: string[]
}> {
  const check = await requireWaicaProject(projectPath)
  const resolver = new PackageResolver(projectPath)
  const [engine, behaviors, archetypes, activeId] = await Promise.all([
    resolver.load<Record<string, unknown>>('@waica/engine'),
    resolver.load<Record<string, unknown>>('@waica/behaviors'),
    discoverArchetypes(projectPath, resolver),
    activeArchetypeId(projectPath),
  ])
  const active = pickArchetype(archetypes, activeId, projectPath)
  const components = Object.values(active.manifest.registry.components).map((Class) => {
    const description: ComponentDescription = {
      componentName: Class.componentName,
      params: (Class.params ?? {}) as Record<string, unknown>,
      defaults: ownDefaults(Class),
      sourcePackage: sourcePackage(
        Class,
        engine.module,
        behaviors.module,
        active.packageName,
      ),
    }
    if (Object.hasOwn(Class, 'displayName') && typeof Class.displayName === 'string') {
      description.displayName = Class.displayName
    }
    return description
  })
  const projectOwned = (
    await Promise.all(
      ['components', 'roles', 'states'].map(async (directory) =>
        (await directFiles(path.join(projectPath, 'src', directory), '.ts')).map((file) => ({
          path: `src/${directory}/${file}`,
          validated: false as const,
        })),
      ),
    )
  )
    .flat()
    .sort((a, b) => a.path.localeCompare(b.path))
  const provenance = provenanceRows([engine, behaviors, ...archetypes.map((entry) => entry.loaded)])
  return {
    components,
    projectOwned,
    notes: check.notes,
    provenance,
    warnings: mixedSourceWarnings(provenance),
  }
}

function componentNames(components: readonly SceneComponentJson[] | undefined): string[] {
  return (components ?? []).map((component) => component.type)
}

function paletteComponents(
  template: { make: () => { prefab?: string; components?: SceneComponentJson[] } },
  prefabs: Record<string, { components: SceneComponentJson[] }>,
): string[] {
  const entity = template.make()
  const fromPrefab = entity.prefab ? prefabs[entity.prefab]?.components : undefined
  return [...componentNames(fromPrefab), ...componentNames(entity.components)]
}

function roleDescription(name: string, role: RoleDefinition): Record<string, unknown> {
  return {
    name,
    description: role.description,
    driver: role.driver ?? null,
    signals: role.signals ?? {},
    graph: role.graph ?? null,
  }
}

export async function describeArchetype(
  projectPath: string,
  requestedId?: string,
): Promise<{
  activeArchetype: string
  archetype: Record<string, unknown> & { id: string; label: string }
  installedArchetypes: Array<{ id: string; label: string; status: 'installed, not active' }>
  notes: string[]
  provenance: Provenance[]
  warnings: string[]
}> {
  const check = await requireWaicaProject(projectPath)
  const resolver = new PackageResolver(projectPath)
  const [engine, behaviors, available, activeId] = await Promise.all([
    resolver.load('@waica/engine'),
    resolver.load('@waica/behaviors'),
    discoverArchetypes(projectPath, resolver),
    activeArchetypeId(projectPath),
  ])
  const selected = pickArchetype(available, requestedId ?? activeId, projectPath)
  // The unrequested active id must also be valid: silently claiming another
  // archetype would repeat the editor fallback this tool deliberately avoids.
  pickArchetype(available, activeId, projectPath)
  const manifest = selected.manifest
  const archetype = {
    id: manifest.id,
    label: manifest.label,
    palette: manifest.palette.map((template) => ({
      name: template.label,
      components: paletteComponents(template, manifest.prefabs),
    })),
    prefabs: Object.entries(manifest.prefabs).map(([ref, prefab]) => ({
      ref,
      type: prefab.type,
      components: componentNames(prefab.components),
    })),
    roles: Object.entries(manifest.bundle.roles).map(([name, role]) =>
      roleDescription(name, role),
    ),
    bindings: manifest.bindings,
    actionLabels: manifest.actionLabels,
    ui: Object.keys(manifest.registry.ui ?? {}).sort(),
    art: manifest.art,
    entityIcons: manifest.entityIcons,
  }
  const installedArchetypes = available
    .filter((entry) => entry.manifest.id !== activeId)
    .map((entry) => ({
      id: entry.manifest.id,
      label: entry.manifest.label,
      status: 'installed, not active' as const,
    }))
    .sort((a, b) => a.id.localeCompare(b.id))
  const provenance = provenanceRows([engine, behaviors, ...available.map((entry) => entry.loaded)])
  return {
    activeArchetype: activeId,
    archetype,
    installedArchetypes,
    notes: check.notes,
    provenance,
    warnings: mixedSourceWarnings(provenance),
  }
}

async function tolerantJson(file: string): Promise<Record<string, unknown>> {
  try {
    return JSON.parse(await readFile(file, 'utf8')) as Record<string, unknown>
  } catch {
    return {}
  }
}

export async function projectSummary(projectPath: string): Promise<{
  archetype: string | null
  scenes: string[]
  prefabs: Array<{ ref: string; type: 'character' | 'object' | 'tile' }>
  components: string[]
  roles: string[]
  states: string[]
  ui: string[]
  stats: string[]
  controls: Record<string, string[]>
  notes: string[]
  provenance: Provenance[]
  warnings: string[]
}> {
  const check = await requireWaicaProject(projectPath)
  const [game, statsFile, controlsFile] = await Promise.all([
    tolerantJson(path.join(projectPath, 'src/game.json')),
    tolerantJson(path.join(projectPath, 'src/stats.json')),
    tolerantJson(path.join(projectPath, 'src/controls.json')),
  ])
  const prefabs: Array<{ ref: string; type: 'character' | 'object' | 'tile' }> = []
  for (const [directory, type] of [
    ['characters', 'character'],
    ['objects', 'object'],
    ['tiles', 'tile'],
  ] as const) {
    const suffix = `.${type}.json`
    for (const file of await directFiles(path.join(projectPath, 'src', directory), suffix)) {
      prefabs.push({ ref: `${directory}/${file.slice(0, -suffix.length)}`, type })
    }
  }
  const rawStats =
    statsFile.stats && typeof statsFile.stats === 'object'
      ? (statsFile.stats as Record<string, unknown>)
      : {}
  const rawBindings =
    controlsFile.bindings && typeof controlsFile.bindings === 'object'
      ? (controlsFile.bindings as Record<string, unknown>)
      : {}
  const controls: Record<string, string[]> = {}
  for (const action of Object.keys(rawBindings).sort()) {
    const value = rawBindings[action]
    if (Array.isArray(value) && value.every((entry) => typeof entry === 'string')) {
      controls[action] = value
    }
  }
  return {
    archetype: typeof game.archetype === 'string' ? game.archetype : null,
    scenes: await directFiles(path.join(projectPath, 'src/scenes'), '.scene.json'),
    prefabs: prefabs.sort((a, b) => a.ref.localeCompare(b.ref)),
    components: await directFiles(path.join(projectPath, 'src/components'), '.ts'),
    roles: await directFiles(path.join(projectPath, 'src/roles'), '.ts'),
    states: await directFiles(path.join(projectPath, 'src/states'), '.ts'),
    ui: await directFiles(path.join(projectPath, 'src/ui'), '.html'),
    stats: Object.keys(rawStats).sort(),
    controls,
    notes: check.notes,
    provenance: [],
    warnings: [],
  }
}
