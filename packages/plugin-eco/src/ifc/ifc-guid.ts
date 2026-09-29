/**
 * Stable IFC GlobalIds. Every IfcRoot entity the exporter writes gets a
 * name-based UUID (version 5: SHA-1 of a fixed namespace and a name built from
 * Pascal node ids), compressed to IFC's 22-character form. Exporting the same
 * scene twice gives the same ids, and anyone can recompute an element's id
 * from its node id with any UUIDv5 implementation (e.g. Python's uuid5 plus
 * ifcopenshell.guid.compress).
 */

/** The namespace for Playground IFC ids (fixed; changing it changes every id). */
export const PLAYGROUND_IFC_NAMESPACE = '3d8f5b52-6a3e-4c1b-9f0e-2b7c8a41d6e9'

const IFC_CHARS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz_$'

function uuidToBytes(uuid: string): Uint8Array {
  const hex = uuid.replace(/[{}-]/g, '')
  if (!/^[0-9a-fA-F]{32}$/.test(hex)) throw new Error(`not a UUID: ${uuid}`)
  const bytes = new Uint8Array(16)
  for (let i = 0; i < 16; i++) bytes[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16)
  return bytes
}

export function bytesToUuid(bytes: Uint8Array): string {
  const hex = [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

/** SHA-1 (FIPS 180-4), synchronous so the exporter needs no secure context. */
export function sha1(data: Uint8Array): Uint8Array {
  const bitLength = data.length * 8
  const padded = new Uint8Array((((data.length + 8) >> 6) + 1) * 64)
  padded.set(data)
  padded[data.length] = 0x80
  const view = new DataView(padded.buffer)
  view.setUint32(padded.length - 8, Math.floor(bitLength / 2 ** 32))
  view.setUint32(padded.length - 4, bitLength >>> 0)
  let h0 = 0x67452301
  let h1 = 0xefcdab89
  let h2 = 0x98badcfe
  let h3 = 0x10325476
  let h4 = 0xc3d2e1f0
  const w = new Uint32Array(80)
  for (let offset = 0; offset < padded.length; offset += 64) {
    for (let i = 0; i < 16; i++) w[i] = view.getUint32(offset + i * 4)
    for (let i = 16; i < 80; i++) {
      const x = (w[i - 3] as number) ^ (w[i - 8] as number) ^ (w[i - 14] as number) ^ (w[i - 16] as number)
      w[i] = (x << 1) | (x >>> 31)
    }
    let a = h0
    let b = h1
    let c = h2
    let d = h3
    let e = h4
    for (let i = 0; i < 80; i++) {
      let f: number
      let k: number
      if (i < 20) {
        f = (b & c) | (~b & d)
        k = 0x5a827999
      } else if (i < 40) {
        f = b ^ c ^ d
        k = 0x6ed9eba1
      } else if (i < 60) {
        f = (b & c) | (b & d) | (c & d)
        k = 0x8f1bbcdc
      } else {
        f = b ^ c ^ d
        k = 0xca62c1d6
      }
      const temp = (((a << 5) | (a >>> 27)) + f + e + k + (w[i] as number)) >>> 0
      e = d
      d = c
      c = (b << 30) | (b >>> 2)
      b = a
      a = temp
    }
    h0 = (h0 + a) >>> 0
    h1 = (h1 + b) >>> 0
    h2 = (h2 + c) >>> 0
    h3 = (h3 + d) >>> 0
    h4 = (h4 + e) >>> 0
  }
  const out = new Uint8Array(20)
  const outView = new DataView(out.buffer)
  ;[h0, h1, h2, h3, h4].forEach((h, i) => outView.setUint32(i * 4, h))
  return out
}

/** RFC 4122 name-based UUID, version 5. */
export function uuidV5(name: string, namespace: string = PLAYGROUND_IFC_NAMESPACE): Uint8Array {
  const ns = uuidToBytes(namespace)
  const nameBytes = new TextEncoder().encode(name)
  const input = new Uint8Array(ns.length + nameBytes.length)
  input.set(ns)
  input.set(nameBytes, ns.length)
  const bytes = sha1(input).slice(0, 16)
  bytes[6] = ((bytes[6] as number) & 0x0f) | 0x50
  bytes[8] = ((bytes[8] as number) & 0x3f) | 0x80
  return bytes
}

/** IFC's 22-character compression of a 128-bit GUID (first character 0–3). */
export function compressGuid(bytes: Uint8Array): string {
  if (bytes.length !== 16) throw new Error('a GUID is 16 bytes')
  const chars = (value: number, count: number) => {
    let out = ''
    for (let i = count - 1; i >= 0; i--) out += IFC_CHARS[Math.floor(value / 64 ** i) % 64]
    return out
  }
  let out = chars(bytes[0] as number, 2)
  for (let i = 1; i < 16; i += 3) {
    out += chars(((bytes[i] as number) << 16) + ((bytes[i + 1] as number) << 8) + (bytes[i + 2] as number), 4)
  }
  return out
}

/** The inverse of compressGuid. */
export function expandGuid(compressed: string): Uint8Array {
  if (compressed.length !== 22) throw new Error(`an IFC GlobalId has 22 characters: ${compressed}`)
  const value = (text: string) => {
    let v = 0
    for (const ch of text) {
      const digit = IFC_CHARS.indexOf(ch)
      if (digit < 0) throw new Error(`not an IFC GlobalId character: ${ch}`)
      v = v * 64 + digit
    }
    return v
  }
  const bytes = new Uint8Array(16)
  const first = value(compressed.slice(0, 2))
  if (first > 255) throw new Error(`an IFC GlobalId starts with 0–3: ${compressed}`)
  bytes[0] = first
  for (let i = 0; i < 5; i++) {
    const v = value(compressed.slice(2 + i * 4, 6 + i * 4))
    bytes[1 + i * 3] = (v >> 16) & 0xff
    bytes[2 + i * 3] = (v >> 8) & 0xff
    bytes[3 + i * 3] = v & 0xff
  }
  return bytes
}

/** The GlobalId for a name built from node ids, e.g. `wall_x`, `wall_x#axis-opening:door_y`. */
export function ifcGlobalId(name: string): string {
  return compressGuid(uuidV5(name))
}
