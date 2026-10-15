/** Byte helpers for doctor scans. ZIP CRC-32 is not exported by fflate (TECH-005). */

const CRC_TABLE = new Uint32Array(256)
for (let n = 0; n < 256; n++) {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  CRC_TABLE[n] = c >>> 0
}

/** IEEE CRC-32, the checksum ZIP stores for uncompressed bytes. */
export function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff
  for (let i = 0; i < bytes.length; i++) {
    const byte = bytes[i] ?? 0
    const row = CRC_TABLE[(c ^ byte) & 0xff] ?? 0
    c = row ^ (c >>> 8)
  }
  return (c ^ 0xffffffff) >>> 0
}

export function decodeUtf8(bytes: Uint8Array): string | undefined {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  } catch {
    return undefined
  }
}

export function encodeUtf8(text: string): Uint8Array {
  return new TextEncoder().encode(text)
}

/** XML 1.0 disallows these code points. Tab, LF and CR stay. */
export function isIllegalXmlChar(code: number): boolean {
  if (code === 0x09 || code === 0x0a || code === 0x0d) return false
  if (code <= 0x1f) return true
  return code === 0xfffe || code === 0xffff
}

export function countIllegalXmlChars(text: string): number {
  let count = 0
  for (let i = 0; i < text.length; i++) {
    if (isIllegalXmlChar(text.charCodeAt(i))) count++
  }
  return count
}

export function stripIllegalXmlChars(text: string): string {
  if (countIllegalXmlChars(text) === 0) return text
  let out = ''
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i)
    if (!isIllegalXmlChar(code)) out += text[i] ?? ''
  }
  return out
}

export async function sha1Hex(bytes: Uint8Array): Promise<string> {
  const copy = new Uint8Array(bytes.byteLength)
  copy.set(bytes)
  const digest = await crypto.subtle.digest('SHA-1', copy)
  const view = new Uint8Array(digest)
  let hex = ''
  for (const byte of view) hex += byte.toString(16).padStart(2, '0')
  return hex
}

export function sameBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.byteLength !== b.byteLength) return false
  for (let i = 0; i < a.byteLength; i++) if (a[i] !== b[i]) return false
  return true
}
