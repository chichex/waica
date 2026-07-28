import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { WriteScheduler, WRITE_DELAY_MS } from './write-scheduler'

describe('WriteScheduler', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('runs a scheduled write after the delay', () => {
    const scheduler = new WriteScheduler()
    const run = vi.fn()
    scheduler.schedule('a', run)
    expect(run).not.toHaveBeenCalled()
    vi.advanceTimersByTime(WRITE_DELAY_MS)
    expect(run).toHaveBeenCalledTimes(1)
  })

  it('keeps only the latest write per key and restarts the clock', () => {
    const scheduler = new WriteScheduler()
    const first = vi.fn()
    const second = vi.fn()
    scheduler.schedule('a', first)
    vi.advanceTimersByTime(WRITE_DELAY_MS - 1)
    scheduler.schedule('a', second)
    vi.advanceTimersByTime(WRITE_DELAY_MS - 1)
    expect(first).not.toHaveBeenCalled()
    expect(second).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(first).not.toHaveBeenCalled()
    expect(second).toHaveBeenCalledTimes(1)
  })

  it('debounces keys independently', () => {
    const scheduler = new WriteScheduler()
    const a = vi.fn()
    const b = vi.fn()
    scheduler.schedule('a', a)
    vi.advanceTimersByTime(WRITE_DELAY_MS / 2)
    scheduler.schedule('b', b)
    vi.advanceTimersByTime(WRITE_DELAY_MS / 2)
    expect(a).toHaveBeenCalledTimes(1)
    expect(b).not.toHaveBeenCalled()
    vi.advanceTimersByTime(WRITE_DELAY_MS / 2)
    expect(b).toHaveBeenCalledTimes(1)
  })

  it('cancel drops a pending write without running it', () => {
    const scheduler = new WriteScheduler()
    const run = vi.fn()
    scheduler.schedule('a', run)
    scheduler.cancel('a')
    vi.advanceTimersByTime(WRITE_DELAY_MS)
    expect(run).not.toHaveBeenCalled()
  })

  it('flushAll runs every pending write immediately, exactly once', () => {
    const scheduler = new WriteScheduler()
    const a = vi.fn()
    const b = vi.fn()
    scheduler.schedule('a', a)
    scheduler.schedule('b', b)
    scheduler.flushAll()
    expect(a).toHaveBeenCalledTimes(1)
    expect(b).toHaveBeenCalledTimes(1)
    vi.advanceTimersByTime(WRITE_DELAY_MS)
    expect(a).toHaveBeenCalledTimes(1)
    expect(b).toHaveBeenCalledTimes(1)
  })

  it('a write scheduled after a flush gets its own clock', () => {
    const scheduler = new WriteScheduler()
    const run = vi.fn()
    scheduler.schedule('a', run)
    scheduler.flushAll()
    scheduler.schedule('a', run)
    vi.advanceTimersByTime(WRITE_DELAY_MS)
    expect(run).toHaveBeenCalledTimes(2)
  })
})
