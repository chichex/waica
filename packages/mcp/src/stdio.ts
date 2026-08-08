import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { prepareWorkspaceRuntime } from './workspace-runtime.js'

/**
 * Connects the MCP server to stdio. Kept separate from the bin wrapper so the
 * waica CLI can start the same server in-process from its bundled copy without
 * importing a module that runs on load.
 */
export async function startStdioServer(): Promise<void> {
  await prepareWorkspaceRuntime()
  const { createWaicaMcpServer } = await import('./server.js')
  const server = createWaicaMcpServer()
  await server.connect(new StdioServerTransport())
}
