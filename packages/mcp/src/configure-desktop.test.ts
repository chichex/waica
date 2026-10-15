import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { createWaicaMcpServer } from './server.js'
import { cleanup, jsonResult, makeProject } from './test-helpers.js'

const roots: string[] = []
afterEach(async () => cleanup(...roots.splice(0)))

const GAME = {
  waicaGame: 1,
  archetype: 'platformer',
  resolution: { mode: 'fixed', width: 640, height: 360 },
  pixelsPerUnit: 16,
}

async function project(game: Record<string, unknown> = GAME): Promise<string> {
  const root = await makeProject({ 'src/game.json': `${JSON.stringify(game, null, 2)}\n` })
  roots.push(root)
  return root
}

async function configure(projectPath: string, args: Record<string, unknown>) {
  const server = createWaicaMcpServer()
  const client = new Client({ name: 'configure-desktop-test', version: '1.0.0' })
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)])
  try {
    const result = await client.callTool({ name: 'configure_desktop', arguments: { project_path: projectPath, ...args } })
    return { isError: 'toolResult' in result ? undefined : result.isError, body: jsonResult(result) }
  } finally {
    await client.close()
    await server.close()
  }
}

async function gameJson(projectPath: string): Promise<string> {
  return readFile(path.join(projectPath, 'src/game.json'), 'utf8')
}

describe('configure_desktop merges into game.json (issue #200 CA-20)', () => {
  it('writes the desktop block, keeps every other key and returns the result', async () => {
    const root = await project()
    const result = await configure(root, { fullscreen: true, scale: 3 })
    expect(result.isError).toBeUndefined()
    expect(result.body).toMatchObject({ desktop: { fullscreen: true, scale: 3 } })
    expect(JSON.parse(await gameJson(root))).toEqual({ ...GAME, desktop: { fullscreen: true, scale: 3 } })
  })

  it('merges a partial update and replaces arrays instead of appending to them', async () => {
    const root = await project({ ...GAME, desktop: { scale: 2, steam: { appId: 480, achievements: ['a', 'b'], stats: ['kills'] } } })
    const result = await configure(root, { fullscreen: false, steam: { achievements: ['c'] } })
    const desktop = { scale: 2, fullscreen: false, steam: { appId: 480, achievements: ['c'], stats: ['kills'] } }
    expect(result.body).toMatchObject({ desktop })
    expect(JSON.parse(await gameJson(root))).toEqual({ ...GAME, desktop })
  })

  it('removes steam with steam: null', async () => {
    const root = await project({ ...GAME, desktop: { scale: 2, steam: { appId: 480 } } })
    const result = await configure(root, { steam: null })
    expect(result.body).toMatchObject({ desktop: { scale: 2 } })
    expect(JSON.parse(await gameJson(root))).toEqual({ ...GAME, desktop: { scale: 2 } })
  })

  it('is listed with a strict schema as the sixteenth tool', async () => {
    const server = createWaicaMcpServer()
    const client = new Client({ name: 'configure-desktop-test', version: '1.0.0' })
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()
    await Promise.all([server.connect(serverTransport), client.connect(clientTransport)])
    const { tools } = await client.listTools()
    await client.close()
    await server.close()
    expect(tools).toHaveLength(16)
    const tool = tools.find((candidate) => candidate.name === 'configure_desktop')
    expect(tool?.inputSchema).toMatchObject({ additionalProperties: false, required: ['project_path'] })
    expect(Object.keys(tool?.inputSchema.properties ?? {}).sort()).toEqual(['fullscreen', 'project_path', 'scale', 'steam'])
  })
})

describe('configure_desktop refuses invalid input and writes nothing (issue #200 CA-20)', () => {
  it.each([
    [{ scale: 0 }, 'scale'],
    [{ scale: -1 }, 'scale'],
    [{ fullscreen: 'yes' }, 'fullscreen'],
    [{ steam: { appId: 4.5 } }, 'steam.appId'],
    [{ steam: { appId: 0 } }, 'steam.appId'],
    [{ steam: { appId: 480, achievements: ['win', 'win'] } }, 'steam.achievements'],
    [{ steam: { appId: 480, stats: ['kills', 'kills'] } }, 'steam.stats'],
    [{ steam: 'on' }, 'steam'],
  ])('%j names %s', async (args, field) => {
    const root = await project()
    const before = await gameJson(root)
    const result = await configure(root, args)
    expect(result.isError).toBe(true)
    expect(result.body).toMatchObject({ error: { code: 'invalid-desktop-config', field } })
    expect(String((result.body.error as { message: string }).message)).toContain(field)
    expect(await gameJson(root)).toBe(before)
  })

  it('refuses a merge whose result is invalid, such as a duplicate already in game.json', async () => {
    const root = await project({ ...GAME, desktop: { steam: { appId: 480, stats: ['kills', 'kills'] } } })
    const before = await gameJson(root)
    const result = await configure(root, { scale: 2 })
    expect(result.body).toMatchObject({ error: { code: 'invalid-desktop-config', field: 'steam.stats' } })
    expect(await gameJson(root)).toBe(before)
  })

  it('refuses a Project whose game.json is not a JSON object', async () => {
    const root = await project()
    await writeFile(path.join(root, 'src/game.json'), '[1, 2]')
    const result = await configure(root, { scale: 2 })
    expect(result.isError).toBe(true)
    expect(await gameJson(root)).toBe('[1, 2]')
  })
})
