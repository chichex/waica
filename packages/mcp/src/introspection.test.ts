import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { fallbackEntriesFor } from './project-component-fallbacks.js'
import { readFile, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { cleanup, makeProject, stubPackage, writeTree } from './test-helpers.js'
import {
  describeArchetype,
  listComponents,
  projectSummary,
} from './introspection.js'
import { defined, match } from '../../engine/src/test-support.js'

// A checkout without built @waica dists compiles the package sources once per
// process before its first project-component load (project-component-fallbacks.ts).
// Paid here, bounded like the compile itself, so it never lands inside a test's
// own timeout — the same guard as server.test.ts (PR #149).
beforeAll(() => fallbackEntriesFor('project-component-runner.ts'), 120_000)

const roots: string[] = []
afterEach(async () => cleanup(...roots.splice(0)))

const EXPECTED_PARTICLE_DEFAULTS = {
  rate: 0,
  emitting: true,
  lifetime: 1,
  positionSpread: [0, 0],
  velocity: [0, 0],
  velocitySpread: [0, 0],
  gravity: [0, 0],
  space: 'world',
  seed: 1,
  capacity: 256,
  overflow: 'recycle-oldest',
  destroyMode: 'clear',
  width: 1,
  height: 1,
  startScale: 1,
  endScale: 1,
  startColor: 0xffffff,
  endColor: 0xffffff,
  startAlpha: 1,
  endAlpha: 0,
  texture: '',
  pixelArt: false,
  blend: 'normal',
  layer: 0,
}

describe('listComponents', () => {
  it('describes all 23 platformer classes (Light since issue #78, Model, Sun and PointLight since issue #154, Collider and RigidBody since issue #159) and only the six declared display names', async () => {
    const project = await makeProject({
      'src/components/dash.ts': `export class Dash { static componentName = 'Dash' }\n`,
      'src/roles/guard.ts': `// project role\n`,
      'src/states/stunned.ts': `// project state\n`,
      'src/components/readme.md': 'ignored',
    })
    roots.push(project)

    const result = await listComponents(project)

    expect(result.components).toHaveLength(24)
    expect(result.components.map((component) => component.componentName)).toEqual(
      expect.arrayContaining([
        'Sprite',
        'AnimatedSprite',
        'ParticleEmitter',
        'Light',
        'Model',
        'Sun',
        'PointLight',
        'Collider',
        'RigidBody',
        'Solid',
        'Hitbox',
        'DynamicBody',
        'StateMachine',
        'PlatformerMotor',
        'DustPuffs',
        'Collectible',
        'Patrol',
        'Chaser',
        'Hazard',
        'Health',
        'Respawnable',
        'OutOfBounds',
        'Lifetime',
        'SceneTransition',
      ]),
    )
    expect(
      result.components
        .filter((component) => component.displayName !== undefined)
        .map(({ componentName, displayName }) => ({ componentName, displayName })),
    ).toEqual([
      { componentName: 'ParticleEmitter', displayName: 'Particle Emitter' },
      { componentName: 'PointLight', displayName: 'Point light (3D)' },
      { componentName: 'StateMachine', displayName: 'State Machine' },
      { componentName: 'PlatformerMotor', displayName: 'Motor' },
      { componentName: 'DustPuffs', displayName: 'Dust puffs' },
      { componentName: 'Respawnable', displayName: 'Respawn' },
      { componentName: 'OutOfBounds', displayName: 'Out of bounds' },
    ])
    expect(result.components.find((component) => component.componentName === 'Chaser')).toMatchObject({
      params: {
        mode: { label: 'Mode', options: ['walker', 'ghost', 'flyer'] },
        range: { label: 'Sight range', min: 1, max: 30, step: 0.5 },
      },
      defaults: { mode: 'walker', range: 6, speed: 3, gravity: 42 },
      sourcePackage: '@waica/behaviors',
    })
    expect(result.components.find((component) => component.componentName === 'DustPuffs')).toMatchObject({
      params: {
        jumpCount: { label: 'Jump puff', min: 0, max: 64, step: 1 },
        landCount: { label: 'Landing burst', min: 0, max: 64, step: 1 },
      },
      defaults: { jumpCount: 5, landCount: 12 },
      sourcePackage: '@waica/behaviors',
    })
    expect(result.components.find((component) => component.componentName === 'Collectible')).toMatchObject({
      params: {
        stat: { label: 'Adds to stat', ref: 'stat' },
      },
    })
    expect(
      result.components.find((component) => component.componentName === 'SceneTransition'),
    ).toMatchObject({
      params: {
        scene: { label: 'Scene' },
        trigger: { label: 'Trigger', options: ['overlap', 'interact'] },
      },
      defaults: { scene: '', trigger: 'overlap' },
      sourcePackage: '@waica/behaviors',
    })
    expect(result.components.find((component) => component.componentName === 'Sprite')).toMatchObject({
      sourcePackage: '@waica/engine',
      defaults: { color: 0xffffff, shape: 'rectangle', width: 1, height: 1 },
    })
    expect(result.components.find((component) => component.componentName === 'ParticleEmitter')).toMatchObject({
      sourcePackage: '@waica/engine',
      params: {
        positionSpread: { label: 'Position spread', kind: 'vector2' },
        startColor: { label: 'Start color', kind: 'color' },
        texture: { label: 'Texture', kind: 'texture' },
        blend: { label: 'Blend', options: ['normal', 'additive'] },
      },
      defaults: EXPECTED_PARTICLE_DEFAULTS,
    })
    expect(result.components.find((component) => component.componentName === 'Hitbox')).toMatchObject({
      params: {
        layer: { label: 'Collision Layer' },
        collidesWith: { label: 'Collision Mask', kind: 'string-list' },
      },
      defaults: { layer: 'default', collidesWith: ['*'] },
      sourcePackage: '@waica/engine',
    })
    expect(
      result.components.some((component) =>
        Object.keys(component.defaults).some((key) => key.startsWith('_')),
      ),
    ).toBe(false)
    const motorDefaults = defined(result.components.find(
      (component) => component.componentName === 'PlatformerMotor',
    )).defaults
    expect(motorDefaults).toMatchObject({ moveSpeed: 9, hitboxWidth: 0.9, hitboxHeight: 0.95 })
    expect(motorDefaults).not.toHaveProperty('coyoteTimer')
    expect(motorDefaults).not.toHaveProperty('grounded')
    for (const component of result.components) {
      expect(JSON.parse(JSON.stringify(component.defaults))).toEqual(component.defaults)
      expect(component.updates).toEqual(expect.any(Boolean))
      expect(component.updateAfter).toEqual(expect.any(Array))
      expect(['2d', '3d', 'both'], component.componentName).toContain(component.space)
    }
    expect(result.components.find(({ componentName }) => componentName === 'AnimatedSprite')).toMatchObject({
      updates: true,
      updateAfter: ['StateMachine'],
      space: '2d',
    })
    expect(result.components.find(({ componentName }) => componentName === 'OutOfBounds')).toMatchObject({
      updates: true,
      updateAfter: ['DynamicBody', 'Health', 'StateMachine'],
      space: 'both',
    })
    expect(result.components.find(({ componentName }) => componentName === 'PlatformerMotor')).toMatchObject({
      updates: false,
      updateAfter: [],
      space: '2d',
    })
    expect(result.components.find(({ componentName }) => componentName === 'Model')).toMatchObject({ space: '3d' })
    expect(result.projectOwned).toEqual([
      { path: 'src/components/dash.ts', validated: false },
      { path: 'src/roles/guard.ts', validated: false },
      { path: 'src/states/stunned.ts', validated: false },
    ])
    expect(result.provenance.map((row) => row.package)).toEqual([
      '@waica/engine',
      '@waica/behaviors',
      '@waica/archetype-isometric',
      '@waica/archetype-platformer',
      '@waica/archetype-topdown',
    ])
  })

  it('keeps project-owned code textual and never executes it', async () => {
    const project = await makeProject({
      'src/components/explodes.ts': `throw new Error('list_components executed project code')\n`,
    })
    roots.push(project)

    const result = await listComponents(project)

    expect(result.projectOwned).toContainEqual({
      path: 'src/components/explodes.ts',
      validated: false,
    })
    expect(result.components).toHaveLength(24)
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
    await stubPackage(project, '@waica/engine')

    const result = await listComponents(project)

    expect(result.components).toHaveLength(24)
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
        updates: false,
        updateAfter: [],
        space: 'both',
        sourcePackage: '@waica/archetype-fixture',
      },
    ])
  })
})

/** The stock platformer player prefab, dust emitter and its DustPuffs cue included. */
const PLATFORMER_PLAYER_COMPONENTS = [
  'AnimatedSprite',
  'PlatformerMotor',
  'StateMachine',
  'Hitbox',
  'Respawnable',
  'Health',
  'OutOfBounds',
  'ParticleEmitter',
  'DustPuffs',
] as const

describe('describeArchetype', () => {
  it('returns the fully enumerated active manifest schema', async () => {
    const project = await makeProject()
    roots.push(project)

    const result = await describeArchetype(project)

    expect(result.activeArchetype).toBe('platformer')
    expect(result.archetype).toMatchObject({
      id: 'platformer',
      label: 'Platformer',
      palette: match.arrayContaining([
        {
          name: 'player',
          components: [...PLATFORMER_PLAYER_COMPONENTS],
        },
      ]),
      prefabs: match.arrayContaining([
        {
          ref: 'characters/player',
          type: 'character',
          components: [...PLATFORMER_PLAYER_COMPONENTS],
        },
      ]),
      roles: match.arrayContaining([
        {
          name: 'player',
          description: match.any(String),
          driver: 'PlatformerMotor',
          signals: match.objectContaining({ move: match.any(String), land: match.any(String) }),
          graph: match.objectContaining({ initial: 'idle', states: match.any(Object) }),
        },
      ]),
      bindings: {
        // Raw strings, pad codes included (issue #75 CA-14, CA-15).
        left: ['ArrowLeft', 'KeyA', 'Gamepad:LeftStickLeft', 'Gamepad:DPadLeft'],
        right: ['ArrowRight', 'KeyD', 'Gamepad:LeftStickRight', 'Gamepad:DPadRight'],
        jump: ['Space', 'ArrowUp', 'KeyW', 'Gamepad:A'],
      },
      actionLabels: { left: 'Move left', right: 'Move right', jump: 'Jump' },
      ui: ['coin-counter', 'damage-number', 'health-bar'],
      art: [
        { file: 'waica-dog.png', uri: 'waica:dog' },
        { file: 'waica-coin.png', uri: 'waica:coin' },
        { file: 'waica-slime.png', uri: 'waica:slime' },
      ],
      entityIcons: { PlatformerMotor: '🐕', Collectible: '🪙', Hazard: '👾' },
    })
    expect(result.installedArchetypes).toEqual([
      { id: 'isometric', label: 'Isometric', status: 'installed, not active' },
      { id: 'topdown', label: 'Top-down', status: 'installed, not active' },
    ])
  })

  it('CA-14: every art entry carries its kind, so a caller can tell a sound from a sprite', async () => {
    const project = await makeProject()
    roots.push(project)

    const result = await describeArchetype(project, 'isometric')

    const art = result.archetype.art as Array<{ file: string; uri: string; kind: string }>
    expect(art.length).toBeGreaterThan(0)
    for (const entry of art) expect(['image', 'sound']).toContain(entry.kind)
    expect(art.filter((entry) => entry.kind === 'sound')).toHaveLength(4)
    expect(art).toContainEqual({
      file: 'waica-iso-sword-swing.ogg',
      uri: 'waica:iso-sword-swing',
      kind: 'sound',
    })
    expect(art).toContainEqual({ file: 'waica-iso-hero.png', uri: 'waica:iso-hero', kind: 'image' })
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
      { id: 'isometric', label: 'Isometric', status: 'installed, not active' },
      { id: 'platformer', label: 'Platformer', status: 'installed, not active' },
      { id: 'topdown', label: 'Top-down', status: 'installed, not active' },
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

  it('surfaces the original failure when the broken declared archetype is active', async () => {
    const project = await makeProject()
    roots.push(project)
    await stubPackage(project, '@waica/archetype-broken', {
      manifest: `throw new Error('broken active manifest')\n`,
    })
    const pkgPath = path.join(project, 'package.json')
    const pkg = JSON.parse(await readFile(pkgPath, 'utf8')) as { dependencies: Record<string, string> }
    pkg.dependencies['@waica/archetype-broken'] = '^9.0.0'
    await writeFile(pkgPath, JSON.stringify(pkg))
    await writeFile(
      path.join(project, 'src/game.json'),
      JSON.stringify({ waicaGame: 1, archetype: 'broken' }),
    )

    await expect(describeArchetype(project)).rejects.toThrow(
      /@waica\/archetype-broken.*broken active manifest/i,
    )
  })

  it('keeps describing the bundled archetype with a warning when package.json is malformed', async () => {
    const project = await makeProject({ 'package.json': '{' })
    roots.push(project)
    await stubPackage(project, '@waica/engine')

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

  it.each([
    ['topdown', 'Top-down'],
    ['isometric', 'Isometric'],
  ])('resolves bundled %s in any project', async (id, label) => {
    const project = await makeProject()
    roots.push(project)
    const result = await describeArchetype(project, id)
    expect(result.archetype).toMatchObject({ id, label })
    expect(result.activeArchetype).toBe('platformer')
  })

  it('rejects unknown ids and names every available id', async () => {
    const project = await makeProject()
    roots.push(project)
    await expect(describeArchetype(project, 'flipscreen')).rejects.toThrow(
      /flipscreen.*isometric.*platformer.*topdown/i,
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
