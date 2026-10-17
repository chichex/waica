import { expect, it } from 'vitest'
import { shadowResourceFixture } from './shadow-resource-probe.ts'

it('uses a deterministic private resource fixture with Sun, all four PointLights and an animated rig', () => {
  const fixture = shadowResourceFixture()
  expect(fixture).toEqual(shadowResourceFixture())
  expect(fixture.render).toEqual({ space: '3d', shadows: { quality: 'low', maxDistance: 40 } })
  const components = fixture.entities?.flatMap((entity) => entity.components ?? []) ?? []
  expect(components.filter((component) => component.type === 'Sun')).toHaveLength(1)
  expect(components.filter((component) => component.type === 'PointLight')).toHaveLength(4)
  expect(components.filter((component) => component.type === 'Model')).toHaveLength(6)
  expect(components.find((component) => component.type === 'Animator')?.props).toEqual({ initialClip: 'walk' })
  expect(components.filter((component) => ['Sun', 'PointLight'].includes(component.type))
    .every((component) => component.props?.castShadows === true)).toBe(true)
})
