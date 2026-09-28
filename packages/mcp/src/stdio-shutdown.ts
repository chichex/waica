// No imports on purpose: Node runs this file directly with type stripping in
// the child-process tests, and the stdio server owns its own lifecycle.

/** How long a clean shutdown may take before the process exits with code 1. */
export const SHUTDOWN_DEADLINE_MS = 5_000

export interface ShutdownHost {
  on(event: 'SIGTERM' | 'SIGINT', listener: () => void): unknown
  exit(code: number): void
  exitCode?: number | string | null | undefined
}

export interface StdioShutdownOptions {
  /** The MCP server; its close() ends every Run Session and project child. */
  readonly server: { close(): Promise<void> }
  readonly host: ShutdownHost
  readonly stdin: { once(event: 'end', listener: () => void): unknown }
  readonly stderr?: { write(text: string): unknown }
  readonly deadlineMs?: number
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/** Closes the server once under a deadline; later calls share the first close. */
function onceUnderDeadline(options: StdioShutdownOptions, forceExit: (reason: string) => void) {
  const { server, host, stderr = process.stderr } = options
  const deadlineMs = options.deadlineMs ?? SHUTDOWN_DEADLINE_MS
  let closing: Promise<void> | undefined
  const close = async (): Promise<void> => {
    const deadline = setTimeout(
      () => forceExit(`shutdown did not finish within ${deadlineMs} ms`),
      deadlineMs,
    )
    try {
      await server.close()
      host.exitCode = 0
    } catch (error) {
      stderr.write(`waica-mcp: shutdown failed: ${errorText(error)}\n`)
      host.exitCode = 1
    } finally {
      clearTimeout(deadline)
    }
  }
  return {
    started: (): boolean => closing !== undefined,
    shutdown: (): Promise<void> => (closing ??= close()),
  }
}

/**
 * Shuts the stdio MCP server down when the host sends SIGTERM or SIGINT, or
 * ends stdin: `server.close()` runs once, and a clean close leaves exit code
 * 0 so Node exits after draining. A close that outlives the deadline, or a
 * second signal while closing, exits with code 1 at once.
 */
export function installStdioShutdown(options: StdioShutdownOptions): () => Promise<void> {
  const { host, stdin, stderr = process.stderr } = options
  const forceExit = (reason: string): void => {
    stderr.write(`waica-mcp: ${reason}; exiting now\n`)
    host.exitCode = 1
    host.exit(1)
  }
  const { started, shutdown } = onceUnderDeadline(options, forceExit)
  const onSignal = (): void => {
    if (started()) forceExit('second signal during shutdown')
    else shutdown().catch(() => {})
  }
  host.on('SIGTERM', onSignal)
  host.on('SIGINT', onSignal)
  stdin.once('end', () => {
    shutdown().catch(() => {})
  })
  return shutdown
}
