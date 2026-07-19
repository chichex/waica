import { Game } from '@waica/engine'
import { setupPlatformer } from '@waica/archetype-platformer'

const canvas = document.querySelector<HTMLCanvasElement>('#game')
if (!canvas) throw new Error('falta el <canvas id="game">')

// Un solo juego por página: si el módulo se re-ejecuta (p. ej. HMR),
// dos loops sobre el mismo canvas corromperían la escena.
if (canvas.dataset.waica) {
  location.reload()
} else {
  canvas.dataset.waica = 'mounted'
  void main(canvas)
}

async function main(canvas: HTMLCanvasElement): Promise<void> {
  const game = new Game({ canvas, viewHeight: 12, background: 0x1a1a2e })

  // Los parámetros tuneados desde el inspector pisan los defaults del arquetipo.
  await game.loadParams('/waica.params.json')

  const setup = setupPlatformer(game)

  if (import.meta.env.DEV) {
    const { attachOverlay } = await import('@waica/overlay')
    attachOverlay(game)
    // Acceso de debug para devtools y tests e2e.
    ;(window as unknown as Record<string, unknown>).__waica = { game, setup }
  }

  game.start()
}
