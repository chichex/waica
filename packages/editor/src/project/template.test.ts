import { ARCHETYPE } from '@waica/archetype-platformer'
import { describe, expect, it } from 'vitest'
import { projectArtFiles, projectFiles } from './template'

describe('projectFiles', () => {
  it.each(['demo', 'blank'] as const)(
    'matches the pre-refactor golden output for a %s start',
    (start) => {
      expect(projectFiles('fixture-name', start)).toMatchSnapshot()
    },
  )

  it('stamps the picked archetype id into game.json', () => {
    const files = projectFiles('my-game', 'demo', 'platformer')
    const game = JSON.parse(files['src/game.json'] ?? '') as { archetype?: unknown }

    expect(game.archetype).toBe('platformer')
  })

  it('loads project components alongside roles and states', () => {
    const main = projectFiles('my-game')['src/main.ts'] ?? ''

    expect(main).toContain(
      "import.meta.glob(['./components/*.ts', './roles/*.ts', './states/*.ts'])",
    )
  })

  it('materializes prefabs from the manifest contract, not registry defaults', () => {
    const registryPrefabs = ARCHETYPE.registry.prefabs
    ARCHETYPE.registry.prefabs = {}

    try {
      const files = projectFiles('my-game')
      expect(files['src/characters/player.character.json']).toBeDefined()
    } finally {
      ARCHETYPE.registry.prefabs = registryPrefabs
    }
  })

  it('demo start ships the sample level, prefab files and UI files', () => {
    const files = projectFiles('my-game')
    const scene = JSON.parse(files['src/scenes/main.scene.json'] ?? '') as {
      entities: unknown[]
      ui?: string[]
    }
    expect(scene.entities.length).toBeGreaterThan(0)
    expect(scene.ui).toContain('coin-counter')
    expect(files['src/characters/player.character.json']).toBeDefined()
    expect(files['src/ui/coin-counter.html']).toBeDefined()
  })

  // Writing these files is the ONLY way a project gets prefabs and UI pieces —
  // nothing resolves an archetype default behind the editor's back any more,
  // so a scene shipped with a ref but no file spawns a componentless ghost.
  it('demo start writes a file for everything its scene references', () => {
    const files = projectFiles('my-game')
    const scene = JSON.parse(files['src/scenes/main.scene.json'] ?? '') as {
      entities: Array<{ prefab?: string }>
      ui?: string[]
    }
    const refs = [...new Set(scene.entities.map((e) => e.prefab).filter((r) => r != null))]
    expect(refs.length).toBeGreaterThan(0)
    for (const ref of refs) {
      const written = Object.keys(files).find((p) => p.startsWith(`src/${ref}.`))
      expect(written, `no file for ${ref}`).toBeDefined()
    }
    for (const name of scene.ui ?? []) {
      expect(files[`src/ui/${name}.html`], `no file for ui ${name}`).toBeDefined()
    }
  })

  it('demo files reference materialized art paths, never registry URIs', () => {
    const files = projectFiles('my-game')
    expect(files['src/characters/player.character.json']).toContain('src/art/waica-dog.png')
    for (const [path, content] of Object.entries(files)) {
      if (path.endsWith('.json')) expect(content, path).not.toContain('waica:')
    }
  })

  it('blank start ships only the chassis: empty scene, no prefab or UI files', () => {
    const files = projectFiles('my-game', 'blank')
    const scene = JSON.parse(files['src/scenes/main.scene.json'] ?? '') as {
      entities: unknown[]
      camera?: { follow?: string }
    }
    expect(scene.entities).toEqual([])
    // No Player to follow yet; the camera just frames the origin.
    expect(scene.camera?.follow).toBeUndefined()
    const extras = Object.keys(files).filter((p) => /^src\/(characters|objects|tiles|ui)\//.test(p))
    expect(extras).toEqual([])
    for (const path of ['package.json', 'index.html', 'src/main.ts', 'src/controls.json', 'src/stats.json', 'src/game.json']) {
      expect(files[path], path).toBeDefined()
    }
  })

  it('materializes stock art for demo starts only', () => {
    const demo = projectArtFiles('demo')
    expect(Object.keys(demo)).toContain('src/art/waica-dog.png')
    expect(Object.values(demo).every((url) => typeof url === 'string' && url.length > 0)).toBe(true)
    expect(projectArtFiles('blank')).toEqual({})
  })

  it('stamps the project name into package.json in both starts', () => {
    for (const start of ['demo', 'blank'] as const) {
      const pkg = JSON.parse(projectFiles('dog-quest', start)['package.json'] ?? '') as {
        name: string
      }
      expect(pkg.name).toBe('dog-quest')
    }
  })
})
