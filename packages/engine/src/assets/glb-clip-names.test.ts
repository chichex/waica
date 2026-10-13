import { describe, expect, it } from 'vitest'
import knight from '../../../archetype-third-person/assets/knight.glb?inline'
import rig from '../../fixtures/rig.glb?inline'
import unitBox from '../../fixtures/unit-box.glb?inline'
import * as engine from '../index.js'

const { glbClipNames } = engine

/** A file's bytes, from the data URI Vite inlines it as. */
function bytesOf(dataUri: string): Uint8Array {
  return Uint8Array.from(atob(dataUri.slice(dataUri.indexOf(',') + 1)), (char) => char.charCodeAt(0))
}

/** A glb whose JSON chunk holds `text`, padded with spaces to 4 bytes, behind a 12-byte header and an 8-byte chunk header. */
function glbWithJson(text: string, magic = 'glTF'): Uint8Array {
  const json = new TextEncoder().encode(text.padEnd(Math.ceil(text.length / 4) * 4, ' '))
  const bytes = new Uint8Array(20 + json.length)
  const view = new DataView(bytes.buffer)
  bytes.set(new TextEncoder().encode(magic), 0)
  view.setUint32(4, 2, true)
  view.setUint32(8, bytes.length, true)
  view.setUint32(12, json.length, true)
  bytes.set(new TextEncoder().encode('JSON'), 16)
  bytes.set(json, 20)
  return bytes
}

describe('glbClipNames (issue #173 CA-3)', () => {
  it('is exported by @waica/engine and lists the rig fixture clips in file order', () => {
    expect(glbClipNames(bytesOf(rig))).toEqual(['idle', 'walk', 'jump'])
  })

  it("lists the third-person archetype Knight's clips in file order", () => {
    expect(glbClipNames(bytesOf(knight))).toEqual([
      '1H_Melee_Attack_Chop',
      'Death_A',
      'Dodge_Forward',
      'Idle',
      'Jump_Idle',
      'Jump_Start',
      'Running_A',
      'Walking_A',
    ])
  })

  it('gives an empty list for a glb with no animations', () => {
    expect(glbClipNames(bytesOf(unitBox))).toEqual([])
  })

  it('names an unnamed clip as three does (animation_<index>)', () => {
    expect(glbClipNames(glbWithJson('{"asset":{"version":"2.0"},"animations":[{"name":"run"},{},{"name":""}]}'))).toEqual(['run', 'animation_1', 'animation_2'])
  })

  it('reads only the header and the JSON chunk: the bytes behind it may be cut off', () => {
    const whole = bytesOf(rig)
    const jsonEnd = 20 + new DataView(whole.buffer).getUint32(12, true)
    expect(glbClipNames(whole.subarray(0, jsonEnd))).toEqual(['idle', 'walk', 'jump'])
  })

  it('gives null for bytes that are not a glb', () => {
    expect(glbClipNames(new Uint8Array(0))).toBeNull()
    expect(glbClipNames(new Uint8Array(8))).toBeNull()
    expect(glbClipNames(new TextEncoder().encode('{"asset":{"version":"2.0"},"animations":[]}'))).toBeNull()
    expect(glbClipNames(glbWithJson('{"animations":[]}', 'nope'))).toBeNull()
    expect(glbClipNames(bytesOf(rig).subarray(0, 40))).toBeNull()
  })

  it('gives null for a JSON chunk that does not parse to a document', () => {
    expect(glbClipNames(glbWithJson('{ nope'))).toBeNull()
    expect(glbClipNames(glbWithJson('[1, 2]'))).toBeNull()
  })
})
