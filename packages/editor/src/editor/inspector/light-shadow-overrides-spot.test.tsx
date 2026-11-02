// @vitest-environment happy-dom
import { cleanup, fireEvent, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, it } from 'vitest'
import type { PrefabJson, SceneEntityJson, SceneJson } from '@waica/engine'
import { defined } from '../../../../engine/src/test-support'
import { MemFS } from '../../fs/project-fs'
import { clearComponentOverride, setComponentProp } from '../../scene/ops'
import { GlbClipCache } from '../glb-clips'
import { renderInspector, renderInspectorWithClips } from '../inspector-test-support'

afterEach(cleanup)

const spot = (props?: Record<string, unknown>): SceneEntityJson => ({
  name: 'Spot', components: [{ type: 'SpotLight', props }],
})

const shadowRow = (label: string): HTMLElement => screen.getByRole('group', { name: label })

async function openAdvanced(): Promise<void> {
  await userEvent.setup().click(screen.getByRole('button', { name: 'Advanced shadows', expanded: false }))
}

it.each([['low', 512], ['medium', 1024], ['high', 2048]] as const)('shows the %s spot profile (%i) as the inherited shadow map size without writing it (CA-11)', async (quality, size) => {
  const props = renderInspector({ kind: 'entity', entity: spot(), sceneName: 'main', space: '3d' }, {
    sceneRender: { space: '3d', shadows: { quality } },
  })
  expect(screen.queryByRole('group', { name: 'Shadow map size' })).toBeNull()

  await openAdvanced()

  const map = shadowRow('Shadow map size')
  expect(map.textContent).toContain('Inherited from scene')
  expect(map.textContent).toContain(`Effective: ${size}`)
  expect(within(map).getByRole('checkbox', { name: 'Override Shadow map size' })).toHaveProperty('checked', false)
  expect(screen.getByRole('status').textContent).toContain(`${quality} · Active`)
  expect(props.onProp).not.toHaveBeenCalled()
  expect(props.onResetProp).not.toHaveBeenCalled()
})

it('shows the SpotLight distance as the effective shadow range, with and without a stored shadow distance (CA-11)', async () => {
  renderInspector({ kind: 'entity', sceneName: 'main', space: '3d', entity: spot({ distance: 9, shadowMaxDistance: 20 }) }, {
    sceneRender: { space: '3d', shadows: { maxDistance: 40 } },
  })
  await openAdvanced()
  expect(shadowRow('Shadow max distance').textContent).toContain('Effective: 9')
  expect(shadowRow('Shadow max distance').textContent).toContain('Stored: 20')
})

it('inherits the scene spot map 1024 with explicit null, while reset removes the instance key and restores prefab 512 (CA-11)', async () => {
  const prefab: PrefabJson = { waicaPrefab: 1, type: 'object', components: [{ type: 'SpotLight', props: { shadowMapSize: 512 } }] }
  let scene: SceneJson = {
    waicaScene: 3, render: { space: '3d', shadows: { quality: 'medium' } },
    entities: [{ name: 'Spot', prefab: 'objects/spot', overrides: { SpotLight: { shadowMapSize: 256 } } }],
  }
  const selection = () => ({ kind: 'entity' as const, entity: defined(scene.entities[0]), sceneName: 'main', space: '3d' as const })
  const view = renderInspectorWithClips(selection(), new GlbClipCache(new MemFS('spot-shadows', {})), {
    prefabs: { 'objects/spot': prefab }, sceneRender: scene.render,
  })
  view.props.onProp.mockImplementation((...args) => {
    scene = setComponentProp(scene, ...args, view.props.prefabs)
    view.rerender(selection())
  })
  view.props.onResetProp.mockImplementation((entity, type, key) => {
    scene = clearComponentOverride(scene, entity, type, key)
    view.rerender(selection())
  })
  await openAdvanced()
  const row = () => shadowRow('Shadow map size')
  expect(within(row()).getByRole('combobox', { name: 'Shadow map size' })).toHaveProperty('value', '256')

  await userEvent.setup().click(within(row()).getByRole('button', { name: 'Inherit scene for Shadow map size' }))
  expect(scene.entities[0]?.overrides).toEqual({ SpotLight: { shadowMapSize: null } })
  expect(row().textContent).toContain('Inherited from scene')
  expect(row().textContent).toContain('Effective: 1024')

  await userEvent.setup().click(within(row()).getByTitle("Reset to the prefab's value"))
  expect(scene.entities[0]?.overrides).toBeUndefined()
  expect(row().textContent).toContain('Stored: 512')
  expect(row().textContent).toContain('Effective: 512')
})

it('edits only a chosen numeric spot override, preserving false and explicit zero (CA-11)', async () => {
  const props = renderInspector({ kind: 'entity', entity: spot({ castShadows: false, shadowBias: 0, shadowRadius: 0 }), sceneName: 'main', space: '3d' })
  expect(screen.getByRole('checkbox', { name: 'Cast shadows' })).toHaveProperty('checked', false)
  await openAdvanced()
  expect(within(shadowRow('Shadow bias')).getByRole('spinbutton', { name: 'Shadow bias' })).toHaveProperty('value', '0')
  expect(shadowRow('Shadow bias').textContent).toContain('Stored: 0')

  fireEvent.change(within(shadowRow('Shadow bias')).getByRole('spinbutton', { name: 'Shadow bias' }), { target: { value: '-0.001' } })
  expect(props.onProp).toHaveBeenLastCalledWith('Spot', 'SpotLight', 'shadowBias', -0.001)
  await userEvent.setup().click(within(shadowRow('Shadow radius')).getByRole('checkbox', { name: 'Override Shadow radius' }))
  expect(props.onProp).toHaveBeenLastCalledWith('Spot', 'SpotLight', 'shadowRadius', null)
})

it('catches a rejected spot activation without changing false to true (CA-11)', async () => {
  const props = renderInspector({ kind: 'entity', entity: spot({ castShadows: false }), sceneName: 'main', space: '3d' })
  props.onProp.mockImplementation(() => { throw new Error('Cannot activate shadow map on device') })

  await userEvent.setup().click(screen.getByRole('checkbox', { name: 'Cast shadows' }))

  const checkbox = screen.getByRole('checkbox', { name: 'Cast shadows' })
  expect(checkbox).toHaveProperty('checked', false)
  expect(checkbox.getAttribute('aria-invalid')).toBe('true')
  expect(screen.getByRole('alert').textContent).toContain('Cannot activate shadow map on device')
})

it('keeps an invalid stored spot flag visible and accepts only a real boolean repair (CA-11)', () => {
  const props = renderInspector({ kind: 'entity', entity: spot({ castShadows: 'false' }), sceneName: 'main', space: '3d' })
  const field = screen.getByRole('textbox', { name: 'Cast shadows' })
  expect(field).toHaveProperty('value', 'false')
  expect(screen.getByRole('alert').textContent).toContain('must be a boolean')

  fireEvent.change(field, { target: { value: 'invalid' } })
  expect(props.onProp).not.toHaveBeenCalled()
  fireEvent.change(field, { target: { value: 'true' } })

  expect(props.onProp).toHaveBeenLastCalledWith('Spot', 'SpotLight', 'castShadows', true)
})

it('keeps spot overrides out of multiselection and reports a rejected flag change there (CA-11)', () => {
  const entities = ['First', 'Second'].map((name) => ({ name, components: [{ type: 'SpotLight', props: { castShadows: false, shadowMapSize: 512 } }] }))
  const props = renderInspector({ kind: 'multi', entities, sceneName: 'main' })
  props.onMultiProp.mockImplementation(() => { throw new RangeError('Shadow map 4096 exceeds capacity 2048') })
  expect(screen.queryByRole('button', { name: 'Advanced shadows' })).toBeNull()
  expect(screen.queryByText('Shadow map size')).toBeNull()

  fireEvent.click(screen.getByRole('checkbox', { name: 'Cast shadows' }))

  expect(props.onMultiProp).toHaveBeenCalledWith(['First', 'Second'], 'SpotLight', 'castShadows', true)
  expect(screen.getByRole('alert').textContent).toContain('4096 exceeds capacity 2048')
  expect(screen.getByRole('checkbox', { name: 'Cast shadows' })).toHaveProperty('checked', false)
})

it('renders the spot cone props from its metadata next to the shadow rows (CA-11)', () => {
  const props = renderInspector({ kind: 'entity', entity: spot({ angle: 45 }), sceneName: 'main', space: '3d' })

  const angle = screen.getByRole('slider', { name: 'Angle (degrees) 45' })
  expect(angle).toHaveProperty('value', '45')
  expect(screen.getByRole('slider', { name: 'Penumbra 0.2' })).toHaveProperty('value', '0.2')
  expect(screen.getByRole('spinbutton', { name: 'Direction y' })).toHaveProperty('value', '-1')
  fireEvent.change(angle, { target: { value: '50' } })

  expect(props.onProp).toHaveBeenLastCalledWith('Spot', 'SpotLight', 'angle', 50)
})
