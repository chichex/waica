import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  type CallToolResult,
  type Tool,
} from '@modelcontextprotocol/sdk/types.js'
import { createProject } from './create-project.js'
import {
  DEFAULT_ARCHETYPE_ID,
  knownArchetype,
  knownArchetypeIds,
} from './known-archetypes.js'
import {
  describeArchetype,
  listComponents,
  projectSummary,
} from './introspection.js'
import {
  ABSOLUTE_PATH_MESSAGE,
  WaicaToolError,
  assertAbsoluteProjectPath,
  requireWaicaProject,
} from './project-path.js'
import {
  scaffoldComponent,
  scaffoldPrefab,
  scaffoldRole,
  scaffoldState,
  scaffoldUi,
} from './scaffolds.js'
import {
  RuntimeToolError,
  type RuntimeControlInput,
  type RuntimeScreenshotResult,
  type RuntimeService,
} from './runtime-service.js'
import { createDefaultRuntimeSessionManager } from './runtime-session-manager.js'
import { ProjectComponentLoader } from './project-component-loader.js'
import { validateProject } from './validation.js'
import { validateRuntimeArguments } from './runtime-arguments.js'
import { objectRecord } from './component-metadata.js'

const PROJECT_PATH = {
  type: 'string',
  description: 'Absolute path to the user game project.',
} as const

function schema(
  properties: Record<string, object>,
  required: string[] = [],
): Tool['inputSchema'] {
  return {
    type: 'object',
    properties: { project_path: PROJECT_PATH, ...properties },
    required: ['project_path', ...required],
    additionalProperties: false,
  }
}

/** A `oneOf` branch's `not` clause: the operation rejects each named field (read by runtime-arguments.ts). */
function forbidding(...fields: string[]): { not: { anyOf: { required: string[] }[] } } {
  return { not: { anyOf: fields.map((field) => ({ required: [field] })) } }
}

export const TOOLS: Tool[] = [
  {
    name: 'create_project',
    description: 'Create a blank or playable Waica project in a new or empty directory.',
    inputSchema: schema({
      start: {
        type: 'string',
        enum: ['demo', 'blank'],
        default: 'demo',
        description: 'demo includes archetype content; blank creates only the chassis.',
      },
      archetype: {
        type: 'string',
        enum: knownArchetypeIds(),
        default: DEFAULT_ARCHETYPE_ID,
        description: 'Archetype the project is created for.',
      },
    }),
    annotations: { destructiveHint: false, idempotentHint: false, openWorldHint: false },
  },
  {
    name: 'list_components',
    description: 'List installed archetype component metadata and textual project-owned code paths.',
    inputSchema: schema({}),
    annotations: { openWorldHint: false },
  },
  {
    name: 'describe_archetype',
    description: 'Describe the active or requested installed archetype manifest.',
    inputSchema: schema({
      archetype: {
        type: 'string',
        description: 'Optional archetype manifest id; defaults to src/game.json.',
      },
    }),
    annotations: { openWorldHint: false },
  },
  {
    name: 'project_summary',
    description: 'Summarize scenes, prefabs, code, UI, stats and controls from project files.',
    inputSchema: schema({}),
    annotations: { readOnlyHint: true, openWorldHint: false },
  },
  {
    name: 'validate_project',
    description: 'Validate every project scene, prefab and configuration file with machine findings.',
    inputSchema: schema({}),
    annotations: { openWorldHint: false },
  },
  {
    name: 'scaffold_component',
    description: 'Create the editor-compatible starter for a project-owned component.',
    inputSchema: schema({ name: { type: 'string', minLength: 1 } }, ['name']),
    annotations: { destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  {
    name: 'scaffold_prefab',
    description: 'Create the editor-compatible starter prefab for a character, object or tile.',
    inputSchema: schema(
      {
        name: { type: 'string', minLength: 1, description: 'Prefab file name, without the type suffix.' },
        type: {
          type: 'string',
          enum: ['character', 'object', 'tile'],
          description: 'Prefab category; it decides the directory and the file suffix.',
        },
        role: {
          type: 'string',
          minLength: 1,
          description: 'Character role from the active archetype (characters only); defaults to player.',
        },
        identity: {
          type: 'string',
          enum: ['player', 'enemy', 'npc', 'custom'],
          description: 'What the character is to the game (characters only); adds its starter components.',
        },
      },
      ['name', 'type'],
    ),
    annotations: { destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  {
    name: 'scaffold_role',
    description: 'Create the editor-compatible starter for a custom character role.',
    inputSchema: schema({ role: { type: 'string', minLength: 1 } }, ['role']),
    annotations: { destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  {
    name: 'scaffold_state',
    description: 'Create the editor-compatible state-code starter for a role and state.',
    inputSchema: schema(
      {
        role: { type: 'string', minLength: 1 },
        state: {
          type: 'string',
          minLength: 1,
          pattern: '^[A-Za-z][A-Za-z0-9_]*$',
          description: 'TypeScript identifier used as the generated state object key.',
        },
      },
      ['role', 'state'],
    ),
    annotations: { destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  {
    name: 'scaffold_ui',
    description: 'Create the editor-compatible starter HTML for a UI piece.',
    inputSchema: schema({ name: { type: 'string', minLength: 1 } }, ['name']),
    annotations: { destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  {
    name: 'start_project',
    description: 'Start or reuse a browser-backed Run Session for a trusted Waica Project.',
    inputSchema: schema({
      browser_executable_path: { type: 'string', minLength: 1 },
      headless: { type: 'boolean', default: true },
      viewport: {
        type: 'object',
        properties: {
          width: { type: 'integer', minimum: 1 },
          height: { type: 'integer', minimum: 1 },
        },
        required: ['width', 'height'],
        additionalProperties: false,
      },
      timeout_ms: { type: 'integer', minimum: 1_000, maximum: 120_000, default: 30_000 },
    }),
    annotations: { destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  {
    name: 'stop_project',
    description: 'Stop a Project Run Session and all browser and process resources it owns.',
    inputSchema: schema({}),
    annotations: { destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  {
    name: 'inspect_runtime',
    description: 'Read a filtered Runtime Snapshot from a running Project.',
    inputSchema: schema({
      entity_ids: { type: 'array', items: { type: 'string' } },
      entity_names: { type: 'array', items: { type: 'string' } },
      component_types: { type: 'array', items: { type: 'string' } },
    }),
    annotations: { readOnlyHint: true, openWorldHint: false },
  },
  {
    name: 'control_runtime',
    description:
      'Inject a semantic action or a canvas click, or change deterministic frame control for a Run Session. ' +
      '`click` takes `x` and `y`: logical coordinates in a 2D scene, canvas CSS pixels in a 3D scene (nothing is picked on the letterbox bars or off the canvas). ' +
      '`hold` takes an optional analog `value` in (0, 1] (default 1; below 0.5 the action moves but is not held). ' +
      '`step` advances whole Simulation Steps of 1/60 s each (`frames`, 1-600, default 1); it does not accept a `dt`.',
    inputSchema: {
      type: 'object',
      properties: {
        project_path: PROJECT_PATH,
        operation: {
          type: 'string',
          enum: ['press', 'hold', 'release', 'pause', 'resume', 'step', 'click', 'scene'],
        },
        action: { type: 'string', minLength: 1 },
        value: { type: 'number', exclusiveMinimum: 0, maximum: 1 },
        frames: { type: 'integer', minimum: 1, maximum: 600 },
        x: { type: 'number' },
        y: { type: 'number' },
        scene: { type: 'string', minLength: 1 },
      },
      required: ['project_path', 'operation'],
      additionalProperties: false,
      oneOf: [
        { properties: { operation: { const: 'hold' } }, required: ['action'], ...forbidding('frames', 'x', 'y', 'scene') },
        {
          properties: { operation: { enum: ['press', 'release'] } },
          required: ['action'],
          ...forbidding('frames', 'x', 'y', 'scene', 'value'),
        },
        {
          properties: { operation: { enum: ['pause', 'resume'] } },
          ...forbidding('action', 'value', 'frames', 'x', 'y', 'scene'),
        },
        { properties: { operation: { const: 'step' } }, ...forbidding('action', 'x', 'y', 'scene', 'value') },
        {
          properties: { operation: { const: 'click' } },
          required: ['x', 'y'],
          ...forbidding('action', 'frames', 'scene', 'value'),
        },
        {
          properties: { operation: { const: 'scene' } },
          required: ['scene'],
          ...forbidding('action', 'frames', 'x', 'y', 'value'),
        },
      ],
    },
    annotations: { destructiveHint: false, idempotentHint: false, openWorldHint: false },
  },
  {
    name: 'capture_screenshot',
    description: 'Capture the composited Waica Game surface from a running Project.',
    inputSchema: schema({}),
    annotations: { readOnlyHint: true, openWorldHint: false },
  },
]

const RUNTIME_TOOL_NAMES = new Set([
  'start_project',
  'stop_project',
  'inspect_runtime',
  'control_runtime',
  'capture_screenshot',
])

function requiredString(args: Record<string, unknown>, name: string, projectPath = ''): string {
  const value = args[name]
  if (typeof value === 'string' && value.length > 0) return value
  throw new WaicaToolError({
    code: 'invalid-input',
    message: `${name} must be a non-empty string.`,
    projectPath,
  })
}

function invalidRuntimeInput(
  name: string,
  projectPath: string,
  message: string,
): never {
  throw new RuntimeToolError({
    code: 'runtime-operation-failed',
    stage: name === 'control_runtime' ? 'control' : 'project',
    message,
    projectPath,
  })
}

/** What a tool call runs against besides its own arguments. */
interface ToolContext {
  readonly runtime: RuntimeService
  readonly signal: AbortSignal
  readonly componentLoader: ProjectComponentLoader
}

type ToolOutput = Record<string, unknown> | RuntimeScreenshotResult

async function execute(
  name: string,
  args: Record<string, unknown>,
  context: ToolContext,
): Promise<ToolOutput> {
  const projectPath = checkedProjectPath(name, args)
  return RUNTIME_TOOL_NAMES.has(name)
    ? executeRuntimeTool(name, args, { projectPath, context })
    : executeProjectTool(name, args, { projectPath, context })
}

/**
 * The call's absolute project_path, checked at the dispatch boundary so every
 * tool has byte-identical stdio-cwd semantics, including create_project.
 * Runtime tools also have their remaining arguments checked here, before any
 * Run Session work starts.
 */
function checkedProjectPath(name: string, args: Record<string, unknown>): string {
  const isRuntimeTool = RUNTIME_TOOL_NAMES.has(name)
  const rawProjectPath = args.project_path
  if (isRuntimeTool && (typeof rawProjectPath !== 'string' || rawProjectPath.length === 0)) {
    invalidRuntimeInput(name, '', 'project_path must be a nonempty absolute path.')
  }
  const projectPath = requiredString(args, 'project_path')
  if (!isRuntimeTool) {
    assertAbsoluteProjectPath(projectPath)
    return projectPath
  }
  if (!path.isAbsolute(projectPath)) {
    throw new RuntimeToolError({
      code: 'runtime-prerequisite-missing',
      stage: 'project',
      message: ABSOLUTE_PATH_MESSAGE,
      projectPath,
    })
  }
  const tool = TOOLS.find((candidate) => candidate.name === name)
  if (tool) {
    validateRuntimeArguments(tool, args, (message) => invalidRuntimeInput(name, projectPath, message))
  }
  return projectPath
}

interface ToolTarget {
  readonly projectPath: string
  readonly context: ToolContext
}

/** File-oriented creation, introspection, validation and scaffold tools. */
async function executeProjectTool(
  name: string,
  args: Record<string, unknown>,
  { projectPath, context }: ToolTarget,
): Promise<Record<string, unknown>> {
  const optionalString = (field: string): string | undefined =>
    args[field] === undefined ? undefined : requiredString(args, field, projectPath)
  switch (name) {
    case 'create_project':
      return createProjectFromArguments(projectPath, optionalString)
    case 'list_components':
      return listComponents(projectPath)
    case 'describe_archetype':
      return describeArchetype(projectPath, optionalString('archetype'))
    case 'project_summary':
      return projectSummary(projectPath)
    case 'validate_project':
      return validateProject(projectPath, {
        signal: context.signal,
        componentLoader: context.componentLoader,
      })
    default:
      return executeScaffoldTool(name, args, projectPath)
  }
}

/** Reads start, then archetype, each checked before the next is read. */
async function createProjectFromArguments(
  projectPath: string,
  optionalString: (field: string) => string | undefined,
): Promise<Record<string, unknown>> {
  const start = optionalString('start') ?? 'demo'
  if (start !== 'demo' && start !== 'blank') {
    throw new WaicaToolError({
      code: 'invalid-input',
      message: 'start must be "demo" or "blank".',
      projectPath,
    })
  }
  const archetype = optionalString('archetype') ?? DEFAULT_ARCHETYPE_ID
  if (!knownArchetype(archetype)) {
    throw new WaicaToolError({
      code: 'unknown-archetype',
      message: `Unknown archetype "${archetype}"; available: ${knownArchetypeIds().join(', ')}.`,
      projectPath,
    })
  }
  return { ...(await createProject(projectPath, start, archetype)) }
}

/** Scaffold tools write a starter into an existing Waica Project. */
async function executeScaffoldTool(
  name: string,
  args: Record<string, unknown>,
  projectPath: string,
): Promise<Record<string, unknown>> {
  const field = (key: string): string => requiredString(args, key, projectPath)
  const optionalField = (key: string): string | undefined =>
    args[key] === undefined ? undefined : field(key)
  const scaffolds = new Map<string, () => Promise<object>>([
    ['scaffold_component', () => scaffoldComponent(projectPath, field('name'))],
    [
      'scaffold_prefab',
      () => scaffoldPrefab(projectPath, field('name'), field('type'), optionalField('role'), optionalField('identity')),
    ],
    ['scaffold_role', () => scaffoldRole(projectPath, field('role'))],
    ['scaffold_state', () => scaffoldState(projectPath, field('role'), field('state'))],
    ['scaffold_ui', () => scaffoldUi(projectPath, field('name'))],
  ])
  const scaffold = scaffolds.get(name)
  if (scaffold === undefined) {
    throw new WaicaToolError({ code: 'unknown-tool', message: `Unknown tool "${name}".`, projectPath })
  }
  const check = await requireWaicaProject(projectPath)
  return { ...(await scaffold()), notes: check.notes, provenance: [], warnings: [] }
}

/** Browser-backed Run Session tools, with arguments already validated. */
function executeRuntimeTool(
  name: string,
  args: Record<string, unknown>,
  { projectPath, context: { runtime, signal } }: ToolTarget,
): Promise<ToolOutput> {
  switch (name) {
    case 'start_project':
      return runtime.start({
        projectPath,
        ...(typeof args.browser_executable_path === 'string'
          ? { browserExecutablePath: args.browser_executable_path }
          : {}),
        ...(typeof args.headless === 'boolean' ? { headless: args.headless } : {}),
        ...(args.viewport && typeof args.viewport === 'object'
          ? { viewport: args.viewport as { width: number; height: number } }
          : {}),
        ...(typeof args.timeout_ms === 'number' ? { timeoutMs: args.timeout_ms } : {}),
      }, { signal })
    case 'stop_project':
      return runtime.stop(projectPath)
    case 'inspect_runtime':
      return runtime.inspect({
        projectPath,
        ...(Array.isArray(args.entity_ids) ? { entityIds: args.entity_ids as string[] } : {}),
        ...(Array.isArray(args.entity_names) ? { entityNames: args.entity_names as string[] } : {}),
        ...(Array.isArray(args.component_types)
          ? { componentTypes: args.component_types as string[] }
          : {}),
      }, { signal })
    case 'control_runtime':
      return runtime.control({
        projectPath,
        operation: requiredString(args, 'operation', projectPath),
        ...(typeof args.action === 'string' ? { action: args.action } : {}),
        ...(typeof args.value === 'number' ? { value: args.value } : {}),
        ...(typeof args.frames === 'number' ? { frames: args.frames } : {}),
        ...(typeof args.x === 'number' ? { x: args.x } : {}),
        ...(typeof args.y === 'number' ? { y: args.y } : {}),
        ...(typeof args.scene === 'string' ? { scene: args.scene } : {}),
      } as RuntimeControlInput, { signal })
    default:
      return runtime.captureScreenshot(projectPath, { signal })
  }
}

/** The payload as plain JSON data (drops undefined, functions and prototypes). */
function jsonSafe(value: Record<string, unknown>): Record<string, unknown> {
  return objectRecord(JSON.parse(JSON.stringify(value)))
}

function result(payload: Record<string, unknown>, isError = false): CallToolResult {
  const safe = jsonSafe(payload)
  return {
    content: [{ type: 'text', text: JSON.stringify(safe, null, 2) }],
    structuredContent: safe,
    ...(isError ? { isError: true } : {}),
  }
}

function screenshotResult(screenshot: RuntimeScreenshotResult): CallToolResult {
  const metadata = jsonSafe(screenshot.metadata)
  return {
    content: [
      { type: 'text', text: JSON.stringify(metadata, null, 2) },
      { type: 'image', mimeType: 'image/png', data: screenshot.data },
    ],
    structuredContent: metadata,
  }
}

function errorResult(
  error: unknown,
  args: Record<string, unknown>,
  toolName: string,
): CallToolResult {
  const projectPath = typeof args.project_path === 'string' ? args.project_path : ''
  if (error instanceof RuntimeToolError) {
    return result({ error: error.body }, true)
  }
  if (error instanceof WaicaToolError) {
    return result({ error: error.body, provenance: [] }, true)
  }
  if (RUNTIME_TOOL_NAMES.has(toolName)) {
    const stage = toolName === 'control_runtime'
      ? 'control'
      : toolName === 'stop_project'
        ? 'cleanup'
        : 'game'
    return result({
      error: {
        code: 'runtime-operation-failed',
        stage,
        message: error instanceof Error ? error.message : String(error),
        projectPath,
      },
    }, true)
  }
  return result(
    {
      error: {
        code: 'tool-error',
        message: error instanceof Error ? error.message : String(error),
        projectPath,
      },
      provenance: [],
    },
    true,
  )
}

/**
 * The version reported over MCP: whatever artifact is shipping this server.
 * In a checkout that is packages/mcp; once the CLI vendors the build into
 * dist/mcp it is the CLI itself. Walking up to the nearest package.json finds
 * the right one in both layouts, and every package in this repo moves on one
 * version, so the host is told the release it is actually running instead of
 * a number frozen in this file — which is how it reported 0.1.0 through the
 * 0.4.x releases.
 */
function shippedVersion(): string {
  let directory = path.dirname(fileURLToPath(import.meta.url))
  for (;;) {
    const manifest = path.join(directory, 'package.json')
    if (existsSync(manifest)) {
      const { version } = objectRecord(JSON.parse(readFileSync(manifest, 'utf8')))
      if (typeof version === 'string' && version !== '') return version
    }
    const parent = path.dirname(directory)
    if (parent === directory) return '0.0.0'
    directory = parent
  }
}

export interface WaicaMcpServerOptions {
  runtime?: RuntimeService
  componentLoader?: ProjectComponentLoader
}

export function createWaicaMcpServer(options: WaicaMcpServerOptions = {}): Server {
  const runtime = options.runtime ?? createDefaultRuntimeSessionManager()
  const componentLoader = options.componentLoader ?? new ProjectComponentLoader()
  const server = new Server(
    // The name stays fixed: it identifies the server to the host, not the
    // package that happens to carry it.
    { name: '@waica/mcp', version: shippedVersion() },
    {
      capabilities: { tools: {} },
      instructions:
        'Operate on user Waica projects through absolute project_path values. Keep editing JSON and TypeScript with the host file tools.',
    },
  )
  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }))
  server.setRequestHandler(CallToolRequestSchema, async (request, extra) => {
    const args = (request.params.arguments ?? {}) as Record<string, unknown>
    try {
      const executed = await execute(request.params.name, args, {
        runtime,
        signal: extra.signal,
        componentLoader,
      })
      return request.params.name === 'capture_screenshot'
        ? screenshotResult(executed as RuntimeScreenshotResult)
        : result(executed as Record<string, unknown>)
    } catch (error) {
      if (extra.signal.aborted) throw (extra.signal.reason ?? error)
      return errorResult(error, args, request.params.name)
    }
  })

  let cleanup: Promise<void> | undefined
  const cleanupResources = (): Promise<void> => {
    cleanup ??= Promise.all([runtime.close(), componentLoader.close()]).then(() => undefined)
    return cleanup
  }
  server.onclose = () => {
    cleanupResources().catch((error: unknown) => {
      console.error(`waica-mcp: cleanup failed: ${error instanceof Error ? error.message : String(error)}`)
    })
  }
  const closeProtocol = server.close.bind(server)
  server.close = async () => {
    // A failed cleanup is still reported, but the transport must close
    // either way or the process would stay alive on its open stdin.
    try {
      await cleanupResources()
    } finally {
      await closeProtocol()
    }
  }
  return server
}

export { ABSOLUTE_PATH_MESSAGE }
