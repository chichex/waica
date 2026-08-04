import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'
import {
  access,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, extname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const requireFromMcp = createRequire(join(root, 'packages/mcp/package.json'))
const { Client } = requireFromMcp('@modelcontextprotocol/sdk/client/index.js')
const { StdioClientTransport } = requireFromMcp('@modelcontextprotocol/sdk/client/stdio.js')
const sandbox = await mkdtemp(join(tmpdir(), 'waica-dist-'))
const nodeModules = join(sandbox, 'node_modules')
const packages = [
  { directory: 'engine', name: '@waica/engine', entry: 'index.js' },
  { directory: 'behaviors', name: '@waica/behaviors', entry: 'index.js' },
  { directory: 'archetype-platformer', name: '@waica/archetype-platformer', entry: 'index.js' },
  { directory: 'mcp', name: '@waica/mcp', entry: 'cli.js' },
]

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    encoding: 'utf8',
    ...options,
  })
  if (result.error) {
    throw new Error(`Could not spawn ${command}: ${result.error.message}`, {
      cause: result.error,
    })
  }
  if (result.status !== 0) {
    const output = [result.stdout, result.stderr].filter(Boolean).join('\n')
    const outcome = result.signal ? `signal ${result.signal}` : `exit ${result.status}`
    throw new Error(`${command} ${args.join(' ')} failed (${outcome})\n${output}`)
  }
  return result
}

async function filesBelow(directory) {
  const entries = await readdir(directory, { withFileTypes: true })
  const files = await Promise.all(
    entries.map(async (entry) => {
      const path = join(directory, entry.name)
      return entry.isDirectory() ? filesBelow(path) : [path]
    }),
  )
  return files.flat()
}

async function assertDistMatchesSource(packageRoot, packageName) {
  const sourceRoot = join(packageRoot, 'src')
  const distRoot = join(packageRoot, 'dist')
  const expected = (await filesBelow(sourceRoot))
    .filter(
      (path) =>
        path.endsWith('.ts') &&
        !path.endsWith('.test.ts') &&
        !path.endsWith('.d.ts') &&
        !relative(sourceRoot, path).startsWith('test-'),
    )
    .map((path) => relative(sourceRoot, path).replace(/\.ts$/, '.js'))
    .sort()
  const actual = (await filesBelow(distRoot))
    .filter((path) => path.endsWith('.js'))
    .map((path) => relative(distRoot, path))
    .sort()

  assert.deepEqual(actual, expected, `${packageName} dist contains missing or stale JavaScript files`)
}

async function assertExplicitRelativeImports(packageRoot, packageName) {
  for (const file of await filesBelow(join(packageRoot, 'dist'))) {
    if (!file.endsWith('.js')) continue
    const source = await readFile(file, 'utf8')
    for (const match of source.matchAll(
      /(?:\bfrom\s*|\bimport\s*(?:\(\s*)?)["'](\.{1,2}\/[^"']+)["']/g,
    )) {
      const specifier = match[1]
      const path = specifier.split(/[?#]/, 1)[0]
      assert.ok(
        extname(path),
        `${packageName}/${relative(join(packageRoot, 'dist'), file)} has extensionless import ${specifier}`,
      )
    }
  }
}

async function findPackageRoot(entry, expectedName) {
  let directory = dirname(entry)
  while (true) {
    try {
      const manifest = JSON.parse(await readFile(join(directory, 'package.json'), 'utf8'))
      if (manifest.name === expectedName) return directory
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error
    }
    const parent = dirname(directory)
    if (parent === directory) throw new Error(`Could not locate installed package ${expectedName}`)
    directory = parent
  }
}

async function materializeExternalDependencies(pkg, manifest) {
  const requireFromPackage = createRequire(
    join(root, 'packages', pkg.directory, 'package.json'),
  )
  for (const dependency of Object.keys(manifest.dependencies ?? {})) {
    if (dependency.startsWith('@waica/')) continue
    const destination = join(nodeModules, ...dependency.split('/'))
    try {
      await access(destination)
      continue
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error
    }

    let entry
    try {
      entry = requireFromPackage.resolve(dependency)
    } catch {
      entry = requireFromPackage.resolve(`${dependency}/package.json`)
    }
    const source = await findPackageRoot(entry, dependency)
    await mkdir(dirname(destination), { recursive: true })
    // Keep pnpm's real package location so the external package's own
    // dependency graph remains available. The @waica packages themselves are
    // always packed and extracted into this sandbox above.
    await symlink(source, destination, process.platform === 'win32' ? 'junction' : 'dir')
  }
}

try {
  await mkdir(join(nodeModules, '@waica'), { recursive: true })
  const packedManifests = new Map()

  for (const pkg of packages) {
    const packageRoot = join(root, 'packages', pkg.directory)
    const distEntry = join(packageRoot, 'dist', pkg.entry)
    await access(distEntry).catch(() => {
      throw new Error(`Missing ${distEntry}; run pnpm build before scripts/test-dist.mjs`)
    })
    await assertDistMatchesSource(packageRoot, pkg.name)

    const archive = join(sandbox, `${pkg.directory}.tgz`)
    run('pnpm', ['pack', '--out', archive], { cwd: packageRoot })

    const destination = join(nodeModules, ...pkg.name.split('/'))
    await mkdir(destination, { recursive: true })
    run('tar', ['-xzf', archive, '--strip-components=1', '-C', destination])
    await assertExplicitRelativeImports(destination, pkg.name)
    packedManifests.set(
      pkg.name,
      JSON.parse(await readFile(join(destination, 'package.json'), 'utf8')),
    )
  }

  const platformerSource = JSON.parse(
    await readFile(join(root, 'packages/archetype-platformer/package.json'), 'utf8'),
  )
  const platformerPacked = packedManifests.get('@waica/archetype-platformer')
  const expectedManifestExport = {
    types: './dist/manifest.d.ts',
    default: './dist/manifest.js',
  }
  assert.deepEqual(
    platformerSource.publishConfig?.exports?.['./manifest'],
    expectedManifestExport,
    'publishConfig.exports must map ./manifest to the built manifest files',
  )
  assert.deepEqual(
    platformerPacked.exports?.['./manifest'],
    expectedManifestExport,
    'the packed package must expose the published ./manifest mapping',
  )
  await access(join(nodeModules, '@waica/archetype-platformer/dist/manifest.js'))
  await access(join(nodeModules, '@waica/archetype-platformer/dist/manifest.d.ts'))

  const mcpSource = JSON.parse(await readFile(join(root, 'packages/mcp/package.json'), 'utf8'))
  const mcpPacked = packedManifests.get('@waica/mcp')
  assert.deepEqual(mcpSource.bin, { 'waica-mcp': 'dist/cli.js' })
  assert.deepEqual(mcpSource.files, ['dist'])
  assert.deepEqual(mcpSource.engines, { node: '>=20.19' })
  assert.equal(mcpSource.exports, undefined, '@waica/mcp must stay pure-bin')
  assert.deepEqual(mcpPacked.bin, mcpSource.bin)
  assert.deepEqual(mcpPacked.files, ['dist'])
  assert.equal(mcpPacked.exports, undefined, 'the packed MCP must stay pure-bin')
  for (const dependency of [
    '@waica/engine',
    '@waica/behaviors',
    '@waica/archetype-platformer',
  ]) {
    assert.equal(
      mcpPacked.dependencies?.[dependency],
      '^0.1.0',
      `${dependency} workspace range must become its published version`,
    )
  }
  const packedCli = join(nodeModules, '@waica/mcp/dist/cli.js')
  assert.ok((await readFile(packedCli, 'utf8')).startsWith('#!/usr/bin/env node\n'))
  await access(join(nodeModules, '@waica/mcp/dist/template/package.json.tpl'))
  await access(join(nodeModules, '@waica/mcp/dist/template/src/main.ts'))

  for (const pkg of packages) {
    await materializeExternalDependencies(pkg, packedManifests.get(pkg.name))
  }

  const probe = join(sandbox, 'probe.mjs')
  await writeFile(
    probe,
    [
      "await import('@waica/engine')",
      "await import('@waica/behaviors')",
      "const rootPackage = await import('@waica/archetype-platformer')",
      "const nodePackage = await import('@waica/archetype-platformer/manifest')",
      "if (rootPackage.ARCHETYPE?.id !== 'platformer') throw new Error('invalid root manifest')",
      "if (nodePackage.ARCHETYPE?.id !== 'platformer') throw new Error('invalid Node-safe manifest')",
      "if ('artUrls' in nodePackage.ARCHETYPE) throw new Error('Node-safe manifest contains browser art URLs')",
      "if (nodePackage.ARCHETYPE.registry.resolveAsset?.('waica:dog') !== 'assets/waica-dog.png') throw new Error('Node-safe registry cannot resolve package assets')",
    ].join('\n'),
  )
  run(process.execPath, [probe], { cwd: sandbox })

  // The README's pre-publish command runs this checkout's built CLI directly,
  // where workspace package exports still point at TypeScript source. Exercise
  // that exact path, then prove project-first tools survive workspace links.
  const sourceTarget = join(sandbox, 'source-stdio-game')
  const sourceClient = new Client({ name: 'waica-source-dist-smoke', version: '1.0.0' })
  const sourceTransport = new StdioClientTransport({
    command: process.execPath,
    args: [join(root, 'packages/mcp/dist/cli.js')],
    cwd: root,
    stderr: 'pipe',
  })
  let sourceStderr = ''
  sourceTransport.stderr?.on('data', (chunk) => {
    sourceStderr += chunk.toString()
  })
  try {
    await sourceClient.connect(sourceTransport, { timeout: 10_000 })
    const created = await sourceClient.callTool(
      {
        name: 'create_project',
        arguments: { project_path: sourceTarget, start: 'blank' },
      },
      undefined,
      { timeout: 10_000 },
    )
    assert.ok(!('toolResult' in created), 'source create_project unexpectedly became a task')
    assert.equal(
      created.isError,
      undefined,
      `source create_project failed: ${JSON.stringify(created)} ${sourceStderr}`,
    )

    await mkdir(join(sourceTarget, 'node_modules/@waica'), { recursive: true })
    for (const directory of ['engine', 'behaviors', 'archetype-platformer']) {
      await symlink(
        join(root, 'packages', directory),
        join(sourceTarget, 'node_modules/@waica', directory),
        process.platform === 'win32' ? 'junction' : 'dir',
      )
    }
    const listed = await sourceClient.callTool(
      { name: 'list_components', arguments: { project_path: sourceTarget } },
      undefined,
      { timeout: 10_000 },
    )
    assert.ok(!('toolResult' in listed), 'source list_components unexpectedly became a task')
    assert.equal(listed.isError, undefined, `workspace-linked list_components failed: ${sourceStderr}`)
  } finally {
    await sourceClient.close().catch(() => {})
  }

  const stdioTarget = join(sandbox, 'stdio-game')
  const client = new Client({ name: 'waica-dist-smoke', version: '1.0.0' })
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [packedCli],
    cwd: sandbox,
    stderr: 'pipe',
  })
  let childStderr = ''
  transport.stderr?.on('data', (chunk) => {
    childStderr += chunk.toString()
  })
  try {
    await client.connect(transport, { timeout: 10_000 })
    const result = await client.callTool(
      {
        name: 'create_project',
        arguments: { project_path: stdioTarget, start: 'blank' },
      },
      undefined,
      { timeout: 10_000 },
    )
    assert.ok(!('toolResult' in result), 'create_project unexpectedly became a task')
    assert.equal(result.isError, undefined, `stdio create_project failed: ${childStderr}`)
    await access(join(stdioTarget, 'package.json'))
    await access(join(stdioTarget, 'src/scenes/main.scene.json'))
  } finally {
    await client.close().catch(() => {})
  }

  console.log(
    'fresh packed packages load in plain Node and @waica/mcp creates a project over real stdio',
  )
} finally {
  await rm(sandbox, { recursive: true, force: true })
}
