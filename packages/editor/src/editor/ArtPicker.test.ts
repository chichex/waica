import { describe, expect, it } from 'vitest'
import { artDirOf, filterArt, groupArtByFolder } from './ArtPicker'
import type { ArtItem } from './use-project-art'

function item(path: string): ArtItem {
  const label = path.split('/').pop()!
  return { label, url: `blob:${label}`, uri: path, path }
}

describe('artDirOf', () => {
  it('shows the folder with the scan roots collapsed away', () => {
    expect(artDirOf(item('src/art/Tiles/Hills_1.png'))).toBe('Tiles')
    expect(artDirOf(item('src/art/Sprites/Player/Body.png'))).toBe('Sprites/Player')
    expect(artDirOf(item('public/backdrop.png'))).toBe('')
  })

  it('is empty for root-level files', () => {
    expect(artDirOf(item('src/art/waica-dog.png'))).toBe('')
  })
})

describe('filterArt', () => {
  const art = [item('src/art/Tiles/Hills_1.png'), item('src/art/Sprites/Body.png')]

  it('matches by name or by path, case-insensitively', () => {
    expect(filterArt(art, 'hills')).toHaveLength(1)
    expect(filterArt(art, 'sprites')).toHaveLength(1)
    expect(filterArt(art, '')).toHaveLength(2)
    expect(filterArt(art, 'nope')).toHaveLength(0)
  })
})

describe('groupArtByFolder', () => {
  it('buckets by folder — root first, folders and items A→Z', () => {
    const groups = groupArtByFolder([
      item('src/art/Tiles/Hills_2.png'),
      item('src/art/loose.png'),
      item('src/art/Backdrops/Sky.png'),
      item('src/art/Tiles/Hills_1.png'),
    ])
    expect(groups.map((g) => g.folder)).toEqual(['', 'Backdrops', 'Tiles'])
    expect(groups[2]!.items.map((i) => i.label)).toEqual(['Hills_1.png', 'Hills_2.png'])
  })

  it('keeps same-named files apart in their own folders', () => {
    const groups = groupArtByFolder([
      item('src/art/Big/Cloud.png'),
      item('src/art/Small/Cloud.png'),
    ])
    expect(groups.map((g) => g.folder)).toEqual(['Big', 'Small'])
  })
})
