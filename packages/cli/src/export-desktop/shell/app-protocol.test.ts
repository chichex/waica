import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { writeTree } from '../test-export.js'
import { APP_ORIGIN, APP_SCHEME, APP_SCHEME_PRIVILEGES, resolveAppRequest } from './app-protocol.js'

let root = ''
let dist = ''

beforeAll(async () => {
  root = await mkdtemp(path.join(os.tmpdir(), 'waica-app-protocol-'))
  dist = path.join(root, 'dist')
  await writeTree(root, {
    'dist/index.html': '<!doctype html>',
    'dist/waica.params.json': '{}',
    'dist/assets/index-abc.js': '',
    'dist/assets/rapier_wasm3d_bg-1.wasm': '',
    'dist/assets/knight-2.glb': '',
    'dist/assets/hero-3.png': '',
    'dist/assets/music-4.ogg': '',
    'dist/assets/scene.json': '{}',
    'secret.txt': 'outside dist',
  })
})

afterAll(() => rm(root, { recursive: true, force: true }))

describe('the app:// protocol (issue #200 CA-9)', () => {
  it('is a standard, secure scheme with fetch and streaming', () => {
    expect(APP_SCHEME).toBe('app')
    expect(APP_ORIGIN).toBe('app://game')
    expect(APP_SCHEME_PRIVILEGES).toEqual({ standard: true, secure: true, supportFetchAPI: true, stream: true })
  })

  it.each(['app://game/', 'app://game/index.html', 'app://game/index.html?x=1#y'])('serves index.html for %s', (url) => {
    expect(resolveAppRequest(dist, url)).toEqual({
      status: 200,
      file: path.join(dist, 'index.html'),
      mimeType: 'text/html; charset=utf-8',
    })
  })

  it("serves the build's waica.params.json, where the template fetches it", () => {
    expect(resolveAppRequest(dist, 'app://game/waica.params.json')).toEqual({
      status: 200,
      file: path.join(dist, 'waica.params.json'),
      mimeType: 'application/json',
    })
  })

})

describe('the app:// protocol: MIME types and refusals (issue #200 CA-9)', () => {
  it.each([
    ['assets/index-abc.js', 'text/javascript; charset=utf-8'],
    ['assets/rapier_wasm3d_bg-1.wasm', 'application/wasm'],
    ['assets/knight-2.glb', 'model/gltf-binary'],
    ['assets/hero-3.png', 'image/png'],
    ['assets/scene.json', 'application/json'],
    ['assets/music-4.ogg', 'audio/ogg'],
  ])('serves %s as %s', (file, mimeType) => {
    expect(resolveAppRequest(dist, `app://game/${file}`)).toEqual({ status: 200, file: path.join(dist, file), mimeType })
  })

  it.each([
    'app://game/../secret.txt',
    'app://game/%2e%2e/secret.txt',
    'app://game/assets/%2E%2E/%2e%2e/secret.txt',
    'app://game/%2e%2e%2fsecret.txt',
    'app://game/assets/missing.js',
    'app://game/assets',
    'app://elsewhere/index.html',
    'app://game/%zz',
  ])('answers 404 for %s', (url) => {
    expect(resolveAppRequest(dist, url)).toEqual({ status: 404 })
  })
})
