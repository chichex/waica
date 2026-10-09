// @vitest-environment happy-dom
import { cleanup, render as renderUi, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { type ComponentProps, createElement } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MemFS } from '../fs/project-fs'
import { ArchetypeContext, resolveArchetype } from '../project/archetype'
import { Explorer } from './Explorer'
import type { ArtItem } from './use-project-art'
import { defined } from '../../../engine/src/test-support'

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

const MODEL: ArtItem = {
  label: 'tree.glb',
  url: 'blob:tree',
  uri: 'src/art/tree.glb',
  path: 'src/art/tree.glb',
  kind: 'model',
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
    sceneFolders: { expanded: new Set(), toggle: () => {}, open: () => {}, setAll: () => {} },
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

/** A sound row's preview toggle: it reads ▶ (preview) or ⏹ (stop). */
const PREVIEW_CONTROL = /^[▶⏹]$/u

describe('Explorer sound library (CA-17, CA-18)', () => {
  afterEach(cleanup)

  function render(props: ComponentProps<typeof Explorer>): void {
    const archetype = resolveArchetype('platformer')
    renderUi(
      createElement(
        ArchetypeContext.Provider,
        { value: archetype },
        createElement(Explorer, props),
      ),
      { reactStrictMode: true },
    )
  }

  it('lists a sound alongside images, with exactly one preview control (the sound row)', () => {
    render(baseProps({ art: [SOUND, IMAGE] }))

    expect(screen.getByText('swing.ogg')).toBeDefined()
    expect(screen.getByText('hero.png')).toBeDefined()
    expect(screen.getAllByRole('button', { name: PREVIEW_CONTROL })).toHaveLength(1)
  })

  it('lists a model (issue #154 CA-8) as its own row: nothing to open or preview, only the file menu', async () => {
    const user = userEvent.setup()
    const onOpenArt = vi.fn()
    render(baseProps({ art: [MODEL, SOUND], onOpenArt }))

    const row = screen.getByText('tree.glb')
    expect(row).toBeDefined()
    await user.click(row)
    expect(onOpenArt).not.toHaveBeenCalled()
    expect(screen.getAllByRole('button', { name: PREVIEW_CONTROL })).toHaveLength(1)
    expect(row.closest('[draggable="true"]')).toBeNull()
  })

  it('invokes the injected preview entry point with the sound URL when clicked in edit mode', async () => {
    const user = userEvent.setup()
    const onPreviewSound = vi.fn()
    render(baseProps({ art: [SOUND], mode: 'edit', onPreviewSound }))

    const button = screen.queryByRole<HTMLButtonElement>('button', { name: PREVIEW_CONTROL })
    expect(button).not.toBeNull()
    expect(defined(button).disabled).toBe(false)

    await user.click(defined(button))

    expect(onPreviewSound).toHaveBeenCalledExactlyOnceWith(SOUND)
  })

  it('disables the preview control while the project is in play mode, and never invokes preview', async () => {
    const user = userEvent.setup()
    const onPreviewSound = vi.fn()
    render(baseProps({ art: [SOUND], mode: 'play', onPreviewSound }))

    const button = screen.queryByRole<HTMLButtonElement>('button', { name: PREVIEW_CONTROL })
    expect(button).not.toBeNull()
    expect(defined(button).disabled).toBe(true)

    await user.click(defined(button))

    expect(onPreviewSound).not.toHaveBeenCalled()
  })

  it('shows a stop control for the row currently previewing, and calls onStopPreview when clicked (review finding B)', async () => {
    const user = userEvent.setup()
    const onPreviewSound = vi.fn()
    const onStopPreview = vi.fn()
    render(
      baseProps({ art: [SOUND], previewingPath: SOUND.path, onPreviewSound, onStopPreview }),
    )

    const button = screen.queryByRole<HTMLButtonElement>('button', { name: PREVIEW_CONTROL })
    expect(button).not.toBeNull()
    expect(defined(button).textContent).toBe('⏹')

    await user.click(defined(button))

    expect(onStopPreview).toHaveBeenCalledOnce()
    expect(onPreviewSound).not.toHaveBeenCalled()
  })

  it('offers to play (not stop) a row that is not the one currently previewing', async () => {
    const user = userEvent.setup()
    const other: ArtItem = { ...SOUND, label: 'hit.ogg', url: 'blob:hit', uri: 'src/art/hit.ogg', path: 'src/art/hit.ogg' }
    const onPreviewSound = vi.fn()
    const onStopPreview = vi.fn()
    render(
      baseProps({ art: [SOUND, other], previewingPath: SOUND.path, onPreviewSound, onStopPreview }),
    )

    expect(screen.getAllByRole('button', { name: PREVIEW_CONTROL })).toHaveLength(2)
    const otherButton = screen.queryByRole('button', { name: '▶' })
    expect(otherButton).not.toBeNull()

    await user.click(defined(otherButton))

    expect(onPreviewSound).toHaveBeenCalledExactlyOnceWith(other)
    expect(onStopPreview).not.toHaveBeenCalled()
  })

  it(
    'keeps the stop control on the previewing row after a re-scan changes every item\'s url ' +
      '(regression, finding 1): useProjectArt revokes and recreates every object URL on each ' +
      're-scan (use-project-art.ts ~179-192), so a url-keyed toggle loses the playing row',
    async () => {
      const user = userEvent.setup()
      const onStopPreview = vi.fn()
      const rescanned: ArtItem = { ...SOUND, url: 'blob:swing-after-rescan' }
      render(baseProps({ art: [rescanned], previewingPath: SOUND.path, onStopPreview }))

      const button = screen.queryByRole<HTMLButtonElement>('button', { name: PREVIEW_CONTROL })
      expect(button).not.toBeNull()
      expect(defined(button).textContent).toBe('⏹')

      await user.click(defined(button))

      expect(onStopPreview).toHaveBeenCalledOnce()
    },
  )

  it('stops the preview when the file being deleted is the one currently previewing (regression, finding 1)', async () => {
    const user = userEvent.setup()
    const onStopPreview = vi.fn()
    const fs = new MemFS('proj', {})
    // happy-dom's window.confirm is undefined (not merely a stub), so
    // vi.spyOn (which requires an existing function) can't target it.
    const originalConfirm = window.confirm
    window.confirm = vi.fn(() => true)
    try {
      render(baseProps({ fs, art: [SOUND], previewingPath: SOUND.path, onStopPreview }))

      const row = screen.queryByText('swing.ogg')
      expect(row).not.toBeNull()
      await user.pointer({ keys: '[MouseRight]', target: defined(row) })
      const deleteButton = screen.queryByRole('menuitem', { name: /Delete/ })
      expect(deleteButton).not.toBeNull()

      await user.click(defined(deleteButton))

      expect(onStopPreview).toHaveBeenCalledOnce()
    } finally {
      window.confirm = originalConfirm
    }
  })

  it('does not stop the preview when the file being deleted is a different one', async () => {
    const user = userEvent.setup()
    const onStopPreview = vi.fn()
    const other: ArtItem = { ...SOUND, label: 'hit.ogg', url: 'blob:hit', uri: 'src/art/hit.ogg', path: 'src/art/hit.ogg' }
    const fs = new MemFS('proj', {})
    const originalConfirm = window.confirm
    window.confirm = vi.fn(() => true)
    try {
      render(baseProps({ fs, art: [SOUND, other], previewingPath: SOUND.path, onStopPreview }))

      const otherRow = screen.queryByText('hit.ogg')
      expect(otherRow).not.toBeNull()
      await user.pointer({ keys: '[MouseRight]', target: defined(otherRow) })
      const deleteButton = screen.queryByRole('menuitem', { name: /Delete/ })
      expect(deleteButton).not.toBeNull()

      await user.click(defined(deleteButton))

      expect(onStopPreview).not.toHaveBeenCalled()
    } finally {
      window.confirm = originalConfirm
    }
  })
})
