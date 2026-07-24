import { describe, expect, it } from 'vitest'
import { buildArtTree, collectDroppedFiles, type ArtItem } from './use-project-art'

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
  return { label: path.split('/').pop() ?? path, url: `blob:${path}`, uri: path, path }
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
