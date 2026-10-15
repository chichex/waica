import type { Tool } from '@modelcontextprotocol/sdk/types.js'

export const PROJECT_PATH = {
  type: 'string',
  description: 'Absolute path to the user game project.',
} as const

/** A tool's input schema: `project_path` plus its own properties, nothing else. */
export function schema(
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
