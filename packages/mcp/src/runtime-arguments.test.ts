import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createWaicaMcpServer } from './server.js'
import type { RuntimeService } from './runtime-service.js'

// CA-32: every runtime tool's arguments, valid and invalid, through the MCP
// transport. Invalid arguments answer the exact stable error body and never
// reach the Run Session service; valid ones reach it as the typed input.

interface ServiceCall {
  method: string
  input: unknown
}

const calls: ServiceCall[] = []

function recordingRuntime(): RuntimeService {
  const record = (method: string, input: unknown): Promise<Record<string, unknown>> => {
    calls.push({ method, input })
    return Promise.resolve({})
  }
  return {
    start: (input) => record('start', input),
    stop: (projectPath) => record('stop', projectPath),
    inspect: (input) => record('inspect', input),
    control: (input) => record('control', input),
    captureScreenshot: (projectPath) => {
      calls.push({ method: 'captureScreenshot', input: projectPath })
      return Promise.resolve({ metadata: {}, data: 'png' })
    },
    close: () => Promise.resolve(),
  }
}

let client: Client
let server: ReturnType<typeof createWaicaMcpServer>

beforeAll(async () => {
  server = createWaicaMcpServer({ runtime: recordingRuntime() })
  client = new Client({ name: 'waica-runtime-arguments-test', version: '1.0.0' })
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)])
})

afterAll(async () => {
  await client.close()
  await server.close()
})

async function call(
  tool: string,
  args: Record<string, unknown>,
): Promise<{ isError: boolean; body: unknown }> {
  const response = await client.callTool({ name: tool, arguments: args })
  if ('toolResult' in response) throw new Error('unexpected task result')
  const text = response.content.find((item) => item.type === 'text')
  if (!text || text.type !== 'text') throw new Error('missing JSON text result')
  const body: unknown = JSON.parse(text.text)
  return { isError: response.isError === true, body }
}

const GAME = '/game'

type ValidCase = [tool: string, args: Record<string, unknown>, method: string, input: unknown]

const VALID: ValidCase[] = [
  ['start_project', {}, 'start', { projectPath: GAME }],
  [
    'start_project',
    {
      browser_executable_path: '/usr/bin/chrome',
      headless: false,
      viewport: { width: 800, height: 600 },
      timeout_ms: 1_000,
    },
    'start',
    {
      projectPath: GAME,
      browserExecutablePath: '/usr/bin/chrome',
      headless: false,
      viewport: { width: 800, height: 600 },
      timeoutMs: 1_000,
    },
  ],
  [
    'start_project',
    { headless: true, viewport: { width: 1_000, height: 1_000 }, timeout_ms: 120_000 },
    'start',
    { projectPath: GAME, headless: true, viewport: { width: 1_000, height: 1_000 }, timeoutMs: 120_000 },
  ],
  ['stop_project', {}, 'stop', GAME],
  ['capture_screenshot', {}, 'captureScreenshot', GAME],
  ['inspect_runtime', {}, 'inspect', { projectPath: GAME }],
  [
    'inspect_runtime',
    { entity_ids: ['e1'], entity_names: [], component_types: ['Health', 'Motor'] },
    'inspect',
    { projectPath: GAME, entityIds: ['e1'], entityNames: [], componentTypes: ['Health', 'Motor'] },
  ],
  ['control_runtime', { operation: 'press', action: 'jump' }, 'control', { projectPath: GAME, operation: 'press', action: 'jump' }],
  ['control_runtime', { operation: 'hold', action: 'left' }, 'control', { projectPath: GAME, operation: 'hold', action: 'left' }],
  ['control_runtime', { operation: 'release', action: 'left' }, 'control', { projectPath: GAME, operation: 'release', action: 'left' }],
  // Issue #75 CA-12: hold alone takes an analog value in (0, 1].
  ['control_runtime', { operation: 'hold', action: 'right', value: 0.5 }, 'control', { projectPath: GAME, operation: 'hold', action: 'right', value: 0.5 }],
  ['control_runtime', { operation: 'hold', action: 'right', value: 1 }, 'control', { projectPath: GAME, operation: 'hold', action: 'right', value: 1 }],
  ['control_runtime', { operation: 'pause' }, 'control', { projectPath: GAME, operation: 'pause' }],
  ['control_runtime', { operation: 'resume' }, 'control', { projectPath: GAME, operation: 'resume' }],
  ['control_runtime', { operation: 'step' }, 'control', { projectPath: GAME, operation: 'step' }],
  ['control_runtime', { operation: 'step', frames: 1 }, 'control', { projectPath: GAME, operation: 'step', frames: 1 }],
  ['control_runtime', { operation: 'step', frames: 600 }, 'control', { projectPath: GAME, operation: 'step', frames: 600 }],
  ['control_runtime', { operation: 'click', x: 0, y: -3.5 }, 'control', { projectPath: GAME, operation: 'click', x: 0, y: -3.5 }],
  ['control_runtime', { operation: 'scene', scene: 'cave' }, 'control', { projectPath: GAME, operation: 'scene', scene: 'cave' }],
]

type InvalidCase = [tool: string, args: Record<string, unknown>, message: string]

const START_MESSAGES = {
  browser: 'browser_executable_path must be a nonempty string.',
  headless: 'headless must be a boolean.',
  timeout: 'timeout_ms must be an integer from 1,000 through 120,000.',
  viewportShape: 'viewport must contain width and height.',
  viewportSize: 'viewport width and height must be positive integers totaling at most 1,000,000 pixels.',
}

const INVALID_PROJECT_STAGE: InvalidCase[] = [
  ['start_project', { extra: true, another: 1 }, 'Unexpected properties: another, extra.'],
  ['start_project', { browser_executable_path: '' }, START_MESSAGES.browser],
  ['start_project', { browser_executable_path: 5 }, START_MESSAGES.browser],
  ['start_project', { headless: 'yes' }, START_MESSAGES.headless],
  ['start_project', { timeout_ms: 999 }, START_MESSAGES.timeout],
  ['start_project', { timeout_ms: 120_001 }, START_MESSAGES.timeout],
  ['start_project', { timeout_ms: 1_500.5 }, START_MESSAGES.timeout],
  ['start_project', { timeout_ms: '30000' }, START_MESSAGES.timeout],
  ['start_project', { viewport: null }, START_MESSAGES.viewportShape],
  ['start_project', { viewport: [640, 360] }, START_MESSAGES.viewportShape],
  ['start_project', { viewport: '640x360' }, START_MESSAGES.viewportShape],
  ['start_project', { viewport: { width: 0, height: 10 } }, START_MESSAGES.viewportSize],
  ['start_project', { viewport: { width: 1.5, height: 10 } }, START_MESSAGES.viewportSize],
  ['start_project', { viewport: { width: '10', height: 10 } }, START_MESSAGES.viewportSize],
  ['start_project', { viewport: { width: 10 } }, START_MESSAGES.viewportSize],
  ['start_project', { viewport: { width: 10, height: 10, depth: 1 } }, START_MESSAGES.viewportSize],
  ['start_project', { viewport: { width: 1_001, height: 1_000 } }, START_MESSAGES.viewportSize],
  ['stop_project', { extra: true }, 'Unexpected properties: extra.'],
  ['capture_screenshot', { extra: true }, 'Unexpected properties: extra.'],
  ['inspect_runtime', { extra: true }, 'Unexpected properties: extra.'],
  ['inspect_runtime', { entity_ids: [3] }, 'entity_ids must be an array of strings.'],
  ['inspect_runtime', { entity_names: 'hero' }, 'entity_names must be an array of strings.'],
  ['inspect_runtime', { component_types: { Health: true } }, 'component_types must be an array of strings.'],
]

const DT_MESSAGE =
  'dt is not accepted: step advances whole Simulation Steps of 1/60 s each; pass frames (1 through 600) instead.'

const INVALID_CONTROL_STAGE: InvalidCase[] = [
  ['control_runtime', {}, 'operation is not a supported runtime control operation.'],
  ['control_runtime', { operation: 'jump' }, 'operation is not a supported runtime control operation.'],
  ['control_runtime', { operation: 'pause', foo: 1 }, 'Unexpected properties: foo.'],
  ['control_runtime', { operation: 'step', dt: 1 / 60 }, DT_MESSAGE],
  ['control_runtime', { operation: 'step', dt: 1 / 60, frames: 2 }, DT_MESSAGE],
  ['control_runtime', { operation: 'press', action: 'jump', dt: 5 }, 'Unexpected properties: dt.'],
  ...['press', 'hold', 'release'].flatMap((operation): InvalidCase[] => [
    ['control_runtime', { operation }, `${operation} requires a nonempty action.`],
    ['control_runtime', { operation, action: '' }, `${operation} requires a nonempty action.`],
    ['control_runtime', { operation, action: 5 }, `${operation} requires a nonempty action.`],
    ...['frames', 'x', 'y', 'scene'].map((field): InvalidCase => [
      'control_runtime',
      { operation, action: 'jump', [field]: 1 },
      `${operation} does not accept frames, x, y or scene.`,
    ]),
  ]),
  ...['pause', 'resume'].flatMap((operation) =>
    ['action', 'frames', 'x', 'y', 'scene'].map((field): InvalidCase => [
      'control_runtime',
      { operation, [field]: 1 },
      `${operation} accepts no additional fields.`,
    ]),
  ),
  ...['action', 'frames', 'scene'].map((field): InvalidCase => [
    'control_runtime',
    { operation: 'click', x: 1, y: 2, [field]: 1 },
    'click does not accept action, frames or scene.',
  ]),
  ['control_runtime', { operation: 'click', y: 2 }, 'click requires a finite x.'],
  ['control_runtime', { operation: 'click', x: 'a', y: 2 }, 'click requires a finite x.'],
  ['control_runtime', { operation: 'click', x: 1 }, 'click requires a finite y.'],
  ['control_runtime', { operation: 'click', x: 1, y: null }, 'click requires a finite y.'],
  ...['action', 'frames', 'x', 'y'].map((field): InvalidCase => [
    'control_runtime',
    { operation: 'scene', scene: 'cave', [field]: 1 },
    'scene does not accept action, frames, x or y.',
  ]),
  ['control_runtime', { operation: 'scene' }, 'scene requires a nonempty scene name.'],
  ['control_runtime', { operation: 'scene', scene: '' }, 'scene requires a nonempty scene name.'],
  ['control_runtime', { operation: 'step', action: 'jump' }, 'step does not accept action.'],
  ...['x', 'y', 'scene'].map((field): InvalidCase => [
    'control_runtime',
    { operation: 'step', [field]: 1 },
    'step does not accept x, y or scene.',
  ]),
  // Issue #75 CA-12: value only on hold, only in (0, 1].
  ...[0, -0.5, 1.5, '0.5', null].map((value): InvalidCase => [
    'control_runtime',
    { operation: 'hold', action: 'right', value },
    'value must be a finite number greater than 0 and at most 1.',
  ]),
  ...['press', 'release'].map((operation): InvalidCase => [
    'control_runtime',
    { operation, action: 'right', value: 0.5 },
    `${operation} does not accept value.`,
  ]),
  ...['pause', 'resume'].map((operation): InvalidCase => [
    'control_runtime',
    { operation, value: 0.5 },
    `${operation} accepts no additional fields.`,
  ]),
  ['control_runtime', { operation: 'step', value: 0.5 }, 'step does not accept value.'],
  ['control_runtime', { operation: 'click', x: 1, y: 2, value: 0.5 }, 'click does not accept value.'],
  ['control_runtime', { operation: 'scene', scene: 'cave', value: 0.5 }, 'scene does not accept value.'],
  ...[0, 601, 1.5, '2'].map((frames): InvalidCase => [
    'control_runtime',
    { operation: 'step', frames },
    'frames must be an integer from 1 through 600.',
  ]),
]

describe('valid runtime tool arguments (CA-32)', () => {
  const cases = VALID.map(([tool, args, method, input]) => ({ tool, args, method, input }))
  it.each(cases)('$tool accepts $args and hands the Run Session service its typed input', async (row) => {
    calls.length = 0
    const response = await call(row.tool, { project_path: GAME, ...row.args })
    expect(response.isError).toBe(false)
    expect(calls).toEqual([{ method: row.method, input: row.input }])
  })
})

describe('invalid runtime tool arguments (CA-32)', () => {
  it.each(INVALID_PROJECT_STAGE)('%s rejects %j at the project stage', async (tool, args, message) => {
    calls.length = 0
    const response = await call(tool, { project_path: GAME, ...args })
    expect(response).toEqual({
      isError: true,
      body: { error: { code: 'runtime-operation-failed', stage: 'project', message, projectPath: GAME } },
    })
    expect(calls).toEqual([])
  })

  it.each(INVALID_CONTROL_STAGE)('%s rejects %j at the control stage', async (tool, args, message) => {
    calls.length = 0
    const response = await call(tool, { project_path: GAME, ...args })
    expect(response).toEqual({
      isError: true,
      body: { error: { code: 'runtime-operation-failed', stage: 'control', message, projectPath: GAME } },
    })
    expect(calls).toEqual([])
  })
})

describe('runtime tool project_path (CA-32)', () => {
  it.each(['start_project', 'stop_project', 'inspect_runtime', 'control_runtime', 'capture_screenshot'])(
    '%s requires a nonempty absolute project_path before any other argument',
    async (tool) => {
      calls.length = 0
      const stage = tool === 'control_runtime' ? 'control' : 'project'
      for (const projectPath of [undefined, '', 5]) {
        const response = await call(tool, { project_path: projectPath, extra: true })
        expect(response).toEqual({
          isError: true,
          body: {
            error: {
              code: 'runtime-operation-failed',
              stage,
              message: 'project_path must be a nonempty absolute path.',
              projectPath: '',
            },
          },
        })
      }
      const relative = await call(tool, { project_path: 'relative-game', extra: true })
      expect(relative).toEqual({
        isError: true,
        body: {
          error: {
            code: 'runtime-prerequisite-missing',
            stage: 'project',
            message:
              "project_path must be absolute because a stdio server's working directory belongs to the agent host, not the game project.",
            projectPath: 'relative-game',
          },
        },
      })
      expect(calls).toEqual([])
    },
  )
})
