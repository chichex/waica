import {
  authoringDefaults,
  componentSpaceOf,
  type ArchetypeManifest,
  type ComponentClass,
  type ComponentSpace,
  type RoleDefinition,
  type SceneComponentJson,
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
  updates: boolean
  updateAfter: string[]
  /** The scene space the class declares with `static space`; `'both'` when it declares none. */
  space: ComponentSpace
  sourcePackage: string
}

/** Whether a class's prototype defines `method` as a function. */
function prototypeDefines(Class: ComponentClass, method: string): boolean {
  const prototype: unknown = Reflect.get(Class, 'prototype')
  return typeof prototype === 'object' && prototype !== null && typeof Reflect.get(prototype, method) === 'function'
}

function moduleDeclaresComponent(
  module: Record<string, unknown>,
  Class: ComponentClass,
): boolean {
  return Object.values(module).some((candidate) => {
    if (candidate === Class) return true
    if (typeof candidate !== 'function') return false
    return Reflect.get(candidate, 'componentName') === Class.componentName
  })
}

/** The modules a component can come from, to name the package that declares it. */
interface ComponentSources {
  engineModule: Record<string, unknown>
  behaviorModule: Record<string, unknown>
  archetypePackage: string
}

function sourcePackage(Class: ComponentClass, sources: ComponentSources): string {
  if (moduleDeclaresComponent(sources.engineModule, Class)) return '@waica/engine'
  if (moduleDeclaresComponent(sources.behaviorModule, Class)) return '@waica/behaviors'
  return sources.archetypePackage
}

function describeComponent(Class: ComponentClass, sources: ComponentSources): ComponentDescription {
  const description: ComponentDescription = {
    componentName: Class.componentName,
    params: (Class.params ?? {}) as Record<string, unknown>,
    defaults: authoringDefaults(Class),
    updates: prototypeDefines(Class, 'onUpdate'),
    updateAfter: [...(Class.updateAfter ?? [])],
    space: componentSpaceOf(Class),
    sourcePackage: sourcePackage(Class, sources),
  }
  if (Object.hasOwn(Class, 'displayName') && typeof Class.displayName === 'string') {
    description.displayName = Class.displayName
  }
  return description
}

/** Project-owned component, role and state files, listed but never validated. */
async function projectOwnedCode(
  projectPath: string,
): Promise<Array<{ path: string; validated: false }>> {
  return (
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
  const discoveryWarnings: string[] = []
  const activeId = await activeArchetypeId(projectPath)
  const [engine, behaviors, archetypes] = await Promise.all([
    resolver.load<Record<string, unknown>>('@waica/engine'),
    resolver.load<Record<string, unknown>>('@waica/behaviors'),
    discoverArchetypes(
      projectPath,
      resolver,
      discoveryWarnings,
      activeId ? [activeId] : [],
    ),
  ])
  const active = pickArchetype(archetypes, activeId, projectPath)
  const components = Object.values(active.manifest.registry.components).map((Class) =>
    describeComponent(Class, {
      engineModule: engine.module,
      behaviorModule: behaviors.module,
      archetypePackage: active.packageName,
    }),
  )
  const projectOwned = await projectOwnedCode(projectPath)
  const provenance = provenanceRows([engine, behaviors, ...archetypes.map((entry) => entry.loaded)])
  return {
    components,
    projectOwned,
    notes: check.notes,
    provenance,
    warnings: [...discoveryWarnings, ...mixedSourceWarnings(provenance)],
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

function archetypeDescription(
  manifest: ArchetypeManifest,
): Record<string, unknown> & { id: string; label: string } {
  return {
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
  const discoveryWarnings: string[] = []
  const activeId = await activeArchetypeId(projectPath)
  const requiredIds = [activeId, requestedId].filter(
    (id): id is string => typeof id === 'string',
  )
  const [engine, behaviors, available] = await Promise.all([
    resolver.load('@waica/engine'),
    resolver.load('@waica/behaviors'),
    discoverArchetypes(projectPath, resolver, discoveryWarnings, requiredIds),
  ])
  // The active id must be known even when another archetype was requested:
  // the response cannot truthfully name an active archetype otherwise.
  const active = pickArchetype(available, activeId, projectPath)
  const selected = requestedId
    ? pickArchetype(available, requestedId, projectPath)
    : active
  const archetype = archetypeDescription(selected.manifest)
  const installedArchetypes = available
    .filter((entry) => entry.manifest.id !== active.manifest.id)
    .map((entry) => ({
      id: entry.manifest.id,
      label: entry.manifest.label,
      status: 'installed, not active' as const,
    }))
    .sort((a, b) => a.id.localeCompare(b.id))
  const provenance = provenanceRows([engine, behaviors, ...available.map((entry) => entry.loaded)])
  return {
    activeArchetype: active.manifest.id,
    archetype,
    installedArchetypes,
    notes: check.notes,
    provenance,
    warnings: [...discoveryWarnings, ...mixedSourceWarnings(provenance)],
  }
}

async function tolerantJson(file: string): Promise<Record<string, unknown>> {
  try {
    const parsed = JSON.parse(await readFile(file, 'utf8')) as unknown
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {}
  } catch {
    return {}
  }
}

type PrefabSummary = { ref: string; type: 'character' | 'object' | 'tile' }

async function projectPrefabs(projectPath: string): Promise<PrefabSummary[]> {
  const prefabs: PrefabSummary[] = []
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
  return prefabs
}

/** controls.json bindings sorted by action, keeping only string-list entries. */
function stringListBindings(bindings: unknown): Record<string, string[]> {
  const rawBindings =
    bindings && typeof bindings === 'object' ? (bindings as Record<string, unknown>) : {}
  const controls: Record<string, string[]> = {}
  for (const action of Object.keys(rawBindings).sort()) {
    const value = rawBindings[action]
    if (Array.isArray(value) && value.every((entry) => typeof entry === 'string')) {
      controls[action] = value
    }
  }
  return controls
}

export async function projectSummary(projectPath: string): Promise<{
  archetype: string | null
  scenes: string[]
  prefabs: PrefabSummary[]
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
  const prefabs = await projectPrefabs(projectPath)
  const rawStats =
    statsFile.stats && typeof statsFile.stats === 'object'
      ? (statsFile.stats as Record<string, unknown>)
      : {}
  const controls = stringListBindings(controlsFile.bindings)
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
