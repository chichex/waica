import { Component, type ParamSpec } from '../component.js'
import { normalizeShadowBoolean, normalizeShadowOverride, SHADOW_OVERRIDE_PARAMS, type LightShadowOverrides } from '../scene-shadows.js'

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
    const normalized = normalizeShadowBoolean(value)
    this.validateChange({ castShadows: normalized })
    this._castShadows = normalized
  }

  /** Null inherits the scene's resolution for this kind of light. */
  get shadowMapSize(): number | null {
    return this._shadowMapSize
  }
  set shadowMapSize(value: unknown) {
    const normalized = normalizeShadowOverride('shadowMapSize', value)
    this.validateChange({ shadowMapSize: normalized })
    this._shadowMapSize = normalized
  }

  /** Null inherits the scene's maximum shadow distance, in world units. */
  get shadowMaxDistance(): number | null {
    return this._shadowMaxDistance
  }
  set shadowMaxDistance(value: unknown) {
    const normalized = normalizeShadowOverride('shadowMaxDistance', value)
    this.validateChange({ shadowMaxDistance: normalized })
    this._shadowMaxDistance = normalized
  }

  /** Null inherits the scene's shadow bias. */
  get shadowBias(): number | null {
    return this._shadowBias
  }
  set shadowBias(value: unknown) {
    const normalized = normalizeShadowOverride('shadowBias', value)
    this.validateChange({ shadowBias: normalized })
    this._shadowBias = normalized
  }

  /** Null inherits the scene's normal-offset shadow bias. */
  get shadowNormalBias(): number | null {
    return this._shadowNormalBias
  }
  set shadowNormalBias(value: unknown) {
    const normalized = normalizeShadowOverride('shadowNormalBias', value)
    this.validateChange({ shadowNormalBias: normalized })
    this._shadowNormalBias = normalized
  }

  /** Null inherits the scene's PCF shadow radius. */
  get shadowRadius(): number | null {
    return this._shadowRadius
  }
  set shadowRadius(value: unknown) {
    const normalized = normalizeShadowOverride('shadowRadius', value)
    this.validateChange({ shadowRadius: normalized })
    this._shadowRadius = normalized
  }

  private validateChange(change: LightShadowOverrides): void {
    this.game?.shadows.validateChange(this, change)
  }
}
