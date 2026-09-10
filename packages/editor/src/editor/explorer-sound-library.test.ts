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
    previewingPath: null,
    onPreviewSound: vi.fn(),
    onStopPreview: vi.fn(),
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

    expect(onPreviewSound).toHaveBeenCalledExactlyOnceWith(SOUND)
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

  it('shows a stop control for the row currently previewing, and calls onStopPreview when clicked (review finding B)', () => {
    const onPreviewSound = vi.fn()
    const onStopPreview = vi.fn()
    render(
      baseProps({ art: [SOUND], previewingPath: SOUND.path, onPreviewSound, onStopPreview }),
    )

    const button = container.querySelector<HTMLButtonElement>('.ed-sound-play')
    expect(button).not.toBeNull()
    expect(button!.textContent).toBe('⏹')

    act(() => button!.click())

    expect(onStopPreview).toHaveBeenCalledOnce()
    expect(onPreviewSound).not.toHaveBeenCalled()
  })

  it('offers to play (not stop) a row that is not the one currently previewing', () => {
    const other: ArtItem = { ...SOUND, label: 'hit.ogg', url: 'blob:hit', uri: 'src/art/hit.ogg', path: 'src/art/hit.ogg' }
    const onPreviewSound = vi.fn()
    const onStopPreview = vi.fn()
    render(
      baseProps({ art: [SOUND, other], previewingPath: SOUND.path, onPreviewSound, onStopPreview }),
    )

    const buttons = container.querySelectorAll<HTMLButtonElement>('.ed-sound-play')
    expect(buttons).toHaveLength(2)
    const otherButton = [...buttons].find((b) => b.textContent === '▶')
    expect(otherButton).not.toBeUndefined()

    act(() => otherButton!.click())

    expect(onPreviewSound).toHaveBeenCalledExactlyOnceWith(other)
    expect(onStopPreview).not.toHaveBeenCalled()
  })

  it(
    'keeps the stop control on the previewing row after a re-scan changes every item\'s url ' +
      '(regression, finding 1): useProjectArt revokes and recreates every object URL on each ' +
      're-scan (use-project-art.ts ~179-192), so a url-keyed toggle loses the playing row',
    () => {
      const onStopPreview = vi.fn()
      const rescanned: ArtItem = { ...SOUND, url: 'blob:swing-after-rescan' }
      render(baseProps({ art: [rescanned], previewingPath: SOUND.path, onStopPreview }))

      const button = container.querySelector<HTMLButtonElement>('.ed-sound-play')
      expect(button).not.toBeNull()
      expect(button!.textContent).toBe('⏹')

      act(() => button!.click())

      expect(onStopPreview).toHaveBeenCalledOnce()
    },
  )

  it('stops the preview when the file being deleted is the one currently previewing (regression, finding 1)', () => {
    const onStopPreview = vi.fn()
    const fs = new MemFS('proj', {})
    // happy-dom's window.confirm is undefined (not merely a stub), so
    // vi.spyOn (which requires an existing function) can't target it.
    const originalConfirm = window.confirm
    window.confirm = vi.fn(() => true)
    try {
      render(baseProps({ fs, art: [SOUND], previewingPath: SOUND.path, onStopPreview }))

      const row = container.querySelector('.ed-x-sound')
      expect(row).not.toBeNull()
      act(() => {
        row!.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }))
      })
      const deleteButton = [...container.querySelectorAll<HTMLButtonElement>('.ed-ctx-item')].find(
        (b) => b.textContent?.includes('Delete'),
      )
      expect(deleteButton).not.toBeUndefined()

      act(() => deleteButton!.click())

      expect(onStopPreview).toHaveBeenCalledOnce()
    } finally {
      window.confirm = originalConfirm
    }
  })

  it('does not stop the preview when the file being deleted is a different one', () => {
    const onStopPreview = vi.fn()
    const other: ArtItem = { ...SOUND, label: 'hit.ogg', url: 'blob:hit', uri: 'src/art/hit.ogg', path: 'src/art/hit.ogg' }
    const fs = new MemFS('proj', {})
    const originalConfirm = window.confirm
    window.confirm = vi.fn(() => true)
    try {
      render(baseProps({ fs, art: [SOUND, other], previewingPath: SOUND.path, onStopPreview }))

      const rows = container.querySelectorAll('.ed-x-sound')
      const otherRow = [...rows].find((r) => r.textContent?.includes('hit.ogg'))
      expect(otherRow).not.toBeUndefined()
      act(() => {
        otherRow!.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }))
      })
      const deleteButton = [...container.querySelectorAll<HTMLButtonElement>('.ed-ctx-item')].find(
        (b) => b.textContent?.includes('Delete'),
      )
      expect(deleteButton).not.toBeUndefined()

      act(() => deleteButton!.click())

      expect(onStopPreview).not.toHaveBeenCalled()
    } finally {
      window.confirm = originalConfirm
    }
  })
})
