import type {
  ArchetypeManifest,
  PrefabJson,
  SceneComponentJson,
  SceneEntityJson,
  SceneJson,
  StateJson,
} from '@waica/engine'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { discoverArchetypes, pickArchetype } from './archetypes.js'
import {
  PackageResolver,
  mixedSourceWarnings,
  provenanceRows,
  type Provenance,
} from './package-resolver.js'
import { directFiles, requireWaicaProject } from './project-path.js'

export type FindingSeverity = 'error' | 'warning' | 'info'

export type FindingCode =
  | 'unknown-component'
  | 'broken-prefab-ref'
  | 'override-key-not-in-prefab'
  | 'missing-clip'
  | 'dangling-transition-target'
  | 'unreachable-state'
  | 'no-state-code'
  | 'input-action-unbound'
  | 'undeclared-stat'
  | 'unknown-ui-piece'
  | 'camera-follow-unknown-entity'
  | 'unparseable-json'

export interface ValidationFinding {
  severity: FindingSeverity
  code: FindingCode
  message: string
  file: string
  ref?: string
}

interface ValidationContext {
  findings: ValidationFinding[]
  manifest: ArchetypeManifest
  knownComponents: Set<string>
  projectComponents: Set<string>
  stateFiles: Set<string>
  roleStateSources: Map<string, string[]>
  bindings: Record<string, string[]>
}

function add(
  context: Pick<ValidationContext, 'findings'>,
  severity: FindingSeverity,
  code: FindingCode,
  message: string,
  file: string,
  ref?: string,
): void {
  context.findings.push({ severity, code, message, file, ...(ref ? { ref } : {}) })
}

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

function checkComponent(
  component: SceneComponentJson,
  file: string,
  ref: string | undefined,
  context: ValidationContext,
): void {
  if (context.knownComponents.has(component.type)) return
  if (context.projectComponents.has(component.type)) {
    add(
      context,
      'info',
      'unknown-component',
      `Component "${component.type}" is project-owned, not validated.`,
      file,
      ref,
    )
    return
  }
  add(
    context,
    'error',
    'unknown-component',
    `Unknown component "${component.type}".`,
    file,
    ref,
  )
}

function componentList(value: unknown): SceneComponentJson[] {
  if (!Array.isArray(value)) return []
  return value.filter(
    (entry): entry is SceneComponentJson =>
      !!entry && typeof entry === 'object' && typeof (entry as { type?: unknown }).type === 'string',
  )
}

function objectRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}

function machineStates(component: SceneComponentJson): Record<string, StateJson> {
  return objectRecord(component.props?.states) as Record<string, StateJson>
}

function escapedRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

async function projectRoleStateSources(projectPath: string): Promise<Map<string, string[]>> {
  const sources = new Map<string, string[]>()
  for (const file of await directFiles(path.join(projectPath, 'src/roles'), '.ts')) {
    const source = await readFile(path.join(projectPath, 'src/roles', file), 'utf8')
    for (const match of source.matchAll(/\bdefine(?:Role|States)\s*\(\s*(['"])([^'"]+)\1/g)) {
      const role = match[2]
      if (!role) continue
      sources.set(role, [...(sources.get(role) ?? []), source.slice(match.index)])
    }
  }
  return sources
}

function roleSourceHasState(source: string, state: string): boolean {
  const statesMarkers = [...source.matchAll(/\bstates\s*:/g)]
  const candidate = statesMarkers.at(-1)
  const registration = candidate ? source.slice(candidate.index) : source
  return new RegExp(`\\b${escapedRegex(state)}\\s*:`).test(registration)
}

/** Mirrors flat state files and textually recognizes project role registrations. */
function stateCodeExists(
  role: string,
  state: string,
  context: ValidationContext,
): boolean {
  const roleStates = context.manifest.bundle.roles[role]?.states
  const logicStates = context.manifest.bundle.logicSets?.[role]
  return (
    (!!roleStates && Object.hasOwn(roleStates, state)) ||
    (!!logicStates && Object.hasOwn(logicStates, state)) ||
    context.stateFiles.has(state) ||
    (context.roleStateSources.get(role) ?? []).some((source) =>
      roleSourceHasState(source, state),
    )
  )
}

function validateStateMachines(
  components: SceneComponentJson[],
  file: string,
  ref: string | undefined,
  context: ValidationContext,
): void {
  const animated = components.find((component) => component.type === 'AnimatedSprite')
  const clips = animated
    ? new Set(Object.keys(objectRecord(animated.props?.clips)))
    : undefined
  for (const machine of components.filter((component) => component.type === 'StateMachine')) {
    const states = machineStates(machine)
    const realNames = Object.keys(states).filter((name) => name !== '*')
    const role = typeof machine.props?.role === 'string' ? machine.props.role : ''
    const initial =
      typeof machine.props?.initial === 'string' && machine.props.initial
        ? machine.props.initial
        : (realNames[0] ?? '')
    for (const name of realNames) {
      const definition = objectRecord(states[name]) as StateJson
      const clip = typeof definition.clip === 'string' ? definition.clip : name
      if (clips && !clips.has(clip)) {
        add(
          context,
          'warning',
          'missing-clip',
          `State "${name}" uses missing animation clip "${clip}".`,
          file,
          ref ?? name,
        )
      }
      const transitions = Array.isArray(definition.transitions) ? definition.transitions : []
      for (const transition of transitions) {
        if (!transition || typeof transition !== 'object') continue
        const to = (transition as { to?: unknown }).to
        const on = (transition as { on?: unknown }).on
        if (typeof to === 'string' && to !== '*' && !Object.hasOwn(states, to)) {
          add(
            context,
            'warning',
            'dangling-transition-target',
            `State "${name}" transitions to missing state "${to}".`,
            file,
            ref ?? name,
          )
        }
        if (typeof on === 'string' && on.startsWith('input:')) {
          const action = on.slice('input:'.length)
          if (!context.bindings[action]?.length) {
            add(
              context,
              'warning',
              'input-action-unbound',
              `Input action "${action}" has no bindings.`,
              file,
              action,
            )
          }
        }
      }
      if (name !== initial) {
        const reachable = Object.values(states).some((candidate) =>
          (Array.isArray(candidate?.transitions) ? candidate.transitions : []).some(
            (transition) => transition?.to === name,
          ),
        )
        if (!reachable) {
          add(
            context,
            'warning',
            'unreachable-state',
            `Nothing transitions to state "${name}" and it is not initial.`,
            file,
            ref ?? name,
          )
        }
      }
      if (!stateCodeExists(role, name, context)) {
        add(
          context,
          'info',
          'no-state-code',
          `State "${name}" has no built-in code, project role registration or src/states/${name}.ts.`,
          file,
          ref ?? name,
        )
      }
    }
  }
}

type LooseSceneEntity = Omit<Partial<SceneEntityJson>, 'name'> & { name?: unknown }

function resolvedEntityComponents(
  entity: LooseSceneEntity,
  prefab?: PrefabJson,
): SceneComponentJson[] {
  const overrides = objectRecord(entity.overrides)
  const inherited = componentList(prefab?.components).map((component) => ({
    type: component.type,
    props: {
      ...objectRecord(component.props),
      ...objectRecord(overrides[component.type]),
    },
  }))
  return [...inherited, ...componentList(entity.components)]
}

function validatePrefab(
  prefab: PrefabJson,
  file: string,
  ref: string,
  context: ValidationContext,
): void {
  const components = componentList(prefab.components)
  for (const component of components) checkComponent(component, file, ref, context)
  validateStateMachines(components, file, ref, context)
}

function validateScene(
  scene: SceneJson,
  file: string,
  prefabs: ReadonlyMap<string, PrefabJson>,
  uiNames: ReadonlySet<string>,
  context: ValidationContext,
): void {
  const rawEntities: unknown[] = Array.isArray(scene.entities) ? scene.entities : []
  const entities = rawEntities
    .map((entity, index) => ({ entity, index }))
    .filter(
      (entry): entry is { entity: LooseSceneEntity; index: number } =>
        !!entry.entity && typeof entry.entity === 'object' && !Array.isArray(entry.entity),
    )
  const entityNames = new Set(
    entities
      .map(({ entity }) => (typeof entity.name === 'string' ? entity.name : ''))
      .filter(Boolean),
  )
  const follow = scene.camera?.follow
  if (typeof follow === 'string' && follow && !entityNames.has(follow)) {
    add(
      context,
      'warning',
      'camera-follow-unknown-entity',
      `Camera follows unknown entity "${follow}".`,
      file,
      follow,
    )
  }
  for (const ui of Array.isArray(scene.ui) ? scene.ui : []) {
    if (typeof ui === 'string' && !uiNames.has(ui)) {
      add(context, 'warning', 'unknown-ui-piece', `Unknown UI piece "${ui}".`, file, ui)
    }
  }
  for (const { entity, index } of entities) {
    const entityRef =
      typeof entity.name === 'string' && entity.name ? entity.name : `entity[${index}]`
    const inline = componentList(entity.components)
    for (const component of inline) checkComponent(component, file, entityRef, context)
    const prefabRef = typeof entity.prefab === 'string' ? entity.prefab : undefined
    const overrides = objectRecord(entity.overrides)
    let prefab: PrefabJson | undefined
    if (prefabRef) {
      prefab = prefabs.get(prefabRef)
      if (!prefab) {
        add(
          context,
          'error',
          'broken-prefab-ref',
          `Entity "${entityRef}" references missing prefab "${prefabRef}".`,
          file,
          prefabRef,
        )
      } else {
        const componentTypes = new Set(
          componentList(prefab.components).map((component) => component.type),
        )
        for (const override of Object.keys(overrides)) {
          if (!componentTypes.has(override)) {
            add(
              context,
              'warning',
              'override-key-not-in-prefab',
              `Override "${override}" is not a component in prefab "${prefabRef}".`,
              file,
              prefabRef,
            )
          }
        }
      }
    }
    // Re-evaluate inherited state behavior only when this entity actually
    // changes a StateMachine or AnimatedSprite. Unrelated overrides keep the
    // prefab-level finding as the single source of truth.
    const stateTypes = new Set(['StateMachine', 'AnimatedSprite'])
    const changesStateBehavior =
      inline.some((component) => stateTypes.has(component.type)) ||
      Object.keys(overrides).some((type) => stateTypes.has(type))
    if (changesStateBehavior) {
      validateStateMachines(
        resolvedEntityComponents(entity, prefab),
        file,
        entityRef,
        context,
      )
    }
  }
}

function statBindings(html: string): Set<string> {
  // GameUi binds text nodes only: attributes, comments, style and script
  // contents are not runtime bindings and must not create validator findings.
  const textOnly = html
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<(style|script)\b[^>]*>[\s\S]*?<\/\1>/gi, '')
    .replace(/<[^>]*>/g, ' ')
  const names = new Set<string>()
  for (const match of textOnly.matchAll(/\{\{\s*([\w-]+)\s*\}\}/g)) {
    if (match[1]) names.add(match[1])
  }
  return names
}

export async function validateProject(projectPath: string): Promise<{
  findings: ValidationFinding[]
  summary: { errors: number; warnings: number; infos: number }
  ok: boolean
  notes: string[]
  provenance: Provenance[]
  warnings: string[]
}> {
  const check = await requireWaicaProject(projectPath)
  const findings: ValidationFinding[] = []
  const fixedPaths = [
    'package.json',
    'src/game.json',
    'src/controls.json',
    'src/stats.json',
    'public/waica.params.json',
  ]
  const fixed = new Map<string, unknown>()
  for (const relative of fixedPaths) {
    fixed.set(relative, await parseJson(projectPath, relative, findings))
  }
  const game = objectRecord(fixed.get('src/game.json'))
  const gameWasUnparseable = findings.some(
    (finding) => finding.code === 'unparseable-json' && finding.file === 'src/game.json',
  )
  const activeId =
    typeof game.archetype === 'string' && game.archetype
      ? game.archetype
      : gameWasUnparseable
        ? 'platformer'
        : null

  const resolver = new PackageResolver(projectPath)
  const discoveryWarnings: string[] = []
  const [engine, behaviors, archetypes, projectComponents, roleStateSources] =
    await Promise.all([
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
    ])
  const manifest = pickArchetype(archetypes, activeId, projectPath).manifest
  const controls = objectRecord(objectRecord(fixed.get('src/controls.json')).bindings)
  const bindings: Record<string, string[]> = {}
  for (const [name, value] of Object.entries(controls)) {
    if (Array.isArray(value) && value.every((entry) => typeof entry === 'string')) {
      bindings[name] = value
    }
  }
  const stateFiles = new Set(
    (await directFiles(path.join(projectPath, 'src/states'), '.ts')).map((file) =>
      file.slice(0, -'.ts'.length),
    ),
  )
  const context: ValidationContext = {
    findings,
    manifest,
    knownComponents: new Set(Object.keys(manifest.registry.components)),
    projectComponents,
    stateFiles,
    roleStateSources,
    bindings,
  }

  const prefabs = new Map<string, PrefabJson>()
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
      const prefab = parsed as PrefabJson
      prefabs.set(ref, prefab)
      validatePrefab(prefab, relative, ref, context)
    }
  }

  const uiFiles = await directFiles(path.join(projectPath, 'src/ui'), '.html')
  const uiNames = new Set(uiFiles.map((file) => file.slice(0, -'.html'.length)))
  const declaredStats = new Set(
    Object.keys(objectRecord(objectRecord(fixed.get('src/stats.json')).stats)),
  )
  for (const file of uiFiles) {
    const relative = `src/ui/${file}`
    const html = await readFile(path.join(projectPath, relative), 'utf8')
    for (const stat of statBindings(html)) {
      if (!declaredStats.has(stat)) {
        add(
          context,
          'warning',
          'undeclared-stat',
          `UI references undeclared stat "${stat}"; runtime writes may still create it.`,
          relative,
          stat,
        )
      }
    }
  }

  const sceneFiles = await directFiles(path.join(projectPath, 'src/scenes'), '.scene.json')
  for (const file of sceneFiles) {
    const relative = `src/scenes/${file}`
    const parsed = await parseJson(projectPath, relative, findings)
    if (!parsed || typeof parsed !== 'object') continue
    validateScene(parsed as SceneJson, relative, prefabs, uiNames, context)
  }

  const params = objectRecord(fixed.get('public/waica.params.json'))
  for (const [entity, rawComponents] of Object.entries(params)) {
    for (const component of Object.keys(objectRecord(rawComponents))) {
      checkComponent({ type: component }, 'public/waica.params.json', entity, context)
    }
  }

  const summary = {
    errors: findings.filter((finding) => finding.severity === 'error').length,
    warnings: findings.filter((finding) => finding.severity === 'warning').length,
    infos: findings.filter((finding) => finding.severity === 'info').length,
  }
  const provenance = provenanceRows([engine, behaviors, ...archetypes.map((entry) => entry.loaded)])
  return {
    findings,
    summary,
    ok: summary.errors === 0,
    notes: [
      ...check.notes,
      'The shipped runtime loads src/scenes/main.scene.json; other scenes are validated but are not loaded automatically.',
    ],
    provenance,
    warnings: [...discoveryWarnings, ...mixedSourceWarnings(provenance)],
  }
}
