import { describe, expect, it } from 'vitest'
import { readFile } from 'node:fs/promises'
import path from 'node:path'

describe('stdio process failure handling', () => {
  it('leaves unexpected MCP rejections and exceptions to Node default handling', async () => {
    const source = await readFile(path.join(import.meta.dirname, 'stdio.ts'), 'utf8')

    expect(source).not.toMatch(/process\.on\(['"]unhandledRejection/)
    expect(source).not.toMatch(/process\.on\(['"]uncaughtException/)
    expect(source).not.toContain('reportProjectCodeFailure')
  })
})
