import { describe, expect, it } from 'vitest'
import { defineStates } from '@waica/engine'
import { MemFS } from '../fs/project-fs'
import {
  listRoleFiles,
  listStateFiles,
  machineProps,
  roleFileTemplate,
  stateCodeStatus,
  stateFileTemplate,
  stateIssues,
  stateNames,
  type MachineProps,
} from './states'

function machine(over: Partial<MachineProps> = {}): MachineProps {
  return {
    role: 'player',
    initial: 'idle',
    states: {
      idle: { transitions: [{ on: 'input:dash', to: 'dashing' }] },
      dashing: { clip: 'run', transitions: [{ on: 'timer:0.25', to: 'idle' }] },
    },
    ...over,
  }
}

describe('machineProps', () => {
  it('normalizes free-form prefab JSON with defaults', () => {
    expect(machineProps({ type: 'StateMachine' })).toEqual({ role: '', initial: '', states: {} })
    expect(machineProps({ type: 'StateMachine', props: { role: 'player' } }).role).toBe('player')
  })
})

describe('stateNames', () => {
  it("hides the '*' wildcard entry — it is edges, not a state", () => {
    expect(stateNames(machine({ states: { idle: {}, '*': {} } }))).toEqual(['idle'])
  })
})

describe('stateCodeStatus', () => {
  it('reports builtin for states registered in an editor-known set', () => {
    defineStates('states-test-set', { glowing: {} })
    expect(stateCodeStatus('states-test-set', 'glowing', [])).toEqual({ kind: 'builtin' })
  })

  it('reports the project file when one matches the state name', () => {
    expect(stateCodeStatus('states-test-set', 'dashing', ['dashing.ts'])).toEqual({
      kind: 'file',
      path: 'src/states/dashing.ts',
    })
  })

  it('reports none otherwise', () => {
    expect(stateCodeStatus('states-test-set', 'dashing', [])).toEqual({ kind: 'none' })
  })
})

describe('stateIssues', () => {
  it('warns when the clip the state plays does not exist', () => {
    const issues = stateIssues('dashing', machine(), ['idle'], ['dashing.ts'])
    expect(issues[0]?.level).toBe('warn')
    expect(issues[0]?.text).toBe('No animation for this state')
    expect(issues[0]?.detail).toContain('"run"')
  })

  it('accepts the clip override when the sprite has it', () => {
    const issues = stateIssues('dashing', machine(), ['run'], ['dashing.ts'])
    expect(issues.filter((i) => i.level === 'warn')).toEqual([])
  })

  it('warns about transitions to states that do not exist', () => {
    const broken = machine({
      states: { idle: { transitions: [{ on: 'signal:x', to: 'idel' }] } },
    })
    const issues = stateIssues('idle', broken, ['idle'], [])
    expect(issues.some((i) => i.level === 'warn' && i.text.includes('"idel"'))).toBe(true)
  })

  it('warns when nothing leads to a non-initial state', () => {
    const stranded = machine({
      states: { idle: {}, dashing: { clip: 'run', transitions: [] } },
    })
    const issues = stateIssues('dashing', stranded, ['run'], ['dashing.ts'])
    expect(issues.some((i) => i.level === 'warn' && i.text === 'Nothing leads here')).toBe(true)
    // The initial state needs no incoming edge — the machine starts there.
    expect(
      stateIssues('idle', stranded, ['idle'], []).some((i) => i.text === 'Nothing leads here'),
    ).toBe(false)
  })

  it('reports nothing for project-file states — Play runs them', () => {
    const issues = stateIssues('dashing', machine(), ['run'], ['dashing.ts'])
    expect(issues).toEqual([])
  })

  it('marks code-less custom states as info, never warn', () => {
    const issues = stateIssues('dashing', machine(), ['run'], [])
    expect(issues).toHaveLength(1)
    expect(issues[0]?.level).toBe('info')
    expect(issues[0]?.detail).toContain('src/states/dashing.ts')
  })
})

describe('listStateFiles', () => {
  it('lists src/states/*.ts basenames from the project tree', async () => {
    const fs = new MemFS('demo', {
      'src/states/dash.ts': '// code',
      'src/states/notes.md': 'not code',
      'src/main.ts': '// entry',
    })
    expect(await listStateFiles(fs)).toEqual(['dash.ts'])
  })

  it('returns empty when the folder does not exist', async () => {
    const fs = new MemFS('demo', { 'src/main.ts': '// entry' })
    expect(await listStateFiles(fs)).toEqual([])
  })
})

describe('stateFileTemplate', () => {
  it("registers the state in the role's logic set", () => {
    const code = stateFileTemplate('merchant', 'trading')
    expect(code).toContain("defineStates('merchant'")
    expect(code).toContain('trading: {')
    expect(code).toContain("from '@waica/engine'")
  })

  it('ships a working motor-based starter for the player role', () => {
    const code = stateFileTemplate('player', 'dashing')
    expect(code).toContain('PlatformerMotor')
    expect(code).toContain('motor.vx = motor.facing * 30')
  })
})

describe('roleFileTemplate', () => {
  it('scaffolds a working defineRole with graph and states', () => {
    const code = roleFileTemplate('guard')
    expect(code).toContain("defineRole('guard'")
    expect(code).toContain('description:')
    expect(code).toContain("initial: 'idle'")
    expect(code).toContain("from '@waica/engine'")
  })
})

describe('listRoleFiles', () => {
  it('lists src/roles/*.ts basenames from the project tree', async () => {
    const fs = new MemFS('demo', {
      'src/roles/guard.ts': '// code',
      'src/roles/notes.md': 'not code',
      'src/main.ts': '// entry',
    })
    expect(await listRoleFiles(fs)).toEqual(['guard.ts'])
  })

  it('returns empty when the folder does not exist', async () => {
    const fs = new MemFS('demo', { 'src/main.ts': '// entry' })
    expect(await listRoleFiles(fs)).toEqual([])
  })
})
