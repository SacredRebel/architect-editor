import { describe, expect, it } from 'bun:test'
import { bytesToUuid, compressGuid, expandGuid, ifcGlobalId, sha1, uuidV5 } from './ifc-guid'

const hex = (bytes: Uint8Array) => [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('')

describe('stable IFC GlobalIds', () => {
  it('SHA-1 matches the FIPS 180 test vector', () => {
    expect(hex(sha1(new TextEncoder().encode('abc')))).toBe(
      'a9993e364706816aba3e25717850c26c9cd0d89d',
    )
    expect(hex(sha1(new Uint8Array(0)))).toBe('da39a3ee5e6b4b0d3255bfef95601890afd80709')
  })

  it("UUIDv5 matches Python's uuid5(NAMESPACE_DNS, 'python.org')", () => {
    const dns = '6ba7b810-9dad-11d1-80b4-00c04fd430c8'
    expect(bytesToUuid(uuidV5('python.org', dns))).toBe('886313e1-3b8a-5372-9b90-0c9aee199e5d')
  })

  it("compresses to IFC's 22 characters and back", () => {
    expect(compressGuid(new Uint8Array(16))).toBe('0000000000000000000000')
    expect(compressGuid(new Uint8Array(16).fill(255))).toBe(`3${'$'.repeat(21)}`)
    for (const name of ['wall_a', 'door_b#opening', 'level_c', '']) {
      const bytes = uuidV5(name)
      const id = compressGuid(bytes)
      expect(id).toHaveLength(22)
      expect('0123').toContain(id[0])
      expect(hex(expandGuid(id))).toBe(hex(bytes))
    }
  })

  it('is stable for a name and different across names', () => {
    expect(ifcGlobalId('wall_abc')).toBe(ifcGlobalId('wall_abc'))
    expect(ifcGlobalId('wall_abc')).not.toBe(ifcGlobalId('wall_abd'))
  })
})
