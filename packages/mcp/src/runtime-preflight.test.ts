import { realpath, rm, symlink } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, stubPackage, tempDir, writeTree } from './test-helpers.js'
import {
  preflightRuntimeProject,
  type RuntimePreflightAdapters,
} from './runtime-preflight.js'

const roots: string[] = []
afterEach(async () => cleanup(...roots.splice(0)))

async function runtimeProject(
  manifest: Record<string, unknown> = {},
  files: Record<string, string> = {},
): Promise<string> {
  const project = await tempDir('waica-runtime-preflight-')
  roots.push(project)
  await writeTree(project, {
    'package.json': JSON.stringify({
      name: 'runtime-fixture',
      private: true,
      type: 'module',
      scripts: { dev: 'vite' },
      dependencies: { '@waica/engine': '^0.5.0' },
      ...manifest,
    }),
    'src/game.json': JSON.stringify({
      waicaGame: 1,
      resolution: { mode: 'fixed', width: 800, height: 450 },
    }),
    ...files,
  })
  await stubPackage(project, '@waica/engine', {
    version: '0.5.0',
    root: 'module.exports = {}\n',
  })
  return project
}

function adapters(
  overrides: Partial<RuntimePreflightAdapters> = {},
): RuntimePreflightAdapters {
  return {
    platform: 'linux',
    commandAvailable: async () => true,
    discoverBrowser: async (explicit) => explicit ?? '/usr/bin/google-chrome',
    ...overrides,
  }
}

describe('Runtime Project preflight', () => {
  it('uses packageManager precedence and returns an exact loopback dev command', async () => {
    const project = await runtimeProject({ packageManager: 'pnpm@11.4.0' })
    const aliasParent = await tempDir('waica-runtime-alias-')
    roots.push(aliasParent)
    const alias = path.join(aliasParent, 'game-link')
    await symlink(project, alias, os.platform() === 'win32' ? 'junction' : 'dir')
    const checked: string[] = []

    const result = await preflightRuntimeProject(
      { projectPath: alias },
      {
        platform: 'darwin',
        commandAvailable: async (command) => {
          checked.push(command)
          return true
        },
        discoverBrowser: async () => '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      },
    )

    expect(result).toMatchObject({
      projectPath: await realpath(project),
      packageManager: 'pnpm',
      command: 'pnpm',
      args: [
        'run',
        'dev',
        '--',
        '--host',
        '127.0.0.1',
        '--port',
        '__WAICA_RUNTIME_PORT__',
        '--strictPort',
      ],
      viewport: { width: 800, height: 450 },
      timeoutMs: 30_000,
      browserExecutablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      engine: { package: '@waica/engine', version: '0.5.0', source: 'project' },
    })
    expect(checked).toEqual(['pnpm'])
  })

  it.each([
    ['package-lock.json', 'npm', ['run', 'dev', '--', '--host', '127.0.0.1', '--port', '__WAICA_RUNTIME_PORT__', '--strictPort']],
    ['pnpm-lock.yaml', 'pnpm', ['run', 'dev', '--', '--host', '127.0.0.1', '--port', '__WAICA_RUNTIME_PORT__', '--strictPort']],
    ['yarn.lock', 'yarn', ['run', 'dev', '--host', '127.0.0.1', '--port', '__WAICA_RUNTIME_PORT__', '--strictPort']],
    ['bun.lock', 'bun', ['run', 'dev', '--', '--host', '127.0.0.1', '--port', '__WAICA_RUNTIME_PORT__', '--strictPort']],
  ] as const)('selects %s as %s and forwards only the fixed Vite flags', async (lock, manager, args) => {
    const project = await runtimeProject({}, { [lock]: '' })

    const result = await preflightRuntimeProject({ projectPath: project }, adapters())

    expect(result.packageManager).toBe(manager)
    expect(result.command).toBe(manager)
    expect(result.args).toEqual(args)
  })

  it('defaults to npm when no package manager metadata exists', async () => {
    const project = await runtimeProject()

    const result = await preflightRuntimeProject({ projectPath: project }, adapters())

    expect(result.packageManager).toBe('npm')
  })

  it.each([
    [{ packageManager: 'deno@2.0.0' }, {}, 'package-manager', /Unsupported/],
    [{ packageManager: 'pnpm' }, {}, 'package-manager', /invalid packageManager/],
    [{}, { 'pnpm-lock.yaml': '', 'yarn.lock': '' }, 'package-manager', /Conflicting/],
    [{ scripts: {} }, {}, 'project', /scripts\.dev/],
    [{ dependencies: {} }, {}, 'dependencies', /declare.*@waica\/engine/],
    [
      { dependencies: { '@waica/engine': '^0.5.0', missing: '^1.0.0' } },
      {},
      'dependencies',
      /missing.*not resolvable/,
    ],
  ] as const)(
    'reports an actionable prerequisite error for invalid Project setup %#',
    async (manifest, files, stage, message) => {
      const project = await runtimeProject(manifest, files)

      await expect(preflightRuntimeProject({ projectPath: project }, adapters())).rejects.toMatchObject({
        body: {
          code: 'runtime-prerequisite-missing',
          stage,
          message: expect.stringMatching(message),
          projectPath: await realpath(project),
        },
      })
    },
  )

  it('requires a Waica Project marker before checking runtime dependencies', async () => {
    const project = await runtimeProject()
    await rm(path.join(project, 'src/game.json'))

    await expect(preflightRuntimeProject({ projectPath: project }, adapters())).rejects.toMatchObject({
      body: {
        code: 'runtime-prerequisite-missing',
        stage: 'project',
        message: expect.stringMatching(/Waica Project/),
      },
    })
  })

  it('rejects Windows before checking commands or browsers', async () => {
    const project = await runtimeProject()
    let touched = false

    await expect(
      preflightRuntimeProject(
        { projectPath: project },
        adapters({
          platform: 'win32',
          commandAvailable: async () => {
            touched = true
            return true
          },
          discoverBrowser: async () => {
            touched = true
            return '/browser'
          },
        }),
      ),
    ).rejects.toMatchObject({
      body: { code: 'runtime-unsupported-host', stage: 'project' },
    })
    expect(touched).toBe(false)
  })

  it('validates explicit viewport and timeout before a session starts', async () => {
    const project = await runtimeProject()

    const valid = await preflightRuntimeProject(
      {
        projectPath: project,
        browserExecutablePath: '/custom/chrome',
        viewport: { width: 1_000, height: 1_000 },
        timeoutMs: 120_000,
        headless: false,
      },
      adapters(),
    )
    expect(valid).toMatchObject({
      browserExecutablePath: '/custom/chrome',
      viewport: { width: 1_000, height: 1_000 },
      timeoutMs: 120_000,
      headless: false,
    })

    await expect(
      preflightRuntimeProject(
        { projectPath: project, viewport: { width: 1_001, height: 1_000 } },
        adapters(),
      ),
    ).rejects.toMatchObject({ body: { stage: 'project', message: expect.stringMatching(/viewport/) } })
    await expect(
      preflightRuntimeProject({ projectPath: project, timeoutMs: 999 }, adapters()),
    ).rejects.toMatchObject({ body: { stage: 'project', message: expect.stringMatching(/timeout_ms/) } })
  })

  it('fails when the selected manager or a system browser is unavailable', async () => {
    const project = await runtimeProject()

    await expect(
      preflightRuntimeProject(
        { projectPath: project },
        adapters({ commandAvailable: async () => false }),
      ),
    ).rejects.toMatchObject({ body: { stage: 'package-manager' } })
    await expect(
      preflightRuntimeProject(
        { projectPath: project },
        adapters({ discoverBrowser: async () => undefined }),
      ),
    ).rejects.toMatchObject({ body: { stage: 'browser' } })
  })
})
