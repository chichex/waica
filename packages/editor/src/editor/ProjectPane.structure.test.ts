import { describe, expect, it } from 'vitest'
import source from './ProjectPane.tsx?raw'

/**
 * The controls panel has no render test to assert against — the editor ships
 * no component tests at all. What IS decidable is that the raw archetype
 * lookup is gone and the resolution goes through actionLabel, whose branches
 * (project label, archetype label, raw name) are covered in controls.test.ts.
 */
describe('ControlsEditor action names', () => {
  it('resolves through actionLabel instead of reading archetype.actionLabels directly', () => {
    expect(source).not.toContain('archetype.actionLabels[')
    expect(source).toContain('actionLabel(')
  })
})
