import { expect, it } from 'vitest'
import { resolveEntityComponents } from '@waica/engine'
import { ARCHETYPE } from './manifest'

// Issue #203 CA-16: public starts declare their shadow policy rather than relying on runtime defaults.
it.each([
  ['Node demo', ARCHETYPE.scene],
  ['Node blank', ARCHETYPE.blankScene],
])('publishes explicit Medium/40 shadows in the %s start', (_name, scene) => {
  expect(scene.render?.shadows).toEqual({ quality: 'medium', maxDistance: 40 })
})

it.each([
  { start: 'demo', scene: ARCHETYPE.scene, modelCount: 60, torches: ['Torch NW', 'Torch NE', 'Torch SW', 'Torch SE'] },
  { start: 'blank', scene: ARCHETYPE.blankScene, modelCount: 2, torches: [] },
])('keeps every Model, Sun and torch in the resolved $start shadow topology', ({ scene, modelCount, torches }) => {
  const components = scene.entities.flatMap((entity) =>
    resolveEntityComponents(entity, ARCHETYPE.prefabs).map((component) => ({ name: entity.name, ...component })),
  )
  const models = components.filter((component) => component.type === 'Model')
  expect(models).toHaveLength(modelCount)
  for (const model of models) expect(model.props, model.name).toMatchObject({ castShadows: true, receiveShadows: true })

  const suns = components.filter((component) => component.type === 'Sun')
  const points = components.filter((component) => component.type === 'PointLight')
  expect(suns.map((component) => component.name)).toEqual(['Sun'])
  expect(points.map((component) => component.name)).toEqual(torches)
  for (const light of [...suns, ...points]) expect(light.props, light.name).toHaveProperty('castShadows', true)
})

it.each(Object.entries(ARCHETYPE.prefabs))('publishes both explicit Model shadow flags in the %s prefab', (_ref, prefab) => {
  const models = prefab.components.filter((component) => component.type === 'Model')
  expect(models).toHaveLength(1)
  expect(models[0]?.props).toMatchObject({ castShadows: true, receiveShadows: true })
})

it('resolveEntityComponents applies instance shadow overrides without mutating shared manifest data', () => {
  const publicData = (): string => JSON.stringify([ARCHETYPE.scene, ARCHETYPE.blankScene, ARCHETYPE.prefabs])
  const before = publicData()
  const torchPrefabs: (string | undefined)[] = []
  for (const template of ARCHETYPE.palette) {
    const entity = template.make()
    entity.overrides = { Model: { castShadows: false, receiveShadows: false }, PointLight: { castShadows: false } }
    const overridden = resolveEntityComponents(entity, ARCHETYPE.prefabs)
    const overriddenModels = overridden.filter((component) => component.type === 'Model')
    expect(overriddenModels, template.label).toHaveLength(1)
    for (const model of overriddenModels) expect(model.props, template.label).toMatchObject({ castShadows: false, receiveShadows: false })
    const overriddenPoints = overridden.filter((component) => component.type === 'PointLight')
    expect(overriddenPoints, template.label).toHaveLength(entity.prefab === 'tiles/torch' ? 1 : 0)
    for (const light of overriddenPoints) expect(light.props, template.label).toHaveProperty('castShadows', false)
    if (overriddenPoints.length > 0) torchPrefabs.push(entity.prefab)

    const freshEntity = template.make()
    expect(freshEntity, template.label).not.toBe(entity)
    const fresh = resolveEntityComponents(freshEntity, ARCHETYPE.prefabs)
    const freshModels = fresh.filter((component) => component.type === 'Model')
    expect(freshModels, template.label).toHaveLength(1)
    for (const model of freshModels) expect(model.props, template.label).toMatchObject({ castShadows: true, receiveShadows: true })
    const freshPoints = fresh.filter((component) => component.type === 'PointLight')
    expect(freshPoints, template.label).toHaveLength(overriddenPoints.length)
    for (const light of freshPoints) expect(light.props, template.label).toHaveProperty('castShadows', true)
  }
  expect(torchPrefabs).toEqual(['tiles/torch'])
  expect(publicData()).toBe(before)
})
