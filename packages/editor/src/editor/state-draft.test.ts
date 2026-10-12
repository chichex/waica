import { describe, expect, it } from 'vitest'
import { applyStateDraft, describeTrigger, parseEdge } from './state-draft'

// The `clip:end` trigger (issue #166) must survive the editor's draft round
// trip: parseEdge once mapped every kind it did not know to `signal`, so
// saving a state rewrote `clip:end` as `signal:end`, a transition that
// never fires (review of PR #167).
describe('state-draft keeps the clip:end trigger', () => {
  it('parses clip:end as the clip kind and serializes it back unchanged', () => {
    const machine = { role: 'player', initial: 'idle', states: { idle: {}, attack: { transitions: [{ on: 'clip:end', to: 'idle' }] } } }
    const edges = (machine.states.attack.transitions ?? []).map(parseEdge)

    expect(edges).toEqual([{ kind: 'clip', arg: 'end', to: 'idle' }])
    expect(applyStateDraft(machine, { state: 'attack', nextName: 'attack', clip: '', edges }).states['attack']).toEqual({
      transitions: [{ on: 'clip:end', to: 'idle' }],
    })
  })

  it('describes clip:end for the incoming-edges line, and still folds an unknown kind into signal', () => {
    expect(describeTrigger('clip:end')).toBe('clip ends')
    expect(describeTrigger('input:jump')).toBe('key press jump')
    expect(parseEdge({ on: 'whatever:x', to: 'idle' })).toEqual({ kind: 'signal', arg: 'x', to: 'idle' })
  })
})
