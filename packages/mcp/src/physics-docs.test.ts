import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { defined } from '../../engine/src/test-support.js'

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
    // Anchored on the note's subject, not on the version placeholder the release renames (PR #164 finding 2).
    expect(readme).toMatch(/## Migrating to [^\n]*3D scenes[\s\S]*static space[\s\S]*component-space-mismatch/)
  })
})

/** One bullet of the README's 3D scenes section, by its bold lead. */
async function bulletOf(name: string): Promise<string> {
  const readme = await text('packages/engine/README.md')
  const scenes = readme.slice(readme.indexOf('## 3D scenes'))
  const start = scenes.indexOf(`- **${name}.**`)
  return scenes.slice(start, scenes.indexOf('\n', start))
}

describe('the 3D simulation docs after the review (PR #164 findings 3, 4 and the layer 1 rule)', () => {
  it('states the capsule radius scaling, every invalid-collider-param, grounded, the sensor default and the 2D behaviors', async () => {
    const readme = await text('packages/engine/README.md')
    const scenes = readme.slice(readme.indexOf('## 3D scenes'))

    expect(await bulletOf('Collider')).toMatch(/sphere.{0,40}largest axis/)
    expect(await bulletOf('Collider')).toMatch(/capsule.{0,40}larger of x and z/)
    expect(await bulletOf('Collider')).toMatch(/twice its radius/)
    expect(await bulletOf('Collider')).toMatch(/friction or restitution outside 0 to 1/)
    expect(await bulletOf('Collider')).toMatch(/offset/)
    expect(await bulletOf('RigidBody')).not.toMatch(/`applyImpulse` and `grounded` are its public API/)
    expect(await bulletOf('RigidBody')).toMatch(/invalid-rigid-body-param/)
    expect(await bulletOf('Contacts and sensors')).toMatch(/default mask.{0,80}fixed/)
    expect(await bulletOf('Contacts and sensors')).toMatch(/kinematic/)
    const intro = scenes.slice(0, scenes.indexOf('```json'))
    const migration = defined(readme.split('\n').find((line) => line.startsWith('- **Components declare their space on the class')))
    for (const sentence of [intro, migration]) {
      for (const marked of ['`DamagePuff`', '`DustPuffs`', '`DustTrail`', '`SwingSparks`']) expect(sentence, marked).toContain(marked)
      for (const neutral of ['`Collectible`', '`SceneTransition`', '`OutOfBounds`', '`Respawnable`']) expect(sentence, neutral).not.toContain(neutral)
    }
  })
})
