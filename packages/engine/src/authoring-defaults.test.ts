import { describe, expect, it, vi } from 'vitest'
import { Component } from './component.js'
import { authoringDefaults } from './authoring-defaults.js'

class WithGetterSetter extends Component {
  static override componentName = 'WithGetterSetter'
  private _width = 5
  get width(): number {
    return this._width
  }
  set width(value: number) {
    this._width = value
  }
}

class WithGetterOnly extends Component {
  static override componentName = 'WithGetterOnly'
  get computed(): number {
    return 42
  }
}

class WithUnderscoreField extends Component {
  static override componentName = 'WithUnderscoreField'
  _hidden = 'secret'
  visible = 'public'
}

class WithUnserializableFields extends Component {
  static override componentName = 'WithUnserializableFields'
  mapField = new Map()
  setField = new Set()
  fnField = () => {}
  plain = 1
}

class WithUndefinedField extends Component {
  static override componentName = 'WithUndefinedField'
  optional?: string
  required = 'value'
}

class WithOwnTransient extends Component {
  static override componentName = 'WithOwnTransient'
  static override transient = ['runtime']
  runtime = 'state'
  tunable = 1
}

class BaseWithTransient extends Component {
  static override componentName = 'BaseWithTransient'
  static override transient = ['inherited']
  inherited = 'state'
}

class SubclassNoOwnTransient extends BaseWithTransient {
  static override componentName = 'SubclassNoOwnTransient'
  own = 2
}

class BaseWithGetter extends Component {
  static override componentName = 'BaseWithGetter'
  private _shared = 'base-value'
  get shared(): string {
    return this._shared
  }
  set shared(value: string) {
    this._shared = value
  }
}

class SubclassInheritsGetter extends BaseWithGetter {
  static override componentName = 'SubclassInheritsGetter'
  own = 3
}

class WithDefinedEntityGame extends Component {
  static override componentName = 'WithDefinedEntityGame'
  tunable = 1
  constructor() {
    super()
    // Proves entity/game are excluded on their own merit, not merely
    // because a fresh instance happens to leave them undefined.
    this.entity = {} as never
    this.game = {} as never
  }
}

class ThrowingCtor extends Component {
  static override componentName = 'ThrowingCtor'
  constructor() {
    super()
    throw new Error('boom')
  }
}

describe('authoringDefaults', () => {
  it('includes an accessor property that declares a setter, reading its public value', () => {
    expect(authoringDefaults(WithGetterSetter)).toEqual({ width: 5 })
  })

  it('excludes a read-only accessor (getter without a setter)', () => {
    expect(authoringDefaults(WithGetterOnly)).toEqual({})
  })

  it('excludes fields whose name starts with an underscore', () => {
    expect(authoringDefaults(WithUnderscoreField)).toEqual({ visible: 'public' })
  })

  it('excludes Map, Set and function values as non-serializable', () => {
    expect(authoringDefaults(WithUnserializableFields)).toEqual({ plain: 1 })
  })

  it('excludes fields whose value is undefined', () => {
    expect(authoringDefaults(WithUndefinedField)).toEqual({ required: 'value' })
  })

  it('excludes a field declared in the class\'s own static transient', () => {
    expect(authoringDefaults(WithOwnTransient)).toEqual({ tunable: 1 })
  })

  it('excludes a field declared transient by an inherited base class', () => {
    expect(authoringDefaults(SubclassNoOwnTransient)).toEqual({ own: 2 })
  })

  it('includes a setter-backed accessor inherited from a base class', () => {
    expect(authoringDefaults(SubclassInheritsGetter)).toEqual({ shared: 'base-value', own: 3 })
  })

  it('never includes entity or game, even when they hold a real value', () => {
    expect(authoringDefaults(WithDefinedEntityGame)).toEqual({ tunable: 1 })
  })

  it('yields {} for a class whose constructor throws', () => {
    const onError = vi.fn()
    expect(authoringDefaults(ThrowingCtor, onError)).toEqual({})
    expect(onError).toHaveBeenCalledOnce()
    expect(onError.mock.calls[0]?.[0]).toBeInstanceOf(Error)
  })
})
