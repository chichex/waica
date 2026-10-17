// @vitest-environment happy-dom
import { act, render } from '@testing-library/react'
import { useLayoutEffect, useRef } from 'react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

vi.mock(
  new URL('../../../../packages/engine/node_modules/three/build/three.webgpu.js', import.meta.url).pathname,
  async (importOriginal) => (await import('../../../engine/src/test-renderer.js')).withFakeRenderer(await importOriginal()),
)

import { PointLight, type SceneJson } from '@waica/engine'
import { lastFakeRenderer } from '../../../engine/src/test-renderer'
import { defined } from '../../../engine/src/test-support'
import { MemFS } from '../fs/project-fs'
import { createCommits, type EditorCore } from './editor-commits'
import { useEditorState } from './editor-state'
import { entityComponentHandlers, entityPropHandlers, overrideHandlers } from './inspector-entity-handlers'
import { stepHistory } from './history-commands'
import { installViewportHost, removeViewportHost } from './test-viewport'
import type { ViewportAccess } from './use-viewport-handle'
import { Viewport, type ViewportHandle } from './Viewport'
import { saveWorkspace } from './workspace'

const MAIN = 'src/scenes/main.scene.json'
const SCENE: SceneJson = {
  waicaScene: 3,
  render: { space: '3d' },
  camera: { kind: 'perspective', position: [0, 5, 10], target: [0, 0, 0] },
  entities: [
    { name: 'Sun', components: [{ type: 'Sun' }] },
    { name: 'Lamp', prefab: 'objects/lamp' },
  ],
}
let current: { core: EditorCore; viewport: ViewportAccess } | null = null

/** Real commits/history/files and the real viewport; only the GPU boundary is fake. */
function Harness({ fs }: { fs: MemFS }) {
  const state = useEditorState(fs)
  const core: EditorCore = { ...state, ...createCommits(state) }
  const ref = useRef<ViewportHandle>(null)
  useLayoutEffect(() => { current = { core, viewport: () => ref.current } })
  const scene = core.scenes.scene
  if (!scene) return null
  return <Viewport ref={ref} scene={scene} scenePath={MAIN} registry={{ ...core.code.editorArchetype.registry, prefabs: core.library.prefabLib[0] }} epoch={core.stage.epoch[0]} mode="edit" selected={null} onSelect={core.selection.setSelected} onMoved={() => {}} />
}

beforeEach(() => {
  installViewportHost()
  current = null
  const storage = new Map<string, string>()
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => { storage.set(key, value) },
    removeItem: (key: string) => { storage.delete(key) },
  })
  vi.stubGlobal('confirm', () => true)
})
afterEach(removeViewportHost)

async function openShadowEditor(scene: SceneJson = SCENE, prefabProps: Record<string, unknown> = { shadowMapSize: 1024, distance: 9 }) {
  const fs = new MemFS('shadow-live', {
    'src/game.json': JSON.stringify({ waicaGame: 1, archetype: 'platformer' }),
    [MAIN]: JSON.stringify(scene),
    'src/objects/lamp.object.json': JSON.stringify({ waicaPrefab: 1, type: 'object', components: [{ type: 'PointLight', props: prefabProps }] }),
  })
  saveWorkspace(fs.name, MAIN, { kind: 'scene', path: MAIN })
  const view = render(<Harness fs={fs} />, { reactStrictMode: true })
  await vi.waitFor(() => expect(current?.viewport()?.game()?.space).toBe('3d'))
  await vi.waitFor(() => expect(current?.viewport()?.game()?.find('Lamp')?.get(PointLight)).toBeDefined())
  await act(async () => { await defined(current?.viewport()?.game()).ready() })
  return { fs, ...view }
}

async function readShadowScene(fs: MemFS): Promise<SceneJson> {
  return JSON.parse(defined(await fs.readText(MAIN))) as SceneJson
}

const liveLamp = (): PointLight => defined(defined(current?.viewport()?.game()?.find('Lamp')).get(PointLight))

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

  act(() => { overrideHandlers(defined(current).core).onResetProp('Lamp', 'PointLight', 'shadowMapSize') })
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

  expect(() => entityComponentHandlers(state.core, state.viewport).onRenderProp('shadows', { quality: 'high' })).toThrow(/4096.*2048/)
  expect(current?.viewport()?.game()?.shadows.quality).toBe('medium')
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

  expect(() => {
    act(() => {
      const handlers = overrideHandlers(state.core, state.viewport)
      if (action === 'reset') handlers.onResetAllProps('Lamp')
      else handlers.onApplyAllProps('Lamp')
    })
  }).toThrow(/4096.*2048/)
  expect(current?.core.scenes.scene).toBe(scene)
  expect(current?.core.library.prefabLib[0]).toBe(prefabs)
})
