// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest'

vi.mock('three/webgpu', async (importOriginal) =>
  (await import('../test-renderer.js')).withFakeRenderer(await importOriginal()),
)

import { Component, type BodyContact, type SolidContact } from '../component.js'
import type { SceneComponentJson, SceneEntityJson } from '../scene.js'
import { use3dTestEnvironment } from '../test-game-3d.js'
import { FLOOR, physicsFixture } from '../test-physics-3d.js'

use3dTestEnvironment()

class Recorder extends Component {
  static override componentName = 'Recorder'
  static contacts: BodyContact[] = []
  static legacy: SolidContact[] = []
  override onBodyContact(contact: BodyContact): void {
    Recorder.contacts.push(contact)
  }
  override onContact(contact: SolidContact): void {
    Recorder.legacy.push(contact)
  }
}

const withRecorder = (name: string, y: number, extra: SceneComponentJson[] = []): SceneEntityJson => ({
  name,
  position: [0, y, 0],
  components: [{ type: 'Collider' }, { type: 'RigidBody' }, { type: 'Recorder' }, ...extra],
})

describe('body contacts (CA-15)', () => {
  it('tells a resting box about the floor once per step, with a normal pointing to it', async () => {
    Recorder.contacts = []
    const { step } = await physicsFixture([FLOOR, withRecorder('Crate', 0.6)], { components: { Recorder } })
    step(60)
    Recorder.contacts = []

    step(1)

    expect(Recorder.contacts).toHaveLength(1)
    const [contact] = Recorder.contacts
    expect(contact?.entity.name).toBe('Crate')
    expect(contact?.other.name).toBe('Floor')
    expect(contact?.normal.x).toBeCloseTo(0, 5)
    expect(contact?.normal.y).toBeCloseTo(-1, 5)
    expect(contact?.normal.z).toBeCloseTo(0, 5)
    expect(contact?.point.y).toBeCloseTo(0, 1)
    expect(Math.abs(contact?.point.x ?? 9)).toBeLessThanOrEqual(0.6)
  })

  it('reports each side its own normal: the floor is pushed upward from the box', async () => {
    Recorder.contacts = []
    const { game, step } = await physicsFixture(
      [{ ...FLOOR, components: [...(FLOOR.components ?? []), { type: 'Recorder' }] }, withRecorder('Crate', 0.6)],
      { components: { Recorder } },
    )
    step(60)
    Recorder.contacts = []

    step(1)

    const onFloor = Recorder.contacts.find((contact) => contact.entity === game.find('Floor'))
    expect(onFloor?.other.name).toBe('Crate')
    expect(onFloor?.normal.y).toBeCloseTo(1, 5)
    expect(Recorder.contacts).toHaveLength(2)
  })
})

describe('body contacts: silence and sensors (CA-15)', () => {
  it('stays silent while nothing touches, and for the hook-less components of a touching body', async () => {
    Recorder.contacts = []
    const { step } = await physicsFixture([FLOOR, withRecorder('High', 10)], { components: { Recorder } })

    step(5)

    expect(Recorder.contacts).toEqual([])
  })

  it('leaves the 2D onContact hook alone', async () => {
    Recorder.contacts = []
    Recorder.legacy = []
    const { step } = await physicsFixture([FLOOR, withRecorder('Crate', 0.6)], { components: { Recorder } })

    step(30)

    expect(Recorder.contacts.length).toBeGreaterThan(0)
    expect(Recorder.legacy).toEqual([])
  })

  it('does not report contact with a sensor', async () => {
    Recorder.contacts = []
    const { step } = await physicsFixture(
      [
        { name: 'Zone', position: [0, 0.5, 0], components: [{ type: 'Collider', props: { sensor: true, size: [4, 1, 4] } }] },
        withRecorder('Crate', 0.5),
      ],
      { components: { Recorder }, simulation: { gravity: [0, 0, 0] } },
    )

    step(10)

    expect(Recorder.contacts).toEqual([])
  })
})
