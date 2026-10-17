// @vitest-environment happy-dom
import { resolveComponentUpdateSchedule, resolveEntityComponents } from '@waica/engine'
import { beforeEach, expect, it, vi } from 'vitest'
import { SCENARIOS } from '../sweep.ts'
import { planFor } from './scenarios.ts'

beforeEach(() => {
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({ fillStyle: '', fillRect: () => {} } as never)
  vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue('data:image/png;base64,fixture')
})

it.each(SCENARIOS)('runs a valid component update schedule for every entity of %s', (name) => {
  const plan = planFor(name)
  for (const entity of plan.scene.entities) {
    const components = resolveEntityComponents(entity, plan.registry.prefabs)
    expect(resolveComponentUpdateSchedule(components.map((component) => component.type), plan.registry.components), entity.name).toMatchObject({ ok: true, issues: [] })
  }
})
