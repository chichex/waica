// @vitest-environment happy-dom
import { act } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

vi.mock(
  new URL('../../../../packages/engine/node_modules/three/build/three.webgpu.js', import.meta.url).pathname,
  async (importOriginal) => (await import('../../../engine/src/test-renderer.js')).withFakeRenderer(await importOriginal()),
)

import { PointLight } from '@waica/engine'
import { lastFakeRenderer } from '../../../engine/src/test-renderer'
import { defined } from '../../../engine/src/test-support'
import { entityComponentHandlers, entityPropHandlers, overrideHandlers } from './inspector-entity-handlers'
import { prefabPropHandlers } from './inspector-prefab-handlers'
import { stepHistory } from './history-commands'
import { removeViewportHost } from './test-viewport'
import { current, liveLamp, openShadowEditor, readShadowScene, resetShadowEditor, SCENE } from './test-shadow-editor'

beforeEach(resetShadowEditor)
afterEach(removeViewportHost)

it('rejects a direct prefab edit against opened 3D instances while the viewport is a 2D preview', async () => {
  const { fs } = await openShadowEditor()
  act(() => defined(current).core.view.openView({ kind: 'prefab', ref: 'objects/lamp' }))
  await vi.waitFor(() => expect(current?.viewport()?.game()?.space).toBe('2d'))
  const state = defined(current)
  const game = defined(state.viewport()?.game())
  await act(async () => { await game.ready() })
  const renderer = lastFakeRenderer()
  renderer.maxTextureSize = 2048
  renderer.backend.device.limits.maxTextureDimension2D = 2048
  const scene = state.core.scenes.scene
  const prefabs = state.core.library.prefabLib[0]
  const saved = await fs.readText('src/objects/lamp.object.json')

  expect(() => {
    act(() => prefabPropHandlers(state.core, state.viewport).onPrefabProp('objects/lamp', 'PointLight', 'shadowMapSize', 4096))
  }).toThrow(/4096.*2048/)
  expect(current?.viewport()?.game()).toBe(game)
  expect(game.find('lamp')?.get(PointLight)?.shadowMapSize).toBe(1024)
  expect(current?.core.scenes.scene).toBe(scene)
  expect(current?.core.library.prefabLib[0]).toBe(prefabs)
  expect(current?.core.history.step('undo')).toBeNull()
  expect(current?.core.persistence.saveState).toBe('saved')
  expect(await fs.readText('src/objects/lamp.object.json')).toBe(saved)
})

it('patches the live Game before persisting a scene shadow edit, without replacing it (CA-13)', async () => {
  const { fs } = await openShadowEditor()
  const state = defined(current)
  const game = defined(state.viewport()?.game())

  act(() => { entityComponentHandlers(state.core, state.viewport).onRenderProp('shadows', { quality: 'low', maxDistance: 12 }) })

  expect(game.shadows.policy).toEqual({ quality: 'low', maxDistance: 12 })
  expect(current?.viewport()?.game()).toBe(game)
  await vi.waitFor(async () => {
    const saved = await readShadowScene(fs)
    expect(saved.render?.shadows).toEqual({ quality: 'low', maxDistance: 12 })
  })
})

it('undoes and redoes a shadow policy through saved JSON and the restored real viewport Game (CA-13)', async () => {
  const { fs } = await openShadowEditor()
  const state = defined(current)
  act(() => { entityComponentHandlers(state.core, state.viewport).onRenderProp('shadows', { quality: 'low', maxDistance: 12 }) })

  await act(async () => { await stepHistory(defined(current).core, 'undo') })
  await vi.waitFor(() => expect(current?.viewport()?.game()?.shadows.policy).toEqual({ quality: 'medium', maxDistance: 40 }))
  await vi.waitFor(async () => expect((await readShadowScene(fs)).render).not.toHaveProperty('shadows'))

  await act(async () => { await stepHistory(defined(current).core, 'redo') })
  await vi.waitFor(() => expect(current?.viewport()?.game()?.shadows.policy).toEqual({ quality: 'low', maxDistance: 12 }))
  await vi.waitFor(async () => expect((await readShadowScene(fs)).render?.shadows).toEqual({ quality: 'low', maxDistance: 12 }))
})

it('keeps scene inheritance distinct from prefab reset through live updates, undo and redo (CA-13)', async () => {
  const { fs } = await openShadowEditor()
  act(() => { const state = defined(current); entityPropHandlers(state.core, state.viewport).onProp('Lamp', 'PointLight', 'shadowMapSize', 256) })
  expect(liveLamp().shadowMapSize).toBe(256)
  act(() => { const state = defined(current); entityPropHandlers(state.core, state.viewport).onProp('Lamp', 'PointLight', 'shadowMapSize', null) })
  expect(liveLamp().shadowMapSize).toBeNull()
  expect(current?.viewport()?.game()?.shadows.resolve(liveLamp()).mapSize).toBe(512)

  act(() => { const state = defined(current); overrideHandlers(state.core, state.viewport).onResetProp('Lamp', 'PointLight', 'shadowMapSize') })
  await vi.waitFor(() => expect(liveLamp().shadowMapSize).toBe(1024))
  expect(current?.core.scenes.scene?.entities.find((entity) => entity.name === 'Lamp')).not.toHaveProperty('overrides')

  await act(async () => { await stepHistory(defined(current).core, 'undo') })
  await vi.waitFor(() => expect(liveLamp().shadowMapSize).toBeNull())
  await vi.waitFor(async () => expect((await readShadowScene(fs)).entities.find((entity) => entity.name === 'Lamp')?.overrides).toEqual({ PointLight: { shadowMapSize: null } }))
  await act(async () => { await stepHistory(defined(current).core, 'redo') })
  await vi.waitFor(() => expect(liveLamp().shadowMapSize).toBe(1024))
})

it('does not persist a scene profile rejected by the live device capacity (CA-13)', async () => {
  const { fs } = await openShadowEditor()
  const renderer = lastFakeRenderer()
  renderer.maxTextureSize = 2048
  renderer.backend.device.limits.maxTextureDimension2D = 2048
  const state = defined(current)
  const game = defined(state.viewport()?.game())
  game.lighting.ambient = { intensity: 0.2 }

  expect(() => entityComponentHandlers(state.core, state.viewport).onRenderProp('shadows', { quality: 'high' })).toThrow(/4096.*2048/)
  expect(current?.viewport()?.game()?.shadows.quality).toBe('medium')
  expect(game.lighting.ambient.intensity).toBe(0.2)
  expect(current?.core.scenes.scene?.render).not.toHaveProperty('shadows')
  expect((await readShadowScene(fs)).render).not.toHaveProperty('shadows')
})

it('rejects an unsupported prefab reset before discarding the last valid viewport Game (CA-13)', async () => {
  await openShadowEditor()
  act(() => { const state = defined(current); entityPropHandlers(state.core, state.viewport).onProp('Lamp', 'PointLight', 'shadowMapSize', 256) })
  const renderer = lastFakeRenderer()
  renderer.maxTextureSize = 2048
  renderer.backend.device.limits.maxTextureDimension2D = 2048
  const game = defined(current?.viewport()?.game())
  act(() => {
    const core = defined(current).core
    const prefab = defined(core.library.prefabLib[0]['objects/lamp'])
    core.commitPrefab('objects/lamp', { ...prefab, components: [{ type: 'PointLight', props: { shadowMapSize: 4096 } }] })
  })

  expect(() => {
    act(() => { const state = defined(current); overrideHandlers(state.core, state.viewport).onResetProp('Lamp', 'PointLight', 'shadowMapSize') })
  }).toThrow(/4096.*2048/)
  expect(current?.viewport()?.game()).toBe(game)
  expect(liveLamp().shadowMapSize).toBe(256)
  expect(current?.core.scenes.scene?.entities.find((entity) => entity.name === 'Lamp')?.overrides).toEqual({ PointLight: { shadowMapSize: 256 } })
})

it('preflights every light before applying a multi-selection shadow flag (CA-13)', async () => {
  await openShadowEditor({ ...SCENE, entities: [
    { name: 'Lamp', prefab: 'objects/lamp', overrides: { PointLight: { castShadows: false, shadowMapSize: 256 } } },
    { name: 'Second', prefab: 'objects/lamp', overrides: { PointLight: { castShadows: false, shadowMapSize: 4096 } } },
  ] })
  const renderer = lastFakeRenderer()
  renderer.maxTextureSize = 2048
  renderer.backend.device.limits.maxTextureDimension2D = 2048
  const state = defined(current)

  expect(() => entityPropHandlers(state.core, state.viewport).onMultiProp(['Lamp', 'Second'], 'PointLight', 'castShadows', true)).toThrow(/4096.*2048/)
  expect(liveLamp().castShadows).toBe(false)
  expect(defined(current?.viewport()?.game()?.find('Second')?.get(PointLight)).castShadows).toBe(false)
  expect(current?.core.scenes.scene?.entities.map((entity) => entity.overrides?.PointLight?.castShadows)).toEqual([false, false])
})

it('does not consult GPU shadow capacity for a non-light multi-edit', async () => {
  await openShadowEditor({ ...SCENE, entities: [...SCENE.entities, { name: 'Box', components: [{ type: 'Model', props: { shape: 'box' } }] }] })
  const readLimit = vi.fn(() => 2048)
  Object.defineProperty(lastFakeRenderer().backend.device.limits, 'maxTextureDimension2D', { get: readLimit })
  const state = defined(current)

  act(() => entityPropHandlers(state.core, state.viewport).onMultiProp(['Box'], 'Model', 'color', 0xff0000))

  expect(readLimit).not.toHaveBeenCalled()
  expect(current?.core.scenes.scene?.entities.find((entity) => entity.name === 'Box')?.components?.[0]?.props?.color).toBe(0xff0000)
})

it.each(['multi', 'reset', 'apply', 'reset all', 'apply all'] as const)('limits a light %s to the affected entities or prefab instances', async (action) => {
  await openShadowEditor({ ...SCENE, entities: [
    { name: 'Lamp', prefab: 'objects/lamp', overrides: { PointLight: { shadowMapSize: 256 } } },
    { name: 'Unrelated', components: [{ type: 'PointLight', props: { shadowMapSize: 4096 } }] },
  ] })
  const renderer = lastFakeRenderer()
  renderer.maxTextureSize = 2048
  renderer.backend.device.limits.maxTextureDimension2D = 2048
  const state = defined(current)
  const handlers = overrideHandlers(state.core, state.viewport)

  expect(() => act(() => {
    if (action === 'multi') entityPropHandlers(state.core, state.viewport).onMultiProp(['Lamp'], 'PointLight', 'shadowMapSize', 512)
    else if (action === 'reset') handlers.onResetProp('Lamp', 'PointLight', 'shadowMapSize')
    else if (action === 'apply') handlers.onApplyProp('Lamp', 'PointLight', 'shadowMapSize')
    else if (action === 'reset all') handlers.onResetAllProps('Lamp')
    else handlers.onApplyAllProps('Lamp')
  })).not.toThrow()
  expect(current?.core.history.step('undo')).not.toBeNull()
})

it('rejects applying a shadow override to a prefab when another instance cannot render it (CA-13)', async () => {
  await openShadowEditor({ ...SCENE, entities: [
    { name: 'Lamp', prefab: 'objects/lamp', overrides: { PointLight: { castShadows: false, shadowMapSize: 4096 } } },
    { name: 'Second', prefab: 'objects/lamp' },
  ] })
  const renderer = lastFakeRenderer()
  renderer.maxTextureSize = 2048
  renderer.backend.device.limits.maxTextureDimension2D = 2048
  const state = defined(current)

  expect(() => {
    act(() => overrideHandlers(state.core, state.viewport).onApplyProp('Lamp', 'PointLight', 'shadowMapSize'))
  }).toThrow(/4096.*2048/)
  expect(current?.core.library.prefabLib[0]['objects/lamp']?.components[0]?.props?.shadowMapSize).toBe(1024)
  expect(liveLamp().shadowMapSize).toBe(4096)
  expect(defined(current?.viewport()?.game()?.find('Second')?.get(PointLight)).shadowMapSize).toBe(1024)
})

it.each(['reset', 'apply'] as const)('preflights a bulk %s before recording any scene or prefab change (CA-13)', async (action) => {
  const entities = action === 'reset'
    ? [{ name: 'Lamp', prefab: 'objects/lamp', overrides: { PointLight: { castShadows: false, shadowMapSize: 256 } } }]
    : [
        { name: 'Lamp', prefab: 'objects/lamp', overrides: { PointLight: { shadowMapSize: 4096 } } },
        { name: 'Second', prefab: 'objects/lamp', overrides: { PointLight: { castShadows: true } } },
      ]
  const prefab = action === 'reset' ? { castShadows: true, shadowMapSize: 4096 } : { castShadows: false, shadowMapSize: 1024 }
  await openShadowEditor({ ...SCENE, entities }, prefab)
  const renderer = lastFakeRenderer()
  renderer.maxTextureSize = 2048
  renderer.backend.device.limits.maxTextureDimension2D = 2048
  const state = defined(current)
  const scene = state.core.scenes.scene
  const prefabs = state.core.library.prefabLib[0]

  const confirm = vi.fn(() => true)
  vi.stubGlobal('confirm', confirm)
  expect(() => {
    act(() => {
      const handlers = overrideHandlers(state.core, state.viewport)
      if (action === 'reset') handlers.onResetAllProps('Lamp')
      else handlers.onApplyAllProps('Lamp')
    })
  }).toThrow(/4096.*2048/)
  expect(confirm).not.toHaveBeenCalled()
  expect(current?.core.scenes.scene).toBe(scene)
  expect(current?.core.library.prefabLib[0]).toBe(prefabs)
})
