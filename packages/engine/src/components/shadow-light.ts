import { Component, type ParamSpec } from '../component.js'
import { normalizeShadowBoolean, normalizeShadowOverride, SHADOW_OVERRIDE_PARAMS } from '../scene-shadows.js'

/** Shared, normalized authoring properties for the two 3D lights. */
export abstract class ShadowLight extends Component {
  static override params = {
    castShadows: { label: 'Cast shadows' },
    ...SHADOW_OVERRIDE_PARAMS,
  } satisfies Record<string, ParamSpec>

  private _castShadows = true
  private _shadowMapSize: number | null = null
  private _shadowMaxDistance: number | null = null
  private _shadowBias: number | null = null
  private _shadowNormalBias: number | null = null
  private _shadowRadius: number | null = null

  get castShadows(): boolean {
    return this._castShadows
  }
  set castShadows(value: unknown) {
    this._castShadows = normalizeShadowBoolean(value)
  }

  /** Null inherits the scene's resolution for this kind of light. */
  get shadowMapSize(): number | null {
    return this._shadowMapSize
  }
  set shadowMapSize(value: unknown) {
    this._shadowMapSize = normalizeShadowOverride('shadowMapSize', value)
  }

  /** Null inherits the scene's maximum shadow distance, in world units. */
  get shadowMaxDistance(): number | null {
    return this._shadowMaxDistance
  }
  set shadowMaxDistance(value: unknown) {
    this._shadowMaxDistance = normalizeShadowOverride('shadowMaxDistance', value)
  }

  /** Null inherits the engine default shadow bias (SHADOW_DEFAULTS.bias). */
  get shadowBias(): number | null {
    return this._shadowBias
  }
  set shadowBias(value: unknown) {
    this._shadowBias = normalizeShadowOverride('shadowBias', value)
  }

  /** Null inherits the engine default normal offset (SHADOW_DEFAULTS.normalBias). */
  get shadowNormalBias(): number | null {
    return this._shadowNormalBias
  }
  set shadowNormalBias(value: unknown) {
    this._shadowNormalBias = normalizeShadowOverride('shadowNormalBias', value)
  }

  /** Null inherits the engine default PCF radius (SHADOW_DEFAULTS.radius). */
  get shadowRadius(): number | null {
    return this._shadowRadius
  }
  set shadowRadius(value: unknown) {
    this._shadowRadius = normalizeShadowOverride('shadowRadius', value)
  }
}
