import type { PrefabJson } from '@waica/engine'

/** The hero's sword-swing sparks: warm, short-lived, thrown up the screen and pulled back down. */
export const SWORD_SPARKS = {
  rate: 0,
  lifetime: 0.3,
  positionSpread: [0.25, 0.25],
  velocity: [-1.8, -1.8],
  velocitySpread: [2.6, 2.6],
  gravity: [3, 3],
  space: 'world',
  seed: 7,
  capacity: 64,
  width: 0.16,
  height: 0.16,
  startScale: 1,
  endScale: 0.3,
  startColor: 0xffc21a,
  endColor: 0xff3a00,
  startAlpha: 1,
  endAlpha: 0,
  blend: 'normal',
  layer: 1,
}

/** Continuous wind streaks covering the 16x16 meadow when placed at its center. */
const WIND = {
  rate: 22,
  lifetime: 1.4,
  positionSpread: [9, 9],
  velocity: [2.2, -2.2],
  velocitySpread: [0.4, 0.4],
  space: 'world',
  seed: 3,
  capacity: 64,
  width: 1.8,
  height: 0.06,
  startScale: 1,
  endScale: 1.6,
  startColor: 0xe8f4ff,
  endColor: 0xe8f4ff,
  startAlpha: 0.6,
  endAlpha: 0,
  layer: 0,
}

/** A burst-only grey puff rising off whatever took damage, drawn over the sprites. */
const HURT_SMOKE = {
  rate: 0,
  lifetime: 0.6,
  positionSpread: [0.2, 0.2],
  velocity: [-0.6, -0.6],
  velocitySpread: [0.8, 0.8],
  gravity: [0.4, 0.4],
  space: 'world',
  seed: 11,
  capacity: 64,
  width: 0.3,
  height: 0.3,
  startScale: 0.6,
  endScale: 1.8,
  startColor: 0xdddddd,
  endColor: 0x777777,
  startAlpha: 0.7,
  endAlpha: 0,
  layer: 1,
}

/** Slow, faint motes over the 10x10 cave's floor (inside its border ring) when placed at its center. */
const CAVE_DUST = {
  rate: 5,
  lifetime: 3,
  positionSpread: [4, 4],
  velocity: [-0.1, -0.1],
  velocitySpread: [0.15, 0.15],
  space: 'world',
  seed: 5,
  capacity: 32,
  width: 0.12,
  height: 0.12,
  startScale: 1,
  endScale: 0.5,
  startColor: 0xfff0c8,
  endColor: 0xfff0c8,
  startAlpha: 0.7,
  endAlpha: 0,
  layer: 0,
}

/**
 * The demo's particle effects as placeable objects: no sprite, only an
 * emitter (plus DamagePuff for the hurt smoke). Scenes place them like any
 * other prop, and the palette offers them.
 */
export const ISOMETRIC_EFFECT_PREFABS: Record<string, PrefabJson> = {
  'objects/wind': {
    waicaPrefab: 1,
    type: 'object',
    components: [{ type: 'ParticleEmitter', props: WIND }],
  },
  'objects/hurt-smoke': {
    waicaPrefab: 1,
    type: 'object',
    components: [
      { type: 'ParticleEmitter', props: HURT_SMOKE },
      { type: 'DamagePuff', props: { count: 10 } },
    ],
  },
  'objects/cave-dust': {
    waicaPrefab: 1,
    type: 'object',
    components: [{ type: 'ParticleEmitter', props: CAVE_DUST }],
  },
}
