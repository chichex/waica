// @vitest-environment happy-dom
import { act, createElement, StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { describe, expect, it, vi } from 'vitest'
import { MemFS } from '../fs/project-fs'
import {
  buildArtTree,
  collectDroppedFiles,
  useProjectArt,
  type ArtItem,
  type ProjectArt,
} from './use-project-art'
import { defined } from '../../../engine/src/test-support'

/** Mounts useProjectArt over a real MemFS and hands back its live return value. */
async function mountProjectArt(fs: MemFS): Promise<{ art(): ProjectArt; unmount(): void }> {
  let latest: ProjectArt | null = null
  function Harness(): null {
    latest = useProjectArt(fs)
    return null
  }
  const host = document.createElement('div')
  const root = createRoot(host)
  await act(async () => {
    root.render(createElement(StrictMode, null, createElement(Harness)))
  })
  return {
    art: () => defined(latest),
    unmount: () => root.unmount(),
  }
}

function pngFile(name: string): File {
  return new File([new Uint8Array([1, 2, 3])], name, { type: 'image/png' })
}

function fileEntry(file: File): FileSystemEntry {
  return {
    isFile: true,
    isDirectory: false,
    name: file.name,
    file: (resolve: (f: File) => void) => resolve(file),
  } as unknown as FileSystemEntry
}

function dirEntry(name: string, children: FileSystemEntry[]): FileSystemEntry {
  let exhausted = false
  return {
    isFile: false,
    isDirectory: true,
    name,
    createReader: () => ({
      readEntries: (resolve: (entries: FileSystemEntry[]) => void) => {
        if (exhausted) return resolve([])
        exhausted = true
        resolve(children)
      },
    }),
  } as unknown as FileSystemEntry
}

function dataTransferFrom(entries: FileSystemEntry[], files: File[] = []): DataTransfer {
  return {
    items: entries.map((entry) => ({ kind: 'file', webkitGetAsEntry: () => entry })),
    files,
  } as unknown as DataTransfer
}

describe('collectDroppedFiles', () => {
  it('falls back to the flat file list when entries are unavailable', async () => {
    const a = pngFile('a.png')
    const b = pngFile('b.png')
    const dt = dataTransferFrom([], [a, b])
    const result = await collectDroppedFiles(dt)
    expect(result).toEqual([
      { file: a, relativePath: 'a.png' },
      { file: b, relativePath: 'b.png' },
    ])
  })

  it('falls back to the flat file list when an item has no webkitGetAsEntry', async () => {
    const a = pngFile('a.png')
    const dt = { items: [{ kind: 'file' }], files: [a] } as unknown as DataTransfer
    const result = await collectDroppedFiles(dt)
    expect(result).toEqual([{ file: a, relativePath: 'a.png' }])
  })

  it('recurses into a dropped folder, prefixing each file with the folder it was in', async () => {
    const nested = pngFile('sprite.png')
    const dt = dataTransferFrom([dirEntry('Assets', [fileEntry(nested)])])
    const result = await collectDroppedFiles(dt)
    expect(result).toEqual([{ file: nested, relativePath: 'Assets/sprite.png' }])
  })

  it('recurses through nested subfolders, building the full relative path', async () => {
    const deep = pngFile('deep.png')
    const dt = dataTransferFrom([dirEntry('Assets', [dirEntry('Sprites', [fileEntry(deep)])])])
    const result = await collectDroppedFiles(dt)
    expect(result).toEqual([{ file: deep, relativePath: 'Assets/Sprites/deep.png' }])
  })

  it('combines loose files and folders dropped together', async () => {
    const loose = pngFile('loose.png')
    const nested = pngFile('nested.png')
    const dt = dataTransferFrom([fileEntry(loose), dirEntry('Assets', [fileEntry(nested)])])
    const result = await collectDroppedFiles(dt)
    expect(result.map((f) => f.relativePath).sort()).toEqual(['Assets/nested.png', 'loose.png'])
  })

  it('ignores non-file drag items (e.g. dragged text) mixed into the drop', async () => {
    const image = pngFile('a.png')
    const dt = {
      items: [
        { kind: 'string', webkitGetAsEntry: () => null },
        { kind: 'file', webkitGetAsEntry: () => fileEntry(image) },
      ],
      files: [],
    } as unknown as DataTransfer
    const result = await collectDroppedFiles(dt)
    expect(result).toEqual([{ file: image, relativePath: 'a.png' }])
  })
})

function artItem(path: string): ArtItem {
  return {
    label: path.split('/').pop() ?? path,
    url: `blob:${path}`,
    uri: path,
    path,
    kind: /\.ogg$/i.test(path) ? 'sound' : 'image',
  }
}

describe('buildArtTree', () => {
  it('puts root-level images directly under the root folder', () => {
    const player = artItem('src/art/player.png')
    const tree = buildArtTree([player])
    expect(tree.folders).toEqual([])
    expect(tree.items).toEqual([player])
  })

  it('groups nested files under folders mirroring the path they were dropped under', () => {
    const sprite = artItem('src/art/Update 1.9/Sprites/player.png')
    const tile = artItem('src/art/Update 1.9/Tiles/brick.png')
    const tree = buildArtTree([sprite, tile])

    expect(tree.items).toEqual([])
    expect(tree.folders.map((f) => f.name)).toEqual(['Update 1.9'])

    const update = tree.folders.find((f) => f.name === 'Update 1.9')
    expect(update?.items).toEqual([])
    expect(update?.folders.map((f) => f.name)).toEqual(['Sprites', 'Tiles'])
    expect(update?.folders.find((f) => f.name === 'Sprites')?.items).toEqual([sprite])
    expect(update?.folders.find((f) => f.name === 'Tiles')?.items).toEqual([tile])
  })

  it('sorts folders and items alphabetically at every level', () => {
    const zebra = artItem('src/art/zebra.png')
    const apple = artItem('src/art/apple.png')
    const zFolder = artItem('src/art/Zoo/lion.png')
    const aFolder = artItem('src/art/Airport/plane.png')
    const tree = buildArtTree([zebra, apple, zFolder, aFolder])

    expect(tree.items.map((i) => i.label)).toEqual(['apple.png', 'zebra.png'])
    expect(tree.folders.map((f) => f.name)).toEqual(['Airport', 'Zoo'])
  })

  it('groups public/ assets too, stripping the scan-root prefix from folder names', () => {
    const icon = artItem('public/ui/icon.png')
    const tree = buildArtTree([icon])
    expect(tree.folders.map((f) => f.name)).toEqual(['ui'])
    expect(tree.folders.find((f) => f.name === 'ui')?.items).toEqual([icon])
  })
})

describe('useProjectArt (CA-17)', () => {
  it('scans .ogg files from src/art alongside images, tagging each item by kind', async () => {
    const fs = new MemFS('proj', {})
    await fs.writeFile('src/art/hero.png', new Uint8Array([1, 2, 3]))
    await fs.writeFile('src/art/swing.ogg', new Uint8Array([4, 5, 6]))
    const mounted = await mountProjectArt(fs)

    const items = [...mounted.art().art].sort((a, b) => a.uri.localeCompare(b.uri))
    expect(items.map((i) => ({ uri: i.uri, kind: i.kind }))).toEqual([
      { uri: 'src/art/hero.png', kind: 'image' },
      { uri: 'src/art/swing.ogg', kind: 'sound' },
    ])

    mounted.unmount()
  })

  it('ignores files that are neither images nor .ogg sounds', async () => {
    const fs = new MemFS('proj', {})
    await fs.writeFile('src/art/notes.txt', new Uint8Array([1]))
    await fs.writeFile('src/art/theme.mp3', new Uint8Array([2]))
    const mounted = await mountProjectArt(fs)

    expect(mounted.art().art).toEqual([])

    mounted.unmount()
  })

  it('imports .ogg files into src/art, same as images', async () => {
    const fs = new MemFS('proj', {})
    const mounted = await mountProjectArt(fs)
    const file = new File([new Uint8Array([1, 2, 3])], 'swing.ogg', { type: 'audio/ogg' })

    await act(async () => {
      await mounted.art().importArt([{ file, relativePath: 'swing.ogg' }])
    })

    const bytes = await fs.readFile('src/art/swing.ogg')
    expect(bytes).not.toBeNull()
    expect(mounted.art().art.map((i) => i.uri)).toEqual(['src/art/swing.ogg'])
    expect(mounted.art().art[0]?.kind).toBe('sound')

    mounted.unmount()
  })
})

describe('useProjectArt models (issue #154 CA-8)', () => {
  it('scans .glb and .gltf files as models with their glTF MIME types, beside images and sounds', async () => {
    const created: Blob[] = []
    vi.spyOn(URL, 'createObjectURL').mockImplementation((blob) => {
      created.push(blob as Blob)
      return `blob:model-${created.length}`
    })
    const fs = new MemFS('proj', {})
    await fs.writeFile('src/art/hero.png', new Uint8Array([1]))
    await fs.writeFile('src/art/tree.glb', new Uint8Array([2]))
    await fs.writeFile('src/art/props/rock.gltf', new Uint8Array([3]))
    const mounted = await mountProjectArt(fs)

    const items = [...mounted.art().art].sort((a, b) => a.uri.localeCompare(b.uri))
    expect(items.map((i) => ({ uri: i.uri, kind: i.kind }))).toEqual([
      { uri: 'src/art/hero.png', kind: 'image' },
      { uri: 'src/art/props/rock.gltf', kind: 'model' },
      { uri: 'src/art/tree.glb', kind: 'model' },
    ])
    expect([...new Set(created.map((blob) => blob.type))].sort()).toEqual(['image/png', 'model/gltf+json', 'model/gltf-binary'])

    mounted.unmount()
  })

  it('imports a .glb into src/art, same as images and sounds', async () => {
    const fs = new MemFS('proj', {})
    const mounted = await mountProjectArt(fs)
    const file = new File([new Uint8Array([1, 2, 3])], 'tree.glb', { type: 'model/gltf-binary' })

    await act(async () => {
      await mounted.art().importArt([{ file, relativePath: 'models/tree.glb' }])
    })

    expect(await fs.readFile('src/art/models/tree.glb')).not.toBeNull()
    expect(mounted.art().art.map((i) => ({ uri: i.uri, kind: i.kind }))).toEqual([
      { uri: 'src/art/models/tree.glb', kind: 'model' },
    ])
    mounted.unmount()
  })
})

describe('useProjectArt load count', () => {
  it('counts every committed scan, so the stage can rebind textures to fresh art', async () => {
    const fs = new MemFS('demo', {})
    await fs.writeFile('src/art/hero.png', new Uint8Array([1, 2, 3]))
    const mounted = await mountProjectArt(fs)
    const afterMount = mounted.art().loads
    expect(afterMount).toBeGreaterThanOrEqual(1)
    expect(mounted.art().art.map((item) => item.label)).toEqual(['hero.png'])

    await act(async () => {
      mounted.art().refresh()
      await Promise.resolve()
    })
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
    expect(mounted.art().loads).toBe(afterMount + 1)
    mounted.unmount()
  })
})
