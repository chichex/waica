import { describe, expect, it } from 'vitest'
import { resolveDirectionalClip } from '@waica/engine'
import { ARCHETYPE } from './index'
import { ARCHETYPE as NODE_ARCHETYPE } from './manifest'
import { ISOMETRIC_ANIMATION } from './animation'
import { ISOMETRIC_ART } from './art'
import { ISOMETRIC_BUNDLE } from './bundle'
import { ISOMETRIC_ACTION_LABELS, ISOMETRIC_BINDINGS } from './controls'
import { ISOMETRIC_PREFABS } from './prefabs'
import {
  ISOMETRIC_ART_URLS,
  ISOMETRIC_PALETTE,
  ISOMETRIC_REGISTRY,
} from './registry'
import { ISOMETRIC_REGISTRY_DATA } from './registry-data'
import { ISOMETRIC_BLANK_SCENE, ISOMETRIC_SCENE } from './scene-default'

const ISOMETRIC_ENTITY_ICONS: Readonly<Record<string, string>> = {
  IsoMotor: '🧭',
  Tilemap: '💎',
  Interactable: '💬',
  Collectible: '📦',
  Hazard: '👹',
}

describe('isometric archetype manifest', () => {
  it('folds every public isometric piece into ARCHETYPE', () => {
    expect(ARCHETYPE).toEqual({
      id: 'isometric',
      label: 'Isometric',
      scene: ISOMETRIC_SCENE,
      blankScene: ISOMETRIC_BLANK_SCENE,
      registry: ISOMETRIC_REGISTRY,
      palette: ISOMETRIC_PALETTE,
      prefabs: ISOMETRIC_PREFABS,
      art: ISOMETRIC_ART,
      entityIcons: ISOMETRIC_ENTITY_ICONS,
      bindings: ISOMETRIC_BINDINGS,
      actionLabels: ISOMETRIC_ACTION_LABELS,
      bundle: ISOMETRIC_BUNDLE,
      animation: ISOMETRIC_ANIMATION,
      artUrls: ISOMETRIC_ART_URLS,
    })
  })

  it('exports the asset-free manifest directly from the Node-safe entry', () => {
    const { artUrls: _artUrls, registry: _registry, ...sharedFields } = ARCHETYPE
    expect(NODE_ARCHETYPE).toEqual({ ...sharedFields, registry: ISOMETRIC_REGISTRY_DATA })
    expect(NODE_ARCHETYPE).not.toHaveProperty('artUrls')
    expect(NODE_ARCHETYPE.registry.resolveAsset?.('waica:iso-hero')).toBe(
      'assets/waica-iso-hero.png',
    )
  })

  it('pins all eight directions and the three mirrored fallbacks', () => {
    expect(NODE_ARCHETYPE.animation).toEqual({
      directions: ['n', 'ne', 'e', 'se', 's', 'sw', 'w', 'nw'],
      fallbacks: {
        w: { dir: 'e', flip: true },
        nw: { dir: 'ne', flip: true },
        sw: { dir: 'se', flip: true },
      },
      contract: { required: ['idle'], fallbacks: { walk: 'idle' } },
    })
  })

  it('resolves shipped and mirrored walk facings through the public contract', () => {
    const clips = ['walk-n', 'walk-ne', 'walk-e', 'walk-se', 'walk-s']
    expect(resolveDirectionalClip(ISOMETRIC_ANIMATION, clips, 'walk', 'w')).toEqual({
      clip: 'walk-e',
      flip: true,
    })
    expect(resolveDirectionalClip(ISOMETRIC_ANIMATION, clips, 'walk', 'nw')).toEqual({
      clip: 'walk-ne',
      flip: true,
    })
    expect(resolveDirectionalClip(ISOMETRIC_ANIMATION, clips, 'walk', 'sw')).toEqual({
      clip: 'walk-se',
      flip: true,
    })
    for (const direction of ['n', 'ne', 'e', 'se', 's']) {
      expect(resolveDirectionalClip(ISOMETRIC_ANIMATION, clips, 'walk', direction)).toEqual({
        clip: `walk-${direction}`,
        flip: false,
      })
    }
  })
})
