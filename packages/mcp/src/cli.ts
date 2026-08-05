#!/usr/bin/env node
import { startStdioServer } from './stdio.js'

startStdioServer().catch((error: unknown) => {
  console.error(`waica-mcp: ${error instanceof Error ? error.message : String(error)}`)
  process.exitCode = 1
})
