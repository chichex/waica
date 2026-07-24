import { describe, expect, it } from 'vitest'
import { MemFS } from './project-fs'
import { loadUiLib } from './ui-fs'

describe('loadUiLib', () => {
  it('marks only file-backed pieces as project names, defaults still resolve', async () => {
    const fs = new MemFS('t', { 'src/ui/health.html': '<div class="health"></div>' })
    const { pieces, projectNames } = await loadUiLib(fs)
    expect([...projectNames]).toEqual(['health'])
    expect(pieces['coin-counter']).toBeDefined()
  })

  it('yields no project names for a blank project', async () => {
    const { projectNames } = await loadUiLib(new MemFS('t', {}))
    expect(projectNames.size).toBe(0)
  })
})
