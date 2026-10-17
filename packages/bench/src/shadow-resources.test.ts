import * as THREE from 'three/webgpu'
import { expect, it } from 'vitest'
import { assertShadowResourceSweep } from './backend-matrix.ts'
import { parseScenarioResult } from './results-guard.ts'
import { resultFromReport, type PageScenarioReport } from './results.ts'
import {
  assertStableShadowCheckpoint, isShadowResourceReport, readRendererMemory,
  SHADOW_RESOURCE_PHASES, ShadowResourceObserver,
} from './shadow-resources.ts'

function memory() {
  return {
    attributes: 8, attributesSize: 128, geometries: 2,
    indexAttributes: 2, indexAttributesSize: 48,
    indirectStorageAttributes: 0, indirectStorageAttributesSize: 0,
    programs: 3, programsSize: 64, readbackBuffers: 0, readbackBuffersSize: 0,
    renderTargets: 2, storageAttributes: 0, storageAttributesSize: 0,
    textures: 4, texturesSize: 1024, uniformBuffers: 3, uniformBuffersSize: 256,
    total: 1520,
  }
}

function gpuBoundary() {
  const info = { memory: memory(), render: { drawCalls: 0 } }
  const live = new Set<THREE.Texture>()
  const backend = {
    createTexture(this: void, texture: THREE.Texture) { live.add(texture); info.memory.textures++ },
    destroyTexture(this: void, texture: THREE.Texture) { live.delete(texture); info.memory.textures-- },
  }
  return { info, backend }
}

it('copies actual renderer memory and rejects missing/nonfinite metrics instead of inventing zero', () => {
  const renderer = gpuBoundary()
  const result = readRendererMemory(renderer)
  expect(result).toEqual(memory())
  renderer.info.memory.textures = 99
  expect(result.textures).toBe(4)
  expect(() => readRendererMemory({ info: { render: { drawCalls: 0 } }, backend: {} })).toThrow(/memory/)
  renderer.info.memory.total = Number.NaN
  expect(() => readRendererMemory(renderer)).toThrow(/total/)
  renderer.info.memory.total = Number.POSITIVE_INFINITY
  expect(() => readRendererMemory(renderer)).toThrow(/total/)
  renderer.info.memory.total = -1
  expect(() => readRendererMemory(renderer)).toThrow(/total/)
  const incomplete = { ...memory(), textures: undefined }
  expect(() => readRendererMemory({ info: { memory: incomplete }, backend: {} })).toThrow(/textures/)
})

/** Only the external GPU allocation boundary is fake; disposal/resize are native Three events. */
function initialize(renderer: ReturnType<typeof gpuBoundary>, target: THREE.RenderTarget): void {
  const attachments = [...target.textures]
  if (target.depthTexture) attachments.push(target.depthTexture)
  for (const texture of attachments) renderer.backend.createTexture(texture)
  const dispose = () => {
    for (const texture of attachments) renderer.backend.destroyTexture(texture)
    target.removeEventListener('dispose', dispose)
  }
  target.addEventListener('dispose', dispose)
}

it('correlates initialized directional and cubemap color/depth attachments, not scene objects', () => {
  const renderer = gpuBoundary()
  const observer = new ShadowResourceObserver(renderer)
  const sun = new THREE.RenderTarget(32, 32, { depthTexture: new THREE.DepthTexture(32, 32) })
  const point = new THREE.CubeRenderTarget(32)
  Object.assign(point, { depthTexture: new THREE.CubeDepthTexture(32) })
  initialize(renderer, sun)
  initialize(renderer, point)
  observer.observe('sun', sun)
  observer.observe('point', point)
  expect(observer.checkpoint('active', 0).shadow).toEqual({
    liveTargets: 2, liveTextures: 4, createdTextures: 4, destroyedTextures: 0,
    initializedTargets: 2, targetDisposals: 0,
  })
  sun.dispose()
  point.dispose()
  observer.assertRetired('sun')
  observer.assertRetired('point')
  expect(observer.checkpoint('empty', 0).shadow).toEqual({
    liveTargets: 0, liveTextures: 0, createdTextures: 4, destroyedTextures: 4,
    initializedTargets: 2, targetDisposals: 2,
  })
  observer.uninstall()
})

it('requires equivalent full memory vectors and shadow live counts; stable nonzero caches are allowed', () => {
  const observer = new ShadowResourceObserver(gpuBoundary())
  const reference = observer.checkpoint('off', 0)
  const measured = observer.checkpoint('off', 1)
  expect(() => assertStableShadowCheckpoint(reference, measured)).not.toThrow()
  expect(() => assertStableShadowCheckpoint(reference, {
    ...measured, memory: { ...measured.memory, programs: 4 },
  })).toThrow(/programs/)
  expect(() => assertStableShadowCheckpoint(reference, { ...measured, phase: 'active' })).toThrow(/phase/)
  expect(() => assertStableShadowCheckpoint(reference, {
    ...measured, shadow: { ...measured.shadow, liveTargets: 1 },
  })).toThrow(/liveTargets/)
  observer.uninstall()
})

it('distinguishes shader-source character counts from retained GPU storage without discarding raw evidence', () => {
  const observer = new ShadowResourceObserver(gpuBoundary())
  const reference = observer.checkpoint('off', 0)
  const recompiled = {
    ...reference, cycle: 1,
    memory: { ...reference.memory, programsSize: 172, total: 1628 },
  }
  expect(() => assertStableShadowCheckpoint(reference, recompiled)).not.toThrow()
  expect(recompiled.memory.programsSize).not.toBe(reference.memory.programsSize)
  expect(() => assertStableShadowCheckpoint(reference, {
    ...recompiled, memory: { ...recompiled.memory, total: recompiled.memory.total + 4 },
  })).toThrow(/total/)
  expect(() => assertStableShadowCheckpoint(reference, {
    ...recompiled, memory: { ...recompiled.memory, programs: 4 },
  })).toThrow(/programs/)
  observer.uninstall()
})

it('supports ten native setSize retire/reinitialize cycles without retaining retired storage', () => {
  const renderer = gpuBoundary()
  const observer = new ShadowResourceObserver(renderer)
  const target = new THREE.CubeRenderTarget(32)
  Object.assign(target, { depthTexture: new THREE.CubeDepthTexture(32) })
  initialize(renderer, target)
  observer.observe('lamp', target)
  for (let cycle = 1; cycle <= 10; cycle++) {
    target.setSize(cycle % 2 ? 64 : 32, cycle % 2 ? 64 : 32)
    observer.assertRetired('lamp')
    initialize(renderer, target)
    observer.observe('lamp', target)
    expect(observer.checkpoint('resized', cycle).shadow.liveTextures).toBe(2)
  }
  target.dispose()
  expect(observer.checkpoint('empty', 10).shadow).toEqual({
    liveTargets: 0, liveTextures: 0, createdTextures: 22, destroyedTextures: 22,
    initializedTargets: 11, targetDisposals: 11,
  })
  observer.uninstall()
})

it('rejects uninitialized maps and a dispose event that failed to retire backend storage', () => {
  const renderer = gpuBoundary()
  const observer = new ShadowResourceObserver(renderer)
  const target = new THREE.RenderTarget(32, 32)
  expect(() => observer.observe('sun', target)).toThrow(/uninitialized/)
  renderer.backend.createTexture(target.texture)
  observer.observe('sun', target)
  target.dispose()
  expect(() => observer.assertRetired('sun')).toThrow(/GPU attachments/)
  renderer.backend.destroyTexture(target.texture)
  observer.assertRetired('sun')
  observer.uninstall()
})

it('includes backend-initialized auxiliary depth attachments owned by the native target', () => {
  const renderer = gpuBoundary()
  const observer = new ShadowResourceObserver(renderer)
  const point = new THREE.CubeRenderTarget(32)
  const auxiliaryDepth = new THREE.DepthTexture(32, 32)
  auxiliaryDepth.renderTarget = point
  initialize(renderer, point)
  renderer.backend.createTexture(auxiliaryDepth)
  point.addEventListener('dispose', () => renderer.backend.destroyTexture(auxiliaryDepth))
  observer.observe('point', point)
  expect(observer.checkpoint('active', 0).shadow.liveTextures).toBe(2)
  point.dispose()
  observer.assertRetired('point')
  expect(observer.checkpoint('empty', 1).shadow.destroyedTextures).toBe(2)
  observer.uninstall()
})

it('counts storage retired during the first render before light.shadow.map can be correlated', () => {
  const renderer = gpuBoundary()
  const observer = new ShadowResourceObserver(renderer)
  const target = new THREE.RenderTarget(32, 32)
  initialize(renderer, target)
  target.setSize(64, 64)
  initialize(renderer, target)
  observer.observe('sun', target)
  expect(observer.checkpoint('active', 0).shadow).toMatchObject({
    createdTextures: 2, destroyedTextures: 1, liveTextures: 1,
  })
  target.dispose()
  observer.uninstall()
})

it('restores own descriptors and inherited backend methods, including partial installation failure', () => {
  const renderer = gpuBoundary()
  const descriptor = Object.getOwnPropertyDescriptor(renderer.backend, 'createTexture')
  const inherited = Object.create(renderer.backend) as object
  const observer = new ShadowResourceObserver({ ...renderer, backend: inherited })
  expect(Object.hasOwn(inherited, 'createTexture')).toBe(true)
  observer.uninstall()
  expect(Object.hasOwn(inherited, 'createTexture')).toBe(false)
  const ownObserver = new ShadowResourceObserver(renderer)
  ownObserver.uninstall()
  expect(Object.getOwnPropertyDescriptor(renderer.backend, 'createTexture')).toEqual(descriptor)
  const unavailable = { createTexture: renderer.backend.createTexture }
  expect(() => new ShadowResourceObserver({ ...renderer, backend: unavailable })).toThrow(/destroyTexture/)
  expect(unavailable.createTexture).toBe(renderer.backend.createTexture)
})

it('fails explicitly if the runtime backend texture API stops receiving actual Three textures', () => {
  const renderer = gpuBoundary()
  const observer = new ShadowResourceObserver(renderer)
  expect(() => { Reflect.apply(renderer.backend.createTexture, renderer.backend, [{}]) }).toThrow(/Three texture/)
  observer.uninstall()
})

function reportFixture() {
  return {
    backend: 'webgl2', cycles: 10, warmupCycles: 3, passed: true, measuredBeforeDispose: true,
    phases: [...SHADOW_RESOURCE_PHASES],
    checkpoints: Array.from({ length: 11 }, (_, cycle) => SHADOW_RESOURCE_PHASES.map((phase, phaseIndex) => ({
      phase, cycle, memory: memory(),
      shadow: {
        liveTargets: ['off', 'scene-2d', 'empty'].includes(phase) ? 0 : phase === 'light-destroyed' ? 4 : 5,
        liveTextures: ['off', 'scene-2d', 'empty'].includes(phase) ? 0 : phase === 'light-destroyed' ? 8 : 10,
        createdTextures: (cycle * 11 + phaseIndex + 1) * 10 + (['off', 'scene-2d', 'empty'].includes(phase) ? 0 : phase === 'light-destroyed' ? 8 : 10),
        destroyedTextures: (cycle * 11 + phaseIndex + 1) * 10,
        initializedTargets: (cycle * 11 + phaseIndex + 1) * 5 + (['off', 'scene-2d', 'empty'].includes(phase) ? 0 : phase === 'light-destroyed' ? 4 : 5),
        targetDisposals: (cycle * 11 + phaseIndex + 1) * 5,
      },
    }))).flat(),
  }
}

it('validates the public report boundary instead of trusting passed or a final zero', () => {
  const report = reportFixture()
  expect(isShadowResourceReport(report)).toBe(true)
  expect(isShadowResourceReport({ ...report, cycles: 9 })).toBe(false)
  expect(isShadowResourceReport({ ...report, checkpoints: report.checkpoints.slice(1) })).toBe(false)
  expect(isShadowResourceReport({ ...report, measuredBeforeDispose: false })).toBe(false)
  expect(isShadowResourceReport({ ...report, phases: report.phases.map(() => ({ toString: () => 'low' })) })).toBe(false)
  const leaking = structuredClone(report)
  const checkpoint = leaking.checkpoints.find((entry) => entry.cycle === 10 && entry.phase === 'off')
  if (!checkpoint) throw new Error('missing fixture checkpoint')
  checkpoint.memory.uniformBuffers++
  expect(isShadowResourceReport(leaking)).toBe(false)
})

it('rejects ten copied cycles with no new GPU creation/disposal evidence', () => {
  const report = reportFixture()
  const reference = report.checkpoints.filter((checkpoint) => checkpoint.cycle === 0)
  const copied = { ...report, checkpoints: Array.from({ length: 11 }, (_, cycle) => reference.map((checkpoint) => ({ ...checkpoint, cycle }))).flat() }
  expect(isShadowResourceReport(copied)).toBe(false)
})

it('preserves validated GPU evidence through local and remote result transport', () => {
  const resources = reportFixture()
  if (!isShadowResourceReport(resources)) throw new Error('Invalid fixture')
  const report: PageScenarioReport = {
    scenario: 'shadows-sun-on-50', backend: 'webgl2', renderer: 'GPU test boundary', resources,
    frameMs: Array.from({ length: 60 }, () => 1),
    shadow: { composition: 'sun', enabled: true, quality: 'medium', casters: 50, lights: 1, warmupFrames: 5, measuredFrames: 60 },
    counters: { drawCalls: 101, meshes: 51, visibleMeshes: 51, geometries: 51, materials: 51, textures: 0, textureSources: 0, entitiesSpawned: 52, entitiesDestroyed: 0, materialsCreated: 51, geometriesCreated: 51 },
  }
  const result = resultFromReport(report, { commit: 'abc1234', host: { platform: 'linux', cpus: 8, chrome: 'Chrome 150' } }, '')
  expect(result.resources).toBe(resources)
  const parsed = parseScenarioResult(JSON.parse(JSON.stringify(result)))
  expect(parsed.resources).toEqual(resources)
  expect(() => assertShadowResourceSweep([parsed])).not.toThrow()
  expect(() => parseScenarioResult({ ...result, resources: { ...resources, backend: 'webgpu' } })).toThrow(/resource evidence/)
})
