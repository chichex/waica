// @vitest-environment happy-dom
import { act, createElement, type ComponentProps } from 'react'
import { createRoot } from 'react-dom/client'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Component, type ComponentClass, type PrefabJson, type SceneEntityJson } from '@waica/engine'
import { MemFS } from '../fs/project-fs'
import { ArchetypeContext, resolveArchetype, type ArchetypeManifest } from '../project/archetype'
import { Editor } from './Editor'
import { Inspector, type InspectorSelection } from './Inspector'
import { saveWorkspace } from './workspace'

vi.mock('./Viewport', () => ({ Viewport: () => null }))
vi.mock('./CodePane', () => ({ CodePane: () => null }))
vi.mock('./play-runner', () => ({
  transpile: async (source: string) => source,
  createModule: async () => 'data:text/javascript,',
  execute: async () => ({}),
  reset: () => {},
}))

class AlphaProducer extends Component {
  static override componentName = 'AlphaProducer'
  override onUpdate(): void {}
}

class BetaConsumer extends Component {
  static override componentName = 'BetaConsumer'
  static override updateAfter = ['AlphaProducer'] as const
  override onUpdate(): void {}
}

class AardvarkUpdate extends Component {
  static override componentName = 'AardvarkUpdate'
  override onUpdate(): void {}
}

class PassiveCard extends Component {
  static override componentName = 'PassiveCard'
}

class BrokenConsumer extends Component {
  static override componentName = 'BrokenConsumer'
  static override updateAfter = ['MissingProducer'] as const
  override onUpdate(): void {}
}

const storage = new Map<string, string>()
const localStorageStub = {
  clear: () => storage.clear(),
  getItem: (key: string) => storage.get(key) ?? null,
  removeItem: (key: string) => storage.delete(key),
  setItem: (key: string, value: string) => storage.set(key, value),
}

const components: Record<string, ComponentClass> = {
  AardvarkUpdate,
  AlphaProducer,
  BetaConsumer,
  BrokenConsumer,
  PassiveCard,
}

function props(
  selection: InspectorSelection,
  prefabs: Record<string, PrefabJson> = {},
): ComponentProps<typeof Inspector> {
  return {
    selection,
    prefabs,
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
  }
}

function renderInspector(
  selection: InspectorSelection,
  prefabs: Record<string, PrefabJson> = {},
): void {
  const archetype = resolveArchetype()
  const value: ArchetypeManifest = {
    ...archetype,
    registry: {
      ...archetype.registry,
      components: { ...archetype.registry.components, ...components },
    },
  }
  document.body.innerHTML = renderToStaticMarkup(
    createElement(
      ArchetypeContext.Provider,
      { value },
      createElement(Inspector, props(selection, prefabs)),
    ),
  )
}

function componentCard(name: string): Element {
  const card = [...document.querySelectorAll('.ed-comp')].find(
    (candidate) => candidate.querySelector('.ed-comp-head > span')?.textContent === name,
  )
  if (!card) throw new Error(`missing component card ${name}`)
  return card
}

function entity(name: string, types: string[]): SceneEntityJson {
  return { name, components: types.map((type) => ({ type })) }
}

beforeEach(() => {
  document.body.innerHTML = ''
  storage.clear()
  vi.stubGlobal('localStorage', localStorageStub)
})

describe('Inspector component update visibility', () => {
  it.each(['entity', 'prefab'] as const)(
    'renders read-only positions and effective constraints on a %s, while passive cards stay unannotated',
    (kind) => {
      const effective = [
        { type: 'BetaConsumer' },
        { type: 'PassiveCard' },
        { type: 'AlphaProducer' },
      ]
      const prefab: PrefabJson = { waicaPrefab: 1, type: 'object', components: effective }
      const selection: InspectorSelection =
        kind === 'entity'
          ? { kind: 'entity', sceneName: 'main', entity: entity('Hero', effective.map((c) => c.type)) }
          : { kind: 'prefab', ref: 'objects/hero', prefab }

      renderInspector(selection, kind === 'prefab' ? { 'objects/hero': prefab } : {})

      expect(componentCard('AlphaProducer').querySelector('.ed-update-badge')?.textContent).toBe(
        'update 1',
      )
      expect(componentCard('BetaConsumer').querySelector('.ed-update-badge')?.textContent).toBe(
        'update 2',
      )
      expect(componentCard('BetaConsumer').querySelector('.ed-update-after')?.textContent).toBe(
        'after: AlphaProducer',
      )
      expect(componentCard('PassiveCard').querySelector('.ed-update-badge')).toBeNull()
      expect(document.querySelector('[draggable]')).toBeNull()
    },
  )

  it('annotates the native Appearance and Role cards as part of the same effective schedule', () => {
    const prefab: PrefabJson = {
      waicaPrefab: 1,
      type: 'character',
      components: [
        { type: 'AnimatedSprite' },
        { type: 'Health' },
        { type: 'StateMachine' },
        { type: 'Hitbox' },
      ],
    }
    renderInspector({ kind: 'prefab', ref: 'characters/hero', prefab }, {
      'characters/hero': prefab,
    })

    const appearance = [...document.querySelectorAll('.ed-sec-head')].find(
      (header) => header.firstElementChild?.textContent === 'Appearance',
    )
    expect(appearance?.querySelector('.ed-update-badge')?.textContent).toBe('update 2')
    expect(appearance?.querySelector('.ed-update-after')?.textContent).toBe(
      'after: StateMachine',
    )
    expect(componentCard('Role').querySelector('.ed-update-badge')?.textContent).toBe('update 1')
    expect(componentCard('Health').querySelector('.ed-update-badge')?.textContent).toBe('update 3')
  })

  it('shows one actionable owner-specific error and no positions for an invalid composition', () => {
    renderInspector({
      kind: 'entity',
      sceneName: 'main',
      entity: entity('Broken hero', ['AlphaProducer', 'BrokenConsumer']),
    })

    const error = document.querySelector('.ed-update-error')
    expect(error?.textContent).toMatch(/Broken hero.*BrokenConsumer.*MissingProducer/)
    expect(document.querySelector('.ed-update-badge')).toBeNull()
  })

  it('keeps Play enabled for a loaded scene with an invalid component schedule', async () => {
    const scenePath = 'src/scenes/main.scene.json'
    const fs = new MemFS('invalid-schedule-project', {
      [scenePath]: JSON.stringify({
        waicaScene: 3,
        entities: [
          {
            name: 'Broken',
            components: [{ type: 'StateMachine' }, { type: 'StateMachine' }],
          },
        ],
      }),
      'src/game.json': JSON.stringify({
        waicaGame: 1,
        archetype: 'platformer',
        resolution: { mode: 'fill', width: 640, height: 360 },
        pixelsPerUnit: 16,
      }),
    })
    saveWorkspace(fs.name, scenePath, { kind: 'scene', path: scenePath })
    const host = document.createElement('div')
    document.body.append(host)
    const root = createRoot(host)

    await act(async () => {
      root.render(createElement(Editor, { fs, onClose: vi.fn() }))
    })
    await vi.waitFor(() => {
      const play = [...host.querySelectorAll('button')].find((button) =>
        button.textContent?.includes('Play'),
      )
      expect(play).toBeDefined()
      expect(play?.disabled).toBe(false)
    })

    await act(async () => root.unmount())
  })

  it('shows concrete multi-selection positions when all agree and update varies when they differ', () => {
    const first = entity('First', ['BetaConsumer', 'AlphaProducer'])
    const same = entity('Same', ['AlphaProducer', 'BetaConsumer'])
    renderInspector({ kind: 'multi', sceneName: 'main', entities: [first, same] })

    expect(componentCard('AlphaProducer').querySelector('.ed-update-badge')?.textContent).toBe(
      'update 1',
    )
    expect(componentCard('BetaConsumer').querySelector('.ed-update-badge')?.textContent).toBe(
      'update 2',
    )

    const shifted = entity('Shifted', ['AardvarkUpdate', 'AlphaProducer', 'BetaConsumer'])
    renderInspector({ kind: 'multi', sceneName: 'main', entities: [first, shifted] })

    expect(componentCard('AlphaProducer').querySelector('.ed-update-badge')?.textContent).toBe(
      'update varies',
    )
    expect(componentCard('BetaConsumer').querySelector('.ed-update-badge')?.textContent).toBe(
      'update varies',
    )
  })
})
