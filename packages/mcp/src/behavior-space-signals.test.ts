import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { describe, expect, it } from 'vitest'
import { componentSpaceOf, type SpaceMarked } from '@waica/engine'

// @waica/behaviors has no Node typings in its tsconfig, so the source scan of
// issue #159 CA-2 runs here, where fs is typed; the tagged set itself is
// asserted in packages/behaviors/src/component-space.test.ts.
const BEHAVIORS_SRC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../behaviors/src')

/**
 * What marks a behavior source as written for the x/y world, under the rule
 * of component-space.test.ts: the 2D solver, and the 2D collision or render
 * components it reads or requires. Matched as code, after the comments are
 * stripped, and never as a quoted name (an `updateAfter` entry orders an
 * update when the sibling is present; it does not require it). `game.query`
 * and `position.y` are not signals: every query has a 3D form and y is up
 * in both spaces.
 */
const TWO_D_SIGNALS: readonly { signal: string; pattern: RegExp }[] = [
  { signal: 'resolveSolidAxis', pattern: /\bresolveSolidAxis\b/ },
  { signal: '2D collision component', pattern: /(?<!['"])\b(?:Hitbox|Solid|DynamicBody)\b(?!['"])/ },
  { signal: '2D render component', pattern: /(?<!['"])\b(?:Sprite|AnimatedSprite|Tilemap|Light|ParticleEmitter)\b(?!['"])/ },
]

/** A source that declares a component class: a named concrete one, or an abstract base that extends Component. */
const DECLARES_COMPONENT = /static override componentName\b|abstract class \w+\s+extends Component\b|\n {2}extends Component\b/

const SOURCES = readdirSync(BEHAVIORS_SRC).filter((file) => file.endsWith('.ts') && !file.endsWith('.test.ts'))

/** The source without its block and line comments, so prose never counts as a signal. */
function withoutComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|\s)\/\/.*$/gm, '$1')
}

function codeOf(file: string): string {
  return withoutComments(readFileSync(path.join(BEHAVIORS_SRC, file), 'utf8'))
}

function signalsIn(code: string): string[] {
  return TWO_D_SIGNALS.filter(({ pattern }) => pattern.test(code)).map(({ signal }) => signal)
}

/** The component sources that show at least one signal, with the signals. */
function flaggedSources(): { file: string; shown: string[] }[] {
  return SOURCES.flatMap((file) => {
    const code = codeOf(file)
    const shown = DECLARES_COMPONENT.test(code) ? signalsIn(code) : []
    return shown.length > 0 ? [{ file, shown }] : []
  })
}

/** The component classes a behavior source exports, with the marker each one really carries (inherited or own). */
async function exportedClasses(file: string): Promise<{ name: string; space: string }[]> {
  const loaded: unknown = await import(pathToFileURL(path.join(BEHAVIORS_SRC, file)).href)
  const classes: { name: string; space: string }[] = []
  for (const value of Object.values(loaded as Record<string, unknown>)) {
    if (typeof value !== 'function' || !Object.hasOwn(value, 'componentName')) continue
    const name: unknown = Reflect.get(value, 'componentName')
    if (typeof name !== 'string') continue
    const space: unknown = Reflect.get(value, 'space')
    const marked: SpaceMarked = space === '2d' || space === '3d' || space === 'both' ? { space } : {}
    classes.push({ name, space: componentSpaceOf(marked) })
  }
  return classes
}

/** Every flagged source's class whose real marker is not '2d'. */
async function untaggedClasses(): Promise<string[]> {
  const untagged: string[] = []
  for (const { file, shown } of flaggedSources()) {
    for (const { name, space } of await exportedClasses(file)) {
      if (space !== '2d') untagged.push(`${file} (${name}, ${space}): ${shown.join(', ')}`)
    }
  }
  return untagged
}

describe('behavior sources that assume 2D carry the marker (issue #159 CA-2)', () => {
  it('finds the behavior sources', () => {
    expect(SOURCES.length).toBeGreaterThan(20)
  })

  it('fails on any component class whose source shows a 2D signal without the 2d marker', async () => {
    expect(await untaggedClasses()).toEqual([])
  })

  it('reads the marker a class inherits, not the text of its own file', async () => {
    expect(codeOf('topdown-motor.ts')).not.toMatch(/static override space/)
    expect(await exportedClasses('topdown-motor.ts')).toEqual([{ name: 'TopDownMotor', space: '2d' }])
  })

  it('does see the signals it greps for, in code and not in comments or quoted names', () => {
    expect(flaggedSources().map(({ file }) => file)).toEqual([
      'chaser.ts',
      'click-to-move.ts',
      'damage-puff.ts',
      'dust-puffs.ts',
      'dust-trail.ts',
      'grid-motor.ts',
      'melee-attack.ts',
      'platformer-motor.ts',
      'swing-sparks.ts',
    ])
    expect(signalsIn(withoutComments("/** its Hitbox mask */\nconst a = 1 // a Solid\nconst after = ['DynamicBody']\n"))).toEqual([])
    expect(signalsIn('this.entity.get(Hitbox)')).toEqual(['2D collision component'])
  })
})
