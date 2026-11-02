// @vitest-environment happy-dom
import { act } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

vi.mock(
  new URL('../../../../packages/engine/node_modules/three/build/three.webgpu.js', import.meta.url).pathname,
  async (importOriginal) => (await import('../../../engine/src/test-renderer.js')).withFakeRenderer(await importOriginal()),
)

import { SpotLight } from '@waica/engine'
import { lastFakeRenderer } from '../../../engine/src/test-renderer'
import { defined } from '../../../engine/src/test-support'
import { entityPropHandlers, overrideHandlers } from './inspector-entity-handlers'
import { prefabPropHandlers } from './inspector-prefab-handlers'
import { stepHistory } from './history-commands'
import { removeViewportHost } from './test-viewport'
import { current, liveSpot, openPrefabPreview, openShadowEditor, readShadowScene, resetShadowEditor, SCENE } from './test-shadow-editor'

beforeEach(resetShadowEditor)
afterEach(removeViewportHost)

const SPOT = { type: 'SpotLight' as const }
const spotScene = (overrides: Record<string, unknown>) => ({ ...SCENE, entities: [{ name: 'Lamp', prefab: 'objects/lamp', overrides: { SpotLight: overrides } }] })

function limitDevice(): void {
  lastFakeRenderer().maxTextureSize = 2048
  lastFakeRenderer().backend.device.limits.maxTextureDimension2D = 2048
}

it('keeps scene inheritance (1024) distinct from the prefab reset (512) through live updates, undo and redo (CA-11)', async () => {
  const { fs } = await openShadowEditor(spotScene({ shadowMapSize: 256 }), { shadowMapSize: 512, distance: 9 }, { prefabType: SPOT.type })
  expect(liveSpot().shadowMapSize).toBe(256)

  act(() => { const state = defined(current); entityPropHandlers(state.core, state.viewport).onProp('Lamp', 'SpotLight', 'shadowMapSize', null) })
  expect(liveSpot().shadowMapSize).toBeNull()
  expect(defined(current?.viewport()?.game()).shadows.resolve(liveSpot()).mapSize).toBe(1024)

  act(() => { const state = defined(current); overrideHandlers(state.core, state.viewport).onResetProp('Lamp', 'SpotLight', 'shadowMapSize') })
  await vi.waitFor(() => expect(liveSpot().shadowMapSize).toBe(512))
  expect(current?.core.scenes.scene?.entities.find((entity) => entity.name === 'Lamp')).not.toHaveProperty('overrides')

  await act(async () => { await stepHistory(defined(current).core, 'undo') })
  await vi.waitFor(() => expect(liveSpot().shadowMapSize).toBeNull())
  await vi.waitFor(async () => expect((await readShadowScene(fs)).entities.find((entity) => entity.name === 'Lamp')?.overrides).toEqual({ SpotLight: { shadowMapSize: null } }))
  await act(async () => { await stepHistory(defined(current).core, 'redo') })
  await vi.waitFor(() => expect(liveSpot().shadowMapSize).toBe(512))
})

it('rejects a direct spot prefab edit against opened 3D instances while the viewport is a 2D preview (CA-11)', async () => {
  const { fs } = await openShadowEditor(SCENE, { shadowMapSize: 512, distance: 9 }, { prefabType: SPOT.type })
  await openPrefabPreview()
  limitDevice()
  const state = defined(current)
  const scene = state.core.scenes.scene
  const prefabs = state.core.library.prefabLib[0]
  const saved = await fs.readText('src/objects/lamp.object.json')

  expect(() => {
    act(() => prefabPropHandlers(state.core, state.viewport).onPrefabProp('objects/lamp', 'SpotLight', 'shadowMapSize', 4096))
  }).toThrow(/4096.*2048/)

  expect(current?.core.scenes.scene).toBe(scene)
  expect(current?.core.library.prefabLib[0]).toBe(prefabs)
  expect(current?.core.history.step('undo')).toBeNull()
  expect(await fs.readText('src/objects/lamp.object.json')).toBe(saved)
})

it('preflights every spot before applying a multi-selection shadow flag (CA-11)', async () => {
  await openShadowEditor({ ...SCENE, entities: [
    { name: 'Lamp', prefab: 'objects/lamp', overrides: { SpotLight: { castShadows: false, shadowMapSize: 256 } } },
    { name: 'Second', prefab: 'objects/lamp', overrides: { SpotLight: { castShadows: false, shadowMapSize: 4096 } } },
  ] }, undefined, { prefabType: SPOT.type })
  limitDevice()
  const state = defined(current)

  expect(() => entityPropHandlers(state.core, state.viewport).onMultiProp(['Lamp', 'Second'], 'SpotLight', 'castShadows', true)).toThrow(/4096.*2048/)

  expect(liveSpot().castShadows).toBe(false)
  expect(defined(current?.viewport()?.game()?.find('Second')?.get(SpotLight)).castShadows).toBe(false)
  expect(current?.core.scenes.scene?.entities.map((entity) => entity.overrides?.SpotLight?.castShadows)).toEqual([false, false])
})

it('preflights a project-owned SpotLight subclass as a spot before changing any of its lights (CA-11)', async () => {
  class ProjectSpot extends SpotLight {
    static override componentName = 'ProjectSpot'
  }
  const custom = (name: string, shadowMapSize: number) => ({ name, components: [{ type: 'ProjectSpot', props: { castShadows: false, shadowMapSize } }] })
  await openShadowEditor({ ...SCENE, entities: [{ name: 'Lamp', prefab: 'objects/lamp' }, custom('First', 256), custom('Second', 4096)] },
    undefined, { prefabType: SPOT.type, components: { ProjectSpot } })
  limitDevice()
  const state = defined(current)
  const scene = state.core.scenes.scene

  expect(() => entityPropHandlers(state.core, state.viewport).onMultiProp(['First', 'Second'], 'ProjectSpot', 'castShadows', true)).toThrow(/4096.*2048/)

  expect(defined(current?.viewport()?.game()?.find('First')?.get(ProjectSpot)).castShadows).toBe(false)
  expect(current?.core.scenes.scene).toBe(scene)
})

it('limits a spot reset to the affected prefab instances, ignoring an unrelated oversized spot (CA-11)', async () => {
  await openShadowEditor({ ...SCENE, entities: [
    { name: 'Lamp', prefab: 'objects/lamp', overrides: { SpotLight: { shadowMapSize: 256 } } },
    { name: 'Unrelated', components: [{ type: 'SpotLight', props: { shadowMapSize: 4096 } }] },
  ] }, undefined, { prefabType: SPOT.type })
  limitDevice()
  const state = defined(current)

  expect(() => act(() => overrideHandlers(state.core, state.viewport).onResetProp('Lamp', 'SpotLight', 'shadowMapSize'))).not.toThrow()
  expect(current?.core.history.step('undo')).not.toBeNull()
})

it('preflights a spot with the spot profile column, not the Sun one (CA-11)', async () => {
  await openShadowEditor({ ...SCENE, render: { space: '3d', shadows: { quality: 'high' } }, entities: [{ name: 'Lamp', prefab: 'objects/lamp' }] }, { distance: 9 }, { prefabType: SPOT.type })
  limitDevice()
  const state = defined(current)

  expect(() => act(() => entityPropHandlers(state.core, state.viewport).onMultiProp(['Lamp'], 'SpotLight', 'intensity', 2))).not.toThrow()

  expect(liveSpot().intensity).toBe(2)
})
