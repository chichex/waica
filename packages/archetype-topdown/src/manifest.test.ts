import { describe, expect, it } from 'vitest'
import { ARCHETYPE } from './index'
import { ARCHETYPE as NODE_ARCHETYPE } from './manifest'
import { TOPDOWN_ANIMATION } from './animation'
import { TOPDOWN_ART } from './art'
import { TOPDOWN_BUNDLE } from './bundle'
import { TOPDOWN_ACTION_LABELS, TOPDOWN_BINDINGS } from './controls'
import { TOPDOWN_PREFABS } from './prefabs'
import { TOPDOWN_ART_URLS, TOPDOWN_PALETTE, TOPDOWN_REGISTRY } from './registry'
import { TOPDOWN_REGISTRY_DATA } from './registry-data'
import { TOPDOWN_BLANK_SCENE, TOPDOWN_SCENE } from './scene-default'

// Not exported by manifest.ts, so the expectation re-declares it.
const TOPDOWN_ENTITY_ICONS: Readonly<Record<string, string>> = {
  TopDownMotor: '🧒',
  Interactable: '💬',
  Collectible: '🧪',
  Hazard: '👾',
}

describe('topdown archetype manifest', () => {
  it('folds every public topdown piece into ARCHETYPE', () => {
    expect(ARCHETYPE).toEqual({
      id: 'topdown',
      label: 'Top-down',
      scene: TOPDOWN_SCENE,
      blankScene: TOPDOWN_BLANK_SCENE,
      registry: TOPDOWN_REGISTRY,
      palette: TOPDOWN_PALETTE,
      prefabs: TOPDOWN_PREFABS,
      art: TOPDOWN_ART,
      entityIcons: TOPDOWN_ENTITY_ICONS,
      bindings: TOPDOWN_BINDINGS,
      actionLabels: TOPDOWN_ACTION_LABELS,
      bundle: TOPDOWN_BUNDLE,
      animation: TOPDOWN_ANIMATION,
      artUrls: TOPDOWN_ART_URLS,
    })
  })

  it('exports the asset-free manifest directly from the Node-safe entry', () => {
    const { artUrls: _artUrls, registry: _registry, ...sharedFields } = ARCHETYPE
    expect(NODE_ARCHETYPE).toEqual({ ...sharedFields, registry: TOPDOWN_REGISTRY_DATA })
    expect(NODE_ARCHETYPE).not.toHaveProperty('artUrls')
    expect(NODE_ARCHETYPE.registry.resolveAsset?.('waica:hero')).toBe('assets/waica-hero.png')
  })

  it('declares the four-direction animation contract with west mirrored', () => {
    expect(NODE_ARCHETYPE.animation).toEqual({
      directions: ['n', 's', 'e', 'w'],
      fallbacks: { w: { dir: 'e', flip: true } },
      contract: { required: ['idle'], fallbacks: { walk: 'idle' } },
    })
  })
})
