// @vitest-environment happy-dom
import { cleanup, fireEvent, screen } from '@testing-library/react'
import { afterEach, expect, it } from 'vitest'
import { renderInspector } from '../inspector-test-support'

afterEach(cleanup)

it('keeps advanced light overrides out of multiselection even when both values are explicit', () => {
  const props = renderInspector({
    kind: 'multi', sceneName: 'main', entities: [
      { name: 'First', components: [{ type: 'Sun', props: { shadowMapSize: 512 } }] },
      { name: 'Second', components: [{ type: 'Sun', props: { shadowMapSize: 1024 } }] },
    ],
  })

  expect(screen.queryByRole('slider', { name: /Shadow map size/ })).toBeNull()
  expect(screen.queryByRole('button', { name: 'Advanced shadows' })).toBeNull()
  fireEvent.click(screen.getByRole('checkbox', { name: 'Cast shadows' }))
  expect(props.onMultiProp).toHaveBeenCalledWith(['First', 'Second'], 'Sun', 'castShadows', false)
})

it('shows a rejected multi-light flag change without leaving the controlled checkbox enabled', () => {
  const props = renderInspector({
    kind: 'multi', sceneName: 'main', entities: [
      { name: 'First', components: [{ type: 'PointLight', props: { castShadows: false } }] },
      { name: 'Second', components: [{ type: 'PointLight', props: { castShadows: false } }] },
    ],
  })
  props.onMultiProp.mockImplementation(() => { throw new RangeError('Shadow map 4096 exceeds capacity 2048') })

  fireEvent.click(screen.getByRole('checkbox', { name: 'Cast shadows' }))

  expect(screen.getByRole('alert').textContent).toContain('4096 exceeds capacity 2048')
  expect(screen.getByRole('checkbox', { name: 'Cast shadows' })).toHaveProperty('checked', false)
})

it('reports a rejected bulk instance reset without an uncaught UI event error', () => {
  const props = renderInspector({
    kind: 'entity', sceneName: 'main', space: '3d',
    entity: { name: 'Lamp', prefab: 'objects/lamp', overrides: { PointLight: { shadowMapSize: 256 } } },
  }, {
    prefabs: { 'objects/lamp': { waicaPrefab: 1, type: 'object', components: [{ type: 'PointLight' }] } },
  })
  props.onResetAllProps.mockImplementation(() => { throw new RangeError('Shadow map 4096 exceeds capacity 2048') })

  fireEvent.click(screen.getByRole('button', { name: '↺ Reset all' }))

  expect(screen.getByRole('alert').textContent).toContain('4096 exceeds capacity 2048')
})
