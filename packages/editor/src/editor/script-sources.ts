// Behavior sources for the read-only Scripts view, keyed by componentName.
// Imported relatively: @waica/behaviors only exports its index, so a deep
// '@waica/behaviors/src/*.ts?raw' import would not resolve through the
// package exports map. Vite bundles ?raw sources at build time.
import chaser from '../../../behaviors/src/chaser.ts?raw'
import collectible from '../../../behaviors/src/collectible.ts?raw'
import hazard from '../../../behaviors/src/hazard.ts?raw'
import gridMotor from '../../../behaviors/src/grid-motor.ts?raw'
import health from '../../../behaviors/src/health.ts?raw'
import isoMotor from '../../../behaviors/src/iso-motor.ts?raw'
import lifetime from '../../../behaviors/src/lifetime.ts?raw'
import meleeAttack from '../../../behaviors/src/melee-attack.ts?raw'
import outOfBounds from '../../../behaviors/src/out-of-bounds.ts?raw'
import patrol from '../../../behaviors/src/patrol.ts?raw'
import platformerMotor from '../../../behaviors/src/platformer-motor.ts?raw'
import respawnable from '../../../behaviors/src/respawnable.ts?raw'
import topdownMotor from '../../../behaviors/src/topdown-motor.ts?raw'
import stateMachine from '../../../engine/src/state/state-machine.ts?raw'

export interface ScriptSource {
  file: string
  source: string
}

function withGridMotor(file: string, subclass: string): string {
  const inlineSubclass = subclass.replace("import { GridMotor } from './grid-motor.js'\n", '')
  return [
    `// Shared implementation: grid-motor.ts`,
    gridMotor.trimEnd(),
    `// Component implementation: ${file}`,
    inlineSubclass,
  ].join('\n\n')
}

export const SCRIPT_SOURCES: Record<string, ScriptSource> = {
  Chaser: { file: 'chaser.ts', source: chaser },
  Collectible: { file: 'collectible.ts', source: collectible },
  GridMotor: { file: 'grid-motor.ts', source: gridMotor },
  Hazard: { file: 'hazard.ts', source: hazard },
  Health: { file: 'health.ts', source: health },
  IsoMotor: { file: 'iso-motor.ts', source: withGridMotor('iso-motor.ts', isoMotor) },
  Lifetime: { file: 'lifetime.ts', source: lifetime },
  MeleeAttack: { file: 'melee-attack.ts', source: meleeAttack },
  OutOfBounds: { file: 'out-of-bounds.ts', source: outOfBounds },
  Patrol: { file: 'patrol.ts', source: patrol },
  PlatformerMotor: { file: 'platformer-motor.ts', source: platformerMotor },
  Respawnable: { file: 'respawnable.ts', source: respawnable },
  StateMachine: { file: 'state-machine.ts', source: stateMachine },
  TopDownMotor: {
    file: 'topdown-motor.ts',
    source: withGridMotor('topdown-motor.ts', topdownMotor),
  },
}

export function scriptSource(name: string): ScriptSource {
  return (
    SCRIPT_SOURCES[name] ?? {
      file: `${name}.ts`,
      source: `// The source of ${name} ships with @waica/behaviors.\n`,
    }
  )
}
