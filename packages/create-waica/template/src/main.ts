import { Game, loadScene } from '@waica/engine'
import { attachCoinHud, PLATFORMER_REGISTRY } from '@waica/archetype-platformer'
import scene from './scenes/main.scene.json'

const canvas = document.querySelector<HTMLCanvasElement>('#game')
if (!canvas) throw new Error('falta el <canvas id="game">')

// Un solo juego por página (protege contra re-ejecuciones del módulo).
if (canvas.dataset.waica) {
  location.reload()
} else {
  canvas.dataset.waica = 'mounted'
  void main(canvas)
}

async function main(canvas: HTMLCanvasElement): Promise<void> {
  const game = new Game({ canvas, viewHeight: 12, background: 0x1a1a2e })

  // Lo que ajustes en el inspector (~) se guarda acá y pisa los defaults.
  await game.loadParams('/waica.params.json')

  // Tu escena: editala con el editor de Waica o a mano — es solo JSON.
  loadScene(game, scene as never, PLATFORMER_REGISTRY)
  attachCoinHud(game)

  if (import.meta.env.DEV) {
    const { attachOverlay } = await import('@waica/overlay')
    attachOverlay(game)
  }

  game.start()
}
