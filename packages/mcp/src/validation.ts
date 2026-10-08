import type { ComponentClass, PrefabJson, SceneJson } from '@waica/engine'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { discoverArchetypes, pickArchetype } from './archetypes.js'
import { collisionCategoryFindings } from './collision-category-validation.js'
import { lightParamFindings } from './light-param-validation.js'
import { objectRecord } from './component-metadata.js'
import {
  checkComponent,
  classMetadata,
  componentList,
  validateComponentClassUpdateContracts,
  validateComponentUpdateSchedule,
  validateParamReferences,
} from './component-validation.js'
import { projectSoundRefs } from './param-reference-resolution.js'
import {
  PackageResolver,
  mixedSourceWarnings,
  provenanceRows,
  type Provenance,
} from './package-resolver.js'
import {
  loadProjectComponents,
  type ProjectComponentLoader,
} from './project-component-loader.js'
import { directFiles, requireWaicaProject } from './project-path.js'
import { validatePrefabSceneTransition } from './scene-transition-validation.js'
import { validateScene } from './scene-validation.js'
import { projectRoleStateSources, validateStateMachines } from './state-machine-validation.js'
import { stockAnchoredPieces, uiBindingFindings } from './ui-binding-validation.js'
import {
  add,
  type ComponentMetadata,
  type ValidationContext,
  type ValidationFinding,
} from './validation-context.js'

export type { FindingCode, FindingSeverity, ValidationFinding } from './validation-context.js'

const PARAMS_FILE = 'public/waica.params.json'
const FIXED_PATHS = [
  'package.json',
  'src/game.json',
  'src/controls.json',
  'src/stats.json',
  PARAMS_FILE,
]

const SCENE_TRANSITION_NOTE =
  'The shipped runtime boots on src/scenes/main.scene.json and registers every scene under src/scenes/ in a catalog; a SceneTransition or control_runtime operation:"scene" can load any of them by name.'

async function parseJson(
  projectPath: string,
  relative: string,
  findings: ValidationFinding[],
): Promise<unknown | undefined> {
  try {
    return JSON.parse(await readFile(path.join(projectPath, relative), 'utf8')) as unknown
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined
    add(
      { findings },
      'error',
      'unparseable-json',
      `Cannot parse JSON: ${(error as Error).message}`,
      relative,
    )
    return undefined
  }
}

async function projectComponentCandidates(projectPath: string): Promise<Set<string>> {
  const names = new Set<string>()
  for (const directory of ['components', 'roles', 'states']) {
    for (const file of await directFiles(path.join(projectPath, 'src', directory), '.ts')) {
      const source = await readFile(path.join(projectPath, 'src', directory, file), 'utf8')
      for (const match of source.matchAll(/\bcomponentName\s*=\s*['"]([^'"]+)['"]/g)) {
        const name = match[1]
        if (name) names.add(name)
      }
    }
  }
  return names
}

function validatePrefab(
  prefab: PrefabJson,
  file: string,
  ref: string,
  context: ValidationContext,
): void {
  const components = componentList(prefab.components)
  for (const component of components) {
    checkComponent(component, file, ref, context)
    if (component.type === 'Hitbox') {
      context.findings.push(...collisionCategoryFindings(component.props, file, ref))
    }
    if (component.type === 'Light') context.findings.push(...lightParamFindings(component.props, file, ref))
  }
  validateParamReferences(
    components.map((component) => ({ component })),
    components,
    file,
    context,
  )
  validateStateMachines(components, file, ref, context)
  validateComponentUpdateSchedule(components, file, ref, context)
}

export interface ValidateProjectOptions {
  signal?: AbortSignal
  componentLoader?: ProjectComponentLoader
}

export type ProjectValidationReport = {
  findings: ValidationFinding[]
  summary: { errors: number; warnings: number; infos: number }
  ok: boolean
  notes: string[]
  provenance: Provenance[]
  warnings: string[]
}

/** The package, archetype and project-code sources validate_project loads up front. */
type LoadedSources = Awaited<ReturnType<typeof loadSources>>

interface PrefabFile {
  prefab: PrefabJson
  relative: string
  ref: string
}

export async function validateProject(
  projectPath: string,
  options: ValidateProjectOptions = {},
): Promise<ProjectValidationReport> {
  options.signal?.throwIfAborted()
  const check = await requireWaicaProject(projectPath)
  const findings: ValidationFinding[] = []
  const fixed = new Map<string, unknown>()
  for (const relative of FIXED_PATHS) {
    fixed.set(relative, await parseJson(projectPath, relative, findings))
  }
  const activeId = activeArchetypeId(fixed, findings)
  const sources = await loadSources(projectPath, activeId, options)
  reportComponentLoadFailures(sources.loadedProjectComponents.failures, findings)
  const manifest = pickArchetype(sources.archetypes, activeId, projectPath).manifest

  // Every scene name the Project declares (a file's stem), so a
  // SceneTransition's target can be checked before any prefab or scene is
  // itself validated — CA-16.
  const sceneFiles = await directFiles(path.join(projectPath, 'src/scenes'), '.scene.json')
  const knownScenes = new Set(sceneFiles.map((file) => file.slice(0, -'.scene.json'.length)))
  const prefabFiles = await readPrefabFiles(projectPath, findings)
  const prefabs = new Map(prefabFiles.map(({ ref, prefab }) => [ref, prefab]))
  const uiFiles = await directFiles(path.join(projectPath, 'src/ui'), '.html')
  const context = await validationContext(projectPath, {
    findings,
    fixed,
    manifest,
    sources,
    prefabRefs: new Set(prefabs.keys()),
    uiPieces: new Set(uiFiles.map((file) => file.slice(0, -'.html'.length))),
  })

  validateComponentClassUpdateContracts(context)
  for (const { prefab, relative, ref } of prefabFiles) {
    validatePrefab(prefab, relative, ref, context)
    findings.push(...validatePrefabSceneTransition(prefab, relative, ref, knownScenes))
  }

  // The UI binding scan must see the ref: 'ui' params of scenes too, so it
  // runs after them, but its findings keep their place before the scenes'.
  const uiBindingsAt = findings.length
  for (const file of sceneFiles) {
    const relative = `src/scenes/${file}`
    const parsed = await parseJson(projectPath, relative, findings)
    if (!parsed || typeof parsed !== 'object') continue
    validateScene(parsed as SceneJson, {
      file: relative,
      prefabs,
      uiNames: context.uiPieces,
      knownScenes,
      context,
    })
  }
  findings.splice(
    uiBindingsAt,
    0,
    ...(await uiBindingFindings(projectPath, uiFiles, context.declaredStats, context.anchoredPieces)),
  )
  validateParamsFile(fixed.get(PARAMS_FILE), context)
  return validationReport(findings, sources, check.notes)
}

function reportComponentLoadFailures(
  failures: LoadedSources['loadedProjectComponents']['failures'],
  findings: ValidationFinding[],
): void {
  for (const failure of failures) {
    add(
      { findings },
      // component-load-unsupported means Node's strip-only loader cannot run
      // code that can still be perfectly valid in the project's Vite/browser
      // toolchain (asset imports, TS enums, an old Node host) — that is not a
      // project defect, so it must not flip a healthy project to ok:false.
      failure.code === 'component-load-unsupported' ? 'info' : 'error',
      failure.code,
      `Cannot execute project module: ${failure.message}`,
      failure.file,
    )
  }
}

/** The archetype src/game.json names; platformer when game.json exists but cannot be parsed. */
function activeArchetypeId(
  fixed: ReadonlyMap<string, unknown>,
  findings: readonly ValidationFinding[],
): string | null {
  const game = objectRecord(fixed.get('src/game.json'))
  if (typeof game.archetype === 'string' && game.archetype) return game.archetype
  const gameWasUnparseable = findings.some(
    (finding) => finding.code === 'unparseable-json' && finding.file === 'src/game.json',
  )
  return gameWasUnparseable ? 'platformer' : null
}

async function loadSources(
  projectPath: string,
  activeId: string | null,
  options: ValidateProjectOptions,
) {
  const resolver = new PackageResolver(projectPath)
  const discoveryWarnings: string[] = []
  const [
    engine,
    behaviors,
    archetypes,
    projectComponents,
    roleStateSources,
    loadedProjectComponents,
  ] = await Promise.all([
    resolver.load('@waica/engine'),
    resolver.load('@waica/behaviors'),
    discoverArchetypes(
      projectPath,
      resolver,
      discoveryWarnings,
      activeId ? [activeId] : [],
    ),
    projectComponentCandidates(projectPath),
    projectRoleStateSources(projectPath),
    options.componentLoader
      ? options.componentLoader.load(projectPath, resolver, { signal: options.signal })
      : loadProjectComponents(projectPath, resolver, { signal: options.signal }),
  ])
  return {
    engine,
    behaviors,
    archetypes,
    projectComponents,
    roleStateSources,
    loadedProjectComponents,
    discoveryWarnings,
  }
}

/**
 * The validation context: component registry and metadata (archetype plus
 * loaded project components), bindings, state files, stats and sound refs,
 * alongside the prefab refs and UI pieces the Project declares.
 */
async function validationContext(
  projectPath: string,
  inputs: {
    findings: ValidationFinding[]
    fixed: ReadonlyMap<string, unknown>
    manifest: ValidationContext['manifest']
    sources: LoadedSources
    prefabRefs: Set<string>
    uiPieces: ReadonlySet<string>
  },
): Promise<ValidationContext> {
  const { findings, fixed, manifest, sources } = inputs
  const stateFiles = new Set(
    (await directFiles(path.join(projectPath, 'src/states'), '.ts')).map((file) =>
      file.slice(0, -'.ts'.length),
    ),
  )
  const declaredStats = new Set(
    Object.keys(objectRecord(objectRecord(fixed.get('src/stats.json')).stats)),
  )
  // CA-13: every uri a `ref: 'sound'` param may validly name — the
  // archetype's own declared sound art plus whatever actually lives under
  // the project's src/art/ (see param-reference-resolution.ts).
  const soundRefs = await projectSoundRefs(projectPath, manifest.art)
  const { componentRegistry, componentMetadata } = componentCatalog(manifest, sources)
  return {
    findings,
    manifest,
    knownComponents: new Set(Object.keys(manifest.registry.components)),
    projectComponents: sources.projectComponents,
    componentMetadata,
    componentRegistry,
    reportedClassConstraints: new Set(),
    prefabRefs: inputs.prefabRefs,
    declaredStats,
    stateFiles,
    roleStateSources: sources.roleStateSources,
    bindings: controlBindings(fixed.get('src/controls.json')),
    soundRefs,
    uiPieces: inputs.uiPieces,
    anchoredPieces: new Set(stockAnchoredPieces(sources.behaviors.module)),
  }
}

/**
 * Bound/unbound is decided from controls.json alone: the shipped runtime
 * installs exactly controls.json's bindings (template main.ts passes
 * controls.bindings raw; engine DEFAULT_BINDINGS is {}), so an action an
 * archetype defines by default but controls.json drops is genuinely unbound
 * at runtime even though discoverArchetypes never guarantees
 * manifest.bindings exists (only manifest.id is validated).
 */
function controlBindings(controlsJson: unknown): Record<string, string[]> {
  const bindings: Record<string, string[]> = {}
  for (const [name, value] of Object.entries(objectRecord(objectRecord(controlsJson).bindings))) {
    if (Array.isArray(value) && value.every((entry) => typeof entry === 'string')) {
      bindings[name] = value
    }
  }
  return bindings
}

/** Archetype components plus the project components that loaded, which also join projectComponents. */
function componentCatalog(
  manifest: ValidationContext['manifest'],
  sources: LoadedSources,
): Pick<ValidationContext, 'componentRegistry' | 'componentMetadata'> {
  const componentRegistry: Record<string, ComponentClass> = {
    ...manifest.registry.components,
  }
  const componentMetadata = new Map<string, ComponentMetadata>(
    Object.entries(componentRegistry).map(([name, Class]) => [
      name,
      classMetadata(Class),
    ]),
  )
  for (const [name, description] of Object.entries(sources.loadedProjectComponents.components)) {
    componentRegistry[name] = description.Class
    componentMetadata.set(name, {
      Class: description.Class,
      params: description.params,
      defaults: description.defaults,
      sourceFile: description.file,
    })
    sources.projectComponents.add(name)
  }
  return { componentRegistry, componentMetadata }
}

/**
 * Every parseable prefab file, read before any is validated so a lexically
 * earlier file can refer to one discovered later in the tree.
 */
async function readPrefabFiles(
  projectPath: string,
  findings: ValidationFinding[],
): Promise<PrefabFile[]> {
  const prefabFiles: PrefabFile[] = []
  for (const [directory, type] of [
    ['characters', 'character'],
    ['objects', 'object'],
    ['tiles', 'tile'],
  ] as const) {
    const suffix = `.${type}.json`
    for (const file of await directFiles(path.join(projectPath, 'src', directory), suffix)) {
      const relative = `src/${directory}/${file}`
      const parsed = await parseJson(projectPath, relative, findings)
      if (!parsed || typeof parsed !== 'object') continue
      const ref = `${directory}/${file.slice(0, -suffix.length)}`
      prefabFiles.push({ prefab: parsed as PrefabJson, relative, ref })
    }
  }
  return prefabFiles
}

function validateParamsFile(paramsJson: unknown, context: ValidationContext): void {
  for (const [entity, rawComponents] of Object.entries(objectRecord(paramsJson))) {
    for (const [component, rawProps] of Object.entries(objectRecord(rawComponents))) {
      checkComponent({ type: component }, PARAMS_FILE, entity, context)
      if (component === 'Hitbox') {
        context.findings.push(...collisionCategoryFindings(rawProps, PARAMS_FILE, entity))
      }
    }
  }
}

function validationReport(
  findings: ValidationFinding[],
  sources: LoadedSources,
  projectNotes: readonly string[],
): ProjectValidationReport {
  const summary = {
    errors: findings.filter((finding) => finding.severity === 'error').length,
    warnings: findings.filter((finding) => finding.severity === 'warning').length,
    infos: findings.filter((finding) => finding.severity === 'info').length,
  }
  const provenance = provenanceRows([
    sources.engine,
    sources.behaviors,
    ...sources.archetypes.map((entry) => entry.loaded),
  ])
  return {
    findings,
    summary,
    ok: summary.errors === 0,
    notes: [...projectNotes, SCENE_TRANSITION_NOTE],
    provenance,
    warnings: [...sources.discoveryWarnings, ...mixedSourceWarnings(provenance)],
  }
}
