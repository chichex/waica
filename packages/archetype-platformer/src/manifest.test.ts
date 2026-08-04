import { describe, expect, it } from 'vitest'
import { ARCHETYPE as NODE_ARCHETYPE } from './manifest'
import { PLATFORMER_REGISTRY_DATA } from './registry-data'
import {
  ARCHETYPE,
  PLATFORMER_ACTION_LABELS,
  PLATFORMER_ART,
  PLATFORMER_ART_URLS,
  PLATFORMER_BINDINGS,
  PLATFORMER_BLANK_SCENE,
  PLATFORMER_BUNDLE,
  PLATFORMER_PALETTE,
  PLATFORMER_PREFABS,
  PLATFORMER_REGISTRY,
  PLATFORMER_SCENE,
} from './index'

const PLATFORMER_ENTITY_ICONS = {
  PlatformerMotor: '🐕',
  Collectible: '🪙',
  Hazard: '👾',
}

describe('platformer archetype manifest', () => {
  it('folds every public platformer piece into ARCHETYPE', () => {
    expect(ARCHETYPE).toEqual({
      id: 'platformer',
      label: 'Platformer',
      scene: PLATFORMER_SCENE,
      blankScene: PLATFORMER_BLANK_SCENE,
      registry: PLATFORMER_REGISTRY,
      palette: PLATFORMER_PALETTE,
      prefabs: PLATFORMER_PREFABS,
      art: PLATFORMER_ART,
      artUrls: PLATFORMER_ART_URLS,
      entityIcons: PLATFORMER_ENTITY_ICONS,
      bindings: PLATFORMER_BINDINGS,
      actionLabels: PLATFORMER_ACTION_LABELS,
      bundle: PLATFORMER_BUNDLE,
    })
  })

  it('exports the asset-free manifest directly from the Node-safe entry', () => {
    const { artUrls: _artUrls, registry: _registry, ...sharedFields } = ARCHETYPE

    expect(NODE_ARCHETYPE).toEqual({
      ...sharedFields,
      registry: PLATFORMER_REGISTRY_DATA,
    })
    expect(NODE_ARCHETYPE).not.toHaveProperty('artUrls')
    expect(NODE_ARCHETYPE.registry.resolveAsset?.('waica:dog')).toBe(
      'assets/waica-dog.png',
    )
  })
})
