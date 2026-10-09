import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

// @waica/behaviors has no Node typings in its tsconfig, so the source scan of
// issue #159 CA-2 runs here, where fs is typed; the tagged set itself is
// asserted in packages/behaviors/src/component-space.test.ts.
const BEHAVIORS_SRC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../behaviors/src')

/** What marks a behavior source as written for the x/y world: the 2D solver, 2D components, 2D query forms and y bounds. */
const TWO_D_SIGNALS: readonly { signal: string; pattern: RegExp }[] = [
  { signal: 'resolveSolidAxis', pattern: /\bresolveSolidAxis\b/ },
  { signal: 'Hitbox/Solid/DynamicBody', pattern: /\b(?:Hitbox|Solid|DynamicBody)\b/ },
  { signal: 'game.query 2D form', pattern: /\bquery\.(?:area|point|nearest|ray)\(/ },
  { signal: 'position.y bound', pattern: /\bposition\.y\s*[<>]/ },
]

/** A source that declares a component class: a named concrete one, or an abstract base that extends Component. */
const DECLARES_COMPONENT = /static override componentName\b|abstract class \w+\s+extends Component\b|\n {2}extends Component\b/

describe('behavior sources that assume 2D carry the marker (issue #159 CA-2)', () => {
  const sources = readdirSync(BEHAVIORS_SRC).filter((file) => file.endsWith('.ts') && !file.endsWith('.test.ts'))

  it('finds the behavior sources', () => {
    expect(sources.length).toBeGreaterThan(20)
  })

  it('fails on any component source showing a 2D signal without static space = 2d', () => {
    const untagged: string[] = []
    for (const file of sources) {
      const text = readFileSync(path.join(BEHAVIORS_SRC, file), 'utf8')
      if (!DECLARES_COMPONENT.test(text)) continue
      const shown = TWO_D_SIGNALS.filter(({ pattern }) => pattern.test(text)).map(({ signal }) => signal)
      if (shown.length === 0 || /static override space = '2d'/.test(text)) continue
      untagged.push(`${file}: ${shown.join(', ')}`)
    }
    expect(untagged).toEqual([])
  })

  it('does see the signals it greps for', () => {
    const flagged = sources.filter((file) => {
      const text = readFileSync(path.join(BEHAVIORS_SRC, file), 'utf8')
      return DECLARES_COMPONENT.test(text) && TWO_D_SIGNALS.some(({ pattern }) => pattern.test(text))
    })
    expect(flagged).toEqual([
      'chaser.ts',
      'click-to-move.ts',
      'collectible.ts',
      'grid-motor.ts',
      'hazard.ts',
      'interactable.ts',
      'melee-attack.ts',
      'out-of-bounds.ts',
      'platformer-motor.ts',
      'scene-transition.ts',
    ])
  })
})
