import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

export async function tempDir(prefix = 'waica-mcp-test-'): Promise<string> {
  return mkdtemp(path.join(os.tmpdir(), prefix))
}

export async function writeTree(
  root: string,
  files: Readonly<Record<string, string | Uint8Array>>,
): Promise<void> {
  for (const [relative, contents] of Object.entries(files)) {
    const target = path.join(root, relative)
    await mkdir(path.dirname(target), { recursive: true })
    await writeFile(target, contents)
  }
}

export async function makeProject(
  files: Readonly<Record<string, string | Uint8Array>> = {},
): Promise<string> {
  const root = await tempDir()
  await writeTree(root, {
    'package.json': JSON.stringify({
      name: path.basename(root),
      private: true,
      type: 'module',
      dependencies: {
        '@waica/engine': '^0.1.0',
        '@waica/behaviors': '^0.1.0',
        '@waica/archetype-platformer': '^0.1.0',
      },
    }),
    'src/game.json': JSON.stringify({ waicaGame: 1, archetype: 'platformer' }),
    ...files,
  })
  return root
}

export async function readJson<T = unknown>(file: string): Promise<T> {
  return JSON.parse(await readFile(file, 'utf8')) as T
}

export async function cleanup(...roots: string[]): Promise<void> {
  await Promise.all(roots.map((root) => rm(root, { recursive: true, force: true })))
}

export async function stubPackage(
  project: string,
  name: string,
  options: {
    version?: string
    root?: string
    manifest?: string
    packageJson?: Record<string, unknown>
  } = {},
): Promise<void> {
  const directory = path.join(project, 'node_modules', ...name.split('/'))
  const exports: Record<string, string> = { '.': './index.cjs' }
  if (options.manifest !== undefined) exports['./manifest'] = './manifest.cjs'
  await writeTree(directory, {
    'package.json': JSON.stringify({
      name,
      version: options.version ?? '9.0.0',
      type: 'commonjs',
      exports,
      ...options.packageJson,
    }),
    'index.cjs': options.root ?? `module.exports = { marker: ${JSON.stringify(name)} }\n`,
    ...(options.manifest === undefined ? {} : { 'manifest.cjs': options.manifest }),
  })
}
