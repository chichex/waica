// Behavior sources for the read-only Scripts view, keyed by componentName.
// Imported relatively: @waica/behaviors only exports its index, so a deep
// '@waica/behaviors/src/*.ts?raw' import would not resolve through the
// package exports map. Vite bundles ?raw sources at build time.
import collectible from '../../../behaviors/src/collectible.ts?raw'
import hazard from '../../../behaviors/src/hazard.ts?raw'
import patrol from '../../../behaviors/src/patrol.ts?raw'
import platformerAnimator from '../../../behaviors/src/platformer-animator.ts?raw'
import platformerMovement from '../../../behaviors/src/platformer-movement.ts?raw'
import respawnable from '../../../behaviors/src/respawnable.ts?raw'

export interface ScriptSource {
  file: string
  source: string
}

export const SCRIPT_SOURCES: Record<string, ScriptSource> = {
  Collectible: { file: 'collectible.ts', source: collectible },
  Hazard: { file: 'hazard.ts', source: hazard },
  Patrol: { file: 'patrol.ts', source: patrol },
  PlatformerAnimator: { file: 'platformer-animator.ts', source: platformerAnimator },
  PlatformerMovement: { file: 'platformer-movement.ts', source: platformerMovement },
  Respawnable: { file: 'respawnable.ts', source: respawnable },
}

export function scriptSource(name: string): ScriptSource {
  return (
    SCRIPT_SOURCES[name] ?? {
      file: `${name}.ts`,
      source: `// The source of ${name} ships with @waica/behaviors.\n`,
    }
  )
}
