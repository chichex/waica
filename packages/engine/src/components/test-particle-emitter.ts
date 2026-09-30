import { Mesh, type BufferGeometry, type MeshBasicMaterial } from 'three'
import { vi } from 'vitest'
import type { TextureBackend } from '../assets/texture-backend.js'
import { Game } from '../game.js'

export type ParticleMesh = Mesh<BufferGeometry, MeshBasicMaterial>

class ResizeObserverStub {
  observe(): void {}
  disconnect(): void {}
}

export function installParticleTestDom(): void {
  document.body.innerHTML = ''
  vi.stubGlobal('ResizeObserver', ResizeObserverStub)
}

export function makeParticleGame(textures?: TextureBackend): Game {
  const canvas = document.createElement('canvas')
  Object.defineProperties(canvas, {
    clientWidth: { value: 640 },
    clientHeight: { value: 360 },
  })
  document.body.append(canvas)
  return new Game({ canvas, ...(textures ? { textures } : {}) })
}

export function particleMeshes(game: Game): ParticleMesh[] {
  return game.scene.children.filter(
    (child): child is ParticleMesh => child instanceof Mesh,
  )
}

export function particleMesh(game: Game): ParticleMesh {
  const mesh = particleMeshes(game)[0]
  if (!mesh) throw new Error('expected particle mesh')
  return mesh
}

export function particleCenters(mesh: ParticleMesh): number[] {
  const positions = mesh.geometry.getAttribute('position')
  const result: number[] = []
  for (let slot = 0; slot < mesh.geometry.drawRange.count / 6; slot += 1) {
    const first = slot * 4
    result.push(
      (positions.getX(first) + positions.getX(first + 1)
        + positions.getX(first + 2) + positions.getX(first + 3)) / 4,
      (positions.getY(first) + positions.getY(first + 1)
        + positions.getY(first + 2) + positions.getY(first + 3)) / 4,
    )
  }
  return result
}
