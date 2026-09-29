import { createContext, useContext } from 'react'
import {
  resolveComponentUpdateSchedule,
  type ComponentClass,
  type SceneComponentJson,
} from '@waica/engine'

interface UpdateScheduleAnnotation {
  position: number
  after: string[]
}

export type InspectorUpdateSchedule =
  | { ok: true; annotations: ReadonlyMap<string, UpdateScheduleAnnotation> }
  | { ok: false; message: string }

export const UpdateScheduleContext = createContext<InspectorUpdateSchedule | null>(null)

export function updateScheduleFor(
  owner: string,
  components: readonly SceneComponentJson[],
  registry: Readonly<Record<string, ComponentClass>>,
): InspectorUpdateSchedule {
  const names = components.map((component) => component.type)
  const result = resolveComponentUpdateSchedule(names, registry)
  if (!result.ok) {
    return {
      ok: false,
      message: `Invalid component update schedule for "${owner}": ${result.issues
        .map((issue) => issue.cause)
        .join(' ')}`,
    }
  }
  const present = new Set(names)
  const annotations = new Map<string, UpdateScheduleAnnotation>()
  result.order.forEach((componentName, index) => {
    const Class = Object.hasOwn(registry, componentName) ? registry[componentName] : undefined
    const after = [...new Set(Class?.updateAfter ?? [])].filter((target) => present.has(target))
    annotations.set(componentName, { position: index + 1, after })
  })
  return { ok: true, annotations }
}

export function UpdateScheduleMeta({
  position,
  after,
}: {
  position: number | 'varies'
  after: readonly string[]
}) {
  return (
    <span className="ed-update-meta">
      <span className="ed-update-badge">update {position}</span>
      {after.length > 0 && <span className="ed-update-after">after: {after.join(', ')}</span>}
    </span>
  )
}

export function ComponentUpdateSchedule({ type }: { type: string }) {
  const schedule = useContext(UpdateScheduleContext)
  if (!schedule?.ok) return null
  const annotation = schedule.annotations.get(type)
  return annotation ? <UpdateScheduleMeta {...annotation} /> : null
}

export function UpdateScheduleError({ schedule }: { schedule: InspectorUpdateSchedule }) {
  return schedule.ok ? null : <div className="ed-warn-card ed-update-error">⚠ {schedule.message}</div>
}
