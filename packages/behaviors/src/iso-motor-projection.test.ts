import { describe, expect, it } from 'vitest'
import { projectIsometric, THREE, type Entity, type Game } from '@waica/engine'
import { IsoMotor } from './iso-motor'

function makeMotor(): IsoMotor {
  const game = { entities: [] } as unknown as Game
  const motor = new IsoMotor()
  const entity = {
    game,
    position: new THREE.Vector3(0, 0, 0),
    scale: new THREE.Vector3(1, 1, 1),
  } as unknown as Entity
  motor.entity = entity
  motor.game = game
  return motor
}

describe('IsoMotor projected render movement', () => {
  it('moves purely right in render space while both logical coordinates change', () => {
    const motor = makeMotor()
    const before = projectIsometric(motor.entity.position.x, motor.entity.position.y)

    for (let frame = 0; frame < 120; frame += 1) {
      motor.run(1, 0, 1 / 60)
      motor.step(1 / 60)
    }

    const after = projectIsometric(motor.entity.position.x, motor.entity.position.y)
    expect(motor.entity.position.x).toBeGreaterThan(0)
    expect(motor.entity.position.y).toBeLessThan(0)
    expect(motor.entity.position.x).toBeCloseTo(-motor.entity.position.y, 10)
    expect(after.x - before.x).toBeGreaterThan(0)
    expect(after.y - before.y).toBeCloseTo(0, 10)
  })
})
