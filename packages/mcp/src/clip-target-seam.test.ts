import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const here = path.dirname(fileURLToPath(import.meta.url))
const STATE_MACHINE = path.resolve(here, '../../engine/src/state/state-machine.ts')

/**
 * The Clip Target seam (issue #166 CA-1): the state machine talks to whatever
 * sibling plays clips through `isClipTarget`, so it must not import
 * AnimatedSprite — the 3D Animator is found the same way.
 */
describe('state/state-machine.ts stays space-agnostic (issue #166 CA-1)', () => {
  const source = readFileSync(STATE_MACHINE, 'utf8')

  it('imports nothing from components/animated-sprite', () => {
    expect(source).not.toMatch(/animated-sprite/)
    const imports = source.match(/^import[\s\S]*?from\s+['"][^'"]+['"]/gm) ?? []
    expect(imports.length).toBeGreaterThan(0)
    for (const statement of imports) expect(statement).not.toMatch(/\bAnimatedSprite\b/)
  })

  it('resolves its target through the Clip Target seam', () => {
    expect(source).toMatch(/isClipTarget/)
  })
})
