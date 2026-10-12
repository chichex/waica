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

/** One bullet of the README's 3D scenes section, by its bold lead. */
async function bulletOf(name: string): Promise<string> {
  const readme = await text('packages/engine/README.md')
  const scenes = readme.slice(readme.indexOf('## 3D scenes'))
  const start = scenes.indexOf(`- **${name}.**`)
  expect(start, `a ${name} bullet`).toBeGreaterThan(0)
  return scenes.slice(start, scenes.indexOf('\n', start))
}

describe('the 3D animation docs, layer 2 (issue #166 CA-12)', () => {
  it('records the decision in ADR 0029: the Clip Target, the step clock, the fade, the overrides and what stays out', async () => {
    const adr = await text('docs/adr/0029-models-animate-through-an-animator-the-simulation-steps.md')

    expect(adr).toMatch(/^# Models animate through an Animator the simulation steps/)
    for (const topic of [/Clip Target/, /Simulation Step/, /`fade`/, /`clips`/, /`clip:end`/, /`AnimationMixer`/, /root motion/, /blend/, /retargeting/, /2D/]) {
      expect(adr, String(topic)).toMatch(topic)
    }
  })

  it('defines Animator in the glossary and updates Model and Assets Ready', async () => {
    const glossary = await text('CONTEXT.md')

    expect(glossary).toMatch(glossaryEntry('Animator'))
    expect(glossary).toMatch(/\*\*Model\*\*:\n[^\n]*Animator/)
    expect(glossary).toMatch(/\*\*Assets Ready\*\*:\n[^\n]*(model|glTF)/)
  })

  it('documents the Animator in the engine README and stops saying the clips are not played', async () => {
    const animator = await bulletOf('Animator')
    for (const topic of [/`initialClip`/, /`fade`/, /`clips`/, /loop/, /speed/, /before the (model|file|glTF) (loads|settles|has loaded)/, /`clip:end`/, /2D scene/, /animator-without-model/, /missing-clip/]) {
      expect(animator, String(topic)).toMatch(topic)
    }
    expect(await bulletOf('Model')).not.toMatch(/not played/)
    expect(await bulletOf('Model')).toMatch(/Animator/)
  })
})
