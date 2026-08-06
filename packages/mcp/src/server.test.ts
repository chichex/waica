import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
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
  'scaffold_prefab',
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
    scaffold_prefab: { name: 'bullet', type: 'object' },
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
  // The handshake is how a host learns which Waica it is driving. It answered
  // 0.1.0 through the 0.4.x releases because the number was a literal in
  // server.ts, so it has to come from the manifest of whatever ships the
  // server — packages/mcp here, the CLI once it vendors the build.
  it('reports the shipping package version in the handshake', async () => {
    const pair = await connectedPair()
    try {
      const { version } = JSON.parse(
        await readFile(path.resolve(import.meta.dirname, '../package.json'), 'utf8'),
      ) as { version: string }
      expect(pair.client.getServerVersion()).toEqual({ name: '@waica/mcp', version })
    } finally {
      await pair.close()
    }
  })

  it('registers exactly the ten tools with concrete JSON schemas', async () => {
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

  // The tenth tool is the one that resolves the project's archetype before it
  // writes, so the round-trip goes through a character rather than the inert
  // object shape the shared error-shape cases use.
  it('round-trips a scaffold_prefab call over the SDK transport', async () => {
    const project = await makeProject()
    roots.push(project)
    const pair = await connectedPair()
    try {
      const result = await pair.client.callTool({
        name: 'scaffold_prefab',
        arguments: { project_path: project, name: 'hero', type: 'character', identity: 'player' },
      })
      expect('toolResult' in result ? undefined : result.isError).not.toBe(true)
      expect(jsonResult(result)).toMatchObject({
        path: 'src/characters/hero.character.json',
        created: true,
      })
      const written = JSON.parse(
        await readFile(path.join(project, 'src/characters/hero.character.json'), 'utf8'),
      ) as { waicaPrefab: number; type: string; components: Array<{ type: string }> }
      expect(written.waicaPrefab).toBe(1)
      expect(written.type).toBe('character')
      expect(written.components.map((component) => component.type)).toContain('StateMachine')
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
