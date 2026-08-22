import { describe, expect, it } from 'vitest'
import type { SceneJson } from '@waica/engine'
import type { GridSettings } from '../project/editor-settings'
import { effectiveGrid } from './effective-grid'

const SETTINGS: GridSettings = { type: 'square', show: true, snap: false, size: 0.75 }
const scene = (projection?: 'isometric'): SceneJson => ({
  waicaScene: 3,
  ...(projection ? { render: { projection } } : {}),
  entities: [],
})

describe('effectiveGrid', () => {
  it('forces an isometric lattice for projected scenes while retaining settings', () => {
    expect(effectiveGrid(scene('isometric'), SETTINGS)).toEqual({
      type: 'isometric',
      show: true,
      snap: false,
      size: 0.75,
    })
  })

  it('uses the project setting for identity scenes', () => {
    const isometricSetting = { ...SETTINGS, type: 'isometric' as const }
    expect(effectiveGrid(scene(), isometricSetting)).toBe(isometricSetting)
    expect(effectiveGrid(scene(), SETTINGS)).toBe(SETTINGS)
  })
})
