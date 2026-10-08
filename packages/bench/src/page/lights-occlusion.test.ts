import { describe, expect, it } from 'vitest'
import type { SceneEntityJson } from '@waica/engine'
import { lightsOcclusion, OCCLUSION_MAP } from './lights-occlusion.ts'

/** The props of an entity's only component, failing when it has none. */
function onlyProps(entity: SceneEntityJson | undefined): Record<string, unknown> {
  const props = entity?.components?.[0]?.props
  if (!props) throw new Error(`expected component props on ${entity?.name ?? 'a missing entity'}`)
  return props
}

function wallCells(entities: SceneEntityJson[]): number[] {
  const cells = onlyProps(entities.find((entity) => entity.name === 'Walls'))['cells']
  if (!Array.isArray(cells)) throw new Error('expected the Walls tilemap cells')
  return cells.map(Number)
}

describe('lightsOcclusion (issue #78 CA-16)', () => {
  it('lights a scene over one Tilemap with solid walls, with `n` torches that cast soft shadows', () => {
    const plan = lightsOcclusion(8)
    const torches = plan.scene.entities.filter((entity) => entity.name.startsWith('Torch-'))
    expect(torches).toHaveLength(8)
    expect(onlyProps(torches[0])).toMatchObject({ castShadows: true, softness: 0.5 })
    expect(plan.scene.render?.lighting).toEqual({ ambient: { intensity: 0.25 } })
    expect(onlyProps(plan.scene.entities[0])['solidTiles']).toEqual([1])
    const cells = wallCells(plan.scene.entities)
    expect(cells).toHaveLength(OCCLUSION_MAP.width * OCCLUSION_MAP.height)
    expect(cells.filter((tile) => tile === 1).length).toBeGreaterThan(0)
    expect(Object.keys(plan.registry.components).sort()).toEqual(['Light', 'Tilemap'])
  })

  it('places every torch on an open cell', () => {
    const plan = lightsOcclusion(32)
    const cells = wallCells(plan.scene.entities)
    for (const torch of plan.scene.entities.filter((entity) => entity.name.startsWith('Torch-'))) {
      const [x, y] = torch.position ?? [0, 0]
      const index = Math.floor(y - OCCLUSION_MAP.originY) * OCCLUSION_MAP.width + Math.floor(x - OCCLUSION_MAP.originX)
      expect(cells[index], torch.name).toBe(0)
    }
  })
})
