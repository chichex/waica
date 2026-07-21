import { describe, expect, it } from 'vitest'
import type { SceneJson } from '@waica/engine'
import {
  addFolder,
  clearAllOverrides,
  clearComponentOverride,
  countOverrides,
  deleteFolder,
  dissolveFolder,
  migrateScene,
  removeEntities,
  renameFolder,
  reorderEntities,
  reorderEntity,
  reorderFolder,
  sceneTree,
  uniqueFolderName,
} from './ops'

describe('migrateScene', () => {
  it('turns legacy ui/* entities into ui list entries', () => {
    const scene: SceneJson = {
      waicaScene: 2,
      entities: [
        { name: 'Player', prefab: 'characters/player', position: [0, 0] },
        { name: 'Hud', prefab: 'ui/coin-counter', position: [0, 0] },
      ],
    }
    const next = migrateScene(scene)
    expect(next.entities.map((e) => e.name)).toEqual(['Player'])
    expect(next.ui).toEqual(['coin-counter'])
  })

  it('does not duplicate pieces already in the ui list', () => {
    const scene: SceneJson = {
      waicaScene: 2,
      entities: [{ name: 'Hud', prefab: 'ui/coin-counter', position: [0, 0] }],
      ui: ['coin-counter'],
    }
    expect(migrateScene(scene).ui).toEqual(['coin-counter'])
  })

  it('returns modern scenes untouched', () => {
    const scene: SceneJson = {
      waicaScene: 3,
      camera: { position: [0, 0], zoom: 12 },
      entities: [{ name: 'Player', prefab: 'characters/player', position: [0, 0] }],
      ui: ['coin-counter'],
    }
    expect(migrateScene(scene)).toBe(scene)
  })
})

describe('clearComponentOverride', () => {
  const scene: SceneJson = {
    waicaScene: 3,
    entities: [
      {
        name: 'Player',
        prefab: 'characters/player',
        position: [0, 0],
        overrides: {
          Sprite: { width: 2, height: 3 },
          PlatformerMovement: { speed: 12 },
        },
      },
      { name: 'Other', prefab: 'characters/player', position: [1, 0] },
    ],
  }

  it('removes only the given key', () => {
    const next = clearComponentOverride(scene, 'Player', 'Sprite', 'width')
    expect(next.entities[0]?.overrides).toEqual({
      Sprite: { height: 3 },
      PlatformerMovement: { speed: 12 },
    })
  })

  it('drops the component map when its last key is cleared', () => {
    const next = clearComponentOverride(scene, 'Player', 'PlatformerMovement', 'speed')
    expect(next.entities[0]?.overrides).toEqual({ Sprite: { width: 2, height: 3 } })
  })

  it('drops the overrides block entirely when it empties out', () => {
    let next = clearComponentOverride(scene, 'Player', 'Sprite', 'width')
    next = clearComponentOverride(next, 'Player', 'Sprite', 'height')
    next = clearComponentOverride(next, 'Player', 'PlatformerMovement', 'speed')
    expect('overrides' in (next.entities[0] ?? {})).toBe(false)
  })

  it('leaves entities without that override untouched', () => {
    const next = clearComponentOverride(scene, 'Other', 'Sprite', 'width')
    expect(next.entities[1]).toBe(scene.entities[1])
    expect(clearComponentOverride(scene, 'Player', 'Sprite', 'color').entities[0]).toBe(
      scene.entities[0],
    )
  })

  it('countOverrides totals keys across components', () => {
    expect(countOverrides(scene.entities[0]!)).toBe(3)
    expect(countOverrides(scene.entities[1]!)).toBe(0)
  })

  it('clearAllOverrides drops the whole block and spares other entities', () => {
    const next = clearAllOverrides(scene, 'Player')
    expect('overrides' in (next.entities[0] ?? {})).toBe(false)
    expect(next.entities[1]).toBe(scene.entities[1])
    expect(clearAllOverrides(scene, 'Other').entities[1]).toBe(scene.entities[1])
  })
})

/** [name, folder?] pairs → a scene; keeps folder tests terse. */
function folderedScene(
  entities: Array<[string, string?]>,
  folders?: string[],
): SceneJson {
  return {
    waicaScene: 3,
    entities: entities.map(([name, folder]) => (folder ? { name, folder } : { name })),
    ...(folders ? { folders } : {}),
  }
}

/** Row shorthand: 'Name' for root entities, 'F[a,b]' for folders. */
function treeShape(scene: SceneJson): string[] {
  return sceneTree(scene).map((r) =>
    r.kind === 'entity' ? r.entity.name : `${r.name}[${r.entities.map((e) => e.name).join(',')}]`,
  )
}

describe('sceneTree', () => {
  it('groups folder members at the first occurrence, in entity order', () => {
    const scene = folderedScene([['A'], ['P1', 'Platforms'], ['B'], ['P2', 'Platforms']])
    expect(treeShape(scene)).toEqual(['A', 'Platforms[P1,P2]', 'B'])
  })

  it('trails registered folders that have no entities', () => {
    const scene = folderedScene([['A']], ['Empty'])
    expect(treeShape(scene)).toEqual(['A', 'Empty[]'])
  })

  it('uniqueFolderName counts registered and ad-hoc folders', () => {
    const scene = folderedScene([['P1', 'Folder']], ['Folder-2'])
    expect(uniqueFolderName(scene, 'Folder')).toBe('Folder-3')
    expect(uniqueFolderName(scene, 'Walls')).toBe('Walls')
  })
})

describe('folder ops', () => {
  it('addFolder registers an empty folder', () => {
    const next = addFolder(folderedScene([['A']]), 'Walls')
    expect(next.folders).toEqual(['Walls'])
    expect(treeShape(next)).toEqual(['A', 'Walls[]'])
  })

  it('renameFolder updates the registry and every member', () => {
    const scene = folderedScene([['P1', 'Old'], ['A']], ['Old'])
    const next = renameFolder(scene, 'Old', 'New')
    expect(next.folders).toEqual(['New'])
    expect(next.entities[0]?.folder).toBe('New')
    expect(next.entities[1]?.folder).toBeUndefined()
  })

  it('dissolveFolder keeps the entities at root, in place', () => {
    const scene = folderedScene([['A'], ['P1', 'Platforms'], ['P2', 'Platforms'], ['B']], ['Platforms'])
    const next = dissolveFolder(scene, 'Platforms')
    expect(treeShape(next)).toEqual(['A', 'P1', 'P2', 'B'])
    expect('folders' in next).toBe(false)
    expect('folder' in (next.entities[1] ?? {})).toBe(false)
  })

  it('deleteFolder removes the folder and its entities', () => {
    const scene = folderedScene([['A'], ['P1', 'Platforms'], ['B']], ['Platforms'])
    const next = deleteFolder(scene, 'Platforms')
    expect(treeShape(next)).toEqual(['A', 'B'])
    expect('folders' in next).toBe(false)
  })
})

describe('reorderEntity', () => {
  const scene = folderedScene([['A'], ['P1', 'Platforms'], ['P2', 'Platforms'], ['B'], ['C']])

  it('into a folder appends at its end and tags the entity', () => {
    const next = reorderEntity(scene, 'C', { into: 'Platforms' })
    expect(treeShape(next)).toEqual(['A', 'Platforms[P1,P2,C]', 'B'])
    expect(next.entities.find((e) => e.name === 'C')?.folder).toBe('Platforms')
  })

  it('before an entity inside a folder joins the folder at that slot', () => {
    const next = reorderEntity(scene, 'B', { beforeEntity: 'P2' })
    expect(treeShape(next)).toEqual(['A', 'Platforms[P1,B,P2]', 'C'])
  })

  it('after a root entity stays at root', () => {
    const next = reorderEntity(scene, 'C', { afterEntity: 'A' })
    expect(treeShape(next)).toEqual(['A', 'C', 'Platforms[P1,P2]', 'B'])
    expect('folder' in (next.entities[1] ?? {})).toBe(false)
  })

  it('before a folder lands at root, above the whole block', () => {
    const next = reorderEntity(scene, 'B', { beforeFolder: 'Platforms' })
    expect(treeShape(next)).toEqual(['A', 'B', 'Platforms[P1,P2]', 'C'])
  })

  it('out of a folder to the end clears the tag', () => {
    const next = reorderEntity(scene, 'P1', 'end')
    expect(treeShape(next)).toEqual(['A', 'Platforms[P2]', 'B', 'C', 'P1'])
    expect('folder' in (next.entities.find((e) => e.name === 'P1') ?? {})).toBe(false)
  })

  it('keeps a folder alive when its last member leaves', () => {
    const one = folderedScene([['P1', 'Platforms'], ['A']])
    const next = reorderEntity(one, 'P1', { afterEntity: 'A' })
    expect(treeShape(next)).toEqual(['A', 'P1', 'Platforms[]'])
    expect(next.folders).toEqual(['Platforms'])
  })

  it('no-ops on unknown names and self-targets', () => {
    expect(reorderEntity(scene, 'Nope', 'end')).toBe(scene)
    expect(reorderEntity(scene, 'B', { beforeEntity: 'B' })).toBe(scene)
    expect(reorderEntity(scene, 'C', { into: 'Nope' })).toBe(scene)
  })

  it('reordering normalizes scattered folder members into one block', () => {
    const scattered = folderedScene([['P1', 'Platforms'], ['A'], ['P2', 'Platforms']])
    const next = reorderEntity(scattered, 'A', 'end')
    expect(next.entities.map((e) => e.name)).toEqual(['P1', 'P2', 'A'])
  })
})

describe('reorderEntities', () => {
  const scene = folderedScene([['A'], ['P1', 'Platforms'], ['P2', 'Platforms'], ['B'], ['C']])

  it('moves the group as one run, keeping display order', () => {
    const next = reorderEntities(scene, ['C', 'A'], { into: 'Platforms' })
    expect(treeShape(next)).toEqual(['Platforms[P1,P2,A,C]', 'B'])
  })

  it('lands the run before a root entity', () => {
    const next = reorderEntities(scene, ['P1', 'C'], { beforeEntity: 'B' })
    expect(treeShape(next)).toEqual(['A', 'Platforms[P2]', 'P1', 'C', 'B'])
  })

  it('no-ops when the target sits inside the moving set', () => {
    expect(reorderEntities(scene, ['A', 'B'], { afterEntity: 'B' })).toBe(scene)
  })

  it('no-ops wholesale on an unknown target', () => {
    expect(reorderEntities(scene, ['A', 'B'], { into: 'Nope' })).toBe(scene)
  })

  it('removeEntities drops every named entity', () => {
    const next = removeEntities(scene, ['A', 'P2', 'C'])
    expect(next.entities.map((e) => e.name)).toEqual(['P1', 'B'])
  })
})

describe('reorderFolder', () => {
  const scene = folderedScene(
    [['A'], ['P1', 'Platforms'], ['W1', 'Walls'], ['B']],
    ['Platforms', 'Walls'],
  )

  it('moves the whole block before another row', () => {
    const next = reorderFolder(scene, 'Walls', { beforeEntity: 'A' })
    expect(treeShape(next)).toEqual(['Walls[W1]', 'A', 'Platforms[P1]', 'B'])
    expect(next.entities.map((e) => e.name)).toEqual(['W1', 'A', 'P1', 'B'])
  })

  it('lands after another folder block', () => {
    const next = reorderFolder(scene, 'Platforms', { afterFolder: 'Walls' })
    expect(treeShape(next)).toEqual(['A', 'Walls[W1]', 'Platforms[P1]', 'B'])
  })

  it('moves to the end', () => {
    const next = reorderFolder(scene, 'Platforms', 'end')
    expect(treeShape(next)).toEqual(['A', 'Walls[W1]', 'B', 'Platforms[P1]'])
  })

  it('no-ops on unknown folders and self-targets', () => {
    expect(reorderFolder(scene, 'Nope', 'end')).toBe(scene)
    expect(reorderFolder(scene, 'Walls', { beforeFolder: 'Walls' })).toBe(scene)
  })
})
