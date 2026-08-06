import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { prepareWorkspaceRuntime } from './workspace-runtime.js'

/**
 * Logs to stderr (never stdout — that's the JSON-RPC transport) instead of
 * letting the failure reach Node's default handling. Exported so the logging
 * itself is unit-testable without touching the global process listeners.
 */
export function reportProjectCodeFailure(
  kind: 'unhandledRejection' | 'uncaughtException',
  detail: unknown,
): void {
  console.error(
    `waica-mcp: ${kind} — likely async work scheduled by a project module executed during ` +
      'validate_project (e.g. a floating fetch() or a throwing setTimeout callback). ' +
      'The server keeps running:',
    detail,
  )
}

/**
 * validate_project runs project-owned components/roles/states in-process
 * (project-component-loader.ts). That code can schedule async work that
 * rejects or throws *after* module evaluation already returned — Node's
 * default handling for that is to crash the whole process, which would take
 * down this long-lived stdio server and every other in-flight tool call for
 * one module's sloppy code. A subprocess sandbox for project code is a
 * larger, separately tracked follow-up; this keeps the blast radius to a
 * logged line for now.
 */
function installProjectCodeGuards(): void {
  process.on('unhandledRejection', (reason) => reportProjectCodeFailure('unhandledRejection', reason))
  process.on('uncaughtException', (error) => reportProjectCodeFailure('uncaughtException', error))
}

/**
 * Connects the MCP server to stdio. Kept separate from the bin wrapper so the
 * waica CLI can start the same server in-process from its bundled copy without
 * importing a module that runs on load.
 */
export async function startStdioServer(): Promise<void> {
  installProjectCodeGuards()
  await prepareWorkspaceRuntime()
  const { createWaicaMcpServer } = await import('./server.js')
  const server = createWaicaMcpServer()
  await server.connect(new StdioServerTransport())
}
