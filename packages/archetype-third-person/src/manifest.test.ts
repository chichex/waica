import { expect, it } from 'vitest'
import { CHARACTER_ROLE, ENEMY_ROLE } from '@waica/behaviors'
import { isPerspectiveCameraJson, type ArchetypeManifest, type SceneJson } from '@waica/engine'
import { ARCHETYPE } from './index'
import { ARCHETYPE as NODE_ARCHETYPE, THIRD_PERSON_ENTITY_ICONS } from './manifest'
import { THIRD_PERSON_ART } from './art'
import { THIRD_PERSON_BUNDLE } from './bundle'
import { THIRD_PERSON_ACTION_LABELS, THIRD_PERSON_BINDINGS } from './controls'
import { THIRD_PERSON_PREFABS } from './prefabs'
import { THIRD_PERSON_ART_URLS, THIRD_PERSON_PALETTE, THIRD_PERSON_REGISTRY } from './registry'
import { THIRD_PERSON_REGISTRY_DATA } from './registry-data'
import { THIRD_PERSON_BLANK_SCENE, THIRD_PERSON_SCENE } from './scene-default'

// Issue #181 CA-23: the manifest.

it('folds every public third-person piece into ARCHETYPE, Node-safe without the art urls (CA-23)', () => {
  expect(ARCHETYPE).toEqual({
    id: 'third-person',
    label: 'Third person',
    scene: THIRD_PERSON_SCENE,
    blankScene: THIRD_PERSON_BLANK_SCENE,
    registry: THIRD_PERSON_REGISTRY,
    palette: THIRD_PERSON_PALETTE,
    prefabs: THIRD_PERSON_PREFABS,
    art: THIRD_PERSON_ART,
    entityIcons: THIRD_PERSON_ENTITY_ICONS,
    bindings: THIRD_PERSON_BINDINGS,
    actionLabels: THIRD_PERSON_ACTION_LABELS,
    bundle: THIRD_PERSON_BUNDLE,
    artUrls: THIRD_PERSON_ART_URLS,
  })
  expect(NODE_ARCHETYPE.registry).toBe(THIRD_PERSON_REGISTRY_DATA)
  expect('artUrls' in NODE_ARCHETYPE).toBe(false)
  const manifest: ArchetypeManifest = NODE_ARCHETYPE
  expect(manifest.id).toBe('third-person')
})

it('bundles the player as the character role and the skeletons as the enemy role (CA-23)', () => {
  expect(THIRD_PERSON_BUNDLE.roles).toEqual({ player: CHARACTER_ROLE, enemy: ENEMY_ROLE })
})

it('binds G-17’s controls and labels every Action (CA-23)', () => {
  expect(THIRD_PERSON_BINDINGS).toMatchObject({
    jump: ['Space', 'Gamepad:A'],
    attack: ['Mouse:Left', 'KeyJ', 'Gamepad:X'],
    run: ['ShiftLeft', 'ShiftRight', 'Gamepad:LB'],
    dodge: ['KeyC', 'Gamepad:B'],
    look_left: ['KeyQ', 'Gamepad:RightStickLeft'],
    look_right: ['KeyE', 'Gamepad:RightStickRight'],
  })
  for (const move of ['up', 'down', 'left', 'right']) expect(THIRD_PERSON_BINDINGS[move]?.length, move).toBe(3)
  expect(Object.keys(THIRD_PERSON_ACTION_LABELS).sort()).toEqual(Object.keys(THIRD_PERSON_BINDINGS).sort())
})

it('declares every scene 3D, with Rapier gravity and an orbit camera that follows the Player (CA-23)', () => {
  for (const scene of [THIRD_PERSON_SCENE, THIRD_PERSON_BLANK_SCENE] satisfies SceneJson[]) {
    expect(scene.render?.space).toBe('3d')
    expect(scene.simulation?.gravity).toEqual([0, -9.81, 0])
    expect(isPerspectiveCameraJson(scene.camera)).toBe(true)
    expect(scene.camera?.follow).toBe('Player')
    expect(scene.entities.some((entity) => entity.name === 'Player' && entity.prefab === 'characters/player')).toBe(true)
  }
})
