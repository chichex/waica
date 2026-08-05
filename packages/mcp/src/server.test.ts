import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, makeProject, tempDir } from './test-helpers.js'
import { createWaicaMcpServer } from './server.js'

const TOOL_NAMES = [
  'create_project',
  'list_components',
  'describe_archetype',
  'project_summary',
  'validate_project',
  'scaffold_component',
  'scaffold_role',
  'scaffold_state',
  'scaffold_ui',
]

const OPERATING_TOOLS = TOOL_NAMES.filter((name) => name !== 'create_project')

function argumentsFor(name: string, projectPath: string): Record<string, unknown> {
  const specific: Record<string, Record<string, unknown>> = {
    create_project: { start: 'blank' },
    list_components: {},
    describe_archetype: {},
    project_summary: {},
    validate_project: {},
    scaffold_component: { name: 'dash' },
    scaffold_role: { role: 'guard' },
    scaffold_state: { role: 'player', state: 'dash' },
    scaffold_ui: { name: 'score' },
  }
  return { project_path: projectPath, ...specific[name] }
}

const roots: string[] = []
afterEach(async () => cleanup(...roots.splice(0)))

async function connectedPair(): Promise<{
  client: Client
  close: () => Promise<void>
}> {
  const server = createWaicaMcpServer()
  const client = new Client({ name: 'waica-mcp-test', version: '1.0.0' })
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)])
  return {
    client,
    close: async () => {
      await client.close()
      await server.close()
    },
  }
}

function jsonResult(result: Awaited<ReturnType<Client['callTool']>>): Record<string, unknown> {
  if ('toolResult' in result) throw new Error('unexpected task result')
  const text = result.content.find((item) => item.type === 'text')
  if (!text || text.type !== 'text') throw new Error('missing JSON text result')
  return JSON.parse(text.text) as Record<string, unknown>
}

describe('MCP server', () => {
  it('registers exactly the nine tools with concrete JSON schemas', async () => {
    const pair = await connectedPair()
    try {
      const listed = await pair.client.listTools()
      expect(listed.tools.map((tool) => tool.name).sort()).toEqual([...TOOL_NAMES].sort())
      for (const tool of listed.tools) {
        expect(tool.inputSchema.type).toBe('object')
        expect(tool.inputSchema.properties).toHaveProperty('project_path')
        expect(tool.inputSchema.required).toContain('project_path')
        expect(tool.description).toBeTruthy()
      }
      const byName = new Map(listed.tools.map((tool) => [tool.name, tool]))
      for (const name of ['list_components', 'describe_archetype', 'validate_project']) {
        expect(byName.get(name)?.annotations?.readOnlyHint).not.toBe(true)
      }
      expect(byName.get('project_summary')?.annotations?.readOnlyHint).toBe(true)
    } finally {
      await pair.close()
    }
  })

  it('round-trips a tool call over the SDK transport', async () => {
    const project = await makeProject({
      'src/scenes/main.scene.json': JSON.stringify({ waicaScene: 3, entities: [] }),
    })
    roots.push(project)
    const pair = await connectedPair()
    try {
      const result = await pair.client.callTool({
        name: 'project_summary',
        arguments: { project_path: project },
      })
      expect('toolResult' in result ? undefined : result.isError).not.toBe(true)
      expect(jsonResult(result)).toMatchObject({ archetype: 'platformer', scenes: ['main.scene.json'] })
    } finally {
      await pair.close()
    }
  })

  it.each(TOOL_NAMES)('%s rejects relative project paths with the stdio cwd explanation', async (name) => {
    const pair = await connectedPair()
    try {
      const result = await pair.client.callTool({
        name,
        arguments: argumentsFor(name, 'relative-game'),
      })
      expect('toolResult' in result ? undefined : result.isError).toBe(true)
      expect(jsonResult(result)).toEqual({
        error: {
          code: 'absolute-project-path-required',
          message:
            'project_path must be absolute because a stdio server\'s working directory belongs to the agent host, not the game project.',
          projectPath: 'relative-game',
        },
        provenance: [],
      })
    } finally {
      await pair.close()
    }
  })

  it.each(OPERATING_TOOLS)(
    '%s uses one cannot-operate error shape for missing and non-project directories',
    async (name) => {
      const parent = await tempDir()
      const nonProject = await tempDir()
      roots.push(parent, nonProject)
      const missing = `${parent}/missing`
      const pair = await connectedPair()
      try {
        const missingResult = await pair.client.callTool({
          name,
          arguments: argumentsFor(name, missing),
        })
        const nonProjectResult = await pair.client.callTool({
          name,
          arguments: argumentsFor(name, nonProject),
        })
        expect(jsonResult(missingResult)).toMatchObject({
          error: { code: 'cannot-operate', reason: 'missing-path', projectPath: missing },
          provenance: [],
        })
        expect(jsonResult(nonProjectResult)).toMatchObject({
          error: { code: 'cannot-operate', reason: 'not-waica-project', projectPath: nonProject },
          provenance: [],
        })
        expect(Object.keys(jsonResult(missingResult).error as object).sort()).toEqual(
          Object.keys(jsonResult(nonProjectResult).error as object).sort(),
        )
      } finally {
        await pair.close()
      }
    },
  )
})
