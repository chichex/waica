import type { ArchetypeManifest, ComponentClass, ParamSpec, SceneEntityJson } from '@waica/engine'

/** A scene entity as validation reads it: the name and the rest of the shape are unchecked JSON. */
export type LooseSceneEntity = Omit<Partial<SceneEntityJson>, 'name'> & { name?: unknown }

export type FindingSeverity = 'error' | 'warning' | 'info'

export type FindingCode =
  | 'unknown-component'
  | 'broken-prefab-ref'
  | 'override-key-not-in-prefab'
  | 'missing-clip'
  | 'missing-sound'
  | 'dangling-transition-target'
  | 'unreachable-state'
  | 'no-state-code'
  | 'input-action-unbound'
  | 'undeclared-stat'
  | 'unknown-ui-piece'
  | 'camera-follow-unknown-entity'
  | 'unknown-scene-transition-target'
  | 'scene-transition-missing-interactable'
  | 'unparseable-json'
  | 'component-load-failed'
  | 'component-load-unsupported'
  | 'duplicate-component'
  | 'invalid-update-constraint'
  | 'component-update-cycle'
  | 'invalid-collision-layer'
  | 'invalid-collision-mask'
  | 'duplicate-collision-mask-entry'
  | 'invalid-scene-render'
  | 'invalid-scene-simulation'
  | 'invalid-collider-param'
  | 'rigid-body-without-collider'
  | 'character-motor-without-body'
  | 'invalid-light-param'
  | 'invalid-sun-param'
  | 'invalid-scene-camera'
  | 'invalid-entity-transform'
  | 'component-space-mismatch'
  | 'missing-model'
  | 'model-shape-ignored'
  | 'gltf-external-resource'

export interface ValidationFinding {
  severity: FindingSeverity
  code: FindingCode
  message: string
  file: string
  ref?: string
}

export interface ComponentMetadata {
  Class: ComponentClass
  params: Record<string, ParamSpec>
  defaults: Record<string, unknown>
  sourceFile?: string
}

/** Everything validate_project knows about the Project while it checks its files. */
export interface ValidationContext {
  findings: ValidationFinding[]
  manifest: ArchetypeManifest
  knownComponents: Set<string>
  projectComponents: Set<string>
  componentMetadata: Map<string, ComponentMetadata>
  componentRegistry: Record<string, ComponentClass>
  reportedClassConstraints: Set<string>
  prefabRefs: Set<string>
  declaredStats: Set<string>
  stateFiles: Set<string>
  roleStateSources: Map<string, string[]>
  bindings: Record<string, string[]>
  soundRefs: ReadonlySet<string>
  /** Every uri a `kind: 'model'` param (Model.src) may validly name — see projectModelRefs. */
  modelRefs: ReadonlySet<string>
  uiPieces: ReadonlySet<string>
  /** The stock Anchored Pieces, plus pieces a component names through a `ref: 'ui'` param. */
  anchoredPieces: Set<string>
}

export function add(
  context: Pick<ValidationContext, 'findings'>,
  severity: FindingSeverity,
  code: FindingCode,
  message: string,
  file: string,
  ref?: string,
): void {
  context.findings.push({ severity, code, message, file, ...(ref ? { ref } : {}) })
}
