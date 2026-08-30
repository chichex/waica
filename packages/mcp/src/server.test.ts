import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { mkdir, readFile, realpath, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, makeProject, tempDir } from './test-helpers.js'
import { ProjectComponentLoader } from './project-component-loader.js'
import { createWaicaMcpServer } from './server.js'
import type { RuntimeService } from './runtime-service.js'

const STATIC_TOOL_NAMES = [
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

const RUNTIME_TOOL_NAMES = [
  'start_project',
  'stop_project',
  'inspect_runtime',
  'control_runtime',
  'capture_screenshot',
]

const TOOL_NAMES = [...STATIC_TOOL_NAMES, ...RUNTIME_TOOL_NAMES]
const OPERATING_TOOLS = STATIC_TOOL_NAMES.filter((name) => name !== 'create_project')

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

async function connectedPair(
  runtime?: RuntimeService,
  componentLoader?: ProjectComponentLoader,
): Promise<{
  client: Client
  server: ReturnType<typeof createWaicaMcpServer>
  close: () => Promise<void>
}> {
  const server = createWaicaMcpServer({
    ...(runtime ? { runtime } : {}),
    ...(componentLoader ? { componentLoader } : {}),
  })
  const client = new Client({ name: 'waica-mcp-test', version: '1.0.0' })
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)])
  return {
    client,
    server,
    close: async () => {
      await client.close()
      await server.close()
    },
  }
}

async function waitForLines(file: string, count: number): Promise<string[]> {
  const deadline = Date.now() + 3_000
  while (Date.now() < deadline) {
    try {
      const lines = (await readFile(file, 'utf8')).trim().split('\n').filter(Boolean)
      if (lines.length >= count) return lines
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    }
    await new Promise((resolve) => setTimeout(resolve, 10))
  }
  throw new Error(`Timed out waiting for ${count} lines in ${file}`)
}

async function waitForPidExit(pid: number): Promise<boolean> {
  const deadline = Date.now() + 1_000
  while (Date.now() < deadline) {
    try {
      process.kill(pid, 0)
    } catch {
      return true
    }
    await new Promise((resolve) => setTimeout(resolve, 10))
  }
  return false
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

  it('registers exactly the fifteen tools with strict schemas and runtime annotations', async () => {
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
      expect(byName.get('inspect_runtime')?.annotations?.readOnlyHint).toBe(true)
      expect(byName.get('capture_screenshot')?.annotations?.readOnlyHint).toBe(true)
      expect(byName.get('control_runtime')?.annotations?.readOnlyHint).not.toBe(true)
      for (const name of RUNTIME_TOOL_NAMES) {
        expect(byName.get(name)?.inputSchema.additionalProperties).toBe(false)
      }
    } finally {
      await pair.close()
    }
  })

  it('returns structured runtime metadata and one non-duplicated PNG block', async () => {
    const metadata = {
      projectPath: '/canonical/game',
      url: 'http://127.0.0.1:43123/',
      engineVersion: '0.5.0',
      bridgeVersion: 1,
      mode: 'paused',
      frame: 4,
      simulationTime: 0.1,
      provenance: [{ package: '@waica/engine', version: '0.5.0', source: 'project' }],
    }
    let closed = 0
    const runtime: RuntimeService = {
      start: async () => ({
        ...metadata,
        reused: false,
        viewport: { width: 640, height: 360 },
        initialSnapshot: { bridgeVersion: 1, mode: 'paused', frame: 0, simulationTime: 0 },
      }),
      stop: async () => ({ projectPath: metadata.projectPath, stopped: true }),
      inspect: async () => ({ ...metadata, snapshot: { entities: [] } }),
      control: async () => ({ ...metadata, heldActions: [] }),
      captureScreenshot: async () => ({ metadata, data: 'iVBORw0KGgoAAAANSUhEUg==' }),
      close: async () => {
        closed += 1
      },
    }
    const pair = await connectedPair(runtime)
    try {
      const started = await pair.client.callTool({
        name: 'start_project',
        arguments: { project_path: '/alias/game' },
      })
      expect(jsonResult(started)).toMatchObject({ ...metadata, reused: false })

      const screenshot = await pair.client.callTool({
        name: 'capture_screenshot',
        arguments: { project_path: '/alias/game' },
      })
      if ('toolResult' in screenshot) throw new Error('unexpected task result')
      expect(screenshot.structuredContent).toEqual(metadata)
      expect(screenshot.content).toEqual([
        { type: 'text', text: JSON.stringify(metadata, null, 2) },
        { type: 'image', mimeType: 'image/png', data: 'iVBORw0KGgoAAAANSUhEUg==' },
      ])
      expect(JSON.stringify(screenshot.structuredContent)).not.toContain('iVBOR')
      expect((screenshot.content[0] as { text: string }).text).not.toContain('iVBOR')
    } finally {
      await pair.close()
    }
    expect(closed).toBe(1)
  })

  it('rejects invalid runtime arguments before calling the Run Session service', async () => {
    let calls = 0
    const called = async (): Promise<Record<string, unknown>> => {
      calls += 1
      return {}
    }
    const runtime: RuntimeService = {
      start: called,
      stop: called,
      inspect: called,
      control: called,
      captureScreenshot: async () => {
        calls += 1
        return { metadata: {}, data: 'png' }
      },
      close: async () => {},
    }
    const pair = await connectedPair(runtime)
    try {
      const cases = [
        { name: 'start_project', arguments: { project_path: '/game', extra: true } },
        { name: 'stop_project', arguments: { project_path: '/game', extra: true } },
        { name: 'inspect_runtime', arguments: { project_path: '/game', entity_ids: [3] } },
        {
          name: 'control_runtime',
          arguments: { project_path: '/game', operation: 'press', action: 'jump', frames: 2 },
        },
        {
          name: 'control_runtime',
          arguments: { project_path: '/game', operation: 'step', action: 'jump' },
        },
        {
          name: 'control_runtime',
          arguments: { project_path: '/game', operation: 'click' },
        },
        {
          name: 'control_runtime',
          arguments: { project_path: '/game', operation: 'click', x: 1 },
        },
        {
          name: 'control_runtime',
          arguments: { project_path: '/game', operation: 'click', x: 1, y: 2, action: 'jump' },
        },
        { name: 'capture_screenshot', arguments: { project_path: '/game', extra: true } },
      ]
      for (const request of cases) {
        const response = await pair.client.callTool(request)
        expect('toolResult' in response ? undefined : response.isError).toBe(true)
        expect(jsonResult(response)).toMatchObject({
          error: {
            code: 'runtime-operation-failed',
            message: expect.any(String),
            projectPath: '/game',
          },
        })
      }

      const relative = await pair.client.callTool({
        name: 'start_project',
        arguments: { project_path: 'relative-game' },
      })
      expect(jsonResult(relative)).toEqual({
        error: {
          code: 'runtime-prerequisite-missing',
          stage: 'project',
          message:
            "project_path must be absolute because a stdio server's working directory belongs to the agent host, not the game project.",
          projectPath: 'relative-game',
        },
      })
      expect(calls).toBe(0)
    } finally {
      await pair.close()
    }
  })

  it('forwards a valid click operation to the Run Session service in logical coordinates', async () => {
    const seen: unknown[] = []
    const runtime: RuntimeService = {
      start: async () => ({}),
      stop: async () => ({}),
      inspect: async () => ({}),
      control: async (input) => {
        seen.push(input)
        return { bridgeVersion: 1, mode: 'paused', frame: 0, simulationTime: 0, heldActions: [] }
      },
      captureScreenshot: async () => ({ metadata: {}, data: 'png' }),
      close: async () => {},
    }
    const pair = await connectedPair(runtime)
    try {
      const response = await pair.client.callTool({
        name: 'control_runtime',
        arguments: { project_path: '/game', operation: 'click', x: 4.5, y: -2.25 },
      })
      expect(response.isError).not.toBe(true)
      expect(seen).toEqual([{ projectPath: '/game', operation: 'click', x: 4.5, y: -2.25 }])
    } finally {
      await pair.close()
    }
  })

  it('keeps unexpected runtime-service failures inside the stable runtime error contract', async () => {
    const runtime: RuntimeService = {
      start: async () => { throw new Error('adapter boom') },
      stop: async () => { throw new Error('adapter boom') },
      inspect: async () => { throw new Error('adapter boom') },
      control: async () => { throw new Error('adapter boom') },
      captureScreenshot: async () => { throw new Error('adapter boom') },
      close: async () => {},
    }
    const pair = await connectedPair(runtime)
    try {
      const response = await pair.client.callTool({
        name: 'inspect_runtime',
        arguments: { project_path: '/game' },
      })
      expect('toolResult' in response ? undefined : response.isError).toBe(true)
      expect(jsonResult(response)).toEqual({
        error: {
          code: 'runtime-operation-failed',
          stage: 'game',
          message: 'adapter boom',
          projectPath: '/game',
        },
      })
    } finally {
      await pair.close()
    }
  })

  it('stops an absent Runtime Session idempotently even when the Project path is missing', async () => {
    const parent = await tempDir()
    roots.push(parent)
    const missing = path.join(await realpath(parent), 'missing-project')
    const pair = await connectedPair()
    try {
      const stopped = await pair.client.callTool({
        name: 'stop_project',
        arguments: { project_path: missing },
      })
      expect('toolResult' in stopped ? undefined : stopped.isError).not.toBe(true)
      expect(jsonResult(stopped)).toEqual({ projectPath: missing, stopped: false })
    } finally {
      await pair.close()
    }
  })

  it.each(['missing', 'incompatible'] as const)(
    'returns one tool-error when the isolated runner is %s',
    async (failure) => {
      const project = await makeProject({
        'src/components/a.ts': 'export class A { static componentName = "A" }\n',
        'src/components/b.ts': 'export class B { static componentName = "B" }\n',
      })
      roots.push(project)
      const runner = path.join(project, `${failure}-runner.mjs`)
      if (failure === 'incompatible') {
        await writeFile(
          runner,
          `
process.send({ kind: 'project-entry-ready', version: 999 })
setInterval(() => {}, 1_000)
`,
        )
      }
      const pair = await connectedPair(
        undefined,
        new ProjectComponentLoader({ runnerPath: runner, deadlineMs: 500 }),
      )
      try {
        const response = await pair.client.callTool({
          name: 'validate_project',
          arguments: { project_path: project },
        })

        expect('toolResult' in response ? undefined : response.isError).toBe(true)
        expect(jsonResult(response)).toEqual({
          error: {
            code: 'tool-error',
            message: expect.stringMatching(/runner|handshake/i),
            projectPath: project,
          },
          provenance: [],
        })
      } finally {
        await pair.close()
      }
    },
  )

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

  it('cancels only one overlapping validation child and starts no later entry for it', async () => {
    const project = await makeProject()
    roots.push(project)
    const starts = path.join(project, 'validation-starts.txt')
    const lock = path.join(project, 'first-validation.lock')
    const later = path.join(project, 'later-entry.txt')
    await mkdir(path.join(project, 'src/components'), { recursive: true })
    await Promise.all([
      writeFile(
        path.join(project, 'src/components/a-gate.ts'),
        `
import { appendFileSync, closeSync, openSync } from 'node:fs'
let first = false
try {
  closeSync(openSync(${JSON.stringify(lock)}, 'wx'))
  first = true
} catch (error) {
  if (error.code !== 'EEXIST') throw error
}
appendFileSync(${JSON.stringify(starts)}, (first ? 'cancel' : 'complete') + ':' + process.pid + '\\n')
if (first) await new Promise(() => setInterval(() => {}, 1_000))
else await new Promise((resolve) => setTimeout(resolve, 30))
export class Gate { static componentName = 'Gate' }
`,
      ),
      writeFile(
        path.join(project, 'src/components/b-later.ts'),
        `
import { appendFileSync } from 'node:fs'
appendFileSync(${JSON.stringify(later)}, String(process.pid) + '\\n')
export class Later { static componentName = 'Later' }
`,
      ),
    ])
    const pair = await connectedPair()
    try {
      const controller = new AbortController()
      const cancelledOutcome = pair.client
        .callTool(
          { name: 'validate_project', arguments: { project_path: project } },
          undefined,
          { signal: controller.signal, timeout: 3_000 },
        )
        .then(
          (value) => ({ value }),
          (error: unknown) => ({ error }),
        )
      const [cancelRow] = await waitForLines(starts, 1)
      const cancelledPid = Number(cancelRow!.split(':')[1])

      const completing = pair.client.callTool(
        { name: 'validate_project', arguments: { project_path: project } },
        undefined,
        { timeout: 3_000 },
      )
      await waitForLines(starts, 2)
      controller.abort(new Error('cancel only the first validation'))

      const [cancelled, completed] = await Promise.all([cancelledOutcome, completing])
      expect(cancelled).toHaveProperty('error')
      expect('toolResult' in completed ? undefined : completed.isError).not.toBe(true)
      expect(await waitForPidExit(cancelledPid)).toBe(true)
      expect(await waitForLines(later, 1)).toHaveLength(1)
      await new Promise((resolve) => setTimeout(resolve, 100))
      expect((await readFile(later, 'utf8')).trim().split('\n')).toHaveLength(1)
    } finally {
      await pair.close()
    }
  })

  it('force-terminates and observes every active validation child before server close completes', async () => {
    const project = await makeProject()
    roots.push(project)
    const starts = path.join(project, 'shutdown-starts.txt')
    await mkdir(path.join(project, 'src/components'), { recursive: true })
    await writeFile(
      path.join(project, 'src/components/hang.ts'),
      `
import { appendFileSync } from 'node:fs'
appendFileSync(${JSON.stringify(starts)}, String(process.pid) + '\\n')
await new Promise(() => setInterval(() => {}, 1_000))
`,
    )
    const pair = await connectedPair()
    const calls = [
      pair.client.callTool(
        { name: 'validate_project', arguments: { project_path: project } },
        undefined,
        { timeout: 10_000 },
      ).catch(() => undefined),
      pair.client.callTool(
        { name: 'validate_project', arguments: { project_path: project } },
        undefined,
        { timeout: 10_000 },
      ).catch(() => undefined),
    ]
    try {
      const pids = (await waitForLines(starts, 2)).map(Number)

      await pair.server.close()

      expect(await Promise.all(pids.map(waitForPidExit))).toEqual([true, true])
      await Promise.all(calls)
    } finally {
      await pair.client.close().catch(() => undefined)
      await pair.server.close().catch(() => undefined)
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

  it.each(STATIC_TOOL_NAMES)('%s rejects relative project paths with the stdio cwd explanation', async (name) => {
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
