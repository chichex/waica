import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const root = path.resolve(import.meta.dirname, '../../..')
const text = (file: string): Promise<string> => readFile(path.join(root, file), 'utf8')

describe('the 3D simulation docs (issue #159 CA-25)', () => {
  it('records the decision in ADR 0028 with its measurements, seams and rejected alternatives', async () => {
    const adr = await text('docs/adr/0028-3d-scenes-simulate-with-rapier.md')

    expect(adr).toMatch(/^# 3D scenes simulate with Rapier/)
    for (const topic of [
      /rapier3d-deterministic-compat/,
      /0\.42 ms/,
      /dynamic `import\(\)`/,
      /pending asset/,
      /`RigidBody`/,
      /ADR 0016/,
      /KinematicCharacterController/,
      /2D is untouched/,
      /hand-rolled 3D solver/,
      /SIMD build/,
      /static import/,
    ]) {
      expect(adr, String(topic)).toMatch(topic)
    }
  })

  it('defines Collider, Rigid Body, Physics World, Simulation Block, Character Motor and Component Space in the glossary', async () => {
    const glossary = await text('CONTEXT.md')

    for (const term of ['Collider', 'Rigid Body', 'Physics World', 'Simulation Block', 'Character Motor', 'Component Space']) {
      expect(glossary, term).toMatch(new RegExp(`\\*\\*${term}\\*\\*:\\n[^\\n]+\\n_Avoid_: [^\\n]+`))
    }
  })

  it('documents each concern in the engine README and the migration of the space marker', async () => {
    const readme = await text('packages/engine/README.md')
    const scenes = readme.slice(readme.indexOf('## 3D scenes'))

    for (const bullet of ['Simulation', 'Collider', 'RigidBody', 'Contacts and sensors', 'Queries', 'Runtime Snapshot']) {
      expect(scenes, bullet).toContain(`- **${bullet}.**`)
    }
    expect(readme).toMatch(/Migrating to `<next minor>`[\s\S]*static space[\s\S]*component-space-mismatch/)
  })
})
