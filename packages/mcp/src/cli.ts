#!/usr/bin/env node
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { createWaicaMcpServer } from './server.js'

async function main(): Promise<void> {
  const server = createWaicaMcpServer()
  await server.connect(new StdioServerTransport())
}

main().catch((error: unknown) => {
  console.error(`waica-mcp: ${error instanceof Error ? error.message : String(error)}`)
  process.exitCode = 1
})
