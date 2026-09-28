import { describe, expect, it, vi } from 'vitest'
import { Component } from './component'
import {
  collectModuleComponents,
  componentClassOf,
  isComponentClass,
  mergeRegistryComponents,
} from './component-registry'

class BuiltinProbe extends Component {
  static override componentName = 'BuiltinProbe'
}

class ProjectProbe extends Component {
  static override componentName = 'ProjectProbe'
}

class ProjectShadow extends Component {
  static override componentName = 'BuiltinProbe'
}

class NamelessProbe extends Component {}

describe('collectModuleComponents', () => {
  it('collects exported Component subclasses by stable componentName', () => {
    expect(
      collectModuleComponents([
        { ProjectProbe, helper: () => {}, value: 3 },
        { default: class NotAComponent {} },
      ]),
    ).toEqual({ ProjectProbe })
  })

  it('keys by componentName rather than export name, ignoring the inherited default', () => {
    expect(collectModuleComponents([{ Renamed: ProjectProbe }], vi.fn())).toEqual({
      ProjectProbe,
    })
  })

  it('reports a subclass that declares no static componentName instead of dropping it', () => {
    const warn = vi.fn()

    expect(collectModuleComponents([{ NamelessProbe }], warn)).toEqual({})
    expect(warn).toHaveBeenCalledOnce()
    expect(warn.mock.calls[0]?.[0]).toContain('NamelessProbe')
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

describe('componentClassOf', () => {
  it('returns the class a live component was built from', () => {
    class Probe extends Component {
      static override componentName = 'Probe'
    }
    expect(componentClassOf(new Probe())).toBe(Probe)
    expect(componentClassOf(new Probe()).componentName).toBe('Probe')
  })

  it('recognises Component subclasses and nothing else', () => {
    class Probe extends Component {
      static override componentName = 'Probe'
    }
    expect(isComponentClass(Probe)).toBe(true)
    expect(isComponentClass(Component)).toBe(false)
    expect(isComponentClass(class NotAComponent {})).toBe(false)
    expect(isComponentClass(() => {})).toBe(false)
    expect(isComponentClass('Probe')).toBe(false)
  })
})
