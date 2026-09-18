import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { access } from 'node:fs/promises'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { createWaicaMcpServer } from './server.js'
import { cleanup, tempDir } from './test-helpers.js'

const roots: string[] = []
afterEach(async () => cleanup(...roots.splice(0)))

type ToolResult = Awaited<ReturnType<Client['callTool']>>

function jsonResult(result: ToolResult): Record<string, unknown> {
  if ('toolResult' in result) throw new Error('unexpected task result')
  const text = result.content.find((item) => item.type === 'text')
  if (!text || text.type !== 'text') throw new Error('missing JSON text result')
  return JSON.parse(text.text) as Record<string, unknown>
}

async function exists(file: string): Promise<boolean> {
  return access(file).then(
    () => true,
    () => false,
  )
}

type Archetype = 'platformer' | 'topdown' | 'isometric'
type Finding = { code: string; file: string; ref?: string }

/** A fresh create_project demo for `archetype`, and validate_project's findings for it. */
async function createAndValidateDemo(archetype: Archetype): Promise<{ project: string; findings: Finding[] }> {
  const parent = await tempDir()
  roots.push(parent)
  const project = path.join(parent, `${archetype}-demo`)
  const server = createWaicaMcpServer()
  const client = new Client({ name: 'waica-mcp-test', version: '1.0.0' })
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)])
  try {
    const created = await client.callTool({
      name: 'create_project',
      arguments: { project_path: project, start: 'demo', archetype },
    })
    expect('toolResult' in created ? undefined : created.isError, JSON.stringify(created)).not.toBe(true)

    const validated = jsonResult(
      await client.callTool({ name: 'validate_project', arguments: { project_path: project } }),
    )
    return { project, findings: validated['findings'] as Finding[] }
  } finally {
    await client.close()
    await server.close()
  }
}

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
      const { project, findings } = await createAndValidateDemo(archetype)

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
      const { findings } = await createAndValidateDemo(archetype)
      const undeclared = findings.filter((finding) => finding.code === 'undeclared-stat')

      expect(undeclared.filter((finding) => STOCK_ANCHORED_FILES.includes(finding.file))).toEqual([])
      expect(
        undeclared.some((finding) => finding.file === 'src/ui/npc-line.html' && finding.ref === 'npcLine'),
      ).toBe(SHIPS_NPC_LINE[archetype])
    },
  )
})
