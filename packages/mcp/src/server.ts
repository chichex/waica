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
  scaffoldRole,
  scaffoldState,
  scaffoldUi,
} from './scaffolds.js'
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
]

function requiredString(args: Record<string, unknown>, name: string, projectPath = ''): string {
  const value = args[name]
  if (typeof value === 'string' && value.length > 0) return value
  throw new WaicaToolError({
    code: 'invalid-input',
    message: `${name} must be a non-empty string.`,
    projectPath,
  })
}

async function execute(name: string, args: Record<string, unknown>): Promise<Record<string, unknown>> {
  const projectPath = requiredString(args, 'project_path')
  // Keep this at the dispatch boundary so every tool has byte-identical
  // stdio-cwd semantics, including create_project.
  assertAbsoluteProjectPath(projectPath)
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

function errorResult(error: unknown, args: Record<string, unknown>): CallToolResult {
  const projectPath = typeof args.project_path === 'string' ? args.project_path : ''
  if (error instanceof WaicaToolError) {
    return result({ error: error.body, provenance: [] }, true)
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

export function createWaicaMcpServer(): Server {
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
      return result(await execute(request.params.name, args))
    } catch (error) {
      return errorResult(error, args)
    }
  })
  return server
}

export { ABSOLUTE_PATH_MESSAGE }
