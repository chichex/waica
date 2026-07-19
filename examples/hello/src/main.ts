import { Game, THREE } from '@waica/engine'

const canvas = document.querySelector<HTMLCanvasElement>('#game')
if (!canvas) throw new Error('falta el <canvas id="game">')

const game = new Game({ canvas, background: 0x1a1a2e, viewHeight: 10 })

// Un "personaje" placeholder en espíritu plataformero: cuadrado que rebota.
const hero = new THREE.Mesh(
  new THREE.PlaneGeometry(1, 1),
  new THREE.MeshBasicMaterial({ color: 0xffb703 }),
)
game.scene.add(hero)

const floor = new THREE.Mesh(
  new THREE.PlaneGeometry(16, 1),
  new THREE.MeshBasicMaterial({ color: 0x2a9d8f }),
)
floor.position.y = -3
game.scene.add(floor)

// Gravedad de juguete + squash & stretch: el primer game feel de Waica.
const GRAVITY = -30
const JUMP = 12
const GROUND_Y = -2 // techo del piso (-2.5) + media altura del héroe (0.5)
let vy = 0
hero.position.y = GROUND_Y

game.onUpdate((dt) => {
  vy += GRAVITY * dt
  hero.position.y += vy * dt
  if (hero.position.y <= GROUND_Y) {
    hero.position.y = GROUND_Y
    vy = JUMP
  }
  const stretch = 1 + Math.min(Math.abs(vy) * 0.02, 0.35)
  hero.scale.set(1 / stretch, stretch, 1)
})

game.start()
