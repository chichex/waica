import { describe, expect, it } from 'vitest'
import { scriptSource } from './script-sources'

describe('scriptSource', () => {
  it('exposes the built-in IsoMotor source under its component name', () => {
    const script = scriptSource('IsoMotor')

    expect(script.file).toBe('iso-motor.ts')
    expect(script.source).toContain('export class IsoMotor')
    expect(script.source).toContain('screenInputToLogical')
  })
})
