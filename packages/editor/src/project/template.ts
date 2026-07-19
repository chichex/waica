// El template de proyecto: la MISMA fuente que usa `npm create waica`
// (?raw imports del paquete create-waica) + la escena default del arquetipo.
import pkgTpl from '../../../create-waica/template/package.json.tpl?raw'
import indexHtml from '../../../create-waica/template/index.html?raw'
import mainTs from '../../../create-waica/template/src/main.ts?raw'
import tsconfigJson from '../../../create-waica/template/tsconfig.json?raw'
import viteConfigTs from '../../../create-waica/template/vite.config.ts?raw'
import readmeMd from '../../../create-waica/template/README.md?raw'
import gitignore from '../../../create-waica/template/_gitignore?raw'
import { PLATFORMER_SCENE } from '@waica/archetype-platformer'

const WAICA_VERSION = '0.1.0'

/** Archivos de un proyecto waica nuevo (arquetipo plataformero). */
export function projectFiles(name: string): Record<string, string> {
  return {
    'package.json': pkgTpl
      .replaceAll('__PROJECT_NAME__', name)
      .replaceAll('__WAICA_VERSION__', WAICA_VERSION),
    'index.html': indexHtml,
    'tsconfig.json': tsconfigJson,
    'vite.config.ts': viteConfigTs,
    'README.md': readmeMd,
    '.gitignore': gitignore,
    'src/main.ts': mainTs,
    'src/scenes/main.scene.json': JSON.stringify(PLATFORMER_SCENE, null, 2) + '\n',
    'public/waica.params.json': '{}\n',
  }
}
