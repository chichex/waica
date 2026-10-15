import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import path from 'node:path'

/**
 * Runs the Project's own `vite build` (its node_modules, its vite.config.ts)
 * into `outDir`, outside the Project (H-20). Its output goes to the console.
 */
export async function viteBuild(project: string, outDir: string): Promise<void> {
  const vite = path.join(project, 'node_modules', 'vite', 'bin', 'vite.js')
  if (!existsSync(vite)) throw new Error(`run npm install in ${project} first (vite is missing)`)
  const child = spawn(process.execPath, [vite, 'build', '--outDir', outDir, '--emptyOutDir'], {
    cwd: project,
    stdio: ['ignore', 'inherit', 'inherit'],
  })
  const code = await new Promise<number | null>((resolve, reject) => {
    child.once('error', reject)
    child.once('exit', resolve)
  })
  if (code !== 0) throw new Error(`vite build failed in ${project} (exit ${String(code)})`)
}
