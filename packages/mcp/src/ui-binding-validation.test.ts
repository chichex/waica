import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, makeProject, stubPackage } from './test-helpers.js'
import { validateProject, type ValidationFinding } from './validation.js'

const roots: string[] = []
afterEach(async () => cleanup(...roots.splice(0)))

async function project(files: Readonly<Record<string, string>>): Promise<string> {
  const root = await makeProject(files)
  roots.push(root)
  return root
}

function orc(health: Record<string, unknown>): string {
  return JSON.stringify({
    waicaPrefab: 1,
    type: 'character',
    components: [{ type: 'Health', props: health }],
  })
}

function bindingWarnings(findings: ValidationFinding[]): Array<Pick<ValidationFinding, 'file' | 'ref'>> {
  return findings
    .filter((finding) => finding.code === 'undeclared-stat' && finding.file.startsWith('src/ui/'))
    .map(({ file, ref }) => ({ file, ref }))
}

/**
 * Deviation D1 of spec issue #72: a piece some component names through a
 * ref: 'ui' param is an Anchored Piece, whose {{bindings}} may be the
 * instance's own values rather than Game stats, so they are not reported as
 * undeclared stats. Every other piece keeps the stat check.
 */
describe('validateProject UI piece bindings', () => {
  it('does not report the bindings of a piece a prefab names through a ref: \'ui\' param', async () => {
    const root = await project({
      'src/characters/orc.character.json': orc({ damageNumber: 'hit-number' }),
      'src/ui/hit-number.html': '<div class="n">-{{amount}}</div>',
      'src/ui/npc-line.html': '<p>{{npcLine}}</p>',
    })

    const result = await validateProject(root)

    expect(bindingWarnings(result.findings)).toEqual([
      { file: 'src/ui/npc-line.html', ref: 'npcLine' },
    ])
  })

  it('still reports the bindings of the same piece when nothing names it', async () => {
    const root = await project({
      'src/characters/orc.character.json': orc({ damageNumber: '' }),
      'src/ui/hit-number.html': '<div class="n">-{{amount}}</div>',
    })

    const result = await validateProject(root)

    expect(bindingWarnings(result.findings)).toEqual([
      { file: 'src/ui/hit-number.html', ref: 'amount' },
    ])
  })

  it('does not report the bindings of a piece only a scene names', async () => {
    const root = await project({
      'src/characters/orc.character.json': orc({}),
      'src/ui/hit-number.html': '<div class="n">-{{amount}}</div>',
      'src/ui/hp-bar.html': '<div>{{current}}/{{max}}</div>',
      'src/scenes/main.scene.json': JSON.stringify({
        waicaScene: 3,
        entities: [
          { name: 'Orc', prefab: 'characters/orc', overrides: { Health: { healthBar: 'hp-bar' } } },
          { name: 'Slime', components: [{ type: 'Health', props: { damageNumber: 'hit-number' } }] },
        ],
      }),
    })

    const result = await validateProject(root)

    expect(bindingWarnings(result.findings)).toEqual([])
  })

  it('keeps UI binding findings after prefab findings and before scene findings', async () => {
    const root = await project({
      'src/characters/orc.character.json': orc({ damageNumber: 'missing-piece' }),
      'src/ui/hud.html': '<div>{{coins}}</div>',
      'src/scenes/main.scene.json': JSON.stringify({
        waicaScene: 3,
        camera: { follow: 'Nobody' },
        entities: [],
      }),
    })

    const result = await validateProject(root)

    expect(result.findings.map(({ code, file }) => `${code} ${file}`)).toEqual([
      'unknown-ui-piece src/characters/orc.character.json',
      'undeclared-stat src/ui/hud.html',
      'camera-follow-unknown-entity src/scenes/main.scene.json',
    ])
  })
})

/** One stock-named piece per binding kind, plus the npc-line screen piece. */
const STOCK_NAMED_PIECES: Readonly<Record<string, string>> = {
  'src/ui/npc-bubble.html': '<div class="bubble">{{line}}</div>',
  'src/ui/interact-prompt.html': '<div class="prompt">Press {{key}}</div>',
  'src/ui/damage-number.html': '<div class="n">-{{amount}}</div>',
  'src/ui/health-bar.html': '<div>{{current}}/{{max}}</div>',
  'src/ui/npc-line.html': '<p>{{npcLine}}</p>',
}

/**
 * Review round 2 of PR #94: the stock Anchored Pieces @waica/behaviors
 * ships (ANCHORED_UI_PIECES) are attached by fixed name — Interactable's
 * npc-bubble and interact-prompt — or through a ref: 'ui' param a demo may
 * not set, so their bindings are exempt by name. The list comes from the
 * project's installed @waica/behaviors (ADR 0001).
 */
describe('validateProject stock Anchored Piece bindings', () => {
  it('does not report the bindings of a stock Anchored Piece that nothing names, but still reports npc-line', async () => {
    const root = await project(STOCK_NAMED_PIECES)

    const result = await validateProject(root)

    expect(bindingWarnings(result.findings)).toEqual([
      { file: 'src/ui/npc-line.html', ref: 'npcLine' },
    ])
  })

  it('reads the stock names from the @waica/behaviors the project has installed', async () => {
    const root = await project({
      'src/ui/speech.html': '<div>{{line}}</div>',
      'src/ui/npc-bubble.html': '<div>{{line}}</div>',
    })
    await stubPackage(root, '@waica/behaviors', {
      root: "module.exports = { ANCHORED_UI_PIECES: ['speech'] }\n",
    })

    const result = await validateProject(root)

    expect(bindingWarnings(result.findings)).toEqual([
      { file: 'src/ui/npc-bubble.html', ref: 'line' },
    ])
  })

  it('treats an installed @waica/behaviors without ANCHORED_UI_PIECES as naming no stock piece', async () => {
    const root = await project(STOCK_NAMED_PIECES)
    await stubPackage(root, '@waica/behaviors')

    const result = await validateProject(root)

    expect(bindingWarnings(result.findings)).toEqual([
      { file: 'src/ui/damage-number.html', ref: 'amount' },
      { file: 'src/ui/health-bar.html', ref: 'current' },
      { file: 'src/ui/health-bar.html', ref: 'max' },
      { file: 'src/ui/interact-prompt.html', ref: 'key' },
      { file: 'src/ui/npc-bubble.html', ref: 'line' },
      { file: 'src/ui/npc-line.html', ref: 'npcLine' },
    ])
  })
})
