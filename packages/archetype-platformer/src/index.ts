import { AnimatedSprite, Game, Hitbox, Solid, Sprite, type Entity } from '@waica/engine'
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

// TODO(H3): cuando exista el segundo arquetipo (top-down), esto se
// generaliza a un manifest declarativo (behaviors + contrato de
// animaciones + input map + template). Con un solo caso, abstraer
// sería inventar — regla del DESIGN.md §9.

export interface PlatformerSetup {
  player: Entity
  /** Marcador de monedas recogidas, para HUD y tests. */
  score: { coins: number }
}

/** Bloque estático del nivel: sprite + colisión del mismo tamaño. */
function block(game: Game, name: string, x: number, y: number, w: number, h: number, color: number): Entity {
  const e = game.spawn(name)
  e.position.set(x, y, 0)
  e.add(Sprite, { width: w, height: h, color })
  e.add(Solid, { width: w, height: h })
  return e
}

function coin(game: Game, index: number, x: number, y: number, onCollect: (value: number) => void): Entity {
  const e = game.spawn(`Coin-${index}`)
  e.position.set(x, y, 0)
  e.add(AnimatedSprite, {
    texture: coinSheet,
    cols: 4,
    rows: 1,
    width: 0.6,
    height: 0.6,
    clips: { spin: { frames: [0, 1, 2, 3], fps: 8 } },
    initialClip: 'spin',
  })
  e.add(Hitbox, { width: 0.5, height: 0.5 })
  e.add(Collectible, { onCollect })
  return e
}

function slime(game: Game, index: number, x: number, y: number, distance: number, speed: number): Entity {
  const e = game.spawn(`Slime-${index}`)
  e.position.set(x, y, 0)
  e.add(AnimatedSprite, {
    texture: slimeSheet,
    cols: 4,
    rows: 1,
    width: 1.1,
    height: 1.1,
    clips: { idle: { frames: [0, 1, 2, 3], fps: 6 } },
    initialClip: 'idle',
  })
  e.add(Hitbox, { width: 0.9, height: 0.6 })
  e.add(Patrol, { distance, speed })
  e.add(Hazard, { stompable: true, bounce: 10 })
  return e
}

function attachHud(): (coins: number) => void {
  const hud = document.createElement('div')
  hud.style.cssText =
    'position:fixed;top:12px;left:14px;z-index:9000;font:600 20px system-ui,sans-serif;' +
    'color:#ffd166;text-shadow:0 1px 3px #000a;user-select:none'
  hud.textContent = '🪙 0'
  document.body.append(hud)
  return (coins) => {
    hud.textContent = `🪙 ${coins}`
  }
}

/**
 * Arma la escena base del arquetipo plataformero: player con game feel
 * de fábrica, nivel con un pozo, monedas, enemigos patrullando y HUD.
 * Jugable con placeholders desde el minuto cero.
 */
export function setupPlatformer(game: Game): PlatformerSetup {
  const score = { coins: 0 }
  const updateHud = attachHud()
  const collect = (value: number): void => {
    score.coins += value
    updateHud(score.coins)
  }

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
  player.add(Hitbox, { width: 0.9, height: 0.95 })
  player.add(Respawnable, { killY: -12 })
  player.add(CameraFollow)

  // Dos islas de piso con un pozo en el medio: caerse mata (y respawnea).
  block(game, 'Ground-A', -6, -5, 16, 2, 0x2a9d8f)
  block(game, 'Ground-B', 16, -5, 16, 2, 0x2a9d8f)
  block(game, 'Platform-1', 5, -2.5, 4, 0.5, 0x2a9d8f)
  block(game, 'Platform-2', 9.5, -0.5, 3, 0.5, 0x2a9d8f)
  block(game, 'Platform-3', -5.5, -1.5, 3, 0.5, 0x2a9d8f)
  block(game, 'Platform-4', 14, 1.5, 3, 0.5, 0x264653)
  block(game, 'Wall-Left', -15.5, 0, 2, 12, 0x264653)
  block(game, 'Wall-Right', 25.5, 0, 2, 12, 0x264653)

  coin(game, 1, -5.5, -0.5, collect)
  coin(game, 2, -2, -3.2, collect)
  coin(game, 3, 5, -1.7, collect)
  coin(game, 4, 9.5, 0.3, collect)
  coin(game, 5, 14, 2.3, collect)
  coin(game, 6, 19, -3.2, collect)

  slime(game, 1, -9, -3.55, 2, 1.5)
  slime(game, 2, 17, -3.55, 2.5, 2.5)

  return { player, score }
}
