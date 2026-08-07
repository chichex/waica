import { describe, expect, it } from 'vitest'
import {
  Component,
  resolveComponentUpdateSchedule,
  type ComponentUpdateScheduleResult,
} from './index'

class Writer extends Component {
  static override componentName = 'Writer'
  override onUpdate(): void {}
}

class Reader extends Component {
  static override componentName = 'Reader'
  static override updateAfter = ['Writer'] as const
  override onUpdate(): void {}
}

class Passive extends Component {
  static override componentName = 'Passive'
}

class Alpha extends Component {
  static override componentName = 'Alpha'
  override onUpdate(): void {}
}

class PassiveDeclarer extends Component {
  static override componentName = 'PassiveDeclarer'
  static override updateAfter = ['Writer'] as const
}

class ReaderAfterPassive extends Component {
  static override componentName = 'ReaderAfterPassive'
  static override updateAfter = ['Passive'] as const
  override onUpdate(): void {}
}

class CycleA extends Component {
  static override componentName = 'CycleA'
  static override updateAfter = ['CycleB'] as const
  override onUpdate(): void {}
}

class CycleB extends Component {
  static override componentName = 'CycleB'
  static override updateAfter = ['CycleA'] as const
  override onUpdate(): void {}
}

class CycleDownstream extends Component {
  static override componentName = 'CycleDownstream'
  static override updateAfter = ['CycleA'] as const
  override onUpdate(): void {}
}

class SelfReader extends Component {
  static override componentName = 'SelfReader'
  static override updateAfter = ['SelfReader'] as const
  override onUpdate(): void {}
}

class UnknownTargetReader extends Component {
  static override componentName = 'UnknownTargetReader'
  static override updateAfter = ['Missing'] as const
  override onUpdate(): void {}
}

class RepeatedReader extends Component {
  static override componentName = 'RepeatedReader'
  static override updateAfter = ['Writer', 'Writer'] as const
  override onUpdate(): void {}
}

class BaseReader extends Component {
  static override componentName = 'BaseReader'
  static override updateAfter: readonly string[] = ['Writer']
  override onUpdate(): void {}
}

class InheritedReader extends BaseReader {
  static override componentName = 'InheritedReader'
}

class ReplacingReader extends BaseReader {
  static override componentName = 'ReplacingReader'
  static override updateAfter = ['Alpha'] as const
}

function permutations<T>(values: readonly T[]): T[][] {
  if (values.length <= 1) return [values.slice()]
  return values.flatMap((value, index) =>
    permutations([...values.slice(0, index), ...values.slice(index + 1)]).map((rest) => [
      value,
      ...rest,
    ]),
  )
}

describe('resolveComponentUpdateSchedule', () => {
  it('returns every updateable component once in executable order and omits passive siblings', () => {
    const result: ComponentUpdateScheduleResult = resolveComponentUpdateSchedule(
      ['Reader', 'Passive', 'Writer'],
      { Reader, Passive, Writer },
    )

    expect(result).toEqual({ ok: true, order: ['Writer', 'Reader'], issues: [] })
  })

  it('returns one canonical order for every source permutation and uses code-unit names as the ready-node tie-break', () => {
    const registry = { Alpha, Passive, Reader, Writer }
    for (const source of permutations(['Reader', 'Passive', 'Writer', 'Alpha'])) {
      expect(resolveComponentUpdateSchedule(source, registry)).toEqual({
        ok: true,
        order: ['Alpha', 'Writer', 'Reader'],
        issues: [],
      })
    }
  })

  it('treats a registered but absent target as a conditional no-op', () => {
    expect(resolveComponentUpdateSchedule(['Reader'], { Reader, Writer })).toEqual({
      ok: true,
      order: ['Reader'],
      issues: [],
    })
  })

  it('rejects an unknown target with an actionable typed issue and no executable order', () => {
    const result = resolveComponentUpdateSchedule(['UnknownTargetReader'], {
      UnknownTargetReader,
    })

    expect(result).toMatchObject({
      ok: false,
      issues: [
        {
          code: 'invalid-update-constraint',
          reason: 'unknown-target',
          declarer: 'UnknownTargetReader',
          target: 'Missing',
          componentNames: ['UnknownTargetReader', 'Missing'],
          cause: expect.stringMatching(/UnknownTargetReader.*Missing/),
        },
      ],
    })
    expect('order' in result).toBe(false)
  })

  it('rejects a passive constraint declarer and a present passive target', () => {
    expect(
      resolveComponentUpdateSchedule(['PassiveDeclarer', 'Writer'], {
        PassiveDeclarer,
        Writer,
      }),
    ).toMatchObject({
      ok: false,
      issues: [
        {
          code: 'invalid-update-constraint',
          reason: 'passive-declarer',
          componentNames: ['PassiveDeclarer'],
          cause: expect.stringContaining('PassiveDeclarer'),
        },
      ],
    })

    expect(
      resolveComponentUpdateSchedule(['ReaderAfterPassive', 'Passive'], {
        Passive,
        ReaderAfterPassive,
      }),
    ).toMatchObject({
      ok: false,
      issues: [
        {
          code: 'invalid-update-constraint',
          reason: 'passive-target',
          declarer: 'ReaderAfterPassive',
          target: 'Passive',
          componentNames: ['ReaderAfterPassive', 'Passive'],
          cause: expect.stringMatching(/ReaderAfterPassive.*Passive/),
        },
      ],
    })
  })

  it('identifies the members of a multi-node cycle without blaming downstream nodes', () => {
    const result = resolveComponentUpdateSchedule(
      ['CycleDownstream', 'CycleB', 'CycleA'],
      { CycleA, CycleB, CycleDownstream },
    )

    expect(result).toMatchObject({
      ok: false,
      issues: [
        {
          code: 'component-update-cycle',
          componentNames: ['CycleA', 'CycleB'],
          cause: expect.stringMatching(/CycleA.*CycleB/),
        },
      ],
    })
    expect('order' in result).toBe(false)
  })

  it('rejects a self-edge as an invalid constraint rather than a one-node cycle', () => {
    const result = resolveComponentUpdateSchedule(['SelfReader'], { SelfReader })

    expect(result).toMatchObject({
      ok: false,
      issues: [
        {
          code: 'invalid-update-constraint',
          reason: 'self-edge',
          declarer: 'SelfReader',
          target: 'SelfReader',
          componentNames: ['SelfReader'],
          cause: expect.stringContaining('SelfReader'),
        },
      ],
    })
  })

  it('rejects duplicate sibling component identities instead of collapsing instances', () => {
    const result = resolveComponentUpdateSchedule(['Writer', 'Writer'], { Writer })

    expect(result).toMatchObject({
      ok: false,
      issues: [
        {
          code: 'duplicate-component',
          componentName: 'Writer',
          componentNames: ['Writer'],
          count: 2,
          cause: expect.stringMatching(/Writer.*2/),
        },
      ],
    })
    expect('order' in result).toBe(false)
  })

  it('collapses repeated targets to one edge', () => {
    expect(
      resolveComponentUpdateSchedule(['RepeatedReader', 'Writer'], {
        RepeatedReader,
        Writer,
      }),
    ).toEqual({ ok: true, order: ['Writer', 'RepeatedReader'], issues: [] })
  })

  it('inherits static constraints normally and replaces them with an own declaration', () => {
    expect(
      resolveComponentUpdateSchedule(['InheritedReader', 'Writer'], {
        InheritedReader,
        Writer,
      }),
    ).toEqual({ ok: true, order: ['Writer', 'InheritedReader'], issues: [] })
    expect(
      resolveComponentUpdateSchedule(['ReplacingReader', 'Alpha', 'Writer'], {
        Alpha,
        ReplacingReader,
        Writer,
      }),
    ).toEqual({
      ok: true,
      order: ['Alpha', 'ReplacingReader', 'Writer'],
      issues: [],
    })
  })
})
