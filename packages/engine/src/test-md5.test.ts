import { describe, expect, it } from 'vitest'
import { md5 } from './test-md5.js'

describe('md5 (test support)', () => {
  it('matches the RFC 1321 vectors', () => {
    expect(md5('')).toBe('d41d8cd98f00b204e9800998ecf8427e')
    expect(md5('abc')).toBe('900150983cd24fb0d6963f7d28e17f72')
    expect(md5('message digest')).toBe('f96b697d7cb7938d525a2f31aaf161d0')
    expect(md5('12345678901234567890123456789012345678901234567890123456789012345678901234567890')).toBe('57edf4a22be3c955ac49da2e2107b67a')
  })
})
