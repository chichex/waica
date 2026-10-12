import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const root = path.resolve(import.meta.dirname, '../../..')
const text = (file: string): Promise<string> => readFile(path.join(root, file), 'utf8')

/** One `**Term**:` entry of the glossary, in the form physics-docs.test.ts pins. */
const glossaryEntry = (term: string): RegExp => new RegExp(`\\*\\*${term}\\*\\*:\\n[^\\n]+\\n_Avoid_: [^\\n]+`)

describe('the 3D animation docs, layer 1 (issue #166 CA-4)', () => {
  it('documents clip:end beside the other triggers and the Clip Target in the engine README', async () => {
    const readme = await text('packages/engine/README.md')
    const start = readme.indexOf('## State machines')
    expect(start, 'a ## State machines section').toBeGreaterThan(0)
    const section = readme.slice(start, readme.indexOf('\n## ', start + 1))

    for (const trigger of ['`input:<action>`', '`timer:<seconds>`', '`signal:<name>`', '`clip:end`']) {
      expect(section, trigger).toContain(trigger)
    }
    expect(section).toMatch(/Clip Target/)
    expect(section).toMatch(/`AnimatedSprite`[^\n]*`Animator`|`Animator`[^\n]*`AnimatedSprite`/)
    expect(section).toMatch(/first sibling/)
  })

  it('defines Clip Target in the glossary', async () => {
    const glossary = await text('CONTEXT.md')

    expect(glossary).toMatch(glossaryEntry('Clip Target'))
  })
})
