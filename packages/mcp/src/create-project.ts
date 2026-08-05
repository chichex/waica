import type { ArchetypeManifest } from '@waica/engine'
import { access, mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  PackageResolver,
  mixedSourceWarnings,
  provenanceRows,
  type Provenance,
} from './package-resolver.js'
import { assertAbsoluteProjectPath } from './project-path.js'

export type ProjectStart = 'demo' | 'blank'

export interface CreateProjectResult {
  projectPath: string
  name: string
  start: ProjectStart
  createdFiles: string[]
  nextSteps: string
  provenance: Provenance[]
  warnings: string[]
}

const moduleDirectory = path.dirname(fileURLToPath(import.meta.url))

async function exists(target: string): Promise<boolean> {
  try {
    await access(target)
    return true
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false
    throw error
  }
}

async function templateRoot(): Promise<string> {
  const built = path.join(moduleDirectory, 'template')
  if (await exists(path.join(built, 'package.json.tpl'))) return built
  const source = path.resolve(moduleDirectory, '../../editor/template')
  if (await exists(path.join(source, 'package.json.tpl'))) return source
  throw new Error('Waica project template is missing from this MCP installation.')
}

function projectUriMap(archetype: ArchetypeManifest): Record<string, string> {
  return Object.fromEntries(archetype.art.map((art) => [art.uri, `src/art/${art.file}`]))
}

function projectJson(value: unknown, archetype: ArchetypeManifest): string {
  const uris = projectUriMap(archetype)
  return (
    JSON.stringify(
      value,
      (_key, entry: unknown) =>
        typeof entry === 'string' ? (uris[entry] ?? entry) : entry,
      2,
    ) + '\n'
  )
}

async function chassisFiles(
  root: string,
  name: string,
  start: ProjectStart,
  version: string,
  archetype: ArchetypeManifest,
): Promise<Record<string, string | Uint8Array>> {
  const read = (relative: string): Promise<string> => readFile(path.join(root, relative), 'utf8')
  const [pkgTpl, indexHtml, mainTs, controlsText, statsJson, gameText, tsconfig, vite, readme, gitignore, params] =
    await Promise.all([
      read('package.json.tpl'),
      read('index.html'),
      read('src/main.ts'),
      read('src/controls.json'),
      read('src/stats.json'),
      read('src/game.json'),
      read('tsconfig.json'),
      read('vite.config.ts'),
      read('README.md'),
      read('_gitignore'),
      read('public/waica.params.json'),
    ])
  const controls = {
    ...(JSON.parse(controlsText) as Record<string, unknown>),
    bindings: archetype.bindings,
  }
  const game = {
    ...(JSON.parse(gameText) as Record<string, unknown>),
    archetype: archetype.id,
  }
  const scene = start === 'demo' ? archetype.scene : archetype.blankScene
  return {
    'package.json': pkgTpl
      .replaceAll('__PROJECT_NAME__', name)
      .replaceAll('__WAICA_VERSION__', version),
    'index.html': indexHtml,
    'tsconfig.json': tsconfig,
    'vite.config.ts': vite,
    'README.md': readme,
    '.gitignore': gitignore,
    'src/main.ts': mainTs,
    'src/controls.json': JSON.stringify(controls, null, 2) + '\n',
    'src/stats.json': statsJson,
    'src/game.json': JSON.stringify(game, null, 2) + '\n',
    'src/scenes/main.scene.json': projectJson(scene, archetype),
    'public/waica.params.json': params,
  }
}

async function validateTarget(target: string): Promise<{ exists: boolean; name: string }> {
  assertAbsoluteProjectPath(target)
  const name = path.basename(path.normalize(target))
  if (!/^[a-z0-9][a-z0-9-_.]*$/.test(name)) {
    throw new Error(
      `Project name "${name}" is invalid; it must match /^[a-z0-9][a-z0-9-_.]*$/.`,
    )
  }
  const parent = path.dirname(target)
  let parentInfo
  try {
    parentInfo = await stat(parent)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new Error(`Project parent directory does not exist: ${parent}`)
    }
    throw error
  }
  if (!parentInfo.isDirectory()) throw new Error(`Project parent is not a directory: ${parent}`)

  try {
    const targetInfo = await stat(target)
    if (!targetInfo.isDirectory()) throw new Error(`Project target is a file: ${target}`)
    const found = (await readdir(target)).sort()
    if (found.length) {
      throw new Error(`Project target is not empty; found: ${found.join(', ')}`)
    }
    return { exists: true, name }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { exists: false, name }
    throw error
  }
}

/** Creates one project without installing dependencies or overwriting files. */
export async function createProject(
  projectPath: string,
  start: ProjectStart = 'demo',
): Promise<CreateProjectResult> {
  if (start !== 'demo' && start !== 'blank') throw new Error('start must be "demo" or "blank"')
  const target = await validateTarget(projectPath)
  const resolver = new PackageResolver()
  const [engine, behaviors, archetypePackage] = await Promise.all([
    resolver.load('@waica/engine'),
    resolver.load('@waica/behaviors'),
    resolver.load<{ ARCHETYPE: ArchetypeManifest }>('@waica/archetype-platformer', './manifest'),
  ])
  const archetype = archetypePackage.module.ARCHETYPE
  const files = await chassisFiles(
    await templateRoot(),
    target.name,
    start,
    engine.provenance.version,
    archetype,
  )
  if (start === 'demo') {
    for (const [ref, prefab] of Object.entries(archetype.prefabs)) {
      files[`src/${ref}.${prefab.type}.json`] = projectJson(prefab, archetype)
    }
    for (const [name, html] of Object.entries(archetype.registry.ui ?? {})) {
      files[`src/ui/${name}.html`] = html
    }
    for (const art of archetype.art) {
      files[`src/art/${art.file}`] = await readFile(
        path.join(archetypePackage.packageRoot, 'assets', art.file),
      )
    }
  }

  if (!target.exists) await mkdir(projectPath)
  for (const [relative, contents] of Object.entries(files)) {
    const destination = path.join(projectPath, relative)
    await mkdir(path.dirname(destination), { recursive: true })
    await writeFile(destination, contents)
  }

  const provenance = provenanceRows([engine, behaviors, archetypePackage])
  return {
    projectPath,
    name: target.name,
    start,
    createdFiles: Object.keys(files).sort(),
    nextSteps: `cd ${target.name}\nnpm install\nnpm run dev`,
    provenance,
    warnings: mixedSourceWarnings(provenance),
  }
}
