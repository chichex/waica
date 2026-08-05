import { afterEach, describe, expect, it } from 'vitest'
import { readFile, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { cleanup, makeProject, stubPackage, writeTree } from './test-helpers.js'
import {
  describeArchetype,
  listComponents,
  projectSummary,
} from './introspection.js'

const roots: string[] = []
afterEach(async () => cleanup(...roots.splice(0)))

describe('listComponents', () => {
  it('describes all 13 platformer classes and only the three declared display names', async () => {
    const project = await makeProject({
      'src/components/dash.ts': `export class Dash { static componentName = 'Dash' }\n`,
      'src/roles/guard.ts': `// project role\n`,
      'src/states/stunned.ts': `// project state\n`,
      'src/components/readme.md': 'ignored',
    })
    roots.push(project)

    const result = await listComponents(project)

    expect(result.components).toHaveLength(13)
    expect(result.components.map((component) => component.componentName)).toEqual(
      expect.arrayContaining([
        'Sprite',
        'AnimatedSprite',
        'Solid',
        'Hitbox',
        'DynamicBody',
        'StateMachine',
        'PlatformerMotor',
        'Collectible',
        'Patrol',
        'Chaser',
        'Hazard',
        'Respawnable',
        'Lifetime',
      ]),
    )
    expect(
      result.components
        .filter((component) => component.displayName !== undefined)
        .map(({ componentName, displayName }) => ({ componentName, displayName })),
    ).toEqual([
      { componentName: 'StateMachine', displayName: 'State Machine' },
      { componentName: 'PlatformerMotor', displayName: 'Motor' },
      { componentName: 'Respawnable', displayName: 'Respawn' },
    ])
    expect(result.components.find((component) => component.componentName === 'Chaser')).toMatchObject({
      params: {
        mode: { label: 'Mode', options: ['walker', 'ghost', 'flyer'] },
        range: { label: 'Sight range', min: 1, max: 30, step: 0.5 },
      },
      defaults: { mode: 'walker', range: 6, speed: 3, gravity: 42 },
      sourcePackage: '@waica/behaviors',
    })
    expect(result.components.find((component) => component.componentName === 'Sprite')).toMatchObject({
      sourcePackage: '@waica/engine',
    })
    expect(result.projectOwned).toEqual([
      { path: 'src/components/dash.ts', validated: false },
      { path: 'src/roles/guard.ts', validated: false },
      { path: 'src/states/stunned.ts', validated: false },
    ])
    expect(result.provenance.map((row) => row.package)).toEqual([
      '@waica/engine',
      '@waica/behaviors',
      '@waica/archetype-platformer',
    ])
  })

  it('attributes mixed-source components by their stable package contract', async () => {
    const project = await makeProject()
    roots.push(project)
    await stubPackage(project, '@waica/engine', {
      root: `class Sprite { static componentName = 'Sprite' }\nmodule.exports = { Sprite }\n`,
    })

    const result = await listComponents(project)

    expect(result.components.find((component) => component.componentName === 'Sprite')).toMatchObject({
      sourcePackage: '@waica/engine',
    })
  })

  it('keeps answering with a warning when project package.json is malformed', async () => {
    const project = await makeProject({ 'package.json': '{' })
    roots.push(project)

    const result = await listComponents(project)

    expect(result.components).toHaveLength(13)
    expect(result.warnings.join('\n')).toMatch(/package\.json.*parse|parse.*package\.json/i)
  })

  it('uses empty defaults when a registry constructor throws', async () => {
    const project = await makeProject()
    roots.push(project)
    const manifest = `
class Explodes { static componentName = 'Explodes'; constructor() { throw new Error('boom') } }
module.exports.ARCHETYPE = {
  id: 'fixture', label: 'Fixture', scene: { waicaScene: 3, entities: [] },
  blankScene: { waicaScene: 3, entities: [] },
  registry: { components: { Explodes }, prefabs: {}, ui: {} }, palette: [], prefabs: {}, art: [],
  entityIcons: {}, bindings: {}, actionLabels: {}, bundle: { roles: {} }
}
`
    await stubPackage(project, '@waica/archetype-fixture', { manifest })
    const pkgPath = path.join(project, 'package.json')
    const pkg = JSON.parse(await readFile(pkgPath, 'utf8')) as { dependencies: Record<string, string> }
    pkg.dependencies['@waica/archetype-fixture'] = '^9.0.0'
    await writeFile(pkgPath, JSON.stringify(pkg))
    await writeFile(
      path.join(project, 'src/game.json'),
      JSON.stringify({ waicaGame: 1, archetype: 'fixture' }),
    )

    const result = await listComponents(project)
    expect(result.components).toEqual([
      {
        componentName: 'Explodes',
        params: {},
        defaults: {},
        sourcePackage: '@waica/archetype-fixture',
      },
    ])
  })
})

describe('describeArchetype', () => {
  it('returns the fully enumerated active manifest schema', async () => {
    const project = await makeProject()
    roots.push(project)

    const result = await describeArchetype(project)

    expect(result.activeArchetype).toBe('platformer')
    expect(result.archetype).toMatchObject({
      id: 'platformer',
      label: 'Platformer',
      palette: expect.arrayContaining([
        { name: 'player', components: ['AnimatedSprite', 'PlatformerMotor', 'StateMachine', 'Hitbox', 'Respawnable'] },
      ]),
      prefabs: expect.arrayContaining([
        {
          ref: 'characters/player',
          type: 'character',
          components: ['AnimatedSprite', 'PlatformerMotor', 'StateMachine', 'Hitbox', 'Respawnable'],
        },
      ]),
      roles: expect.arrayContaining([
        {
          name: 'player',
          description: expect.any(String),
          driver: 'PlatformerMotor',
          signals: expect.objectContaining({ move: expect.any(String), land: expect.any(String) }),
          graph: expect.objectContaining({ initial: 'idle', states: expect.any(Object) }),
        },
      ]),
      bindings: {
        left: ['ArrowLeft', 'KeyA'],
        right: ['ArrowRight', 'KeyD'],
        jump: ['Space', 'ArrowUp', 'KeyW'],
      },
      actionLabels: { left: 'Move left', right: 'Move right', jump: 'Jump' },
      ui: ['coin-counter'],
      art: [
        { file: 'waica-dog.png', uri: 'waica:dog' },
        { file: 'waica-coin.png', uri: 'waica:coin' },
        { file: 'waica-slime.png', uri: 'waica:slime' },
      ],
      entityIcons: { PlatformerMotor: '🐕', Collectible: '🪙', Hazard: '👾' },
    })
    expect(result.installedArchetypes).toEqual([])
  })

  it('discovers project dependency archetypes, honors the active id and lists the rest', async () => {
    const project = await makeProject()
    roots.push(project)
    const manifest = `
module.exports.ARCHETYPE = {
  id: 'fixture', label: 'Fixture World', scene: { waicaScene: 3, entities: [] },
  blankScene: { waicaScene: 3, entities: [] }, registry: { components: {}, prefabs: {}, ui: { panel: '<p />' } },
  palette: [], prefabs: {}, art: [{ file: 'fixture.png', uri: 'fixture:art' }], entityIcons: {},
  bindings: { act: ['KeyF'] }, actionLabels: { act: 'Act' }, bundle: { roles: {} }
}
`
    await stubPackage(project, '@waica/archetype-fixture', { version: '4.2.0', manifest })
    const pkgPath = path.join(project, 'package.json')
    const pkg = JSON.parse(await readFile(pkgPath, 'utf8')) as { dependencies: Record<string, string> }
    pkg.dependencies['@waica/archetype-fixture'] = '^4.2.0'
    await writeFile(pkgPath, JSON.stringify(pkg))
    await writeFile(
      path.join(project, 'src/game.json'),
      JSON.stringify({ waicaGame: 1, archetype: 'fixture' }),
    )

    const active = await describeArchetype(project)
    expect(active.archetype).toMatchObject({ id: 'fixture', label: 'Fixture World', ui: ['panel'] })
    expect(active.installedArchetypes).toEqual([
      { id: 'platformer', label: 'Platformer', status: 'installed, not active' },
    ])

    const explicit = await describeArchetype(project, 'platformer')
    expect(explicit.archetype.id).toBe('platformer')
    expect(explicit.activeArchetype).toBe('fixture')
  })

  it('skips an inactive declared archetype that is not installed', async () => {
    const project = await makeProject()
    roots.push(project)
    const pkgPath = path.join(project, 'package.json')
    const pkg = JSON.parse(await readFile(pkgPath, 'utf8')) as { dependencies: Record<string, string> }
    pkg.dependencies['@waica/archetype-not-installed'] = '^1.0.0'
    await writeFile(pkgPath, JSON.stringify(pkg))

    const result = await describeArchetype(project)

    expect(result.archetype.id).toBe('platformer')
    expect(result.warnings).toContain(
      'Declared archetype package @waica/archetype-not-installed is not installed; it was skipped.',
    )
  })

  it('isolates a broken inactive declared archetype', async () => {
    const project = await makeProject()
    roots.push(project)
    await stubPackage(project, '@waica/archetype-broken', {
      manifest: `throw new Error('broken inactive manifest')\n`,
    })
    const pkgPath = path.join(project, 'package.json')
    const pkg = JSON.parse(await readFile(pkgPath, 'utf8')) as { dependencies: Record<string, string> }
    pkg.dependencies['@waica/archetype-broken'] = '^9.0.0'
    await writeFile(pkgPath, JSON.stringify(pkg))

    const result = await describeArchetype(project)

    expect(result.archetype.id).toBe('platformer')
    expect(result.warnings.join('\n')).toMatch(
      /@waica\/archetype-broken.*broken inactive manifest/i,
    )
  })

  it('keeps describing the bundled archetype with a warning when package.json is malformed', async () => {
    const project = await makeProject({ 'package.json': '{' })
    roots.push(project)

    const result = await describeArchetype(project)

    expect(result.archetype.id).toBe('platformer')
    expect(result.warnings.join('\n')).toMatch(/package\.json.*parse|parse.*package\.json/i)
  })

  it('does not silently use platformer when game.json is missing', async () => {
    const project = await makeProject({
      'src/scenes/main.scene.json': JSON.stringify({ waicaScene: 3, entities: [] }),
    })
    roots.push(project)
    await rm(path.join(project, 'src/game.json'))

    await expect(describeArchetype(project)).rejects.toThrow(/active archetype|game\.json/i)
    await expect(listComponents(project)).rejects.toThrow(/active archetype|game\.json/i)
  })

  it('does not silently use platformer when game.json is malformed', async () => {
    const project = await makeProject({ 'src/game.json': '{' })
    roots.push(project)
    await expect(describeArchetype(project)).rejects.toThrow(/src\/game\.json.*parse|parse.*src\/game\.json/i)
  })

  it('rejects unknown ids and names every available id', async () => {
    const project = await makeProject()
    roots.push(project)
    await expect(describeArchetype(project, 'topdown')).rejects.toThrow(
      /topdown.*platformer|platformer.*topdown/i,
    )
  })
})

describe('projectSummary', () => {
  it('treats valid JSON null values as empty tolerant inputs', async () => {
    const project = await makeProject({
      'src/game.json': 'null',
      'src/stats.json': 'null',
      'src/controls.json': 'null',
    })
    roots.push(project)

    expect(await projectSummary(project)).toMatchObject({
      archetype: null,
      stats: [],
      controls: {},
    })
  })

  it('deeply summarizes only the documented plain-file sources', async () => {
    const project = await makeProject({
      'src/scenes/main.scene.json': JSON.stringify({ waicaScene: 3, entities: [] }),
      'src/scenes/bonus.scene.json': JSON.stringify({ waicaScene: 3, entities: [] }),
      'src/characters/hero.character.json': JSON.stringify({ waicaPrefab: 1, type: 'character', components: [] }),
      'src/objects/key.object.json': JSON.stringify({ waicaPrefab: 1, type: 'object', components: [] }),
      'src/tiles/wall.tile.json': JSON.stringify({ waicaPrefab: 1, type: 'tile', components: [] }),
      'src/components/dash.ts': '',
      'src/roles/guard.ts': '',
      'src/states/stunned.ts': '',
      'src/ui/hud.html': '<p />',
      'src/stats.json': JSON.stringify({ waicaStats: 1, stats: { lives: 3, points: 0 } }),
      'src/controls.json': JSON.stringify({ waicaControls: 1, bindings: { jump: ['Space'], dash: ['KeyE'] } }),
    })
    roots.push(project)

    expect(await projectSummary(project)).toMatchObject({
      archetype: 'platformer',
      scenes: ['bonus.scene.json', 'main.scene.json'],
      prefabs: [
        { ref: 'characters/hero', type: 'character' },
        { ref: 'objects/key', type: 'object' },
        { ref: 'tiles/wall', type: 'tile' },
      ],
      components: ['dash.ts'],
      roles: ['guard.ts'],
      states: ['stunned.ts'],
      ui: ['hud.html'],
      stats: ['lives', 'points'],
      controls: { dash: ['KeyE'], jump: ['Space'] },
    })
  })
})
