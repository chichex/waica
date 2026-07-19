import { AnimatedSprite, Game, Solid, Sprite, type Entity } from '@waica/engine'
import { CameraFollow, PlatformerAnimator, PlatformerMovement } from '@waica/behaviors'
import dogSheet from '../assets/waica-dog.png'

// TODO(H3): cuando exista el segundo arquetipo (top-down), esto se
// generaliza a un manifest declarativo (behaviors + contrato de
// animaciones + input map + template). Con un solo caso, abstraer
// sería inventar — regla del DESIGN.md §9.

export interface PlatformerSetup {
  player: Entity
}

/** Bloque estático del nivel: sprite + colisión del mismo tamaño. */
function block(game: Game, name: string, x: number, y: number, w: number, h: number, color: number): Entity {
  const e = game.spawn(name)
  e.position.set(x, y, 0)
  e.add(Sprite, { width: w, height: h, color })
  e.add(Solid, { width: w, height: h })
  return e
}

/**
 * Arma la escena base del arquetipo plataformero: un player con el
 * game feel de fábrica y un nivel de placeholders para empezar a jugar
 * desde el minuto cero.
 */
export function setupPlatformer(game: Game): PlatformerSetup {
  const player = game.spawn('Player')
  player.position.set(0, -1, 0)
  // La perrita placeholder cumple el contrato de animaciones del arquetipo:
  // el usuario la reemplaza por su personaje manteniendo los nombres de clip.
  player.add(AnimatedSprite, {
    texture: dogSheet,
    cols: 4,
    rows: 4,
    width: 1.4,
    height: 1.4,
    pixelArt: true,
    clips: {
      idle: { frames: [0, 1, 2, 3], fps: 5 },
      run: { frames: [4, 5, 6, 7], fps: 10 },
      jump: { frames: [8, 9], fps: 8, loop: false },
      fall: { frames: [12, 13], fps: 8 },
    },
    initialClip: 'idle',
  })
  player.add(PlatformerMovement)
  player.add(PlatformerAnimator)
  player.add(CameraFollow)

  block(game, 'Ground', 0, -5, 40, 2, 0x2a9d8f)
  block(game, 'Platform-1', 5, -2.5, 4, 0.5, 0x2a9d8f)
  block(game, 'Platform-2', 9.5, -0.5, 3, 0.5, 0x2a9d8f)
  block(game, 'Platform-3', -5.5, -1.5, 3, 0.5, 0x2a9d8f)
  block(game, 'Platform-4', 14, 1.5, 3, 0.5, 0x2a9d8f)
  block(game, 'Wall-Left', -19, 0, 2, 12, 0x264653)
  block(game, 'Wall-Right', 21, 0, 2, 12, 0x264653)

  return { player }
}
