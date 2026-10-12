// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { GltfModelBackend, THREE } from '@waica/engine'
import knight from '../art/knight.glb?inline'
import sceneFile from './scenes/main.scene.json'

interface GlbJson {
  animations?: { name?: string }[]
  skins?: { joints: number[] }[]
  images?: { uri?: string; bufferView?: number }[]
  buffers?: { uri?: string }[]
}

/** The glb's bytes and JSON chunk, from the data URI Vite inlines the file as. */
function parseGlb(): { bytes: Uint8Array; json: GlbJson } {
  const bytes = Uint8Array.from(atob(knight.slice(knight.indexOf(',') + 1)), (char) => char.charCodeAt(0))
  const view = new DataView(bytes.buffer)
  const jsonLength = view.getUint32(12, true)
  return { bytes, json: JSON.parse(new TextDecoder().decode(bytes.subarray(20, 20 + jsonLength))) as GlbJson }
}

/** Every clip name the main scene's Player refers to: the Animator's initialClip and overrides, and each state's clip. */
function referencedClips(): string[] {
  const player = sceneFile.entities.find((entity) => entity.name === 'Player')
  const components: Array<{ type: string; props?: Record<string, unknown> }> = player?.components ?? []
  const animator = components.find((component) => component.type === 'Animator')?.props ?? {}
  const machine = components.find((component) => component.type === 'StateMachine')?.props ?? {}
  const states = (machine.states ?? {}) as Record<string, { clip?: string }>
  const names = [
    ...(typeof animator.initialClip === 'string' ? [animator.initialClip] : []),
    ...Object.keys(animator.clips ?? {}),
    ...Object.entries(states).filter(([name]) => name !== '*').map(([name, state]) => state.clip ?? name),
  ]
  return [...new Set(names)]
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('examples/smoke-3d/art/knight.glb (issue #166 CA-17)', () => {
  const { bytes, json } = parseGlb()

  it('is a self-contained skinned character of at most 3 MB', () => {
    expect(bytes.length).toBeLessThanOrEqual(3 * 1024 * 1024)
    expect(json.skins?.map((skin) => skin.joints.length)).toEqual([41])
    expect([...(json.buffers ?? []), ...(json.images ?? [])].every((entry) => entry.uri === undefined)).toBe(true)
    expect(json.images?.[0]?.bufferView).toBeTypeOf('number')
  })

  it('holds every clip the main scene references, by its exact name: idle, walk, a one-shot jump and the fall', () => {
    const clips = (json.animations ?? []).map((animation) => animation.name)
    expect(referencedClips().sort()).toEqual(['Idle', 'Jump_Idle', 'Jump_Start', 'Walking_A'])
    for (const name of referencedClips()) expect(clips, name).toContain(name)
  })

  it('loads through the real GLTFLoader as a SkinnedMesh with its clips', async () => {
    // A copy: its buffer is a plain ArrayBuffer, which Response takes as a body.
    const body = new Uint8Array(bytes).buffer
    vi.stubGlobal('fetch', () => Promise.resolve(new Response(body, { status: 200 })))
    const model = await new GltfModelBackend().load('/knight.glb')
    let skinned = 0
    model.scene.traverse((object) => {
      if (object instanceof THREE.SkinnedMesh) skinned += 1
    })
    expect(skinned).toBeGreaterThan(0)
    expect(model.animations.map((clip) => clip.name).sort()).toEqual(['Idle', 'Jump_Idle', 'Jump_Land', 'Jump_Start', 'Walking_A'])
  })
})
