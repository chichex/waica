import { Game, Solid, Sprite, type Entity } from '@waica/engine'
import { CameraFollow, PlatformerMovement } from '@waica/behaviors'

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
  player.add(Sprite, { width: 0.9, height: 0.95, color: 0xffb703 })
  player.add(PlatformerMovement)
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
