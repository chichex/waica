// @vitest-environment happy-dom
import { act, createElement, type ComponentProps } from 'react'
import { createRoot } from 'react-dom/client'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { PrefabJson } from '@waica/engine'
import { MemFS } from '../fs/project-fs'
import { ArchetypeContext, resolveArchetype } from '../project/archetype'
import { Editor } from './Editor'
import { Inspector } from './Inspector'
import type { ArtItem } from './use-project-art'
import { saveWorkspace } from './workspace'

vi.mock('./Viewport', () => ({ Viewport: () => null }))
vi.mock('./CodePane', () => ({ CodePane: () => null }))
vi.mock('./play-runner', () => ({
  transpile: async (source: string) => source,
  createModule: async () => 'data:text/javascript,',
  execute: async () => ({}),
  reset: () => {},
}))

/**
 * A component with ref: 'ui' (Health.damageNumber, Health.healthBar — see
 * spec issue #72 CA-17) must render as a picker over the project's UI
 * pieces, exactly like the ref: 'sound' picker in inspector-sound-ref.test.ts,
 * not as free text.
 */
function baseProps(
  overrides: Partial<ComponentProps<typeof Inspector>> = {},
): ComponentProps<typeof Inspector> {
  return {
    selection: null,
    prefabs: {},
    stats: {},
    actions: {},
    art: [],
    urlFor: (uri) => uri,
    onImportArt: vi.fn(async () => {}),
    viewportVisibility: { appearance: true, collision: true },
    onViewportVisibility: vi.fn(),
    onRename: vi.fn(),
    onMove: vi.fn(),
    onProp: vi.fn(),
    onMultiProp: vi.fn(),
    onResetProp: vi.fn(),
    onApplyProp: vi.fn(),
    onResetAllProps: vi.fn(),
    onApplyAllProps: vi.fn(),
    onAddComponent: vi.fn(),
    onRemoveComponent: vi.fn(),
    onSetEntityCollision: vi.fn(),
    onSetTexture: vi.fn(),
    onDelete: vi.fn(),
    onOpenPrefab: vi.fn(),
    onPrefabProp: vi.fn(),
    onPrefabAddComponent: vi.fn(),
    onPrefabRemoveComponent: vi.fn(),
    onPrefabToggleAnimated: vi.fn(),
    onPrefabSetTexture: vi.fn(),
    onPrefabSetShape: vi.fn(),
    onPrefabSetCollision: vi.fn(),
    onEditAnimation: vi.fn(),
    onCameraProp: vi.fn(),
    onRenderProp: vi.fn(),
    pixelsPerUnit: 16,
    resolution: { mode: 'fixed', width: 640, height: 360 },
    sceneCamera: undefined,
    onSizeAppearance: vi.fn(),
    onPrefabSizeAppearance: vi.fn(),
    stateFiles: [],
    roleFiles: [],
    onMachinePatch: vi.fn(),
    onPrefabMachinePatch: vi.fn(),
    onCreateRoleFile: vi.fn(),
    onEditState: vi.fn(),
    ...overrides,
  }
}

function renderMarkup(props: ComponentProps<typeof Inspector>): void {
  const archetype = resolveArchetype('platformer')
  document.body.innerHTML = renderToStaticMarkup(
    createElement(
      ArchetypeContext.Provider,
      { value: archetype },
      createElement(Inspector, props),
    ),
  )
}

function rowNamed(label: string, root: ParentNode = document): Element {
  const row = [...root.querySelectorAll('.ed-row')].find((r) =>
    r.textContent?.startsWith(label),
  )
  if (!row) throw new Error(`missing row "${label}"`)
  return row
}

/** The values a ref picker offers, without its "none" and "Custom…" entries. */
function pickerChoices(row: Element): string[] {
  const select = row.querySelector('select')
  if (!select) throw new Error('row is not a picker')
  return [...select.querySelectorAll('option')]
    .filter((option) => option.getAttribute('value') !== '' && option.textContent !== 'Custom…')
    .map((option) => option.getAttribute('value') ?? '')
}

const hero: PrefabJson = {
  waicaPrefab: 1,
  type: 'character',
  components: [{ type: 'Health', props: {} }],
}

const storage = new Map<string, string>()
const localStorageStub = {
  clear: () => storage.clear(),
  getItem: (key: string) => storage.get(key) ?? null,
  removeItem: (key: string) => storage.delete(key),
  setItem: (key: string, value: string) => storage.set(key, value),
}

beforeEach(() => {
  document.body.innerHTML = ''
  storage.clear()
  vi.stubGlobal('localStorage', localStorageStub)
})

describe('Inspector ui ref picker (CA-17)', () => {
  it("renders Health's damageNumber and healthBar as pickers listing only the project's UI pieces", () => {
    const art: ArtItem[] = [
      {
        label: 'hurt.ogg',
        url: 'blob:hurt',
        uri: 'src/art/hurt.ogg',
        path: 'src/art/hurt.ogg',
        kind: 'sound',
      },
    ]
    renderMarkup(
      baseProps({
        selection: { kind: 'prefab', ref: 'characters/hero', prefab: hero },
        prefabs: { 'characters/hero': hero },
        stats: { points: 0 },
        art,
        uiPieces: ['npc-line', 'health-bar', 'damage-number'],
      }),
    )

    expect(pickerChoices(rowNamed('Damage number'))).toEqual([
      'damage-number',
      'health-bar',
      'npc-line',
    ])
    expect(pickerChoices(rowNamed('Health bar'))).toEqual([
      'damage-number',
      'health-bar',
      'npc-line',
    ])
  })

  it('renders empty pickers (not free text) when the project has no UI pieces yet', () => {
    renderMarkup(
      baseProps({
        selection: { kind: 'prefab', ref: 'characters/hero', prefab: hero },
        prefabs: { 'characters/hero': hero },
      }),
    )

    for (const label of ['Damage number', 'Health bar']) {
      const row = rowNamed(label)
      expect(pickerChoices(row)).toEqual([])
      expect(row.querySelector('input[type="text"]')).toBeNull()
    }
  })

  it("offers the pieces the Editor loads from the project's src/ui/", async () => {
    const fs = new MemFS('ui-ref-project', {
      'src/game.json': JSON.stringify({
        waicaGame: 1,
        archetype: 'platformer',
        resolution: { mode: 'fill', width: 640, height: 360 },
        pixelsPerUnit: 16,
      }),
      'src/scenes/main.scene.json': JSON.stringify({ waicaScene: 3, entities: [] }),
      'src/characters/hero.character.json': JSON.stringify(hero),
      'src/ui/health-bar.html': '<div></div>',
      'src/ui/damage-number.html': '<div></div>',
    })
    saveWorkspace(fs.name, 'src/scenes/main.scene.json', { kind: 'prefab', ref: 'characters/hero' })
    const host = document.createElement('div')
    document.body.append(host)
    const root = createRoot(host)

    await act(async () => {
      root.render(createElement(Editor, { fs, onClose: vi.fn() }))
    })
    await vi.waitFor(() => {
      expect(pickerChoices(rowNamed('Damage number', host))).toEqual([
        'damage-number',
        'health-bar',
      ])
    })

    await act(async () => root.unmount())
  })
})
