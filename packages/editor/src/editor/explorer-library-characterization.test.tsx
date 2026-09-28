// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { PrefabJson } from '@waica/engine'
import type { ComponentProps } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MemFS } from '../fs/project-fs'
import { ArchetypeContext, resolveArchetype } from '../project/archetype'
import { Explorer } from './Explorer'
import type { ArtItem } from './use-project-art'
import { defined } from '../../../engine/src/test-support'

// Characterization of the Explorer's library panels — prefab groups, UI
// pieces, components, art and project files — pinned before splitting
// Explorer.tsx by responsibility.

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

type ExplorerProps = ComponentProps<typeof Explorer>

const spy = () => vi.fn<(...args: unknown[]) => void>()

function explorerSpies() {
  return {
    onRefreshArt: spy(), onOpenScene: spy(), onSelectEntity: spy(), onToggleEntity: spy(),
    onRangeEntities: spy(), onClearSelection: spy(), onSelectCamera: spy(), onAddEntity: spy(),
    onCreateScene: spy(), onCreateFolder: spy(), onRenameFolder: spy(), onDissolveFolder: spy(),
    onDeleteFolder: spy(), onReorderEntity: spy(), onReorderFolder: spy(), onOpenPrefab: spy(),
    onOpenScript: spy(), onCreateComponent: spy(), onOpenComponentFile: spy(), onOpenStateFile: spy(),
    onOpenArt: spy(), onOpenControls: spy(), onOpenStats: spy(), onOpenGame: spy(), onDuplicateScene: spy(),
    onDeleteScene: spy(), onDuplicateEntity: spy(), onDeleteEntity: spy(), onRenameEntity: spy(),
    onDeleteEntities: spy(), onDuplicateEntities: spy(), onReorderEntities: spy(), onCreatePrefab: spy(),
    onDuplicatePrefab: spy(), onRenamePrefab: spy(), onDeletePrefab: spy(), onAddPrefabToScene: spy(),
    onOpenUi: spy(), onCreateUi: spy(), onDuplicateUi: spy(), onDeleteUi: spy(), onToggleUiInScene: spy(),
    onArtDeleted: spy(), onPreviewSound: spy(), onStopPreview: spy(),
    onImportArt: vi.fn<(...args: unknown[]) => Promise<void>>(() => Promise.resolve()),
  }
}

const prefab = (type: PrefabJson['type']): PrefabJson => ({ waicaPrefab: 1, type, components: [] })

const image = (path: string): ArtItem => ({
  label: defined(path.split('/').pop()),
  url: `blob:${path}`,
  uri: path,
  path,
  kind: 'image',
})

const ART = [image('src/art/hero.png'), image('src/art/tiles/grass.png'), image('src/art/tiles/dirt.png')]

function renderExplorer(overrides: Partial<ExplorerProps> = {}) {
  const spies = explorerSpies()
  const fs = new MemFS('proj', { 'src/art/hero.png': 'png' })
  const props: ExplorerProps = {
    ...spies,
    fs, scenePaths: [], openScenePath: null, view: null,
    scene: { waicaScene: 3, entities: [], ui: ['hud'] },
    sceneFolders: { expanded: new Set(), toggle: spy(), open: spy(), setAll: spy() },
    selected: null, multi: [], importProgress: null, mode: 'edit', previewingPath: null,
    prefabLib: { 'characters/hero': prefab('character'), 'objects/coin': prefab('object') },
    uiLib: { hud: '<div></div>', menu: '<div></div>' }, art: ART,
    customComponents: [{ name: 'Spin', path: 'src/components/spin.ts' }],
    stateFiles: ['dash.ts'], roleFiles: ['guard.ts'],
    ...overrides,
  }
  render(
    <ArchetypeContext.Provider value={resolveArchetype('platformer')}>
      <Explorer {...props} />
    </ArchetypeContext.Provider>,
    { reactStrictMode: true },
  )
  return { spies, fs }
}

const row = (name: string | RegExp): HTMLElement => screen.getByRole('button', { name })

async function menuItem(target: HTMLElement, label: RegExp): Promise<void> {
  const user = userEvent.setup()
  await user.pointer({ keys: '[MouseRight]', target })
  await user.click(screen.getByRole('menuitem', { name: label }))
}

describe('Explorer library (characterization): prefabs', () => {
  it('groups prefabs by type, opens them and carries their ref when dragged', async () => {
    const user = userEvent.setup()
    const { spies } = renderExplorer()

    expect(screen.getByText('Characters')).toBeDefined()
    expect(screen.getByText('Tiles')).toBeDefined()
    await user.click(row(/hero$/))
    expect(spies.onOpenPrefab).toHaveBeenCalledWith('characters/hero')
    const data = new Map<string, string>()
    fireEvent.dragStart(row(/coin$/), { dataTransfer: { setData: (k: string, v: string) => data.set(k, v) } })
    expect(data.get('waica/prefab')).toBe('objects/coin')
    await user.click(screen.getByRole('button', { description: 'New tile' }))
    expect(spies.onCreatePrefab).toHaveBeenCalledWith('tile')
  })

  it('renames a prefab inline and runs its menu actions', async () => {
    const user = userEvent.setup()
    const { spies } = renderExplorer()

    await user.dblClick(row(/hero$/))
    const field = screen.getByDisplayValue('hero')
    await user.clear(field)
    await user.type(field, 'knight{Enter}')
    expect(spies.onRenamePrefab).toHaveBeenCalledWith('characters/hero', 'knight')
    await menuItem(row(/coin$/), /Add to scene/)
    await menuItem(row(/coin$/), /Duplicate/)
    await menuItem(row(/coin$/), /New object/)
    await menuItem(row(/coin$/), /Delete/)
    expect(spies.onAddPrefabToScene).toHaveBeenCalledWith('objects/coin')
    expect(spies.onDuplicatePrefab).toHaveBeenCalledWith('objects/coin')
    expect(spies.onCreatePrefab).toHaveBeenCalledWith('object')
    expect(spies.onDeletePrefab).toHaveBeenCalledWith('objects/coin')
  })
})

describe('Explorer library (characterization): UI pieces and components', () => {
  it('flags UI pieces the open scene starts with and toggles them in it', async () => {
    const user = userEvent.setup()
    const { spies } = renderExplorer()

    expect(screen.getByRole('button', { name: '🧩 hud ●' })).toBeDefined()
    await user.click(row('🧩 menu'))
    expect(spies.onOpenUi).toHaveBeenCalledWith('menu')
    await menuItem(row('🧩 menu'), /Add to scene/)
    await menuItem(row('🧩 hud ●'), /Remove from scene/)
    await menuItem(row('🧩 menu'), /Duplicate/)
    await menuItem(row('🧩 menu'), /Delete/)
    expect(spies.onToggleUiInScene.mock.calls).toEqual([['menu'], ['hud']])
    expect(spies.onDuplicateUi).toHaveBeenCalledWith('menu')
    expect(spies.onDeleteUi).toHaveBeenCalledWith('menu')
  })

  it('lists built-in, state, role and custom component files', async () => {
    const user = userEvent.setup()
    const { spies } = renderExplorer()

    await user.click(row('📜 dash.ts'))
    await user.click(row('🎭 guard.ts'))
    await user.click(row('📜 Spin'))
    expect(spies.onOpenStateFile.mock.calls).toEqual([['src/states/dash.ts'], ['src/roles/guard.ts']])
    expect(spies.onOpenComponentFile).toHaveBeenCalledWith('src/components/spin.ts')
    const builtin = screen.getAllByRole('button', { name: /^📜/ })[0]
    await user.click(defined(builtin))
    expect(spies.onOpenScript).toHaveBeenCalledTimes(1)
  })

  it('explains empty component groups', () => {
    renderExplorer({ stateFiles: [], roleFiles: [], customComponents: [] })

    expect(screen.getByText(/No state code yet/)).toBeDefined()
    expect(screen.getByText(/No custom roles yet/)).toBeDefined()
    expect(screen.getByText('No custom components yet')).toBeDefined()
  })
})

describe('Explorer library (characterization): art', () => {
  it('shows art folders collapsed, expands them and opens an image', async () => {
    const user = userEvent.setup()
    const { spies } = renderExplorer()

    expect(screen.queryByRole('button', { name: /grass/ })).toBeNull()
    await user.click(row('▸ 📁 tiles'))
    expect(row('▾ 📂 tiles')).toBeDefined()
    await user.click(row('🖼️ grass.png'))
    expect(spies.onOpenArt).toHaveBeenCalledWith(ART[1])
    expect(screen.getByText('Drop art here or press ＋')).toBeDefined()
  })

  it('searches art, expanding every match, and says when nothing matches', async () => {
    const user = userEvent.setup()
    renderExplorer()

    const search = screen.getByPlaceholderText('Search art…')
    await user.type(search, 'dirt')
    expect(row('🖼️ dirt.png')).toBeDefined()
    expect(screen.queryByRole('button', { name: /hero\.png/ })).toBeNull()
    await user.type(search, 'zzz')
    expect(screen.getByText('no art matches “dirtzzz”')).toBeDefined()
  })

  it('deletes an art file after confirming', async () => {
    vi.stubGlobal('confirm', vi.fn(() => true))
    const { spies, fs } = renderExplorer()

    await menuItem(row('🖼️ hero.png'), /Delete/)
    await vi.waitFor(() => expect(spies.onRefreshArt).toHaveBeenCalledTimes(1))
    expect(spies.onArtDeleted).toHaveBeenCalledWith('src/art/hero.png')
    expect(await fs.readText('src/art/hero.png')).toBeNull()
  })

  it('imports chosen files and shows import progress', () => {
    const { spies } = renderExplorer({ importProgress: { done: 1, total: 3 } })
    const file = new File(['png'], 'bat.png', { type: 'image/png' })

    expect(screen.getByText('Importing 1/3…')).toBeDefined()
    fireEvent.change(defined(document.querySelector('input[type="file"]')), { target: { files: [file] } })
    expect(spies.onImportArt).toHaveBeenCalledWith([{ file, relativePath: 'bat.png' }])
  })
})

describe('Explorer library (characterization): dragging art', () => {
  it('drags an image out as a texture and imports files dropped on the panel', async () => {
    const { spies } = renderExplorer()
    const data = new Map<string, string>()
    fireEvent.dragStart(row('🖼️ hero.png'), { dataTransfer: { setData: (k: string, v: string) => data.set(k, v) } })
    expect(data.get('waica/art')).toBe('src/art/hero.png')

    const file = new File(['png'], 'bat.png', { type: 'image/png' })
    const panel = defined(screen.getByText('Art').closest('section'))
    const transfer = { types: ['Files'], items: [], files: [file], dropEffect: 'none' }
    fireEvent.dragOver(panel, { dataTransfer: transfer })
    expect(panel.className).toContain('is-dropping')
    fireEvent.drop(panel, { dataTransfer: transfer })
    expect(panel.className).not.toContain('is-dropping')
    await vi.waitFor(() => expect(spies.onImportArt).toHaveBeenCalledWith([{ file, relativePath: 'bat.png' }]))
  })
})

describe('Explorer library (characterization): project files', () => {
  it('opens controls, stats and game', async () => {
    const user = userEvent.setup()
    const { spies } = renderExplorer()

    await user.click(row('🎮 controls'))
    await user.click(row('📊 stats'))
    await user.click(row('🕹️ game'))
    expect(spies.onOpenControls).toHaveBeenCalledTimes(1)
    expect(spies.onOpenStats).toHaveBeenCalledTimes(1)
    expect(spies.onOpenGame).toHaveBeenCalledTimes(1)
  })
})
