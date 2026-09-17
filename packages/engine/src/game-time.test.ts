import { describe, expect, it, vi } from 'vitest'
import { SIMULATION_STEP } from './fixed-step'
import { GameTime, advanceGameTime, type TimerOptions } from './game-time'

function step(time: GameTime, times = 1): void {
  for (let i = 0; i < times; i += 1) advanceGameTime(time)
}

describe('GameTime.now (CA-9)', () => {
  it('is 0 on a new GameTime and advances only through advanceGameTime', () => {
    const time = new GameTime()
    expect(time.now).toBe(0)

    step(time)
    expect(time.now).toBe(SIMULATION_STEP)
    step(time, 59)
    expect(time.now).toBeCloseTo(1, 12)
  })

  it('never advances on its own — zero calls means zero seconds', () => {
    const time = new GameTime()
    expect(time.now).toBe(0)
    expect(time.now).toBe(0)
  })
})

describe('GameTime.after (CA-1)', () => {
  it.each([
    [0.1, 6],
    [0.3, 18],
    [0.5, 30],
    [1, 60],
    [0.25, 15],
  ])('fires exactly once at the start of step %s -> %s steps later, never synchronously', (seconds, dueStep) => {
    const time = new GameTime()
    const callback = vi.fn()
    time.after(seconds, callback)

    expect(callback).not.toHaveBeenCalled() // never synchronous
    step(time, dueStep - 1)
    expect(callback).not.toHaveBeenCalled()
    step(time)
    expect(callback).toHaveBeenCalledOnce()
    step(time, 10)
    expect(callback).toHaveBeenCalledOnce() // fires once only
  })

  it.each([0, -1])('after(%s) fires at the start of the very next step', (seconds) => {
    const time = new GameTime()
    const callback = vi.fn()
    time.after(seconds, callback)

    step(time)
    expect(callback).toHaveBeenCalledOnce()
  })

  it('never fires on a step where no advanceGameTime call happens', () => {
    const time = new GameTime()
    const callback = vi.fn()
    time.after(0.1, callback)
    // Reading .now / .pending without stepping must not advance anything.
    void time.now
    void time.pending
    expect(callback).not.toHaveBeenCalled()
  })
})

describe('GameTime.every (CA-2)', () => {
  it('runs one interval after creation, not on creation', () => {
    const time = new GameTime()
    const callback = vi.fn()
    time.every(0.25, callback)
    step(time, 14)
    expect(callback).not.toHaveBeenCalled()
    step(time)
    expect(callback).toHaveBeenCalledOnce()
  })

  it('fires on steps 15, 30, 45 for every(0.25) created at Game Time 0', () => {
    const time = new GameTime()
    const fireSteps: number[] = []
    let stepCount = 0
    time.every(0.25, () => fireSteps.push(stepCount))
    for (let i = 0; i < 45; i += 1) {
      stepCount += 1
      step(time)
    }
    expect(fireSteps).toEqual([15, 30, 45])
  })

  it('fires on steps 6, 12, 18 for every(0.1)', () => {
    const time = new GameTime()
    const fireSteps: number[] = []
    let stepCount = 0
    time.every(0.1, () => fireSteps.push(stepCount))
    for (let i = 0; i < 18; i += 1) {
      stepCount += 1
      step(time)
    }
    expect(fireSteps).toEqual([6, 12, 18])
  })

  it('fires on steps 2, 3, 4, 5, 6, 8 and exactly 50 times within the first 60 steps for every(0.02)', () => {
    const time = new GameTime()
    const fireSteps: number[] = []
    let stepCount = 0
    time.every(0.02, () => fireSteps.push(stepCount))
    for (let i = 0; i < 60; i += 1) {
      stepCount += 1
      step(time)
    }
    expect(fireSteps.slice(0, 6)).toEqual([2, 3, 4, 5, 6, 8])
    expect(fireSteps).toHaveLength(50)
    // Never more than once in a single step.
    expect(new Set(fireSteps).size).toBe(fireSteps.length)
  })

  it('fires once per step for every(0.001) — the sub-step interval is raised to one step', () => {
    const time = new GameTime()
    const callback = vi.fn()
    time.every(0.001, callback)
    step(time, 5)
    expect(callback).toHaveBeenCalledTimes(5)
  })

  it('stays active until cancelled', () => {
    const time = new GameTime()
    const callback = vi.fn()
    const handle = time.every(0.1, callback)
    step(time, 6)
    expect(handle.active).toBe(true)
    handle.cancel()
    expect(handle.active).toBe(false)
    step(time, 12)
    expect(callback).toHaveBeenCalledOnce()
  })
})

describe('GameTime start-of-step pass order (CA-3)', () => {
  it('runs the due timer and advances the tween within the same step', () => {
    const time = new GameTime()
    const timerRan = vi.fn()
    const tweenUpdates: number[] = []
    time.after(0, timerRan)
    time.tween({ from: 0, to: 1, seconds: 10, onUpdate: (v) => tweenUpdates.push(v) })
    expect(tweenUpdates).toEqual([0]) // synchronous onUpdate(from) at creation
    step(time)
    expect(timerRan).toHaveBeenCalledOnce()
    expect(tweenUpdates).toHaveLength(2) // creation + this step's advance
  })

  it('runs due timers in due-time order, ties broken by creation order', () => {
    const time = new GameTime()
    const order: string[] = []
    time.after(0.2, () => order.push('b-second'))
    time.after(0.1, () => order.push('a-first'))
    time.after(0.1, () => order.push('a-tie-second'))
    step(time, 12)
    expect(order).toEqual(['a-first', 'a-tie-second', 'b-second'])
  })

  it('never runs or advances work created during the pass in that same pass', () => {
    const time = new GameTime()
    const order: string[] = []
    time.after(0, () => {
      order.push('outer')
      time.after(0, () => order.push('inner'))
    })
    step(time)
    expect(order).toEqual(['outer'])
    step(time)
    expect(order).toEqual(['outer', 'inner'])
  })

  it('never advances or completes a tween that a due timer created during the pass', () => {
    const time = new GameTime()
    const values: number[] = []
    const completed = vi.fn()
    time.after(0, () => {
      time.tween({ from: 0, to: 1, seconds: 0, onUpdate: (v) => values.push(v), onComplete: completed })
    })

    step(time)
    expect(values).toEqual([0]) // only the synchronous onUpdate(from)
    expect(completed).not.toHaveBeenCalled()

    step(time)
    expect(values).toEqual([0, 1])
    expect(completed).toHaveBeenCalledOnce()
  })

  it("lets a component's onUpdate on this same step observe what a due callback changed", () => {
    const time = new GameTime()
    let seenByComponent: number | null = null
    time.after(0.1, () => {
      seenByComponent = 42
    })
    step(time, 5)
    expect(seenByComponent).toBeNull()
    step(time) // 6th step: timer fires as part of the pass, before "component" code below runs
    // Simulates a component's onUpdate reading state after the pass.
    expect(seenByComponent).toBe(42)
  })
})

describe('GameTime.nextInSteps (CA-9 float trap)', () => {
  it('avoids the float trap: after(0.1) needs 6 more steps, never 7', () => {
    const time = new GameTime()
    time.after(0.1, () => {})
    expect(time.nextInSteps).toBe(6)
  })
})

describe('GameTime handle (CA-6)', () => {
  it('after(0.5) reports elapsed 0.2 and remaining 0.3 after 12 steps', () => {
    const time = new GameTime()
    const handle = time.after(0.5, () => {})
    step(time, 12)
    expect(handle.elapsed).toBeCloseTo(0.2, 9)
    expect(handle.remaining).toBeCloseTo(0.3, 9)
  })

  it('once inactive, remaining is 0 and elapsed stays frozen', () => {
    const time = new GameTime()
    const handle = time.after(0.1, () => {})
    step(time, 6)
    expect(handle.active).toBe(false)
    const frozenElapsed = handle.elapsed
    expect(handle.remaining).toBe(0)
    step(time, 10)
    expect(handle.elapsed).toBe(frozenElapsed)
    expect(handle.remaining).toBe(0)
  })

  it('cancel() is idempotent and silent, even on an already-inactive handle', () => {
    const time = new GameTime()
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const handle = time.after(0.1, () => {})
    handle.cancel()
    handle.cancel()
    expect(handle.active).toBe(false)
    expect(warn).not.toHaveBeenCalled()
    warn.mockRestore()
  })

  it("cancel() before the due step prevents the callback and freezes elapsed at cancel time", () => {
    const time = new GameTime()
    const callback = vi.fn()
    const handle = time.after(0.5, callback)
    step(time, 6)
    handle.cancel()
    step(time, 30)
    expect(callback).not.toHaveBeenCalled()
    expect(handle.elapsed).toBeCloseTo(0.1, 9)
  })

  it("every's elapsed counts from its last run, not from creation, once it has fired", () => {
    const time = new GameTime()
    const handle = time.every(0.1, () => {})
    step(time, 6) // first fire
    expect(handle.elapsed).toBeCloseTo(0, 9)
    step(time, 3)
    expect(handle.elapsed).toBeCloseTo(0.05, 9)
  })
})

describe('GameTime.tween (CA-7)', () => {
  it('calls onUpdate(from) synchronously before returning, then on later steps interpolates, and completes with exactly `to` plus onComplete', () => {
    const time = new GameTime()
    const values: number[] = []
    const onComplete = vi.fn()
    time.tween({ from: 0, to: 1, seconds: 0.5, onUpdate: (v) => values.push(v), onComplete })

    expect(values).toEqual([0]) // synchronous onUpdate(from)
    expect(onComplete).not.toHaveBeenCalled()

    step(time, 29)
    expect(values).toHaveLength(30)
    expect(onComplete).not.toHaveBeenCalled()

    step(time) // step k+30: completes
    expect(values).toHaveLength(31)
    expect(values.at(-1)).toBe(1)
    expect(onComplete).toHaveBeenCalledOnce()

    step(time, 5)
    expect(values).toHaveLength(31) // no further onUpdate calls once complete
    expect(onComplete).toHaveBeenCalledOnce()
  })

  it('is linear by default: the midpoint value is exactly halfway', () => {
    const time = new GameTime()
    const values: number[] = []
    time.tween({ from: 10, to: 20, seconds: 10 / 60, onUpdate: (v) => values.push(v) })
    step(time, 5) // halfway through a 10-step tween
    expect(values.at(-1)).toBeCloseTo(15, 9)
  })

  it('quadIn at 0.5 progress is 0.25', () => {
    const time = new GameTime()
    const values: number[] = []
    time.tween({ from: 0, to: 1, seconds: 20 / 60, easing: 'quadIn', onUpdate: (v) => values.push(v) })
    step(time, 10) // exactly halfway through a 20-step tween
    expect(values.at(-1)).toBeCloseTo(0.25, 9)
  })

  it('accepts a custom easing function', () => {
    const time = new GameTime()
    const values: number[] = []
    time.tween({
      from: 0,
      to: 10,
      seconds: 10 / 60,
      easing: (t) => t * t * t,
      onUpdate: (v) => values.push(v),
    })
    step(time, 5)
    expect(values.at(-1)).toBeCloseTo(10 * 0.5 ** 3, 9)
  })

  it('with seconds <= 0 applies `from` on creation and `to` + onComplete at the start of the next step', () => {
    const time = new GameTime()
    const values: number[] = []
    const onComplete = vi.fn()
    time.tween({ from: 0, to: 5, seconds: 0, onUpdate: (v) => values.push(v), onComplete })
    expect(values).toEqual([0])
    step(time)
    expect(values).toEqual([0, 5])
    expect(onComplete).toHaveBeenCalledOnce()
  })

  it('a negative seconds behaves the same as 0', () => {
    const time = new GameTime()
    const values: number[] = []
    time.tween({ from: 0, to: 5, seconds: -1, onUpdate: (v) => values.push(v) })
    step(time)
    expect(values).toEqual([0, 5])
  })

  it('cancel() leaves the last applied value in place and never calls onComplete', () => {
    const time = new GameTime()
    const values: number[] = []
    const onComplete = vi.fn()
    const handle = time.tween({ from: 0, to: 1, seconds: 0.5, onUpdate: (v) => values.push(v), onComplete })
    step(time, 10)
    const lastValue = values.at(-1)
    handle.cancel()
    step(time, 30)
    expect(values.at(-1)).toBe(lastValue)
    expect(onComplete).not.toHaveBeenCalled()
  })

  it('if onUpdate(from) throws, tween() throws and registers nothing', () => {
    const time = new GameTime()
    expect(() =>
      time.tween({
        from: 0,
        to: 1,
        seconds: 1,
        onUpdate: () => {
          throw new Error('boom')
        },
      }),
    ).toThrow('boom')
    expect(time.pending).toBe(0)
  })
})

describe('GameTime invalid input (CA-8)', () => {
  function expectInvalid(fn: () => void): void {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    fn()
    expect(warn).toHaveBeenCalledOnce()
    expect(warn.mock.calls[0]?.[0]).toMatch(/^\[waica\]/)
    warn.mockRestore()
  }

  it('after(): non-finite seconds never throws, warns once, returns an inactive handle that never fires', () => {
    const time = new GameTime()
    const callback = vi.fn()
    let handle: ReturnType<GameTime['after']> | undefined
    expectInvalid(() => {
      handle = time.after(NaN, callback)
    })
    expect(handle!.active).toBe(false)
    step(time, 100)
    expect(callback).not.toHaveBeenCalled()
  })

  it.each([Infinity, -Infinity])('after(): rejects %s seconds', (seconds) => {
    const time = new GameTime()
    expectInvalid(() => {
      const handle = time.after(seconds, () => {})
      expect(handle.active).toBe(false)
    })
  })

  it('after(): a finite negative seconds is valid, treated as 0, and logs nothing', () => {
    const time = new GameTime()
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const callback = vi.fn()
    const handle = time.after(-5, callback)
    expect(warn).not.toHaveBeenCalled()
    expect(handle.active).toBe(true)
    step(time)
    expect(callback).toHaveBeenCalledOnce()
    warn.mockRestore()
  })

  it('after(): non-function callback', () => {
    const time = new GameTime()
    expectInvalid(() => {
      // @ts-expect-error deliberate invalid input
      time.after(1, 'not a function')
    })
  })

  it('every(): non-finite seconds', () => {
    const time = new GameTime()
    expectInvalid(() => {
      time.every(Infinity, () => {})
    })
  })

  it('tween(): non-finite from/to', () => {
    const time = new GameTime()
    expectInvalid(() => {
      time.tween({ from: NaN, to: 1, seconds: 1, onUpdate: () => {} })
    })
  })

  it('tween(): non-function onUpdate skips even the synchronous call, silently in this warn-count sense', () => {
    const time = new GameTime()
    expectInvalid(() => {
      // @ts-expect-error deliberate invalid input
      time.tween({ from: 0, to: 1, seconds: 1, onUpdate: 'nope' })
    })
  })

  it('tween(): onComplete present but not a function', () => {
    const time = new GameTime()
    expectInvalid(() => {
      // @ts-expect-error deliberate invalid input
      time.tween({ from: 0, to: 1, seconds: 1, onUpdate: () => {}, onComplete: 'nope' })
    })
  })

  it('tween(): unknown easing name', () => {
    const time = new GameTime()
    expectInvalid(() => {
      // @ts-expect-error deliberate invalid input
      time.tween({ from: 0, to: 1, seconds: 1, easing: 'bounceOut', onUpdate: () => {} })
    })
  })

  it('rejects an owner that is not an object with a boolean alive', () => {
    const time = new GameTime()
    expectInvalid(() => {
      // @ts-expect-error deliberate invalid input
      time.after(1, () => {}, { owner: { alive: 'yes' } })
    })
  })

  it('a dead owner (alive: false) yields an inactive handle silently — no warning', () => {
    const time = new GameTime()
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const callback = vi.fn()
    const owner = { alive: false }
    const handle = time.after(0.1, callback, { owner })
    expect(handle.active).toBe(false)
    expect(warn).not.toHaveBeenCalled()
    step(time, 10)
    expect(callback).not.toHaveBeenCalled()
    warn.mockRestore()
  })

  it('a dead owner makes a tween skip onUpdate(from) too, silently', () => {
    const time = new GameTime()
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const onUpdate = vi.fn()
    const handle = time.tween({ from: 0, to: 1, seconds: 1, onUpdate, owner: { alive: false } })
    expect(handle.active).toBe(false)
    expect(onUpdate).not.toHaveBeenCalled()
    expect(warn).not.toHaveBeenCalled()
    warn.mockRestore()
  })
})

describe('GameTime scope (CA-4)', () => {
  it('cancelSceneScoped() cancels scene-scoped work (default and any non-session scope) without running callbacks', () => {
    const time = new GameTime()
    const sceneDefault = vi.fn()
    const sceneExplicit = vi.fn()
    const sceneOther = vi.fn()
    const session = vi.fn()
    time.after(0.1, sceneDefault)
    time.after(0.1, sceneExplicit, { scope: 'scene' })
    // A bogus value from untyped JS still normalizes to scene, not a compile error at the call site here.
    time.after(0.1, sceneOther, { scope: 'whatever' as TimerOptions['scope'] })
    const sessionHandle = time.after(0.1, session, { scope: 'session' })

    time.cancelSceneScoped()
    step(time, 10)

    expect(sceneDefault).not.toHaveBeenCalled()
    expect(sceneExplicit).not.toHaveBeenCalled()
    expect(sceneOther).not.toHaveBeenCalled()
    expect(session).toHaveBeenCalledOnce()
    expect(sessionHandle.active).toBe(false) // fired -> inactive
  })

  it('cancelSceneScoped() cancels scene-scoped tweens without running onUpdate again or onComplete', () => {
    const time = new GameTime()
    const values: number[] = []
    const onComplete = vi.fn()
    time.tween({ from: 0, to: 1, seconds: 1, onUpdate: (v) => values.push(v), onComplete })
    step(time, 5)
    const before = values.length

    time.cancelSceneScoped()
    step(time, 60)

    expect(values).toHaveLength(before)
    expect(onComplete).not.toHaveBeenCalled()
  })
})

describe('GameTime owner cancellation (CA-5)', () => {
  it('cancelOwnedBy(owner) cancels only that owner\'s timers and tweens, whatever their scope', () => {
    const time = new GameTime()
    const owner = { alive: true }
    const other = { alive: true }
    const ownerCb = vi.fn()
    const otherCb = vi.fn()
    time.after(0.1, ownerCb, { owner, scope: 'session' })
    time.after(0.1, otherCb, { owner: other })
    const ownerUpdate = vi.fn()
    const ownerComplete = vi.fn()
    const otherUpdate = vi.fn()
    const otherComplete = vi.fn()
    time.tween({ from: 0, to: 1, seconds: 1, onUpdate: ownerUpdate, onComplete: ownerComplete, owner })
    time.tween({ from: 0, to: 1, seconds: 1, onUpdate: otherUpdate, onComplete: otherComplete, owner: other })
    ownerUpdate.mockClear() // drop the synchronous onUpdate(from) call tween() makes at creation
    otherUpdate.mockClear()

    time.cancelOwnedBy(owner)
    step(time, 60) // long enough for the after(0.1)s and the 1s tweens to run their course

    expect(ownerCb).not.toHaveBeenCalled()
    expect(otherCb).toHaveBeenCalledOnce()
    expect(ownerUpdate).not.toHaveBeenCalled() // cancelled tween: no further onUpdate
    expect(ownerComplete).not.toHaveBeenCalled() // and no onComplete
    expect(otherUpdate).toHaveBeenCalled() // another owner's tween keeps advancing
    expect(otherComplete).toHaveBeenCalledOnce()
  })
})

describe('GameTime.cancelAll (CA-4)', () => {
  it('cancels both scopes, running no callback', () => {
    const time = new GameTime()
    const scene = vi.fn()
    const session = vi.fn()
    time.after(0.1, scene)
    time.after(0.1, session, { scope: 'session' })

    time.cancelAll()
    step(time, 10)

    expect(scene).not.toHaveBeenCalled()
    expect(session).not.toHaveBeenCalled()
  })
})

describe('GameTime Runtime Snapshot fields (CA-10)', () => {
  it('reports pending 0 and nextInSteps null with nothing scheduled', () => {
    const time = new GameTime()
    expect(time.pending).toBe(0)
    expect(time.nextInSteps).toBeNull()
  })

  it('after(0.1): pending 1, nextInSteps 6, then decreasing, then null with the callback run once', () => {
    const time = new GameTime()
    const callback = vi.fn()
    time.after(0.1, callback)
    expect(time.pending).toBe(1)
    expect(time.nextInSteps).toBe(6)

    step(time, 5)
    expect(time.pending).toBe(1)
    expect(time.nextInSteps).toBe(1)

    step(time)
    expect(time.pending).toBe(0)
    expect(time.nextInSteps).toBeNull()
    expect(callback).toHaveBeenCalledOnce()
  })

  it('every(0.25): nextInSteps 15, and pending stays 1 after it runs', () => {
    const time = new GameTime()
    time.every(0.25, () => {})
    expect(time.nextInSteps).toBe(15)
    step(time, 15)
    expect(time.pending).toBe(1)
    expect(time.nextInSteps).toBe(15)
  })

  it('a 0.5s tween: nextInSteps 30', () => {
    const time = new GameTime()
    time.tween({ from: 0, to: 1, seconds: 0.5, onUpdate: () => {} })
    expect(time.nextInSteps).toBe(30)
  })

  it('reports the smallest nextInSteps across multiple pending entries', () => {
    const time = new GameTime()
    time.after(1, () => {})
    time.after(0.1, () => {})
    time.tween({ from: 0, to: 1, seconds: 0.5, onUpdate: () => {} })
    expect(time.nextInSteps).toBe(6)
    expect(time.pending).toBe(3)
  })
})

/** Peeks at the private backing arrays: no public API exposes raw entry counts or array identity. */
function timerCount(time: GameTime): number {
  return (time as unknown as { timers: unknown[] }).timers.length
}
function tweenCount(time: GameTime): number {
  return (time as unknown as { tweens: unknown[] }).tweens.length
}
function timersArray(time: GameTime): unknown {
  return (time as unknown as { timers: unknown }).timers
}

describe('GameTime reclaims cancelled entries outside a step (review finding 2)', () => {
  it('cancelSceneScoped() prunes the backing arrays immediately, with no step ever running', () => {
    const time = new GameTime()
    time.after(0.1, () => {})
    time.tween({ from: 0, to: 1, seconds: 0.1, onUpdate: () => {} })
    expect(timerCount(time)).toBe(1)
    expect(tweenCount(time)).toBe(1)

    time.cancelSceneScoped() // no advanceGameTime() call anywhere in this test

    expect(timerCount(time)).toBe(0)
    expect(tweenCount(time)).toBe(0)
  })

  it('cancelOwnedBy() prunes only the cancelled entries immediately, with no step ever running', () => {
    const time = new GameTime()
    const owner = { alive: true }
    const other = { alive: true }
    time.after(0.1, () => {}, { owner })
    time.after(0.1, () => {}, { owner: other })
    expect(timerCount(time)).toBe(2)

    time.cancelOwnedBy(owner)

    expect(timerCount(time)).toBe(1)
  })

  it('cancelAll() prunes both backing arrays immediately, with no step ever running', () => {
    const time = new GameTime()
    time.after(0.1, () => {})
    time.tween({ from: 0, to: 1, seconds: 0.1, onUpdate: () => {} })

    time.cancelAll()

    expect(timerCount(time)).toBe(0)
    expect(tweenCount(time)).toBe(0)
  })

  it('pending/nextInSteps already ignored cancelled-but-unpruned entries, and still do after reclaiming', () => {
    const time = new GameTime()
    time.after(0.1, () => {})
    time.cancelSceneScoped()
    expect(time.pending).toBe(0)
    expect(time.nextInSteps).toBeNull()
  })

  it('a cancellation from inside a due callback does not corrupt the pass currently running', () => {
    const time = new GameTime()
    const owner = { alive: true }
    const order: string[] = []
    // Both due on the same step; "a" was created first, so it runs first and
    // cancels "b"'s owner mid-pass — "b" must be skipped, not run twice or throw.
    time.after(0.1, () => {
      order.push('a')
      time.cancelOwnedBy(owner)
    })
    time.after(0.1, () => order.push('b'), { owner })

    step(time, 6)

    expect(order).toEqual(['a'])
  })
})

describe('GameTime does no per-step allocation when nothing is scheduled or due (review finding 3)', () => {
  it('now still advances and nothing fires with nothing scheduled at all', () => {
    const time = new GameTime()
    step(time, 5)
    expect(time.now).toBeCloseTo(5 * SIMULATION_STEP, 12)
    expect(time.pending).toBe(0)
    expect(time.nextInSteps).toBeNull()
  })

  it('does not reassign the timers array on a step where nothing is due', () => {
    const time = new GameTime()
    time.after(10, () => {}) // due far in the future: not due this step
    const before = timersArray(time)

    step(time)

    expect(timersArray(time)).toBe(before) // same reference: no filter() ran
  })

  it('does reassign the timers array on the step a timer actually fires', () => {
    const time = new GameTime()
    time.after(SIMULATION_STEP, () => {})
    const before = timersArray(time)

    step(time)

    expect(timersArray(time)).not.toBe(before)
    expect(timerCount(time)).toBe(0)
  })
})
