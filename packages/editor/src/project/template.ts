// The project template: the SAME source `npm create waica` uses
// (?raw imports from the create-waica package) + the archetype's default scene.
import pkgTpl from '../../../create-waica/template/package.json.tpl?raw'
import indexHtml from '../../../create-waica/template/index.html?raw'
import mainTs from '../../../create-waica/template/src/main.ts?raw'
import controlsJson from '../../../create-waica/template/src/controls.json?raw'
import statsJson from '../../../create-waica/template/src/stats.json?raw'
import gameJson from '../../../create-waica/template/src/game.json?raw'
import tsconfigJson from '../../../create-waica/template/tsconfig.json?raw'
import viteConfigTs from '../../../create-waica/template/vite.config.ts?raw'
import readmeMd from '../../../create-waica/template/README.md?raw'
import gitignore from '../../../create-waica/template/_gitignore?raw'
import { ACTIVE_ARCHETYPE } from './archetype'

const WAICA_VERSION = '0.1.0'

/** How a new project starts: the archetype's demo level, or just the chassis. */
export type ProjectStart = 'demo' | 'blank'

// Demo projects own their art as files, so their JSON references the file
// path ('src/art/waica-dog.png'), never the registry URI ('waica:dog').
const URI_TO_PATH = Object.fromEntries(
  ACTIVE_ARCHETYPE.art.map((art) => [art.uri, `src/art/${art.file}`]),
)

/** Serializes scene/prefab JSON, mapping stock-art URIs to project paths. */
function projectJson(value: unknown): string {
  const json = JSON.stringify(
    value,
    (_key, v: unknown) => (typeof v === 'string' ? (URI_TO_PATH[v] ?? v) : v),
    2,
  )
  return json + '\n'
}

/**
 * Binary companions to projectFiles(): art to materialize, path → fetchable
 * URL (the archetype's bundled asset). Empty for blank projects.
 */
export function projectArtFiles(start: ProjectStart = 'demo'): Record<string, string> {
  if (start === 'blank') return {}
  return Object.fromEntries(
    ACTIVE_ARCHETYPE.art.map((art) => [
      `src/art/${art.file}`,
      ACTIVE_ARCHETYPE.artUrls[art.file] ?? art.uri,
    ]),
  )
}

/** Files for a fresh waica project (active archetype). */
export function projectFiles(name: string, start: ProjectStart = 'demo'): Record<string, string> {
  const scene = start === 'demo' ? ACTIVE_ARCHETYPE.scene : ACTIVE_ARCHETYPE.blankScene
  const files: Record<string, string> = {
    'package.json': pkgTpl
      .replaceAll('__PROJECT_NAME__', name)
      .replaceAll('__WAICA_VERSION__', WAICA_VERSION),
    'index.html': indexHtml,
    'tsconfig.json': tsconfigJson,
    'vite.config.ts': viteConfigTs,
    'README.md': readmeMd,
    '.gitignore': gitignore,
    'src/main.ts': mainTs,
    'src/controls.json': controlsJson,
    'src/stats.json': statsJson,
    'src/game.json': gameJson,
    'src/scenes/main.scene.json': projectJson(scene),
    'public/waica.params.json': '{}\n',
  }
  // A blank project ships only the chassis: no prefab, UI or art files, and
  // its scene is empty. It starts with nothing because it HAS nothing —
  // no archetype default resolves behind the editor's back.
  if (start === 'blank') return files
  // One file per prefab, mirroring its ref: 'characters/slime' (type
  // 'character') → src/characters/slime.character.json. scripts/sync-scene.mjs
  // materializes the same layout into the wizard template and the repo example.
  for (const [key, prefab] of Object.entries(ACTIVE_ARCHETYPE.registry.prefabs ?? {})) {
    files[`src/${key}.${prefab.type}.json`] = projectJson(prefab)
  }
  // UI pieces are plain HTML files: presentation only, toggled from code.
  for (const [name, html] of Object.entries(ACTIVE_ARCHETYPE.registry.ui ?? {})) {
    files[`src/ui/${name}.html`] = html
  }
  return files
}
