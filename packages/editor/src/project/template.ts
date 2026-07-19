// The project template: the SAME source `npm create waica` uses
// (?raw imports from the create-waica package) + the archetype's default scene.
import pkgTpl from '../../../create-waica/template/package.json.tpl?raw'
import indexHtml from '../../../create-waica/template/index.html?raw'
import mainTs from '../../../create-waica/template/src/main.ts?raw'
import tsconfigJson from '../../../create-waica/template/tsconfig.json?raw'
import viteConfigTs from '../../../create-waica/template/vite.config.ts?raw'
import readmeMd from '../../../create-waica/template/README.md?raw'
import gitignore from '../../../create-waica/template/_gitignore?raw'
import { ACTIVE_ARCHETYPE } from './archetype'

const WAICA_VERSION = '0.1.0'

/** Files for a fresh waica project (active archetype). */
export function projectFiles(name: string): Record<string, string> {
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
    'src/scenes/main.scene.json': JSON.stringify(ACTIVE_ARCHETYPE.scene, null, 2) + '\n',
    'public/waica.params.json': '{}\n',
  }
  // One file per prefab, mirroring its ref: 'characters/slime' (type
  // 'character') → src/characters/slime.character.json. scripts/sync-scene.mjs
  // materializes the same layout into the wizard template and the repo example.
  for (const [key, prefab] of Object.entries(ACTIVE_ARCHETYPE.registry.prefabs ?? {})) {
    files[`src/${key}.${prefab.type}.json`] = JSON.stringify(prefab, null, 2) + '\n'
  }
  return files
}
