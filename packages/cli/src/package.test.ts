import { describe, expect, it } from 'vitest'
import { access, readFile } from 'node:fs/promises'
import path from 'node:path'

const packageRoot = path.resolve(import.meta.dirname, '..')

describe('@waica/cli package contract', () => {
  it('publishes both the editor and the MCP server from one bin set', async () => {
    const pkg = JSON.parse(await readFile(path.join(packageRoot, 'package.json'), 'utf8')) as Record<
      string,
      unknown
    >
    expect(pkg).toMatchObject({
      name: '@waica/cli',
      type: 'module',
      bin: { waica: 'dist/cli.js' },
      files: ['dist'],
      // Matches the MCP server's floor: it is the same process.
      engines: { node: '>=22.18' },
      publishConfig: { access: 'public' },
      scripts: {
        build: 'tsc -p tsconfig.build.json && node bundle-editor.mjs && node bundle-mcp.mjs',
      },
      dependencies: {
        '@modelcontextprotocol/sdk': expect.stringMatching(/^\^1\./),
        'playwright-core': expect.stringMatching(/^\^1\./),
        three: expect.stringMatching(/^\^0\./),
      },
      devDependencies: {
        '@waica/editor': 'workspace:^',
        '@waica/mcp': 'workspace:^',
      },
    })
    const mcpPkg = JSON.parse(
      await readFile(path.resolve(packageRoot, '../mcp/package.json'), 'utf8'),
    ) as Record<string, unknown>
    expect(mcpPkg).toMatchObject({
      name: '@waica/mcp',
      engines: { node: '>=22.18' },
    })
    expect(pkg).not.toHaveProperty('exports')
    expect(Object.keys(pkg.dependencies as object).sort()).toEqual([
      '@modelcontextprotocol/sdk',
      'playwright-core',
      'three',
    ])
    await access(path.join(packageRoot, 'bundle-mcp.mjs'))
  })

  // `npx <pkg>` picks the entry point by name: with exactly one bin it runs
  // that one, but with several it looks for a bin named after the package
  // minus its scope, and dies with "could not determine executable to run"
  // when none matches. 0.4.0 shipped with two bins under a package called
  // `@waica/cli`, so `npx @waica/cli` — the first line of every README —
  // resolved to nothing. The binaries were fine; it is the relationship
  // between the package name and the bin names that broke, and nothing here
  // was watching it because every other test invokes the bins by path.
  it('exposes a bin set npx can resolve', async () => {
    const pkg = JSON.parse(await readFile(path.join(packageRoot, 'package.json'), 'utf8')) as {
      name: string
      bin: Record<string, string>
    }
    const bins = Object.keys(pkg.bin)
    const unscoped = pkg.name.replace(/^@[^/]+\//, '')
    expect(
      bins.length === 1 || bins.includes(unscoped),
      `npx runs "${pkg.name}" only if it declares a single bin or one named "${unscoped}"; it declares: ${bins.join(', ')}`,
    ).toBe(true)
  })

  // One release, one number — including the two private packages. The CLI
  // vendors the three libraries and the generated project asks npm for them by
  // version, so a package left behind publishes a CLI whose bundled copies
  // disagree with the registry. `editor` and `mcp` never reach npm, but they
  // ride inside the CLI and the MCP server reports its own manifest version
  // to the host, so a stale number there misidentifies the running release.
  // The git tag is checked against these in .github/workflows/publish.yml.
  it('keeps every published package on the same version', async () => {
    const packages = [
      'cli',
      'engine',
      'behaviors',
      'archetype-platformer',
      'archetype-topdown',
      'editor',
      'mcp',
    ]
    const versions = await Promise.all(
      packages.map(async (directory) => {
        const manifest = JSON.parse(
          await readFile(path.resolve(packageRoot, '..', directory, 'package.json'), 'utf8'),
        ) as { version: string }
        return [directory, manifest.version] as const
      }),
    )
    const [, release] = versions[0]!
    expect(Object.fromEntries(versions)).toEqual(
      Object.fromEntries(packages.map((directory) => [directory, release])),
    )
    expect(release).toMatch(/^\d+\.\d+\.\d+$/)
  })
})
