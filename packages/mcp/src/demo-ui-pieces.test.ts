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
        const findings = validated['findings'] as Array<{ code: string; file: string; ref?: string }>

        expect(findings.filter((finding) => finding.code === 'unknown-ui-piece')).toEqual([])
        for (const piece of ['damage-number', 'health-bar']) {
          expect(await exists(path.join(project, 'src/ui', `${piece}.html`)), piece).toBe(true)
        }
      } finally {
        await client.close()
        await server.close()
      }
    },
  )
})
