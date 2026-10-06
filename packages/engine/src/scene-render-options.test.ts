import { describe, expect, it } from 'vitest'
import { resolveAmbientLight, resolvePostEffects, sceneRenderIssues } from './scene-render-options.js'

describe('resolveAmbientLight (CA-2)', () => {
  it('is full white light when the scene declares none', () => {
    expect(resolveAmbientLight(undefined)).toEqual({ color: '#ffffff', intensity: 1 })
    expect(resolveAmbientLight({})).toEqual({ color: '#ffffff', intensity: 1 })
    expect(resolveAmbientLight({ ambient: {} })).toEqual({ color: '#ffffff', intensity: 1 })
  })

  it('keeps a declared color and intensity, lower-casing the color', () => {
    expect(resolveAmbientLight({ ambient: { color: '#2030A0', intensity: 0.25 } })).toEqual({
      color: '#2030a0',
      intensity: 0.25,
    })
  })

  it('clamps an out-of-range intensity and drops an unreadable color at runtime (inference 11)', () => {
    expect(resolveAmbientLight({ ambient: { intensity: 4 } }).intensity).toBe(1)
    expect(resolveAmbientLight({ ambient: { intensity: -1 } }).intensity).toBe(0)
    expect(resolveAmbientLight({ ambient: { color: 'dark', intensity: Number.NaN } })).toEqual({
      color: '#ffffff',
      intensity: 1,
    })
  })
})

describe('resolvePostEffects (CA-2, CA-11)', () => {
  it('turns every Post Effect off when the scene declares none', () => {
    expect(resolvePostEffects(undefined)).toEqual({ vignette: null, colorGrade: null })
    expect(resolvePostEffects({})).toEqual({ vignette: null, colorGrade: null })
  })

  it('keeps a vignette and fills a color grade’s absent fields with neutral values', () => {
    expect(resolvePostEffects({ vignette: { intensity: 0.6, radius: 0.4 }, colorGrade: { contrast: 1.2 } })).toEqual({
      vignette: { intensity: 0.6, radius: 0.4 },
      colorGrade: { tint: '#ffffff', contrast: 1.2, saturation: 1 },
    })
  })

  it('clamps out-of-range values at runtime', () => {
    expect(resolvePostEffects({
      vignette: { intensity: 2, radius: -1 },
      colorGrade: { tint: '#FF8800', contrast: 5, saturation: -2 },
    })).toEqual({
      vignette: { intensity: 1, radius: 0 },
      colorGrade: { tint: '#ff8800', contrast: 2, saturation: 0 },
    })
  })
})

describe('sceneRenderIssues (CA-2, inference 12)', () => {
  it('finds nothing wrong with an absent, empty or in-range render block', () => {
    expect(sceneRenderIssues(undefined)).toEqual([])
    expect(sceneRenderIssues({ sort: 'y' })).toEqual([])
    expect(sceneRenderIssues({
      lighting: { ambient: { color: '#102030', intensity: 0 } },
      post: { vignette: { intensity: 1, radius: 0 }, colorGrade: { tint: '#ffffff', contrast: 2, saturation: 0 } },
    })).toEqual([])
  })

  it('names each out-of-range field with its allowed range', () => {
    const issues = sceneRenderIssues({
      lighting: { ambient: { color: 'orange', intensity: 1.5 } },
      post: {
        vignette: { intensity: -0.1, radius: 2 },
        colorGrade: { tint: '#12345', contrast: 3, saturation: 'x' },
      },
    })
    expect(issues).toEqual([
      { field: 'render.lighting.ambient.color', message: 'render.lighting.ambient.color must be a #rrggbb color; got "orange".' },
      { field: 'render.lighting.ambient.intensity', message: 'render.lighting.ambient.intensity must be a number from 0 to 1; got 1.5.' },
      { field: 'render.post.vignette.intensity', message: 'render.post.vignette.intensity must be a number from 0 to 1; got -0.1.' },
      { field: 'render.post.vignette.radius', message: 'render.post.vignette.radius must be a number from 0 to 1; got 2.' },
      { field: 'render.post.colorGrade.tint', message: 'render.post.colorGrade.tint must be a #rrggbb color; got "#12345".' },
      { field: 'render.post.colorGrade.contrast', message: 'render.post.colorGrade.contrast must be a number from 0 to 2; got 3.' },
      { field: 'render.post.colorGrade.saturation', message: 'render.post.colorGrade.saturation must be a number from 0 to 2; got "x".' },
    ])
  })

  it('requires both vignette fields and rejects a block that is not an object', () => {
    expect(sceneRenderIssues({ post: { vignette: { intensity: 0.5 } } })).toEqual([
      { field: 'render.post.vignette.radius', message: 'render.post.vignette.radius must be a number from 0 to 1; got undefined.' },
    ])
    expect(sceneRenderIssues({ lighting: 3 })).toEqual([
      { field: 'render.lighting', message: 'render.lighting must be an object; got 3.' },
    ])
  })
})
