export interface CliIo {
  readonly stderr: { write(text: string): unknown }
  readonly process: { exitCode?: number | string | null | undefined }
}

/**
 * Runs the CLI's main and turns a rejection into one `waica: <message>` line
 * on stderr and exit code 1 — never an unhandled rejection or a stack trace.
 */
export async function runCli(
  main: () => Promise<void>,
  io: CliIo = { stderr: process.stderr, process },
): Promise<void> {
  try {
    await main()
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    io.stderr.write(`waica: ${message.replace(/\s*\n\s*/g, ' ')}\n`)
    io.process.exitCode = 1
  }
}
