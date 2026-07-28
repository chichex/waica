import { describe, expect, it, vi } from 'vitest'
import { Component } from './component'
import { collectModuleComponents, mergeRegistryComponents } from './component-registry'

class BuiltinProbe extends Component {
  static override componentName = 'BuiltinProbe'
}

class ProjectProbe extends Component {
  static override componentName = 'ProjectProbe'
}

class ProjectShadow extends Component {
  static override componentName = 'BuiltinProbe'
}

describe('collectModuleComponents', () => {
  it('collects exported Component subclasses by stable componentName', () => {
    expect(
      collectModuleComponents([
        { ProjectProbe, helper: () => {}, value: 3 },
        { default: class NotAComponent {} },
      ]),
    ).toEqual({ ProjectProbe })
  })
})

describe('mergeRegistryComponents', () => {
  it('keeps builtins, lets project classes win collisions and warns with the shadowed type', () => {
    const warn = vi.fn()
    const base = {
      components: { BuiltinProbe },
      prefabs: {},
      resolveAsset: (uri: string) => uri,
    }

    const merged = mergeRegistryComponents(
      base,
      { ProjectProbe, BuiltinProbe: ProjectShadow },
      warn,
    )

    expect(merged).not.toBe(base)
    expect(merged.components).toEqual({
      BuiltinProbe: ProjectShadow,
      ProjectProbe,
    })
    expect(merged.prefabs).toBe(base.prefabs)
    expect(merged.resolveAsset).toBe(base.resolveAsset)
    expect(warn).toHaveBeenCalledOnce()
    expect(warn.mock.calls[0]?.[0]).toContain('BuiltinProbe')
  })
})
