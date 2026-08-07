import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'
import {
  access,
  cp,
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  realpath,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, extname, join, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { libraryVersions, publishedManifest, readLibraryManifests } from './published-manifest.mjs'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const requireFromMcp = createRequire(join(root, 'packages/mcp/package.json'))
const { Client } = requireFromMcp('@modelcontextprotocol/sdk/client/index.js')
const { StdioClientTransport } = requireFromMcp('@modelcontextprotocol/sdk/client/stdio.js')
const sandbox = await mkdtemp(join(tmpdir(), 'waica-dist-'))
const nodeModules = join(sandbox, 'node_modules')
// @waica/mcp is absent on purpose: it is not published on its own, it ships
// inside @waica/cli. Its dist is checked in place and then exercised
// through the packed CLI. The three libraries stay here because the CLI vendors
// exactly these published shapes next to the bundled server.
const packages = [
  { directory: 'engine', name: '@waica/engine', entry: 'index.js' },
  { directory: 'behaviors', name: '@waica/behaviors', entry: 'index.js' },
  { directory: 'archetype-platformer', name: '@waica/archetype-platformer', entry: 'index.js' },
  { directory: 'cli', name: '@waica/cli', entry: 'cli.js', bundled: ['editor', 'mcp'] },
]
const vendoredLibraries = ['@waica/engine', '@waica/behaviors', '@waica/archetype-platformer']

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

async function symbolicLinksBelow(directory) {
  const links = []
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const target = join(directory, entry.name)
    const info = await lstat(target)
    if (info.isSymbolicLink()) links.push(target)
    else if (info.isDirectory()) links.push(...(await symbolicLinksBelow(target)))
  }
  return links
}

/** Directories the build copies in wholesale rather than compiles from src. */
function outsideBundledTrees(distRoot, bundled) {
  return (path) =>
    !bundled.some((directory) => path.startsWith(`${join(distRoot, directory)}${sep}`))
}

async function assertDistMatchesSource(packageRoot, packageName, bundled = []) {
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
    .filter(outsideBundledTrees(distRoot, bundled))
    .map((path) => relative(distRoot, path))
    .sort()

  assert.deepEqual(actual, expected, `${packageName} dist contains missing or stale JavaScript files`)
}

async function assertExplicitRelativeImports(packageRoot, packageName, bundled = []) {
  const distRoot = join(packageRoot, 'dist')
  for (const file of (await filesBelow(distRoot)).filter(outsideBundledTrees(distRoot, bundled))) {
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

async function resolvedDependencyRoot(requireFromParent, dependency, optional) {
  try {
    let entry
    try {
      entry = requireFromParent.resolve(dependency)
    } catch {
      entry = requireFromParent.resolve(`${dependency}/package.json`)
    }
    return realpath(await findPackageRoot(entry, dependency))
  } catch (error) {
    if (optional && error?.code === 'MODULE_NOT_FOUND') return undefined
    throw error
  }
}

async function materializeExternalDependency(
  dependency,
  requireFromParent,
  destinationNodeModules,
  ancestors = new Set(),
  optional = false,
) {
  if (dependency.startsWith('@waica/')) return
  const source = await resolvedDependencyRoot(requireFromParent, dependency, optional)
  if (!source || ancestors.has(source)) return

  const destination = join(destinationNodeModules, ...dependency.split('/'))
  try {
    await access(destination)
    return
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error
  }

  await mkdir(dirname(destination), { recursive: true })
  const sourceNodeModules = join(source, 'node_modules')
  await cp(source, destination, {
    recursive: true,
    dereference: true,
    filter: (candidate) =>
      candidate !== sourceNodeModules && !candidate.startsWith(`${sourceNodeModules}${sep}`),
  })

  const manifest = JSON.parse(await readFile(join(source, 'package.json'), 'utf8'))
  const requireFromDependency = createRequire(join(source, 'package.json'))
  const nextAncestors = new Set([...ancestors, source])
  const nestedNodeModules = join(destination, 'node_modules')
  for (const child of Object.keys(manifest.dependencies ?? {}).sort()) {
    await materializeExternalDependency(
      child,
      requireFromDependency,
      nestedNodeModules,
      nextAncestors,
    )
  }
  for (const child of Object.keys(manifest.optionalDependencies ?? {}).sort()) {
    await materializeExternalDependency(
      child,
      requireFromDependency,
      nestedNodeModules,
      nextAncestors,
      true,
    )
  }
}

async function materializeExternalDependencies(pkg, manifest) {
  const requireFromPackage = createRequire(
    join(root, 'packages', pkg.directory, 'package.json'),
  )
  for (const dependency of Object.keys(manifest.dependencies ?? {}).sort()) {
    await materializeExternalDependency(dependency, requireFromPackage, nodeModules)
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
    await assertDistMatchesSource(packageRoot, pkg.name, pkg.bundled)

    const archive = join(sandbox, `${pkg.directory}.tgz`)
    run('pnpm', ['pack', '--out', archive], { cwd: packageRoot })

    const destination = join(nodeModules, ...pkg.name.split('/'))
    await mkdir(destination, { recursive: true })
    run('tar', ['-xzf', archive, '--strip-components=1', '-C', destination])
    await assertExplicitRelativeImports(destination, pkg.name, pkg.bundled)
    packedManifests.set(
      pkg.name,
      JSON.parse(await readFile(join(destination, 'package.json'), 'utf8')),
    )
  }

  // CI publishes the libraries with `npm publish`, which needs the manifest
  // lowered by scripts/prepare-publish.mjs because it does not understand
  // `workspace:^` or publishConfig. `pnpm pack` above did that lowering for
  // real, so the two must agree on everything a consumer resolves against —
  // otherwise the registry gets a package this suite never actually tested.
  const libraryManifests = readLibraryManifests()
  const libraryVersionMap = libraryVersions(libraryManifests)
  for (const { source } of libraryManifests) {
    const lowered = publishedManifest(source, libraryVersionMap)
    const packed = packedManifests.get(source.name)
    for (const field of ['name', 'version', 'type', 'files', 'exports', 'dependencies']) {
      assert.deepEqual(
        lowered[field],
        packed[field],
        `prepare-publish.mjs and pnpm pack disagree on ${source.name} ${field}`,
      )
    }
  }

  const packedEngineReadme = join(nodeModules, '@waica/engine/README.md')
  await access(packedEngineReadme)
  assert.match(
    await readFile(packedEngineReadme, 'utf8'),
    /updateAfter[\s\S]*Unicode code-unit[\s\S]*fail closed/i,
    'the packed engine must include its component update contract README',
  )
  const packedEngineTypes = await readFile(
    join(nodeModules, '@waica/engine/dist/index.d.ts'),
    'utf8',
  )
  assert.match(packedEngineTypes, /resolveComponentUpdateSchedule/)
  assert.match(packedEngineTypes, /ComponentUpdateScheduleResult/)
  assert.match(packedEngineTypes, /ComponentUpdateScheduleIssue/)

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

  // The server is never packed on its own, so its dist is verified where it is
  // built; the packed CLI below then runs that same dist, copied.
  const mcpRoot = join(root, 'packages/mcp')
  await assertDistMatchesSource(mcpRoot, '@waica/mcp')
  await assertExplicitRelativeImports(mcpRoot, '@waica/mcp')
  await access(join(mcpRoot, 'dist/native-import.cjs'))
  const mcpSource = JSON.parse(await readFile(join(mcpRoot, 'package.json'), 'utf8'))
  assert.equal(mcpSource.private, true, '@waica/mcp must stay unpublished: it ships inside the CLI')
  assert.equal(mcpSource.publishConfig, undefined, '@waica/mcp must carry no publish settings')

  const cliSource = JSON.parse(await readFile(join(root, 'packages/cli/package.json'), 'utf8'))
  const cliPacked = packedManifests.get('@waica/cli')
  // One bin, so `npx @waica/cli` resolves it without needing a bin named
  // after the package — see the npx note in packages/cli/src/package.test.ts.
  assert.deepEqual(cliSource.bin, { waica: 'dist/cli.js' })
  assert.deepEqual(cliPacked.bin, cliSource.bin)
  assert.deepEqual(cliPacked.files, ['dist'])
  assert.deepEqual(cliPacked.engines, { node: '>=22.18' })
  assert.equal(cliPacked.exports, undefined, '@waica/cli must stay pure-bin')
  assert.deepEqual(
    Object.keys(cliPacked.dependencies ?? {}).sort(),
    ['@modelcontextprotocol/sdk', 'three'],
    'the published CLI must declare exactly the runtime deps its bundled server loads',
  )

  const packedCliRoot = join(nodeModules, '@waica/cli')
  const packedCli = join(packedCliRoot, 'dist/cli.js')
  assert.ok((await readFile(packedCli, 'utf8')).startsWith('#!/usr/bin/env node\n'))
  await access(join(packedCliRoot, 'dist/editor/index.html'))
  await access(join(packedCliRoot, 'dist/mcp/stdio.js'))
  await access(join(packedCliRoot, 'dist/mcp/native-import.cjs'))
  await access(join(packedCliRoot, 'dist/mcp/template/package.json.tpl'))
  await access(join(packedCliRoot, 'dist/mcp/template/src/main.ts'))

  // These vendored copies are the bundled fallback for projects without their
  // own node_modules. They must carry published exports — the checkout's point
  // at TypeScript source, which plain Node refuses to load.
  for (const name of vendoredLibraries) {
    const vendorRoot = join(packedCliRoot, 'dist/mcp/node_modules', ...name.split('/'))
    const vendored = JSON.parse(await readFile(join(vendorRoot, 'package.json'), 'utf8'))
    const published = packedManifests.get(name)
    assert.deepEqual(
      vendored.exports,
      published.exports,
      `${name} must be vendored with its published exports`,
    )
    assert.equal(vendored.version, published.version, `${name} must be vendored at its real version`)
    assert.equal(vendored.publishConfig, undefined)
    for (const file of published.files) await access(join(vendorRoot, file))
  }
  await access(
    join(packedCliRoot, 'dist/mcp/node_modules/@waica/archetype-platformer/assets/waica-dog.png'),
  )

  for (const pkg of packages) {
    await materializeExternalDependencies(pkg, packedManifests.get(pkg.name))
  }
  assert.deepEqual(
    (await symbolicLinksBelow(nodeModules)).map((file) => relative(sandbox, file)),
    [],
    'the packed dependency graph must not contain symlinks that can escape the sandbox',
  )

  const probe = join(sandbox, 'probe.mjs')
  await writeFile(
    probe,
    [
      "const enginePackage = await import('@waica/engine')",
      "if (typeof enginePackage.resolveComponentUpdateSchedule !== 'function') throw new Error('engine root has no schedule resolver')",
      "class PackedProducer extends enginePackage.Component { static componentName = 'PackedProducer'; onUpdate() {} }",
      "class PackedConsumer extends enginePackage.Component { static componentName = 'PackedConsumer'; static updateAfter = ['PackedProducer']; onUpdate() {} }",
      "const packedSchedule = enginePackage.resolveComponentUpdateSchedule(['PackedConsumer', 'PackedProducer'], { PackedConsumer, PackedProducer })",
      "if (!packedSchedule.ok || packedSchedule.order.join(',') !== 'PackedProducer,PackedConsumer') throw new Error('packed engine resolver contract failed')",
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
  // that exact path — `waica mcp`, not the packed copy — then prove
  // project-first tools survive workspace links.
  const sourceTarget = join(sandbox, 'source-stdio-game')
  const projectOwnedTarget = join(sandbox, 'project-owned-stdio-game')
  const sourceClient = new Client({ name: 'waica-source-dist-smoke', version: '1.0.0' })
  const sourceTransport = new StdioClientTransport({
    command: process.execPath,
    args: [join(root, 'packages/cli/dist/cli.js'), 'mcp'],
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

    const projectOwnedCreated = await sourceClient.callTool(
      {
        name: 'create_project',
        arguments: { project_path: projectOwnedTarget, start: 'blank' },
      },
      undefined,
      { timeout: 10_000 },
    )
    assert.ok(
      !('toolResult' in projectOwnedCreated),
      'project-owned create_project unexpectedly became a task',
    )
    assert.equal(projectOwnedCreated.isError, undefined, sourceStderr)
    await mkdir(join(projectOwnedTarget, 'node_modules/@waica'), { recursive: true })
    for (const dependency of [
      '@waica/engine',
      '@waica/behaviors',
      '@waica/archetype-platformer',
      'three',
    ]) {
      await cp(
        join(nodeModules, ...dependency.split('/')),
        join(projectOwnedTarget, 'node_modules', ...dependency.split('/')),
        { recursive: true, dereference: true },
      )
    }
    const projectArchetypeRoot = join(
      projectOwnedTarget,
      'node_modules/@waica/archetype-platformer',
    )
    const projectArchetypePackage = JSON.parse(
      await readFile(join(projectArchetypeRoot, 'package.json'), 'utf8'),
    )
    projectArchetypePackage.version = '7.7.7'
    await writeFile(
      join(projectArchetypeRoot, 'package.json'),
      `${JSON.stringify(projectArchetypePackage, null, 2)}\n`,
    )
    await writeFile(
      join(projectArchetypeRoot, 'dist/manifest.js'),
      [
        "class ProjectOnly { static componentName = 'ProjectOnly'; static params = {}; value = 77 }",
        'export const ARCHETYPE = {',
        "  id: 'platformer', label: 'Project-owned platformer',",
        '  scene: { waicaScene: 3, entities: [] }, blankScene: { waicaScene: 3, entities: [] },',
        '  registry: { components: { ProjectOnly }, prefabs: {}, ui: {} },',
        '  palette: [], prefabs: {}, art: [], entityIcons: {}, bindings: {}, actionLabels: {},',
        '  bundle: { roles: {} },',
        '}',
      ].join('\n'),
    )
    const projectOwnedListed = await sourceClient.callTool(
      { name: 'list_components', arguments: { project_path: projectOwnedTarget } },
      undefined,
      { timeout: 10_000 },
    )
    assert.ok(
      !('toolResult' in projectOwnedListed),
      'project-owned list_components unexpectedly became a task',
    )
    assert.equal(
      projectOwnedListed.isError,
      undefined,
      `project-owned list_components failed: ${sourceStderr}`,
    )
    assert.deepEqual(
      projectOwnedListed.structuredContent?.components?.map((component) => component.componentName),
      ['ProjectOnly'],
      'the checkout CLI must load the project-owned manifest rather than its own workspace copy',
    )
    assert.deepEqual(
      projectOwnedListed.structuredContent?.provenance?.find(
        (row) => row.package === '@waica/archetype-platformer',
      ),
      { package: '@waica/archetype-platformer', version: '7.7.7', source: 'project' },
    )
  } finally {
    await sourceClient.close().catch(() => {})
  }

  const stdioTarget = join(sandbox, 'stdio-game')
  const client = new Client({ name: 'waica-dist-smoke', version: '1.0.0' })
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [packedCli, 'mcp'],
    cwd: sandbox,
    stderr: 'pipe',
  })
  let childStderr = ''
  transport.stderr?.on('data', (chunk) => {
    childStderr += chunk.toString()
  })
  try {
    await client.connect(transport, { timeout: 10_000 })
    // The packed CLI is the layout that ships, and the server resolves its
    // version by walking up from dist/mcp — which lands on the CLI's own
    // manifest here, not the one in packages/mcp. Only this rung exercises
    // that path; in a checkout the walk stops somewhere else entirely.
    assert.deepEqual(
      client.getServerVersion(),
      { name: '@waica/mcp', version: cliSource.version },
      'the packed server must report the shipping CLI version in its handshake',
    )
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

    await mkdir(join(stdioTarget, 'src/components'), { recursive: true })
    await mkdir(join(stdioTarget, 'src/objects'), { recursive: true })
    const componentSource = (target) =>
      [
        "import { Component } from '@waica/engine'",
        'export class PackedRef extends Component {',
        "  static componentName = 'PackedRef'",
        "  static params = { target: { ref: 'prefab' } }",
        `  target = ${JSON.stringify(target)}`,
        '}',
      ].join('\n')
    const componentFile = join(stdioTarget, 'src/components/packed-ref.ts')
    await writeFile(componentFile, componentSource('objects/missing-one'))
    await writeFile(
      join(stdioTarget, 'src/objects/probe.object.json'),
      JSON.stringify({
        waicaPrefab: 1,
        type: 'object',
        components: [{ type: 'PackedRef' }],
      }),
    )
    const validate = () =>
      client.callTool(
        { name: 'validate_project', arguments: { project_path: stdioTarget } },
        undefined,
        { timeout: 10_000 },
      )
    const firstValidation = await validate()
    assert.equal(
      firstValidation.isError,
      undefined,
      `packed validate_project failed: ${childStderr}`,
    )
    assert.ok(
      firstValidation.structuredContent?.findings?.some(
        (finding) =>
          finding.code === 'broken-prefab-ref' &&
          finding.ref === 'PackedRef.target' &&
          finding.message.includes('objects/missing-one'),
      ),
      'the packed MCP must execute project TypeScript and validate its ref metadata',
    )
    assert.ok(
      !firstValidation.structuredContent?.findings?.some((finding) =>
        finding.code.startsWith('component-load-'),
      ),
      'the packed native project-module loader must not report a load failure',
    )

    await writeFile(componentFile, componentSource('objects/missing-two'))
    const secondValidation = await validate()
    assert.ok(
      secondValidation.structuredContent?.findings?.some(
        (finding) =>
          finding.code === 'broken-prefab-ref' &&
          finding.message.includes('objects/missing-two'),
      ),
      'the packed long-lived MCP must observe an edited project module',
    )
  } finally {
    await client.close().catch(() => {})
  }

  console.log(
    'fresh packed packages load in plain Node and the packed `waica mcp` creates a project over real stdio',
  )
} finally {
  await rm(sandbox, { recursive: true, force: true })
}
