import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import {
  access,
  mkdir,
  mkdtemp,
  readFile,
  realpath,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
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
  if (result.status !== 0) {
    const output = [result.stdout, result.stderr].filter(Boolean).join('\n')
    throw new Error(`${command} ${args.join(' ')} failed (${result.status})\n${output}`)
  }
  return result
}

try {
  await mkdir(join(nodeModules, '@waica'), { recursive: true })

  for (const pkg of packages) {
    const packageRoot = join(root, 'packages', pkg.directory)
    const distEntry = join(packageRoot, 'dist', 'index.js')
    await access(distEntry).catch(() => {
      throw new Error(`Missing ${distEntry}; run pnpm build before pnpm test:dist`)
    })

    const archive = join(sandbox, `${pkg.directory}.tgz`)
    run('pnpm', ['pack', '--out', archive], { cwd: packageRoot })

    const destination = join(nodeModules, ...pkg.name.split('/'))
    await mkdir(destination, { recursive: true })
    run('tar', ['-xzf', archive, '--strip-components=1', '-C', destination])
  }

  const platformerSource = JSON.parse(
    await readFile(join(root, 'packages/archetype-platformer/package.json'), 'utf8'),
  )
  const platformerPacked = JSON.parse(
    await readFile(join(nodeModules, '@waica/archetype-platformer/package.json'), 'utf8'),
  )
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

  const threeSource = await realpath(join(root, 'node_modules/three'))
  await symlink(threeSource, join(nodeModules, 'three'), 'dir')

  const probe = join(sandbox, 'probe.mjs')
  await writeFile(
    probe,
    [
      "await import('@waica/engine')",
      "await import('@waica/behaviors')",
      "const { ARCHETYPE } = await import('@waica/archetype-platformer/manifest')",
      "if (ARCHETYPE?.id !== 'platformer') throw new Error('invalid platformer manifest')",
      "if ('artUrls' in ARCHETYPE) throw new Error('Node-safe manifest imported browser art URLs')",
    ].join('\n'),
  )
  run(process.execPath, [probe], { cwd: sandbox })

  console.log('dist packages load in plain Node, including @waica/archetype-platformer/manifest')
} finally {
  await rm(sandbox, { recursive: true, force: true })
}
