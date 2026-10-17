import { describe, expect, it } from 'vitest'
import { SCENARIOS } from '../sweep.ts'
import { planFor } from './scenarios.ts'

describe('shadow scenarios in the benchmark sweep', () => {
  it('adds the complete paired 50/200 matrix after the unchanged seventeen scenarios', () => {
    expect(SCENARIOS.slice(0, 17)).toEqual([
      'static-sprites-1000', 'static-sprites-5000', 'static-sprites-20000',
      'spawn-churn-10', 'spawn-churn-50', 'spawn-churn-200',
      'animated-sprites-500', 'animated-sprites-2000',
      'bullet-hell-10', 'bullet-hell-20', 'bullet-hell-40',
      'lights-occlusion-8', 'lights-occlusion-32',
      'falling-boxes-200', 'falling-boxes-1000', 'skinned-characters-50', 'skinned-characters-200',
    ])
    expect(SCENARIOS.slice(17)).toEqual([
      'shadows-sun-off-50', 'shadows-sun-off-200', 'shadows-sun-on-50', 'shadows-sun-on-200',
      'shadows-point-off-50', 'shadows-point-off-200', 'shadows-point-on-50', 'shadows-point-on-200',
      'shadows-four-point-off-50', 'shadows-four-point-off-200', 'shadows-four-point-on-50', 'shadows-four-point-on-200',
    ])
  })

  it('resolves every shadow id to its authored composition, activation and workload size', () => {
    const names = SCENARIOS.filter((candidate) => candidate.startsWith('shadows-'))
    expect(names).toHaveLength(12)
    for (const name of names) {
      const plan = planFor(name)
      const composition = name.includes('four-point') ? 'four-point' : name.includes('sun') ? 'sun' : 'point'
      const enabled = name.includes('-on-')
      expect(plan.shadow).toEqual({
        composition, enabled, quality: enabled ? 'medium' : 'off',
        casters: name.endsWith('-200') ? 200 : 50,
        lights: composition === 'four-point' ? 4 : 1,
        warmupFrames: 5, measuredFrames: 60,
      })
      expect(plan.scene.render?.shadows).toEqual({ quality: enabled ? 'medium' : 'off', maxDistance: 40 })
      expect(plan.steps).toBe(60)
      expect(plan.warmupFrames).toBe(5)
      expect(plan.scene).toEqual(planFor(name).scene)
    }
  })
})
