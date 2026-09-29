import {
  resolveComponentUpdateSchedule,
  type ComponentClass,
  type ComponentUpdateScheduleIssue,
  type SceneComponentJson,
} from '@waica/engine'
import { classDefaults, objectRecord } from './component-metadata.js'
import { resolveParamReference } from './param-reference-resolution.js'
import { add, type ComponentMetadata, type ValidationContext } from './validation-context.js'

export function checkComponent(
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

export function componentList(value: unknown): SceneComponentJson[] {
  if (!Array.isArray(value)) return []
  return value.filter(
    (entry): entry is SceneComponentJson =>
      !!entry && typeof entry === 'object' && typeof (entry as { type?: unknown }).type === 'string',
  )
}

export function classMetadata(Class: ComponentClass): ComponentMetadata {
  // A throwing constructor has no observable defaults, matching list_components.
  return { Class, params: Class.params ?? {}, defaults: classDefaults(Class) }
}

/** Clip names declared by the sibling AnimatedSprite, or undefined when there is none (no animation contract to check). */
export function siblingClips(siblings: SceneComponentJson[]): Set<string> | undefined {
  const animated = siblings.find((component) => component.type === 'AnimatedSprite')
  return animated ? new Set(Object.keys(objectRecord(animated.props?.clips))) : undefined
}

export interface ParamReferenceEntry {
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

export function validateParamReferences(
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
      if (spec.ref === 'ui') context.anchoredPieces.add(value)
      const field = `${component.type}.${param}`
      const finding = resolveParamReference(
        { componentType: component.type, param, ref: spec.ref, value, clips, file, field },
        {
          prefabRefs: context.prefabRefs,
          animation: context.manifest.animation,
          bindings: context.bindings,
          declaredStats: context.declaredStats,
          soundRefs: context.soundRefs,
          uiPieces: context.uiPieces,
        },
      )
      if (finding) context.findings.push(finding)
    }
  }
}

export function componentUpdateIssueKey(issue: ComponentUpdateScheduleIssue): string {
  switch (issue.code) {
    case 'duplicate-component':
      return `${issue.code}:${issue.componentName}:${issue.count}`
    case 'invalid-update-constraint':
      return `${issue.code}:${issue.reason}:${issue.declarer}:${issue.target ?? ''}`
    case 'component-update-cycle':
      return `${issue.code}:${issue.componentNames.join('\0')}`
  }
}

export function componentUpdateIssues(
  components: readonly SceneComponentJson[],
  context: ValidationContext,
): ComponentUpdateScheduleIssue[] {
  const result = resolveComponentUpdateSchedule(
    components.map((component) => component.type),
    context.componentRegistry,
  )
  return result.ok ? [] : [...result.issues]
}

function addComponentUpdateFinding(
  issue: ComponentUpdateScheduleIssue,
  file: string,
  ref: string | undefined,
  context: ValidationContext,
): void {
  let findingFile = file
  let findingRef = ref
  if (issue.code === 'invalid-update-constraint') {
    const source = context.componentMetadata.get(issue.declarer)?.sourceFile
    if (source) {
      const key = `${source}:${componentUpdateIssueKey(issue)}`
      if (context.reportedClassConstraints.has(key)) return
      context.reportedClassConstraints.add(key)
      findingFile = source
      findingRef = issue.declarer
    }
  }
  add(context, 'error', issue.code, issue.cause, findingFile, findingRef)
}

export function validateComponentUpdateSchedule(
  components: readonly SceneComponentJson[],
  file: string,
  ref: string | undefined,
  context: ValidationContext,
  inheritedIssues: ReadonlySet<string> = new Set(),
): void {
  for (const issue of componentUpdateIssues(components, context)) {
    if (inheritedIssues.has(componentUpdateIssueKey(issue))) continue
    addComponentUpdateFinding(issue, file, ref, context)
  }
}

export function validateComponentClassUpdateContracts(context: ValidationContext): void {
  for (const componentName of Object.keys(context.componentRegistry).sort()) {
    const metadata = context.componentMetadata.get(componentName)
    const result = resolveComponentUpdateSchedule([componentName], context.componentRegistry)
    if (result.ok) continue
    for (const issue of result.issues) {
      if (issue.code !== 'invalid-update-constraint') continue
      addComponentUpdateFinding(
        issue,
        metadata?.sourceFile ?? 'package.json',
        componentName,
        context,
      )
    }
  }
}
