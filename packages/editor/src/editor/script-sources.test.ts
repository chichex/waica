import { describe, expect, it } from 'vitest'
import { scriptSource } from './script-sources'

describe('scriptSource', () => {
  it.each([
    ['IsoMotor', 'iso-motor.ts', 'export class IsoMotor', 'screenInputToLogical'],
    ['TopDownMotor', 'topdown-motor.ts', 'export class TopDownMotor', 'Math.hypot'],
  ])('shows the shared implementation with the %s subclass', (name, file, subclass, seam) => {
    const script = scriptSource(name)

    expect(script.file).toBe(file)
    expect(script.source).toContain('export abstract class GridMotor')
    expect(script.source).toContain('resolveSolidAxis')
    expect(script.source).toContain(subclass)
    expect(script.source.indexOf('export abstract class GridMotor')).toBeLessThan(
      script.source.indexOf(subclass),
    )
    expect(script.source).not.toContain("from './grid-motor.js'")
    expect(script.source).toContain(seam)
  })

  it('ships the melee attack source alongside the other behaviors', () => {
    const script = scriptSource('MeleeAttack')

    expect(script.file).toBe('melee-attack.ts')
    expect(script.source).toContain('export class MeleeAttack')
    expect(script.source).toContain('strike(facing: string)')
  })

  it('exposes the shared motor source directly for catalog completeness', () => {
    const script = scriptSource('GridMotor')

    expect(script.file).toBe('grid-motor.ts')
    expect(script.source).toContain('export abstract class GridMotor')
  })
})
