// @vitest-environment happy-dom
import { act, createElement, type ComponentProps } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MemFS } from '../fs/project-fs'
import { ArchetypeContext, resolveArchetype } from '../project/archetype'
import { Explorer } from './Explorer'
import type { ArtItem } from './use-project-art'

/**
 * CA-17 (the library learns audio) and CA-18 (preview, editor-owned, disabled
 * in play mode) — see .sdd/specs/issue-67-engine-audio-subsystem.md. The
 * preview path is deliberately independent of game.audio (spec decision 19):
 * onPreviewSound is the injectable seam this test exercises, matching how
 * ADR 0013 made the engine's own audio backend testable.
 */

const SOUND: ArtItem = {
  label: 'swing.ogg',
  url: 'blob:swing',
  uri: 'src/art/swing.ogg',
  path: 'src/art/swing.ogg',
  kind: 'sound',
}

const IMAGE: ArtItem = {
  label: 'hero.png',
  url: 'blob:hero',
  uri: 'src/art/hero.png',
  path: 'src/art/hero.png',
  kind: 'image',
}

function baseProps(
  overrides: Partial<ComponentProps<typeof Explorer>> = {},
): ComponentProps<typeof Explorer> {
  return {
    fs: new MemFS('proj', {}),
    scenePaths: [],
    openScenePath: null,
    justCreatedFolder: null,
    scene: null,
    view: null,
    selected: null,
    multi: [],
    prefabLib: {},
    uiLib: {},
    art: [],
    onImportArt: vi.fn(async () => {}),
    importProgress: null,
    onRefreshArt: vi.fn(),
    onOpenScene: vi.fn(),
    onSelectEntity: vi.fn(),
    onToggleEntity: vi.fn(),
    onRangeEntities: vi.fn(),
    onClearSelection: vi.fn(),
    onSelectCamera: vi.fn(),
    onAddEntity: vi.fn(),
    onCreateScene: vi.fn(),
    onCreateFolder: vi.fn(),
    onRenameFolder: vi.fn(),
    onDissolveFolder: vi.fn(),
    onDeleteFolder: vi.fn(),
    onReorderEntity: vi.fn(),
    onReorderFolder: vi.fn(),
    onOpenPrefab: vi.fn(),
    onOpenScript: vi.fn(),
    customComponents: [],
    onCreateComponent: vi.fn(),
    onOpenComponentFile: vi.fn(),
    stateFiles: [],
    roleFiles: [],
    onOpenStateFile: vi.fn(),
    onOpenArt: vi.fn(),
    onOpenControls: vi.fn(),
    onOpenStats: vi.fn(),
    onOpenGame: vi.fn(),
    onDuplicateScene: vi.fn(),
    onDeleteScene: vi.fn(),
    onDuplicateEntity: vi.fn(),
    onDeleteEntity: vi.fn(),
    onRenameEntity: vi.fn(),
    onDeleteEntities: vi.fn(),
    onDuplicateEntities: vi.fn(),
    onReorderEntities: vi.fn(),
    onCreatePrefab: vi.fn(),
    onDuplicatePrefab: vi.fn(),
    onRenamePrefab: vi.fn(),
    onDeletePrefab: vi.fn(),
    onAddPrefabToScene: vi.fn(),
    onOpenUi: vi.fn(),
    onCreateUi: vi.fn(),
    onDuplicateUi: vi.fn(),
    onDeleteUi: vi.fn(),
    onToggleUiInScene: vi.fn(),
    onArtDeleted: vi.fn(),
    mode: 'edit',
    onPreviewSound: vi.fn(),
    ...overrides,
  }
}

describe('Explorer sound library (CA-17, CA-18)', () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    document.body.innerHTML = ''
    container = document.createElement('div')
    document.body.append(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
  })

  function render(props: ComponentProps<typeof Explorer>): void {
    const archetype = resolveArchetype('platformer')
    act(() => {
      root.render(
        createElement(
          ArchetypeContext.Provider,
          { value: archetype },
          createElement(Explorer, props),
        ),
      )
    })
  }

  it('lists a sound alongside images, with exactly one preview control (the sound row)', () => {
    render(baseProps({ art: [SOUND, IMAGE] }))

    expect(container.textContent).toContain('swing.ogg')
    expect(container.textContent).toContain('hero.png')
    expect(container.querySelectorAll('.ed-sound-play')).toHaveLength(1)
  })

  it('invokes the injected preview entry point with the sound URL when clicked in edit mode', () => {
    const onPreviewSound = vi.fn()
    render(baseProps({ art: [SOUND], mode: 'edit', onPreviewSound }))

    const button = container.querySelector<HTMLButtonElement>('.ed-sound-play')
    expect(button).not.toBeNull()
    expect(button!.disabled).toBe(false)

    act(() => button!.click())

    expect(onPreviewSound).toHaveBeenCalledExactlyOnceWith(SOUND.url)
  })

  it('disables the preview control while the project is in play mode, and never invokes preview', () => {
    const onPreviewSound = vi.fn()
    render(baseProps({ art: [SOUND], mode: 'play', onPreviewSound }))

    const button = container.querySelector<HTMLButtonElement>('.ed-sound-play')
    expect(button).not.toBeNull()
    expect(button!.disabled).toBe(true)

    act(() => button!.click())

    expect(onPreviewSound).not.toHaveBeenCalled()
  })
})
