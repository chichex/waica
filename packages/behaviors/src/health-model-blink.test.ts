// @vitest-environment happy-dom
import { expect, it, vi } from 'vitest'

// The engine's own copy of three, by path: this package does not depend on three.
vi.mock(
  new URL('../../engine/node_modules/three/build/three.webgpu.js', import.meta.url).pathname,
  async (importOriginal) =>
    (await import('../../engine/src/test-renderer.js')).withFakeRenderer(await importOriginal<Record<string, unknown>>()),
)

import { Model } from '@waica/engine'
import { use3dTestEnvironment } from '../../engine/src/test-game-3d.js'
import { physicsFixture } from '../../engine/src/test-physics-3d.js'
import { defined } from '../../engine/src/test-support.js'
import { Health } from './health.js'

// Issue #181 CA-18: the invulnerability blink hides and shows a 3D entity's Model.

use3dTestEnvironment()

it('blinks the node that holds a Model during the window and leaves it visible when it closes (CA-18)', async () => {
  const fixture = await physicsFixture(
    [{ name: 'Knight', components: [{ type: 'Model', props: { shape: 'box' } }, { type: 'Health', props: { max: 3, invulnerability: 0.5 } }] }],
    { components: { Model, Health } },
  )
  const knight = defined(fixture.game.find('Knight'))
  const model = defined(defined(knight.get(Model)).root, 'the Model root')
  expect(model.parent).toBe(knight.node)

  defined(knight.get(Health)).damage(1)
  const seen: boolean[] = []
  for (let frame = 0; frame < 36; frame += 1) {
    fixture.step(1)
    seen.push(knight.node.visible)
  }

  expect(seen.slice(0, 29)).toContain(false)
  expect(seen.slice(0, 29)).toContain(true)
  expect(seen.slice(30)).toEqual([true, true, true, true, true, true])
  expect(defined(knight.get(Health)).blinking).toBe(false)
})
