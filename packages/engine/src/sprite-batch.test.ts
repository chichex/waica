import * as THREE from 'three'
import { expect, it } from 'vitest'
import { SpriteBatch } from './sprite-batch'

/**
 * The lines a GLSL preprocessor keeps with USE_INSTANCING undefined: only
 * that one macro is evaluated, every other conditional is kept whole.
 */
function withoutInstancing(source: string): string {
  const stack: { instancing: boolean; active: boolean }[] = []
  const kept: string[] = []
  for (const line of source.split('\n')) {
    const directive = line.trim()
    if (/^#if/.test(directive)) {
      const instancing = /^#ifdef\s+USE_INSTANCING\b/.test(directive)
      stack.push({ instancing, active: !instancing })
      continue
    }
    const top = stack.at(-1)
    if (directive.startsWith('#else') && top?.instancing) {
      top.active = !top.active
      continue
    }
    if (directive.startsWith('#endif') && top) {
      stack.pop()
      continue
    }
    if (stack.every((frame) => frame.active)) kept.push(line)
  }
  return kept.join('\n')
}

function batchVertexShader(): string {
  const batch = new SpriteBatch(
    { texture: null, pixelArt: false, shape: 'rectangle' },
    { texture: () => { throw new Error('untextured: no texture request') } },
    new THREE.PlaneGeometry(1, 1),
  )
  const shader = { vertexShader: THREE.ShaderLib.basic.vertexShader, fragmentShader: '', uniforms: {} }
  batch.material.onBeforeCompile(shader as unknown as THREE.WebGLProgramParametersWithUniforms, {} as THREE.WebGLRenderer)
  return shader.vertexShader
}

it('keeps the instancing rewrite behind USE_INSTANCING, so a non-instanced draw of the material still compiles (review)', () => {
  const source = batchVertexShader()
  expect(source).toContain('instanceMatrix * vec4( transformed, 1.0 )')

  const plain = withoutInstancing(source)
  expect(plain).not.toMatch(/instanceMatrix|instanceUv/)
  expect(plain).toContain('#include <project_vertex>')
  expect(plain).toContain('#include <uv_vertex>')
})
