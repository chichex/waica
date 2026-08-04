import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'
import {
  access,
  cp,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  writeFile,
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, extname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const sandbox = await mkdtemp(join(tmpdir(), 'waica-dist-'))
const nodeModules = join(sandbox, 'node_modules')
const packages = [
  { directory: 'engine', name: '@waica/engine' },
  { directory: 'behaviors', name: '@waica/behaviors' },
  { directory: 'archetype-platformer', name: '@waica/archetype-platformer' },
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
    .filter((path) => path.endsWith('.ts') && !path.endsWith('.test.ts') && !path.endsWith('.d.ts'))
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
    await cp(source, destination, { recursive: true })
  }
}

try {
  await mkdir(join(nodeModules, '@waica'), { recursive: true })
  const packedManifests = new Map()

  for (const pkg of packages) {
    const packageRoot = join(root, 'packages', pkg.directory)
    const distEntry = join(packageRoot, 'dist', 'index.js')
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

  console.log('fresh packed packages and both platformer entry points load in plain Node')
} finally {
  await rm(sandbox, { recursive: true, force: true })
}
