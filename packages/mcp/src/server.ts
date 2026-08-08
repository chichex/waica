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
import { validateProject } from './validation.js'

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
    description: 'Inject a semantic action or change deterministic frame control for a Run Session.',
    inputSchema: {
      type: 'object',
      properties: {
        project_path: PROJECT_PATH,
        operation: {
          type: 'string',
          enum: ['press', 'hold', 'release', 'pause', 'resume', 'step'],
        },
        action: { type: 'string', minLength: 1 },
        dt: { type: 'number', exclusiveMinimum: 0, maximum: 0.1 },
        frames: { type: 'integer', minimum: 1, maximum: 600 },
      },
      required: ['project_path', 'operation'],
      additionalProperties: false,
      oneOf: [
        {
          properties: { operation: { enum: ['press', 'hold', 'release'] } },
          required: ['action'],
          not: { anyOf: [{ required: ['dt'] }, { required: ['frames'] }] },
        },
        {
          properties: { operation: { enum: ['pause', 'resume'] } },
          not: {
            anyOf: [{ required: ['action'] }, { required: ['dt'] }, { required: ['frames'] }],
          },
        },
        {
          properties: { operation: { const: 'step' } },
          not: { anyOf: [{ required: ['action'] }] },
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

function assertOnlyRuntimeFields(
  name: string,
  args: Record<string, unknown>,
  allowed: readonly string[],
  projectPath: string,
): void {
  const extras = Object.keys(args).filter((key) => !allowed.includes(key))
  if (extras.length > 0) {
    invalidRuntimeInput(name, projectPath, `Unexpected properties: ${extras.sort().join(', ')}.`)
  }
}

function assertStringArray(
  name: string,
  args: Record<string, unknown>,
  field: string,
  projectPath: string,
): void {
  const value = args[field]
  if (value !== undefined && (!Array.isArray(value) || value.some((entry) => typeof entry !== 'string'))) {
    invalidRuntimeInput(name, projectPath, `${field} must be an array of strings.`)
  }
}

function validateRuntimeArguments(
  name: string,
  args: Record<string, unknown>,
  projectPath: string,
): void {
  switch (name) {
    case 'start_project': {
      assertOnlyRuntimeFields(
        name,
        args,
        ['project_path', 'browser_executable_path', 'headless', 'viewport', 'timeout_ms'],
        projectPath,
      )
      if (
        args.browser_executable_path !== undefined &&
        (typeof args.browser_executable_path !== 'string' || args.browser_executable_path.length === 0)
      ) {
        invalidRuntimeInput(name, projectPath, 'browser_executable_path must be a nonempty string.')
      }
      if (args.headless !== undefined && typeof args.headless !== 'boolean') {
        invalidRuntimeInput(name, projectPath, 'headless must be a boolean.')
      }
      if (args.timeout_ms !== undefined) {
        const timeout = args.timeout_ms
        if (typeof timeout !== 'number' || !Number.isInteger(timeout) || timeout < 1_000 || timeout > 120_000) {
          invalidRuntimeInput(name, projectPath, 'timeout_ms must be an integer from 1,000 through 120,000.')
        }
      }
      if (args.viewport !== undefined) {
        if (!args.viewport || typeof args.viewport !== 'object' || Array.isArray(args.viewport)) {
          invalidRuntimeInput(name, projectPath, 'viewport must contain width and height.')
        }
        const viewport = args.viewport as Record<string, unknown>
        const keys = Object.keys(viewport)
        if (
          keys.some((key) => key !== 'width' && key !== 'height') ||
          keys.length !== 2 ||
          typeof viewport.width !== 'number' ||
          typeof viewport.height !== 'number' ||
          !Number.isInteger(viewport.width) ||
          !Number.isInteger(viewport.height) ||
          viewport.width <= 0 ||
          viewport.height <= 0 ||
          viewport.width * viewport.height > 1_000_000
        ) {
          invalidRuntimeInput(
            name,
            projectPath,
            'viewport width and height must be positive integers totaling at most 1,000,000 pixels.',
          )
        }
      }
      return
    }
    case 'stop_project':
    case 'capture_screenshot':
      assertOnlyRuntimeFields(name, args, ['project_path'], projectPath)
      return
    case 'inspect_runtime':
      assertOnlyRuntimeFields(
        name,
        args,
        ['project_path', 'entity_ids', 'entity_names', 'component_types'],
        projectPath,
      )
      assertStringArray(name, args, 'entity_ids', projectPath)
      assertStringArray(name, args, 'entity_names', projectPath)
      assertStringArray(name, args, 'component_types', projectPath)
      return
    case 'control_runtime': {
      assertOnlyRuntimeFields(
        name,
        args,
        ['project_path', 'operation', 'action', 'dt', 'frames'],
        projectPath,
      )
      const operation = args.operation
      if (!['press', 'hold', 'release', 'pause', 'resume', 'step'].includes(String(operation))) {
        invalidRuntimeInput(name, projectPath, 'operation is not a supported runtime control operation.')
      }
      if (operation === 'press' || operation === 'hold' || operation === 'release') {
        if (typeof args.action !== 'string' || args.action.length === 0) {
          invalidRuntimeInput(name, projectPath, `${operation} requires a nonempty action.`)
        }
        if (args.dt !== undefined || args.frames !== undefined) {
          invalidRuntimeInput(name, projectPath, `${operation} does not accept dt or frames.`)
        }
      } else if (operation === 'pause' || operation === 'resume') {
        if (args.action !== undefined || args.dt !== undefined || args.frames !== undefined) {
          invalidRuntimeInput(name, projectPath, `${operation} accepts no additional fields.`)
        }
      } else {
        if (args.action !== undefined) invalidRuntimeInput(name, projectPath, 'step does not accept action.')
        if (
          args.dt !== undefined &&
          (typeof args.dt !== 'number' || !Number.isFinite(args.dt) || args.dt <= 0 || args.dt > 0.1)
        ) {
          invalidRuntimeInput(name, projectPath, 'dt must be finite and greater than 0 and at most 0.1.')
        }
        if (
          args.frames !== undefined &&
          (typeof args.frames !== 'number' || !Number.isInteger(args.frames) || args.frames < 1 || args.frames > 600)
        ) {
          invalidRuntimeInput(name, projectPath, 'frames must be an integer from 1 through 600.')
        }
      }
      return
    }
  }
}

async function execute(
  name: string,
  args: Record<string, unknown>,
  runtime: RuntimeService,
): Promise<Record<string, unknown> | RuntimeScreenshotResult> {
  const isRuntimeTool = RUNTIME_TOOL_NAMES.has(name)
  const rawProjectPath = args.project_path
  if (isRuntimeTool && (typeof rawProjectPath !== 'string' || rawProjectPath.length === 0)) {
    invalidRuntimeInput(name, '', 'project_path must be a nonempty absolute path.')
  }
  const projectPath = requiredString(args, 'project_path')
  // Keep this at the dispatch boundary so every tool has byte-identical
  // stdio-cwd semantics, including create_project.
  if (isRuntimeTool) {
    if (!path.isAbsolute(projectPath)) {
      throw new RuntimeToolError({
        code: 'runtime-prerequisite-missing',
        stage: 'project',
        message: ABSOLUTE_PATH_MESSAGE,
        projectPath,
      })
    }
    validateRuntimeArguments(name, args, projectPath)
  } else {
    assertAbsoluteProjectPath(projectPath)
  }
  switch (name) {
    case 'create_project': {
      const start = args.start === undefined ? 'demo' : requiredString(args, 'start', projectPath)
      if (start !== 'demo' && start !== 'blank') {
        throw new WaicaToolError({
          code: 'invalid-input',
          message: 'start must be "demo" or "blank".',
          projectPath,
        })
      }
      return { ...(await createProject(projectPath, start)) }
    }
    case 'list_components':
      return listComponents(projectPath)
    case 'describe_archetype':
      return describeArchetype(
        projectPath,
        args.archetype === undefined ? undefined : requiredString(args, 'archetype', projectPath),
      )
    case 'project_summary':
      return projectSummary(projectPath)
    case 'validate_project':
      return validateProject(projectPath)
    case 'scaffold_component': {
      const check = await requireWaicaProject(projectPath)
      return {
        ...(await scaffoldComponent(projectPath, requiredString(args, 'name', projectPath))),
        notes: check.notes,
        provenance: [],
        warnings: [],
      }
    }
    case 'scaffold_prefab': {
      const check = await requireWaicaProject(projectPath)
      return {
        ...(await scaffoldPrefab(
          projectPath,
          requiredString(args, 'name', projectPath),
          requiredString(args, 'type', projectPath),
          args.role === undefined ? undefined : requiredString(args, 'role', projectPath),
          args.identity === undefined ? undefined : requiredString(args, 'identity', projectPath),
        )),
        notes: check.notes,
        provenance: [],
        warnings: [],
      }
    }
    case 'scaffold_role': {
      const check = await requireWaicaProject(projectPath)
      return {
        ...(await scaffoldRole(projectPath, requiredString(args, 'role', projectPath))),
        notes: check.notes,
        provenance: [],
        warnings: [],
      }
    }
    case 'scaffold_state': {
      const check = await requireWaicaProject(projectPath)
      return {
        ...(await scaffoldState(
          projectPath,
          requiredString(args, 'role', projectPath),
          requiredString(args, 'state', projectPath),
        )),
        notes: check.notes,
        provenance: [],
        warnings: [],
      }
    }
    case 'scaffold_ui': {
      const check = await requireWaicaProject(projectPath)
      return {
        ...(await scaffoldUi(projectPath, requiredString(args, 'name', projectPath))),
        notes: check.notes,
        provenance: [],
        warnings: [],
      }
    }
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
      })
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
      })
    case 'control_runtime':
      return runtime.control({
        projectPath,
        operation: requiredString(args, 'operation', projectPath),
        ...(typeof args.action === 'string' ? { action: args.action } : {}),
        ...(typeof args.dt === 'number' ? { dt: args.dt } : {}),
        ...(typeof args.frames === 'number' ? { frames: args.frames } : {}),
      } as RuntimeControlInput)
    case 'capture_screenshot':
      return runtime.captureScreenshot(projectPath)
    default:
      throw new WaicaToolError({
        code: 'unknown-tool',
        message: `Unknown tool "${name}".`,
        projectPath,
      })
  }
}

function jsonSafe(value: Record<string, unknown>): Record<string, unknown> {
  return JSON.parse(JSON.stringify(value)) as Record<string, unknown>
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
      const { version } = JSON.parse(readFileSync(manifest, 'utf8')) as { version?: string }
      if (version) return version
    }
    const parent = path.dirname(directory)
    if (parent === directory) return '0.0.0'
    directory = parent
  }
}

export interface WaicaMcpServerOptions {
  runtime?: RuntimeService
}

export function createWaicaMcpServer(options: WaicaMcpServerOptions = {}): Server {
  const runtime = options.runtime ?? createDefaultRuntimeSessionManager()
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
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const args = (request.params.arguments ?? {}) as Record<string, unknown>
    try {
      const executed = await execute(request.params.name, args, runtime)
      return request.params.name === 'capture_screenshot'
        ? screenshotResult(executed as RuntimeScreenshotResult)
        : result(executed as Record<string, unknown>)
    } catch (error) {
      return errorResult(error, args, request.params.name)
    }
  })

  let cleanup: Promise<void> | undefined
  const cleanupRuntime = (): Promise<void> => {
    cleanup ??= runtime.close()
    return cleanup
  }
  server.onclose = () => {
    void cleanupRuntime()
  }
  const closeProtocol = server.close.bind(server)
  server.close = async () => {
    await cleanupRuntime()
    await closeProtocol()
  }
  return server
}

export { ABSOLUTE_PATH_MESSAGE }
