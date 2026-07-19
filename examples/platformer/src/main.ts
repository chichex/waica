import { Game } from '@waica/engine'
import { setupPlatformer } from '@waica/archetype-platformer'

const canvas = document.querySelector<HTMLCanvasElement>('#game')
if (!canvas) throw new Error('falta el <canvas id="game">')

const game = new Game({ canvas, viewHeight: 12, background: 0x1a1a2e })

// Los parámetros tuneados desde el inspector pisan los defaults del arquetipo.
await game.loadParams('/waica.params.json')

setupPlatformer(game)

if (import.meta.env.DEV) {
  const { attachOverlay } = await import('@waica/overlay')
  attachOverlay(game)
  // Acceso de debug para devtools y tests e2e.
  ;(window as unknown as Record<string, unknown>).__waica = { game }
}

game.start()
