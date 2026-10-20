// @vitest-environment happy-dom
import { act } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

vi.mock(
  'three/webgpu',
  async (importOriginal) => (await import('../../../engine/src/test-renderer.js')).withFakeRenderer(await importOriginal()),
)

import { PointLight, type SceneJson } from '@waica/engine'
import { lastFakeRenderer } from '../../../engine/src/test-renderer'
import { defined } from '../../../engine/src/test-support'
import { entityPropHandlers, overrideHandlers } from './inspector-entity-handlers'
import { prefabPropHandlers } from './inspector-prefab-handlers'
import { current, openPrefabPreview, openShadowEditor, resetShadowEditor, SCENE } from './test-shadow-editor'
import { removeViewportHost } from './test-viewport'

beforeEach(resetShadowEditor)
afterEach(removeViewportHost)

function limitDevice(): void {
  lastFakeRenderer().maxTextureSize = 2048
  lastFakeRenderer().backend.device.limits.maxTextureDimension2D = 2048
}

it.each([
  ['scene Off', { ...SCENE, render: { space: '3d' as const, shadows: { quality: 'off' as const } } }, {}],
  ['cast disabled', SCENE, { castShadows: false }],
  ['all instances opt out', { ...SCENE, entities: [{ name: 'Lamp', prefab: 'objects/lamp', overrides: { PointLight: { castShadows: false } } }] }, {}],
  ['no instances', { ...SCENE, entities: [{ name: 'Lamp', components: [{ type: 'PointLight' }] }] }, {}],
  ['2D scene', { ...SCENE, render: { space: '2d' as const } }, {}],
] satisfies Array<[string, SceneJson, Record<string, unknown>]>)('does not reject inactive prefab requests: %s', async (_reason, scene, props) => {
  await openShadowEditor(scene, { shadowMapSize: 1024, ...props })
  await openPrefabPreview()
  limitDevice()
  const state = defined(current)

  act(() => prefabPropHandlers(state.core, state.viewport).onPrefabProp('objects/lamp', 'PointLight', 'shadowMapSize', 4096))

  expect(current?.core.library.prefabLib[0]['objects/lamp']?.components[0]?.props?.shadowMapSize).toBe(4096)
  expect(current?.viewport()?.game()?.find('lamp')?.get(PointLight)?.shadowMapSize).toBe(4096)
})

it.each([
  { castShadows: false, shadowMapSize: 4096 },
  { shadowMapSize: 4096, castShadows: false },
])('validates final prefab props independent of authored key order: %j', async (props) => {
  await openShadowEditor(SCENE, props)
  await openPrefabPreview()
  limitDevice()
  const state = defined(current)

  expect(() => act(() => prefabPropHandlers(state.core, state.viewport).onPrefabProp('objects/lamp', 'PointLight', 'castShadows', 'false'))).toThrow(/4096.*2048/)

  expect(current?.core.library.prefabLib[0]['objects/lamp']?.components[0]?.props?.castShadows).toBe(false)
  expect(current?.core.history.step('undo')).toBeNull()
})

it('uses the authored Sun camera coverage, not the orthographic prefab preview camera', async () => {
  await openShadowEditor({ ...SCENE, camera: { kind: 'perspective', near: 10, far: 30 } }, { shadowMapSize: 1024, shadowMaxDistance: 5 }, { prefabType: 'Sun' })
  await openPrefabPreview()
  limitDevice()
  let state = defined(current)

  act(() => prefabPropHandlers(state.core, state.viewport).onPrefabProp('objects/lamp', 'Sun', 'shadowMapSize', 4096))
  expect(current?.core.library.prefabLib[0]['objects/lamp']?.components[0]?.props?.shadowMapSize).toBe(4096)
  state = defined(current)
  const prefabs = state.core.library.prefabLib[0]

  expect(() => act(() => prefabPropHandlers(state.core, state.viewport).onPrefabProp('objects/lamp', 'Sun', 'shadowMaxDistance', 20))).toThrow(/4096.*2048/)
  expect(current?.core.library.prefabLib[0]).toBe(prefabs)
})

it('uses the active Editor Camera coverage for a scene light multi-edit', async () => {
  await openShadowEditor(SCENE, { shadowMapSize: 1024, shadowMaxDistance: 5 }, { prefabType: 'Sun' })
  limitDevice()
  let state = defined(current)
  defined(state.viewport()?.game()).camera.near = 10

  act(() => entityPropHandlers(state.core, state.viewport).onMultiProp(['Lamp'], 'Sun', 'shadowMapSize', 4096))
  expect(current?.core.scenes.scene?.entities.find((entity) => entity.name === 'Lamp')?.overrides?.Sun?.shadowMapSize).toBe(4096)
  state = defined(current)
  const scene = state.core.scenes.scene

  expect(() => act(() => entityPropHandlers(state.core, state.viewport).onMultiProp(['Lamp'], 'Sun', 'shadowMaxDistance', 20))).toThrow(/4096.*2048/)
  expect(current?.core.scenes.scene).toBe(scene)
})

it('shares project-owned light defaults within one preflight but refreshes them on the next edit', async () => {
  let constructions = 0
  let defaultMapSize = 1024
  class ProjectLight extends PointLight {
    static override componentName = 'ProjectLight'
    constructor() {
      super()
      constructions++
      this.shadowMapSize = defaultMapSize
    }
  }
  const names = ['First', 'Second', 'Third']
  await openShadowEditor({ ...SCENE, entities: [
    ...SCENE.entities,
    ...names.map((name) => ({ name, components: [{ type: 'ProjectLight' }] })),
  ] }, undefined, { components: { ProjectLight } })
  limitDevice()
  let state = defined(current)
  const before = constructions

  act(() => entityPropHandlers(state.core, state.viewport).onMultiProp(names, 'ProjectLight', 'intensity', 2))
  expect(constructions - before).toBe(1)
  state = defined(current)
  const scene = state.core.scenes.scene
  defaultMapSize = 4096

  expect(() => act(() => entityPropHandlers(state.core, state.viewport).onMultiProp(names, 'ProjectLight', 'intensity', 3))).toThrow(/4096.*2048/)
  expect(constructions - before).toBe(2)
  expect(current?.core.scenes.scene).toBe(scene)
  expect(state.viewport()?.game()?.find('First')?.get(ProjectLight)?.intensity).toBe(2)
})

it.each(['reset', 'apply'] as const)('cancelling a valid bulk %s leaves the live Game, files, history and libraries unchanged', async (action) => {
  const { fs } = await openShadowEditor({ ...SCENE, entities: [{ name: 'Lamp', prefab: 'objects/lamp', overrides: { PointLight: { shadowMapSize: 256, castShadows: false } } }] })
  const state = defined(current)
  const game = defined(state.viewport()?.game())
  const scene = state.core.scenes.scene
  const prefabs = state.core.library.prefabLib[0]
  const savedScene = await fs.readText('src/scenes/main.scene.json')
  const savedPrefab = await fs.readText('src/objects/lamp.object.json')
  const confirm = vi.fn(() => false)
  vi.stubGlobal('confirm', confirm)

  act(() => {
    const handlers = overrideHandlers(state.core, state.viewport)
    if (action === 'reset') handlers.onResetAllProps('Lamp')
    else handlers.onApplyAllProps('Lamp')
  })

  expect(confirm).toHaveBeenCalledOnce()
  const unchanged = defined(current)
  expect(unchanged.viewport()?.game()).toBe(game)
  const light = defined(game.find('Lamp')?.get(PointLight))
  expect(light.shadowMapSize).toBe(256)
  expect(light.castShadows).toBe(false)
  expect(unchanged.core.scenes.scene).toBe(scene)
  expect(unchanged.core.library.prefabLib[0]).toBe(prefabs)
  expect(unchanged.core.history.step('undo')).toBeNull()
  expect(unchanged.core.persistence.saveState).toBe('saved')
  expect(await fs.readText('src/scenes/main.scene.json')).toBe(savedScene)
  expect(await fs.readText('src/objects/lamp.object.json')).toBe(savedPrefab)
})
