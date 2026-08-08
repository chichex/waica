// The project template: the chassis files a fresh project starts from
// (?raw imports from ../../template) + the archetype's default scene.
import pkgTpl from '../../template/package.json.tpl?raw'
import indexHtml from '../../template/index.html?raw'
import mainTs from '../../template/src/main.ts?raw'
import controlsJson from '../../template/src/controls.json?raw'
import statsJson from '../../template/src/stats.json?raw'
import gameJson from '../../template/src/game.json?raw'
import tsconfigJson from '../../template/tsconfig.json?raw'
import viteConfigTs from '../../template/vite.config.ts?raw'
import readmeMd from '../../template/README.md?raw'
import gitignore from '../../template/_gitignore?raw'
import { archetypePackageName, resolveArchetype, type ArchetypeManifest } from './archetype'
import enginePackage from '../../../engine/package.json'

// The @waica/* range a fresh project depends on, read from the engine rather
// than written down here: the published libraries move in lockstep, so the
// version that ships is the one the generated package.json must ask npm for.
// packages/mcp/src/create-project.ts derives the same number the same way.
const WAICA_VERSION = enginePackage.version

/** How a new project starts: the archetype's demo level, or just the chassis. */
export type ProjectStart = 'demo' | 'blank'

// Demo projects own their art as files, so their JSON references the file
// path ('src/art/waica-dog.png'), never the registry URI ('waica:dog').
function projectUriMap(archetype: ArchetypeManifest): Record<string, string> {
  return Object.fromEntries(
    archetype.art.map((art) => [art.uri, `src/art/${art.file}`]),
  )
}

/** Serializes scene/prefab JSON, mapping stock-art URIs to project paths. */
function projectJson(value: unknown, archetype: ArchetypeManifest): string {
  const uriToPath = projectUriMap(archetype)
  const json = JSON.stringify(
    value,
    (_key, v: unknown) => (typeof v === 'string' ? (uriToPath[v] ?? v) : v),
    2,
  )
  return json + '\n'
}

/**
 * Binary companions to projectFiles(): art to materialize, path → fetchable
 * URL (the archetype's bundled asset). Empty for blank projects.
 */
export function projectArtFiles(
  start: ProjectStart = 'demo',
  archetypeId = 'platformer',
): Record<string, string> {
  if (start === 'blank') return {}
  const archetype = resolveArchetype(archetypeId)
  return Object.fromEntries(
    archetype.art.map((art) => [
      `src/art/${art.file}`,
      archetype.artUrls[art.file] ?? art.uri,
    ]),
  )
}

/** Files for a fresh waica project, resolved from the picked archetype. */
export function projectFiles(
  name: string,
  start: ProjectStart = 'demo',
  archetypeId = 'platformer',
): Record<string, string> {
  const archetype = resolveArchetype(archetypeId)
  const scene = start === 'demo' ? archetype.scene : archetype.blankScene
  const game = { ...(JSON.parse(gameJson) as Record<string, unknown>), archetype: archetype.id }
  const controls = {
    ...(JSON.parse(controlsJson) as Record<string, unknown>),
    bindings: archetype.bindings,
  }
  const archetypePackage = archetypePackageName(archetype.id)
  const files: Record<string, string> = {
    'package.json': pkgTpl
      .replaceAll('__PROJECT_NAME__', name)
      .replaceAll('__WAICA_VERSION__', WAICA_VERSION)
      .replaceAll('__ARCHETYPE_PACKAGE__', archetypePackage),
    'index.html': indexHtml,
    'tsconfig.json': tsconfigJson,
    'vite.config.ts': viteConfigTs,
    'README.md': readmeMd,
    '.gitignore': gitignore,
    'src/main.ts': mainTs.replaceAll('__ARCHETYPE_PACKAGE__', archetypePackage),
    'src/controls.json': JSON.stringify(controls, null, 2) + '\n',
    'src/stats.json': statsJson,
    'src/game.json': JSON.stringify(game, null, 2) + '\n',
    'src/scenes/main.scene.json': projectJson(scene, archetype),
    'public/waica.params.json': '{}\n',
  }
  // A blank project ships only the chassis: no prefab, UI or art files, and
  // its scene is empty. It starts with nothing because it HAS nothing —
  // no archetype default resolves behind the editor's back.
  if (start === 'blank') return files
  // One file per prefab, mirroring its ref: 'characters/slime' (type
  // 'character') → src/characters/slime.character.json. scripts/sync-scene.mjs
  // materializes the same layout into the wizard template and the repo example.
  for (const [key, prefab] of Object.entries(archetype.prefabs)) {
    files[`src/${key}.${prefab.type}.json`] = projectJson(prefab, archetype)
  }
  // UI pieces are plain HTML files: presentation only, toggled from code.
  for (const [name, html] of Object.entries(archetype.registry.ui ?? {})) {
    files[`src/ui/${name}.html`] = html
  }
  return files
}
