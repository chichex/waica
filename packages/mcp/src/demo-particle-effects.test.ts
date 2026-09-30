import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import type { PrefabJson, SceneJson } from '@waica/engine'
import { createWaicaMcpServer } from './server.js'
import { cleanup, readJson, tempDir } from './test-helpers.js'

const roots: string[] = []
afterEach(async () => cleanup(...roots.splice(0)))

type ToolResult = Awaited<ReturnType<Client['callTool']>>
type Archetype = 'platformer' | 'topdown' | 'isometric'
type Finding = { code: string; file: string; severity: string; message?: string }

function jsonResult(result: ToolResult): Record<string, unknown> {
  if ('toolResult' in result) throw new Error('unexpected task result')
  const text = result.content.find((item) => item.type === 'text')
  if (!text || text.type !== 'text') throw new Error('missing JSON text result')
  return JSON.parse(text.text) as Record<string, unknown>
}

/** A fresh create_project demo for `archetype`, and validate_project's findings for it. */
async function createDemo(archetype: Archetype): Promise<{ project: string; findings: Finding[] }> {
  const parent = await tempDir()
  roots.push(parent)
  const project = path.join(parent, `${archetype}-demo`)
  const server = createWaicaMcpServer()
  const client = new Client({ name: 'waica-mcp-test', version: '1.0.0' })
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)])
  try {
    const created = await client.callTool({
      name: 'create_project',
      arguments: { project_path: project, start: 'demo', archetype },
    })
    expect('toolResult' in created ? undefined : created.isError, JSON.stringify(created)).not.toBe(true)
    const validated = jsonResult(
      await client.callTool({ name: 'validate_project', arguments: { project_path: project } }),
    )
    return { project, findings: validated['findings'] as Finding[] }
  } finally {
    await client.close()
    await server.close()
  }
}

/** The component types of a generated prefab file, in order. */
async function prefabTypes(project: string, file: string): Promise<string[]> {
  const prefab = await readJson<PrefabJson>(path.join(project, 'src', file))
  return prefab.components.map((component) => component.type)
}

/** Each named scene entity's prefab ref. */
async function scenePrefabs(project: string, file: string): Promise<Record<string, string | undefined>> {
  const scene = await readJson<SceneJson>(path.join(project, 'src/scenes', file))
  return Object.fromEntries(scene.entities.map((entity) => [entity.name, entity.prefab]))
}

/** The particle cues each archetype's player prefab carries, after its ParticleEmitter. */
const PLAYER_CUE: Readonly<Record<Archetype, string>> = {
  platformer: 'DustPuffs',
  topdown: 'DustTrail',
  isometric: 'SwingSparks',
}

describe('create_project demos ship the archetype particle effects', () => {
  it.each(['platformer', 'topdown', 'isometric'] as const)(
    'the %s demo player carries its emitter and cue, and validates without unknown components',
    async (archetype) => {
      const { project, findings } = await createDemo(archetype)
      const types = await prefabTypes(project, 'characters/player.character.json')

      const emitter = types.indexOf('ParticleEmitter')
      const cue = types.indexOf(PLAYER_CUE[archetype])
      expect(emitter, types.join(', ')).toBeGreaterThan(types.indexOf('StateMachine'))
      expect(cue, types.join(', ')).toBeGreaterThan(emitter)
      expect(findings.filter((finding) => finding.code === 'unknown-component')).toEqual([])
    },
  )

  it('the isometric demo stages wind and hurt smoke in main, and dust (no wind) in the cave', async () => {
    const { project } = await createDemo('isometric')

    const main = await scenePrefabs(project, 'main.scene.json')
    expect(main['Wind']).toBe('objects/wind')
    expect(main['HurtSmoke']).toBe('objects/hurt-smoke')
    const cave = await scenePrefabs(project, 'cave.scene.json')
    expect(cave['Dust']).toBe('objects/cave-dust')
    expect(cave['Wind']).toBeUndefined()
    expect(await prefabTypes(project, 'objects/wind.object.json')).toEqual(['ParticleEmitter'])
    expect(await prefabTypes(project, 'objects/hurt-smoke.object.json')).toEqual([
      'ParticleEmitter',
      'DamagePuff',
    ])
    expect(await prefabTypes(project, 'objects/cave-dust.object.json')).toEqual(['ParticleEmitter'])
  })
})
