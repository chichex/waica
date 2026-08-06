import type {
  ArchetypeManifest,
  ComponentClass,
  ParamSpec,
  PrefabJson,
  SceneComponentJson,
  SceneEntityJson,
  SceneJson,
  StateJson,
} from '@waica/engine'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { discoverArchetypes, pickArchetype } from './archetypes.js'
import { classDefaults, objectRecord } from './component-metadata.js'
import {
  PackageResolver,
  mixedSourceWarnings,
  provenanceRows,
  type Provenance,
} from './package-resolver.js'
import { loadProjectComponents } from './project-component-loader.js'
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
  | 'component-load-failed'
  | 'component-load-unsupported'

export interface ValidationFinding {
  severity: FindingSeverity
  code: FindingCode
  message: string
  file: string
  ref?: string
}

interface ComponentMetadata {
  params: Record<string, ParamSpec>
  defaults: Record<string, unknown>
}

interface ValidationContext {
  findings: ValidationFinding[]
  manifest: ArchetypeManifest
  knownComponents: Set<string>
  projectComponents: Set<string>
  componentMetadata: Map<string, ComponentMetadata>
  prefabRefs: Set<string>
  declaredStats: Set<string>
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

function classMetadata(Class: ComponentClass): ComponentMetadata {
  // A throwing constructor has no observable defaults, matching list_components.
  return { params: Class.params ?? {}, defaults: classDefaults(Class) }
}

/** Clip names declared by the sibling AnimatedSprite, or undefined when there is none (no animation contract to check). */
function siblingClips(siblings: SceneComponentJson[]): Set<string> | undefined {
  const animated = siblings.find((component) => component.type === 'AnimatedSprite')
  return animated ? new Set(Object.keys(objectRecord(animated.props?.clips))) : undefined
}

/** Whether `action` has at least one real binding — an own key, since bindings is keyed by an untrusted string. */
function isBoundAction(bindings: Record<string, string[]>, action: string): boolean {
  return Object.hasOwn(bindings, action) && (bindings[action]?.length ?? 0) > 0
}

interface ParamReferenceEntry {
  component: SceneComponentJson
  /**
   * Restricts the check to these param names. Used when re-validating a
   * scene-overridden component so the untouched params it inherited from
   * the prefab do not repeat the prefab-level finding a second time under
   * the scene file. Undefined means "check every declared ref param",
   * which is correct for prefab components and inline scene components —
   * neither was already validated elsewhere.
   */
  only?: ReadonlySet<string>
}

function validateParamReferences(
  entries: ParamReferenceEntry[],
  siblings: SceneComponentJson[],
  file: string,
  context: ValidationContext,
): void {
  const clips = siblingClips(siblings)
  for (const { component, only } of entries) {
    const metadata = context.componentMetadata.get(component.type)
    if (!metadata) continue
    const props = objectRecord(component.props)
    for (const [param, spec] of Object.entries(metadata.params)) {
      if (only && !only.has(param)) continue
      if (!spec.ref || spec.options !== undefined) continue
      const value = Object.hasOwn(props, param) ? props[param] : metadata.defaults[param]
      if (typeof value !== 'string' || value === '') continue
      const field = `${component.type}.${param}`
      switch (spec.ref) {
        case 'prefab':
          if (!context.prefabRefs.has(value)) {
            add(
              context,
              'error',
              'broken-prefab-ref',
              `Component "${component.type}" param "${param}" references missing prefab "${value}".`,
              file,
              field,
            )
          }
          break
        case 'clip':
          if (clips && !clips.has(value)) {
            add(
              context,
              'error',
              'missing-clip',
              `Component "${component.type}" param "${param}" references missing animation clip "${value}".`,
              file,
              field,
            )
          }
          break
        case 'action':
          if (!isBoundAction(context.bindings, value)) {
            add(
              context,
              // Consistent with the pre-existing state-transition check for the
              // same condition (below): an unbound action is a real gap the
              // agent should look at, but not one that flips ok:false.
              'warning',
              'input-action-unbound',
              `Component "${component.type}" param "${param}" references unbound input action "${value}".`,
              file,
              field,
            )
          }
          break
        case 'stat':
          if (!context.declaredStats.has(value)) {
            add(
              context,
              'warning',
              'undeclared-stat',
              `Component "${component.type}" param "${param}" references undeclared stat "${value}"; runtime writes may still create it.`,
              file,
              field,
            )
          }
          break
      }
    }
  }
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
  const clips = siblingClips(components)
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
      const explicitClip = typeof definition.clip === 'string' ? definition.clip : undefined
      const clip = explicitClip ?? name
      // No "empty means none" special case here: the runtime looks up
      // `this.states[state]?.clip ?? state`, and '' survives that nullish
      // coalesce, so an explicit empty clip is looked up literally and must
      // be validated like any other explicit value (unlike Collectible.stat,
      // which the runtime genuinely treats as unset).
      if (clips && !clips.has(clip)) {
        add(
          context,
          explicitClip === undefined ? 'warning' : 'error',
          'missing-clip',
          `State "${name}" uses missing animation clip "${clip}".`,
          file,
          explicitClip === undefined ? (ref ?? name) : `StateMachine.states.${name}.clip`,
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
  validateParamReferences(
    components.map((component) => ({ component })),
    components,
    file,
    context,
  )
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
    // Lazily resolved: only computed when a consumer below actually needs
    // the merged prefab+override component list (an override that changes a
    // ref param, a clip-context change, an inline ref:clip lookup that needs
    // the effective sibling AnimatedSprite, or state-machine revalidation).
    // A plain "prefab: ref" entity with no overrides and no inline
    // components never pays for building it (restores the pre-typed-refs
    // laziness that only ran this for state-behavior changes).
    let cachedEffectiveComponents: SceneComponentJson[] | undefined
    const effectiveComponents = (): SceneComponentJson[] => {
      cachedEffectiveComponents ??= resolvedEntityComponents(entity, prefab)
      return cachedEffectiveComponents
    }
    const hasRefKind = (type: string, kind: NonNullable<ParamSpec['ref']>): boolean =>
      Object.values(context.componentMetadata.get(type)?.params ?? {}).some(
        (spec) => spec.ref === kind && spec.options === undefined,
      )

    // Undefined scope means "check every declared ref param" — correct for
    // inline components (never validated elsewhere) and for a component a
    // clip-context change forces a full recheck of. A Set scopes the check
    // to only the override's changed params, so a prefab-level finding for
    // a param the override never touched is not reported a second time
    // under the scene file.
    const referenceScopes = new Map<SceneComponentJson, ReadonlySet<string> | undefined>()
    for (const component of inline) referenceScopes.set(component, undefined)

    const inlineTypes = new Set(inline.map((component) => component.type))
    for (const [type, rawPatch] of Object.entries(overrides)) {
      if (inlineTypes.has(type)) continue
      const metadata = context.componentMetadata.get(type)
      const patch = objectRecord(rawPatch)
      const changedRefParams = new Set(
        Object.entries(metadata?.params ?? {})
          .filter(
            ([param, spec]) =>
              spec.ref !== undefined && spec.options === undefined && Object.hasOwn(patch, param),
          )
          .map(([param]) => param),
      )
      if (changedRefParams.size === 0) continue
      const effective = effectiveComponents().find((component) => component.type === type)
      if (effective && !referenceScopes.has(effective)) referenceScopes.set(effective, changedRefParams)
    }
    const changesClipContext =
      inline.some((component) => component.type === 'AnimatedSprite') ||
      Object.hasOwn(overrides, 'AnimatedSprite')
    if (changesClipContext) {
      for (const component of effectiveComponents()) {
        // A clip-context change can affect params this component didn't
        // itself change, so this always widens to a full check rather than
        // narrowing an already-scoped entry from the override loop above.
        if (hasRefKind(component.type, 'clip')) referenceScopes.set(component, undefined)
      }
    }
    const needsSiblings =
      cachedEffectiveComponents !== undefined ||
      [...referenceScopes.keys()].some((component) => hasRefKind(component.type, 'clip'))
    validateParamReferences(
      [...referenceScopes.entries()].map(([component, only]) => ({ component, only })),
      needsSiblings ? effectiveComponents() : [...referenceScopes.keys()],
      file,
      context,
    )

    // Re-evaluate inherited state behavior only when this entity actually
    // changes a StateMachine or AnimatedSprite. Unrelated overrides keep the
    // prefab-level finding as the single source of truth.
    const stateTypes = new Set(['StateMachine', 'AnimatedSprite'])
    const changesStateBehavior =
      inline.some((component) => stateTypes.has(component.type)) ||
      Object.keys(overrides).some((type) => stateTypes.has(type))
    if (changesStateBehavior) {
      validateStateMachines(effectiveComponents(), file, entityRef, context)
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
    loadProjectComponents(projectPath, resolver),
  ])
  for (const failure of loadedProjectComponents.failures) {
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
  const manifest = pickArchetype(archetypes, activeId, projectPath).manifest
  const controls = objectRecord(objectRecord(fixed.get('src/controls.json')).bindings)
  // Bound/unbound is decided from controls.json alone: the shipped runtime
  // installs exactly controls.json's bindings (template main.ts passes
  // controls.bindings raw; engine DEFAULT_BINDINGS is {}), so an action an
  // archetype defines by default but controls.json drops is genuinely
  // unbound at runtime even though discoverArchetypes never guarantees
  // manifest.bindings exists (only manifest.id is validated).
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
  const declaredStats = new Set(
    Object.keys(objectRecord(objectRecord(fixed.get('src/stats.json')).stats)),
  )
  const componentMetadata = new Map<string, ComponentMetadata>(
    Object.entries(manifest.registry.components).map(([name, Class]) => [
      name,
      classMetadata(Class),
    ]),
  )
  for (const [name, description] of Object.entries(loadedProjectComponents.components)) {
    componentMetadata.set(name, {
      params: description.params,
      defaults: description.defaults,
    })
    projectComponents.add(name)
  }

  // Reconstruct the complete ref set before validating any prefab, so a
  // lexically earlier file can refer to one discovered later in the tree.
  const prefabs = new Map<string, PrefabJson>()
  const prefabFiles: Array<{ prefab: PrefabJson; relative: string; ref: string }> = []
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
      prefabFiles.push({ prefab, relative, ref })
    }
  }
  const context: ValidationContext = {
    findings,
    manifest,
    knownComponents: new Set(Object.keys(manifest.registry.components)),
    projectComponents,
    componentMetadata,
    prefabRefs: new Set(prefabs.keys()),
    declaredStats,
    stateFiles,
    roleStateSources,
    bindings,
  }
  for (const { prefab, relative, ref } of prefabFiles) {
    validatePrefab(prefab, relative, ref, context)
  }

  const uiFiles = await directFiles(path.join(projectPath, 'src/ui'), '.html')
  const uiNames = new Set(uiFiles.map((file) => file.slice(0, -'.html'.length)))
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
