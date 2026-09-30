import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { createWaicaMcpServer } from './server.js'

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

/** The JSON object a tool returned as its text content block. */
export function jsonResult(result: Awaited<ReturnType<Client['callTool']>>): Record<string, unknown> {
  if ('toolResult' in result) throw new Error('unexpected task result')
  const text = result.content.find((item) => item.type === 'text')
  if (!text || text.type !== 'text') throw new Error('missing JSON text result')
  return JSON.parse(text.text) as Record<string, unknown>
}

/** One validate_project finding, as far as the demo tests read it. */
export interface DemoFinding {
  code: string
  file: string
  severity: string
  ref?: string
}

/**
 * A fresh `create_project` demo for `archetype` under a new temp directory
 * (recorded in `roots` for cleanup), and `validate_project`'s findings for
 * it, both through a real in-memory MCP server.
 */
export async function createAndValidateDemo(
  archetype: string,
  roots: string[],
): Promise<{ project: string; findings: DemoFinding[] }> {
  const parent = await tempDir()
  roots.push(parent)
  const project = path.join(parent, `${archetype}-demo`)
  const server = createWaicaMcpServer()
  const client = new Client({ name: 'waica-mcp-test', version: '1.0.0' })
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)])
  try {
    const created = await client.callTool({
      name: 'create_project',
      arguments: { project_path: project, start: 'demo', archetype },
    })
    if (!('toolResult' in created) && created.isError === true) {
      throw new Error(`create_project(${archetype}) failed: ${JSON.stringify(created)}`)
    }
    const validated = jsonResult(
      await client.callTool({ name: 'validate_project', arguments: { project_path: project } }),
    )
    return { project, findings: validated['findings'] as DemoFinding[] }
  } finally {
    await client.close()
    await server.close()
  }
}
