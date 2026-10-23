import { CharacterMotor } from '@waica/behaviors'
import { authoringDefaults, type SceneComponentJson } from '@waica/engine'
import { expect, it } from 'vitest'
import { THIRD_PERSON_PREFABS } from './prefabs'

// Issue #205 CA-15: the Knight walks and runs through one Locomotion blend, and fades fast into its attack and dodge.

/** A prefab's component of a type, failing the test if it has none. */
function componentOf(prefab: string, type: string): SceneComponentJson {
  const component = THIRD_PERSON_PREFABS[prefab]?.components.find((candidate) => candidate.type === type)
  if (!component) throw new Error(`${prefab} has no ${type}`)
  return component
}

it('gives the Player’s Animator the Locomotion blend: Idle at 0, Walking_A at 6 and Running_A at 10 by speed, smoothed over 0.15 s (CA-15)', () => {
  expect(componentOf('characters/player', 'Animator').props?.blends).toEqual({
    Locomotion: { param: 'speed', points: [{ clip: 'Idle', at: 0 }, { clip: 'Walking_A', at: 6 }, { clip: 'Running_A', at: 10 }], smoothing: 0.15 },
  })
})

it('puts Walking_A and Running_A at the speeds the Player’s CharacterMotor walks and runs at: its props, else the motor’s defaults (CA-15)', () => {
  const motor = { ...authoringDefaults(CharacterMotor), ...componentOf('characters/player', 'CharacterMotor').props }
  const blends = componentOf('characters/player', 'Animator').props?.blends as Record<string, { points: { clip: string; at: number }[] }>
  const at = Object.fromEntries((blends.Locomotion?.points ?? []).map(({ clip, at: threshold }) => [clip, threshold]))

  expect(at).toEqual({ Idle: 0, Walking_A: motor.speed, Running_A: motor.runSpeed })
})

it('plays Locomotion in idle, walk and run, and the Knight’s own clips in the other states (CA-15)', () => {
  const states = componentOf('characters/player', 'StateMachine').props?.states as Record<string, { clip?: string }>
  const clips = Object.fromEntries(Object.entries(states).filter(([name]) => name !== '*').map(([name, state]) => [name, state.clip]))

  expect(clips).toEqual({
    idle: 'Locomotion',
    walk: 'Locomotion',
    run: 'Locomotion',
    jump: 'Jump_Start',
    fall: 'Jump_Idle',
    attack: '1H_Melee_Attack_Chop',
    roll: 'Dodge_Forward',
    die: 'Death_A',
  })
})

it('fades into the attack and the dodge over 0.05 s and into the death over 0.3 s, keeping the one-shots (CA-15)', () => {
  expect(componentOf('characters/player', 'Animator').props?.clips).toEqual({
    Jump_Start: { loop: false },
    '1H_Melee_Attack_Chop': { loop: false, fade: 0.05 },
    Dodge_Forward: { loop: false, fade: 0.05 },
    Death_A: { loop: false, fade: 0.3 },
  })
})

it('leaves the Skeleton without blends or per-clip fades (CA-15)', () => {
  expect(componentOf('characters/skeleton', 'Animator').props).toEqual({
    initialClip: 'Walking_A',
    clips: { '1H_Melee_Attack_Chop': { loop: false }, Hit_A: { loop: false }, Death_A: { loop: false } },
  })
})
