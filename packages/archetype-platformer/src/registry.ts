import {
  AnimatedSprite,
  Hitbox,
  Solid,
  Sprite,
  type SceneEntityJson,
  type SceneRegistry,
} from '@waica/engine'
import {
  CameraFollow,
  Collectible,
  Hazard,
  Patrol,
  PlatformerAnimator,
  PlatformerMovement,
  Respawnable,
} from '@waica/behaviors'
import dogSheet from '../assets/waica-dog.png'
import coinSheet from '../assets/waica-coin.png'
import slimeSheet from '../assets/waica-slime.png'

const BUILTIN_ASSETS: Record<string, string> = {
  'waica:dog': dogSheet,
  'waica:coin': coinSheet,
  'waica:slime': slimeSheet,
}

/** Componentes disponibles en el arquetipo plataformero + sus assets. */
export const PLATFORMER_REGISTRY: SceneRegistry = {
  components: {
    Sprite,
    AnimatedSprite,
    Solid,
    Hitbox,
    PlatformerMovement,
    PlatformerAnimator,
    CameraFollow,
    Collectible,
    Patrol,
    Hazard,
    Respawnable,
  },
  resolveAsset: (uri) => BUILTIN_ASSETS[uri] ?? uri,
}

export interface EntityTemplate {
  label: string
  icon: string
  /** Crea el JSON de una instancia nueva (sin posición; la pone el editor). */
  make: () => SceneEntityJson
}

/** La paleta del editor: piezas arrastrables al viewport. */
export const PLATFORMER_PALETTE: EntityTemplate[] = [
  {
    label: 'Plataforma',
    icon: '▬',
    make: () => ({
      name: 'Platform',
      components: [
        { type: 'Sprite', props: { width: 3, height: 0.5, color: 0x2a9d8f } },
        { type: 'Solid', props: { width: 3, height: 0.5 } },
      ],
    }),
  },
  {
    label: 'Bloque',
    icon: '■',
    make: () => ({
      name: 'Block',
      components: [
        { type: 'Sprite', props: { width: 2, height: 2, color: 0x264653 } },
        { type: 'Solid', props: { width: 2, height: 2 } },
      ],
    }),
  },
  {
    label: 'Moneda',
    icon: '🪙',
    make: () => ({
      name: 'Coin',
      components: [
        {
          type: 'AnimatedSprite',
          props: {
            texture: 'waica:coin',
            cols: 4,
            rows: 1,
            width: 0.6,
            height: 0.6,
            clips: { spin: { frames: [0, 1, 2, 3], fps: 8 } },
            initialClip: 'spin',
          },
        },
        { type: 'Hitbox', props: { width: 0.5, height: 0.5 } },
        { type: 'Collectible', props: { value: 1 } },
      ],
    }),
  },
  {
    label: 'Slime',
    icon: '👾',
    make: () => ({
      name: 'Slime',
      components: [
        {
          type: 'AnimatedSprite',
          props: {
            texture: 'waica:slime',
            cols: 4,
            rows: 1,
            width: 1.1,
            height: 1.1,
            clips: { idle: { frames: [0, 1, 2, 3], fps: 6 } },
            initialClip: 'idle',
          },
        },
        { type: 'Hitbox', props: { width: 0.9, height: 0.6 } },
        { type: 'Patrol', props: { distance: 2, speed: 2 } },
        { type: 'Hazard', props: { stompable: true, bounce: 10 } },
      ],
    }),
  },
  {
    label: 'Decorado',
    icon: '▢',
    make: () => ({
      name: 'Deco',
      components: [{ type: 'Sprite', props: { width: 1, height: 1, color: 0x8ecae6 } }],
    }),
  },
]
