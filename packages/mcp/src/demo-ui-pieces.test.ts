import { access } from 'node:fs/promises'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, createAndValidateDemo } from './test-helpers.js'

const roots: string[] = []
afterEach(async () => cleanup(...roots.splice(0)))

async function exists(file: string): Promise<boolean> {
  return access(file).then(
    () => true,
    () => false,
  )
}

type Archetype = 'platformer' | 'topdown' | 'isometric'

/**
 * Issue #72, CA-18: a demo created through create_project names only UI
 * pieces it ships. The isometric orc and the platformer slime name the
 * stock Health pieces through ref: 'ui' params, so the archetype has to
 * ship those pieces for validate_project to stay quiet about them; every
 * archetype ships them (grill S10), whether or not its demo names one.
 */
describe('create_project demos and their ref: \'ui\' pieces', () => {
  it.each(['platformer', 'topdown', 'isometric'] as const)(
    'the %s demo reports no unknown-ui-piece and carries the stock Health pieces',
    async (archetype) => {
      const { project, findings } = await createAndValidateDemo(archetype, roots)

      expect(findings.filter((finding) => finding.code === 'unknown-ui-piece')).toEqual([])
      for (const piece of ['damage-number', 'health-bar']) {
        expect(await exists(path.join(project, 'src/ui', `${piece}.html`)), piece).toBe(true)
      }
    },
  )
})

/** Where each archetype ships the stock Anchored Pieces, and whether it ships npc-line. */
const STOCK_ANCHORED_FILES = [
  'src/ui/npc-bubble.html',
  'src/ui/interact-prompt.html',
  'src/ui/damage-number.html',
  'src/ui/health-bar.html',
]
const SHIPS_NPC_LINE: Readonly<Record<Archetype, boolean>> = {
  platformer: false,
  topdown: true,
  isometric: true,
}

/**
 * Review round 2 of PR #94: the stock Anchored Pieces' bindings are
 * per-instance values (the NPC's line, the interact key, the hit's amount),
 * so a fresh demo reports no undeclared-stat for them, whether or not
 * anything names them through a ref: 'ui' param. npc-line is a screen piece
 * bound to the npcLine stat and keeps its warning.
 */
describe('create_project demos and the stock Anchored Pieces\' bindings', () => {
  it.each(['platformer', 'topdown', 'isometric'] as const)(
    'the %s demo reports no undeclared-stat for a stock Anchored Piece, and keeps npc-line\'s',
    async (archetype) => {
      const { findings } = await createAndValidateDemo(archetype, roots)
      const undeclared = findings.filter((finding) => finding.code === 'undeclared-stat')

      expect(undeclared.filter((finding) => STOCK_ANCHORED_FILES.includes(finding.file))).toEqual([])
      expect(
        undeclared.some((finding) => finding.file === 'src/ui/npc-line.html' && finding.ref === 'npcLine'),
      ).toBe(SHIPS_NPC_LINE[archetype])
    },
  )
})
