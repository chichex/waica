import { describe, expect, it } from 'vitest'
import { projectArtFiles, projectFiles } from './template'

describe('projectFiles', () => {
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
