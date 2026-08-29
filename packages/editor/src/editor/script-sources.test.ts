import { describe, expect, it } from 'vitest'
import { inlineShared, scriptSource } from './script-sources'

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

  it.each([
    ['MeleeAttack', 'export class MeleeAttack'],
    ['Patrol', 'export class Patrol'],
    ['IsoMotor', 'export class IsoMotor'],
  ])('inlines the shared facing table ahead of %s, so its imports resolve on screen', (name, subject) => {
    const script = scriptSource(name)

    expect(script.source).toContain('export function facingForInput')
    expect(script.source).toContain('export function logicalDirection')
    expect(script.source).not.toContain("from './facing.js'")
    expect(script.source.indexOf('export function facingForInput')).toBeLessThan(
      script.source.indexOf(subject),
    )
  })

  it('strips only the exact shared import: the dot in the specifier is literal', () => {
    // A regex built from 'facing.js' with an unescaped dot would also swallow
    // an import of './facingXjs' — the strip must match the file name exactly.
    const script = scriptSource('Patrol')
    const stripped = (script.source.match(/^import .* from '\.\/[^']+'$/gm) ?? []).filter(
      (line) => /facing/.test(line),
    )

    expect(stripped).toEqual([])
    expect(inlineShared('probe.ts', "import { x } from './facingXjs'\nexport const y = 1\n", [
      { file: 'facing.ts', source: 'export const shared = 1' },
    ])).toContain("import { x } from './facingXjs'")
  })

  it('keeps the grid motor ahead of the facing table for IsoMotor', () => {
    const script = scriptSource('IsoMotor')

    expect(script.source).not.toContain("from './grid-motor.js'")
    expect(script.source.indexOf('export abstract class GridMotor')).toBeLessThan(
      script.source.indexOf('export function facingForInput'),
    )
  })

  it('exposes the shared motor source directly for catalog completeness', () => {
    const script = scriptSource('GridMotor')

    expect(script.file).toBe('grid-motor.ts')
    expect(script.source).toContain('export abstract class GridMotor')
  })
})
