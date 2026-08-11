import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { planWorkspaceRuntime } from './workspace-runtime'

const ROOT = path.sep === '/' ? '/repo' : 'C:\\repo'

function existsExcept(...missingFragments: string[]) {
  return (target: string): Promise<boolean> =>
    Promise.resolve(!missingFragments.some((fragment) => target.includes(fragment)))
}

describe('planWorkspaceRuntime', () => {
  it('maps core and every built archetype when all dists exist', async () => {
    const plan = await planWorkspaceRuntime(ROOT, existsExcept())
    expect(plan).toBeDefined()
    expect(Object.keys(plan!.mappings).sort()).toEqual([
      '@waica/archetype-platformer',
      '@waica/archetype-platformer/manifest',
      '@waica/archetype-topdown',
      '@waica/archetype-topdown/manifest',
      '@waica/behaviors',
      '@waica/engine',
    ])
    expect(plan!.parentPrefixes).toHaveLength(4)
    expect(plan!.warnings).toEqual([])
  })

  it('skips only the archetype whose dist is missing, with a warning', async () => {
    const plan = await planWorkspaceRuntime(ROOT, existsExcept('archetype-topdown'))
    expect(plan).toBeDefined()
    expect(Object.keys(plan!.mappings).sort()).toEqual([
      '@waica/archetype-platformer',
      '@waica/archetype-platformer/manifest',
      '@waica/behaviors',
      '@waica/engine',
    ])
    expect(plan!.parentPrefixes).toHaveLength(3)
    expect(plan!.warnings).toHaveLength(1)
    expect(plan!.warnings[0]).toContain('@waica/archetype-topdown')
  })

  it('installs nothing without the core engine and behaviors dists', async () => {
    expect(await planWorkspaceRuntime(ROOT, existsExcept(path.join('engine', 'dist')))).toBeUndefined()
    expect(
      await planWorkspaceRuntime(ROOT, existsExcept(path.join('behaviors', 'dist'))),
    ).toBeUndefined()
  })
})
