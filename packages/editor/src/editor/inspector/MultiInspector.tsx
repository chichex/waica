import type { PrefabJson, SceneComponentJson, SceneEntityJson } from '@waica/engine'
import { useArchetype, type ArchetypeManifest } from '../../project/archetype'
import { resolveComponents } from '../../scene/ops'
import { collisionParamDiagnostics, type ParamDiagnostic } from '../collision-category-diagnostics'
import { entityIcon } from '../icons'
import { ANIMATION_KEYS, componentDefaults, componentKeys, componentLabel } from './component-meta'
import type { InspectorProps } from './inspector-props'
import { PropRow } from './PropRow'
import {
  UpdateScheduleError,
  UpdateScheduleMeta,
  updateScheduleFor,
  type InspectorUpdateSchedule,
} from './update-schedule'

type OnMultiProp = InspectorProps['onMultiProp']

function paramValuesEqual(left: unknown, right: unknown): boolean {
  if (!Array.isArray(left) || !Array.isArray(right)) return Object.is(left, right)
  return (
    left.length === right.length &&
    left.every((value, index) => Object.is(value, right[index]))
  )
}

function multiCollisionDiagnostics(
  componentType: string,
  param: string,
  names: readonly string[],
  values: readonly unknown[],
): ParamDiagnostic[] | undefined {
  let recognized = false
  const result: ParamDiagnostic[] = []
  values.forEach((value, index) => {
    const diagnostics = collisionParamDiagnostics(componentType, param, value)
    if (diagnostics === undefined) return
    recognized = true
    result.push(
      ...diagnostics.map((diagnostic) => ({
        severity: diagnostic.severity,
        message: `${names[index]}: ${diagnostic.message}`,
      })),
    )
  })
  return recognized ? result : undefined
}

/**
 * Looks a shared component type up on every selected entity. Shared types are
 * taken from the first entity and kept only when every entity carries them, so
 * a miss or an empty selection means that invariant broke.
 */
function lookupShared<T, U>(
  items: readonly T[],
  lookup: (item: T) => U | undefined,
  type: string,
): [U, ...U[]] {
  const found = items.map((item) => {
    const value = lookup(item)
    if (value === undefined) throw new Error(`shared component type "${type}" is missing on a selected entity`)
    return value
  })
  const [first, ...rest] = found
  if (first === undefined) throw new Error(`shared component type "${type}" has no selected entity`)
  return [first, ...rest]
}

/** One shared component's primitive props, each written to every selected entity at once. */
interface MultiComponentSectionProps {
  type: string
  comps: [SceneComponentJson, ...SceneComponentJson[]]
  names: string[]
  archetype: ArchetypeManifest
  onMultiProp: OnMultiProp
}

function MultiComponentSection({ type, comps, names, archetype, onMultiProp }: MultiComponentSectionProps) {
  const defaults = componentDefaults(comps[0], archetype)
  const specs = archetype.registry.components[type]?.params ?? {}
  const valueOf = (comp: SceneComponentJson, key: string): unknown =>
    comp.props && Object.hasOwn(comp.props, key) ? comp.props[key] : defaults[key]
  const keys = [...new Set(comps.flatMap((c) => componentKeys(c, archetype)))].filter((key) => {
    const paramKind = specs[key]?.kind
    if ((ANIMATION_KEYS.has(key) || key === 'texture') && paramKind !== 'texture') return false
    if (paramKind === 'string-list' || paramKind === 'vector2') return true
    const sample = comps.map((c) => valueOf(c, key)).find((v) => v !== undefined)
    const kind = typeof sample
    return kind === 'number' || kind === 'boolean' || kind === 'string'
  })
  if (keys.length === 0) return null
  return (
    <div className="ed-section">
      <header className="ed-sec-head">{componentLabel(type, archetype)}</header>
      {keys.map((key) => {
        const values = comps.map((c) => valueOf(c, key))
        const uniform = values.every((value) => paramValuesEqual(value, values[0]))
        const spec = specs[key]
        return (
          <PropRow
            key={`multi.${names.length}.${type}.${key}`}
            label={key}
            spec={uniform ? spec : { ...spec, label: `${spec?.label ?? key} (mixed)` }}
            value={values[0] === undefined ? 0 : values[0]}
            diagnostics={multiCollisionDiagnostics(type, key, names, values)}
            onChange={(value) => onMultiProp(names, type, key, value)}
          />
        )
      })}
    </div>
  )
}

/**
 * Batch editor for the multi-selection: components every selected entity
 * carries, with their primitive props editable in one stroke. Uniform values
 * show as-is; mixed ones show the first entity's value marked "(mixed)".
 * Committing a row writes the value to every selected entity.
 */
function MultiPropsSection({
  entities,
  prefabs,
  onMultiProp,
}: {
  entities: SceneEntityJson[]
  prefabs: Record<string, PrefabJson>
  onMultiProp: OnMultiProp
}) {
  const archetype = useArchetype()
  const names = entities.map((e) => e.name)
  const resolved = entities.map((e) => resolveComponents(e, prefabs))
  const sharedTypes = (resolved[0] ?? [])
    .map((c) => c.type)
    .filter(
      (type) =>
        type !== 'StateMachine' && resolved.every((comps) => comps.some((c) => c.type === type)),
    )
  return (
    <>
      {sharedTypes.map((type) => (
        <MultiComponentSection
          key={type}
          type={type}
          comps={lookupShared(resolved, (list) => list.find((c) => c.type === type), type)}
          names={names}
          archetype={archetype}
          onMultiProp={onMultiProp}
        />
      ))}
    </>
  )
}

/** Shared components' update positions: concrete when every entity agrees, else "varies". */
function SharedUpdatePositions({
  types,
  schedules,
  archetype,
}: {
  types: string[]
  schedules: Array<Extract<InspectorUpdateSchedule, { ok: true }>>
  archetype: ArchetypeManifest
}) {
  return (
    <div className="ed-section ed-update-multi">
      <header className="ed-sec-head">Update schedule</header>
      {types.map((type) => {
        const annotations = lookupShared(schedules, (schedule) => schedule.annotations.get(type), type)
        const position = annotations.every(({ position }) => position === annotations[0].position)
          ? annotations[0].position
          : 'varies'
        const after = annotations.every(
          ({ after }) => after.join('\0') === annotations[0].after.join('\0'),
        )
          ? annotations[0].after
          : []
        return (
          <div className="ed-comp" key={type}>
            <header className="ed-comp-head">
              <span>{componentLabel(type, archetype)}</span>
              <UpdateScheduleMeta position={position} after={after} />
            </header>
          </div>
        )
      })}
    </div>
  )
}

function MultiUpdateScheduleSection({
  entities,
  prefabs,
}: {
  entities: readonly SceneEntityJson[]
  prefabs: Record<string, PrefabJson>
}) {
  const archetype = useArchetype()
  const resolved = entities.map((entity) => resolveComponents(entity, prefabs))
  const schedules = entities.map((entity, index) =>
    updateScheduleFor(entity.name, resolved[index] ?? [], archetype.registry.components),
  )
  const invalid = schedules.filter(
    (schedule): schedule is Extract<InspectorUpdateSchedule, { ok: false }> => !schedule.ok,
  )
  if (invalid.length > 0) {
    return (
      <div className="ed-section ed-update-multi">
        <header className="ed-sec-head">Update schedule</header>
        {invalid.map((schedule) => (
          <UpdateScheduleError key={schedule.message} schedule={schedule} />
        ))}
      </div>
    )
  }
  const valid = schedules as Array<Extract<InspectorUpdateSchedule, { ok: true }>>
  const sharedTypes = [...new Set((resolved[0] ?? []).map((component) => component.type))].filter(
    (type) => valid.every((schedule) => schedule.annotations.has(type)),
  )
  if (sharedTypes.length === 0) return null
  return <SharedUpdatePositions types={sharedTypes} schedules={valid} archetype={archetype} />
}

/** The multi-selection: who is selected, how to act on the group, and its shared props. */
export function MultiInspector({
  entities,
  prefabs,
  onMultiProp,
}: {
  entities: SceneEntityJson[]
  prefabs: Record<string, PrefabJson>
  onMultiProp: OnMultiProp
}) {
  const archetype = useArchetype()
  return (
    <div className="ed-pad">
      <div className="ed-ins-multi">
        {entities.map((entity) => (
          <div key={entity.name} className="ed-ins-multi-row">
            <span className="ed-x-ico">{entityIcon(entity, prefabs, archetype)}</span>
            {entity.name}
          </div>
        ))}
      </div>
      <div className="ed-hint">
        drag any of them in the viewport to move the group · Shift-click adds or removes one
        · ⌘/Ctrl+D duplicates · Delete removes — or right-click a selected row
      </div>
      <MultiUpdateScheduleSection entities={entities} prefabs={prefabs} />
      <MultiPropsSection entities={entities} prefabs={prefabs} onMultiProp={onMultiProp} />
    </div>
  )
}
