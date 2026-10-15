import { HELP } from '../help.js'
import { parseExportArgs } from './args.js'
import { exportDesktop, type ExportDeps } from './export.js'

function oneLine(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/**
 * `waica export <target> …`: today the one target is `desktop`. Every failure
 * is thrown as one line, which runCli prints as `waica: <message>` with exit 1.
 */
export async function runExportCommand(argv: string[], deps?: ExportDeps): Promise<void> {
  const [target, ...rest] = argv
  if (target === '--help') {
    console.log(HELP)
    return
  }
  if (target !== 'desktop') {
    throw new Error(`unknown export target "${target ?? ''}" — try waica export desktop`)
  }
  try {
    const args = parseExportArgs(rest)
    if (args.help) console.log(HELP)
    else await exportDesktop(args, deps)
  } catch (error) {
    throw new Error(`export desktop: ${oneLine(error)}`, { cause: error })
  }
}
