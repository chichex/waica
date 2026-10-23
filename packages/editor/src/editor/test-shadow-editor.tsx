import { act, render } from '@testing-library/react'
import { useLayoutEffect, useMemo, useRef } from 'react'
import { expect, vi } from 'vitest'
import { PointLight, resolveSceneSpace, Sun, type SceneJson, type SceneRegistry } from '@waica/engine'
import { defined } from '../../../engine/src/test-support'
import { MemFS } from '../fs/project-fs'
import { createCommits, type EditorCore } from './editor-commits'
import { useEditorState } from './editor-state'
import { installViewportHost } from './test-viewport'
import type { ViewportAccess } from './use-viewport-handle'
import { Viewport, type ViewportHandle } from './Viewport'
import { saveWorkspace } from './workspace'

export const MAIN = 'src/scenes/main.scene.json'
export const SCENE: SceneJson = {
  waicaScene: 3,
  render: { space: '3d' },
  camera: { kind: 'perspective', position: [0, 5, 10], target: [0, 0, 0] },
  entities: [
    { name: 'Sun', components: [{ type: 'Sun' }] },
    { name: 'Lamp', prefab: 'objects/lamp' },
  ],
}
export let current: { core: EditorCore; viewport: ViewportAccess } | null = null

/** Real commits/history/files and the real viewport; only the GPU boundary is fake. */
function Harness({ fs, components }: { fs: MemFS; components: SceneRegistry['components'] }) {
  const state = useEditorState(fs)
  const core: EditorCore = { ...state, ...createCommits(state) }
  const ref = useRef<ViewportHandle>(null)
  useLayoutEffect(() => { current = { core, viewport: () => ref.current } })
  const preview = useMemo<SceneJson | null>(() => core.view.view?.kind === 'prefab'
    ? { waicaScene: 2, entities: [{ name: 'lamp', prefab: core.view.view.ref }] }
    : null, [core.view.view])
  const scene = preview ?? core.scenes.scene
  if (!scene) return null
  const base = core.code.editorArchetype.registry
  const registry = { ...base, components: { ...base.components, ...components }, prefabs: core.library.prefabLib[0] }
  return <Viewport key={preview ? 'prefab' : 'scene'} ref={ref} scene={scene} scenePath={preview ? undefined : MAIN} registry={registry} epoch={core.stage.epoch[0]} mode="edit" selected={null} onSelect={core.selection.setSelected} onMoved={() => {}} />
}

export function resetShadowEditor(): void {
  installViewportHost()
  current = null
  const storage = new Map<string, string>()
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => { storage.set(key, value) },
    removeItem: (key: string) => { storage.delete(key) },
  })
  vi.stubGlobal('confirm', () => true)
}

export async function openShadowEditor(scene: SceneJson = SCENE, prefabProps: Record<string, unknown> = { shadowMapSize: 1024, distance: 9 }, options: { components?: SceneRegistry['components']; prefabType?: 'PointLight' | 'Sun' } = {}) {
  const fs = new MemFS('shadow-live', {
    'src/game.json': JSON.stringify({ waicaGame: 1, archetype: 'platformer' }),
    [MAIN]: JSON.stringify(scene),
    'src/objects/lamp.object.json': JSON.stringify({ waicaPrefab: 1, type: 'object', components: [{ type: options.prefabType ?? 'PointLight', props: prefabProps }] }),
  })
  saveWorkspace(fs.name, MAIN, { kind: 'scene', path: MAIN })
  const view = render(<Harness fs={fs} components={options.components ?? {}} />, { reactStrictMode: true })
  await vi.waitFor(() => expect(current?.viewport()?.game()?.space).toBe(resolveSceneSpace(scene.render)))
  if (options.prefabType === 'Sun') await vi.waitFor(() => expect(current?.viewport()?.game()?.find('Lamp')?.get(Sun)).toBeDefined())
  else await vi.waitFor(() => expect(current?.viewport()?.game()?.find('Lamp')?.get(PointLight)).toBeDefined())
  await act(async () => { await defined(current?.viewport()?.game()).ready() })
  return { fs, ...view }
}

export async function openPrefabPreview(): Promise<void> {
  act(() => defined(current).core.view.openView({ kind: 'prefab', ref: 'objects/lamp' }))
  await vi.waitFor(() => expect(current?.viewport()?.game()?.space).toBe('2d'))
  await act(async () => { await defined(current?.viewport()?.game()).ready() })
}

export async function readShadowScene(fs: MemFS): Promise<SceneJson> {
  return JSON.parse(defined(await fs.readText(MAIN))) as SceneJson
}

export const liveLamp = (): PointLight => defined(defined(current?.viewport()?.game()?.find('Lamp')).get(PointLight))
