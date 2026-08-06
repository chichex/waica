import { describe, expect, it, vi } from 'vitest'
import { Component, type ComponentClass } from '@waica/engine'
import { classDefaults } from './component-defaults'

class Gun extends Component {
  static override componentName = 'Gun'
  speed = 12
  automatic = false
}

class ThrowingGun extends Component {
  static override componentName = 'Gun'
  constructor() {
    super()
    throw new Error('ctor boom')
  }
}

class WithTransient extends Component {
  static override componentName = 'WithTransient'
  static override transient = ['runtime']
  runtime = 'state'
  tunable = 5
}

class WithGetterParam extends Component {
  static override componentName = 'WithGetterParam'
  private _speed = 7
  get speed(): number {
    return this._speed
  }
  set speed(value: number) {
    this._speed = value
  }
}

describe('classDefaults', () => {
  it('reads the class field defaults with their real types', () => {
    expect(classDefaults(Gun as unknown as ComponentClass, 'Gun')).toMatchObject({
      speed: 12,
      automatic: false,
    })
  })

  it('returns nothing for a type the registry does not know', () => {
    expect(classDefaults(undefined, 'Missing')).toEqual({})
  })

  it('contains a throwing project constructor instead of letting it reach React', () => {
    // This runs during render: an uncaught throw here blanks the editor.
    const onError = vi.fn()

    expect(classDefaults(ThrowingGun as unknown as ComponentClass, 'Gun', onError)).toEqual({})
    expect(onError).toHaveBeenCalledOnce()
    expect(onError.mock.calls[0]?.[0]).toContain('Gun')
    expect(onError.mock.calls[0]?.[0]).toContain('ctor boom')
  })

  it('excludes fields declared transient — runtime state, not an authorable default', () => {
    expect(classDefaults(WithTransient as unknown as ComponentClass, 'WithTransient')).toEqual({
      tunable: 5,
    })
  })

  it('resolves a getter-backed param to its real value through the shared helper', () => {
    expect(classDefaults(WithGetterParam as unknown as ComponentClass, 'WithGetterParam')).toEqual({
      speed: 7,
    })
  })
})
