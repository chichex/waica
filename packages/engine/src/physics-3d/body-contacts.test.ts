// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest'

vi.mock('three/webgpu', async (importOriginal) =>
  (await import('../test-renderer.js')).withFakeRenderer(await importOriginal()),
)

import { Component, type BodyContact, type SolidContact } from '../component.js'
import { RigidBody } from '../components/rigid-body.js'
import type { SceneComponentJson, SceneEntityJson } from '../scene.js'
import { use3dTestEnvironment } from '../test-game-3d.js'
import { defined } from '../test-support.js'
import { FLOOR, physicsFixture, worldOf } from '../test-physics-3d.js'

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

/** Destroys its own entity the first time it touches anything. */
class Breaks extends Component {
  static override componentName = 'Breaks'
  override onBodyContact(): void {
    this.entity.destroy()
  }
}

/** Adds a second RigidBody (which rebuilds the body) the first time it touches anything. */
class Rebuilds extends Component {
  static override componentName = 'Rebuilds'
  static rebuilt = 0
  private done = false
  override onBodyContact(): void {
    if (this.done) return
    this.done = true
    Rebuilds.rebuilt += 1
    this.entity.add(RigidBody)
  }
}

const RESTING = (name: string, x: number, extra: SceneComponentJson[]): SceneEntityJson => ({
  name,
  position: [x, 0.5, 0],
  components: [{ type: 'Collider' }, { type: 'RigidBody' }, ...extra],
})

describe('body contacts survive handlers that change the world (PR #161 review)', () => {
  it('lets a handler destroy its own entity: no crash, and the entities after it still hear their contacts', async () => {
    Recorder.contacts = []
    const { game, step } = await physicsFixture(
      [FLOOR, RESTING('A', 0, [{ type: 'Breaks' }]), RESTING('B', 1, [{ type: 'Breaks' }]), RESTING('C', 3, [{ type: 'Recorder' }])],
      { components: { Breaks, Recorder } },
    )

    // The boxes start exactly on the floor: the first contacts come with the second step.
    expect(() => step(2)).not.toThrow()

    expect(game.find('A')).toBeUndefined()
    expect(game.find('B')).toBeUndefined()
    expect(Recorder.contacts.map((contact) => `${contact.entity.name}<-${contact.other.name}`)).toEqual(['C<-Floor'])
    expect(worldOf(game).bodiesOf(game.entities).map((record) => record.entity.name)).toEqual(['Floor', 'C'])
    step(1)
    expect(Recorder.contacts).toHaveLength(2)
  })

  it('lets a handler rebuild its own body: no crash, and the rebuilt body keeps hearing its contacts', async () => {
    Recorder.contacts = []
    Rebuilds.rebuilt = 0
    const { game, step } = await physicsFixture([FLOOR, RESTING('A', 0, [{ type: 'Rebuilds' }, { type: 'Recorder' }]), RESTING('B', 3, [{ type: 'Recorder' }])], {
      components: { Rebuilds, Recorder },
    })
    const before = defined(worldOf(game).recordOf(defined(game.find('A')))).shape.handle

    expect(() => step(2)).not.toThrow()

    expect(Rebuilds.rebuilt).toBe(1)
    expect(defined(worldOf(game).recordOf(defined(game.find('A')))).shape.handle).not.toBe(before)
    Recorder.contacts = []
    step(1)
    expect(Recorder.contacts.map((contact) => `${contact.entity.name}<-${contact.other.name}`).sort()).toEqual(['A<-Floor', 'B<-Floor'])
  })
})

describe('body contacts of kinematic bodies (PR #161 review)', () => {
  it('tells a kinematic body about the fixed floor it stands on and the kinematic body beside it', async () => {
    Recorder.contacts = []
    const kinematic = (name: string, x: number, extra: SceneComponentJson[] = []): SceneEntityJson => ({
      name,
      position: [x, 0.5, 0],
      components: [{ type: 'Collider' }, { type: 'RigidBody', props: { type: 'kinematic' } }, ...extra],
    })
    const { step } = await physicsFixture([FLOOR, kinematic('Walker', 0, [{ type: 'Recorder' }]), kinematic('Other', 1)], {
      components: { Recorder },
    })

    step(1)

    expect(Recorder.contacts.map((contact) => contact.other.name).sort()).toEqual(['Floor', 'Other'])
    expect(Recorder.contacts.find((contact) => contact.other.name === 'Floor')?.normal.y).toBeCloseTo(-1, 5)
  })
})

describe('body contacts cost nothing when nobody listens (PR #161 review)', () => {
  it('never reads the narrow phase while no component implements onBodyContact, and does once one does', async () => {
    const { game, step } = await physicsFixture([FLOOR, RESTING('A', 0, []), RESTING('B', 2, [])], { components: { Recorder } })
    const pairs = vi.spyOn(worldOf(game).raw, 'contactPairsWith')

    step(5)
    expect(pairs).not.toHaveBeenCalled()

    game.find('B')?.add(Recorder)
    step(1)
    expect(pairs).toHaveBeenCalledTimes(1)
  })
})
