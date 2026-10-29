// Reads a zip made by src/lib/zip.ts back, for the tests: from its central directory, checking
// every local header, size and CRC against it. Stored (uncompressed) entries only.
import { crc32 } from '../../src/lib/zip'

export interface ZipRead {
  path: string
  bytes: Uint8Array
  folder: boolean
  utf8: boolean
}

export function readZip(zip: Uint8Array): ZipRead[] {
  const view = new DataView(zip.buffer, zip.byteOffset, zip.byteLength)
  const end = zip.length - 22
  if (view.getUint32(end, true) !== 0x06054b50) throw new Error('no end of central directory')
  const count = view.getUint16(end + 10, true)
  let at = view.getUint32(end + 16, true)
  const out: ZipRead[] = []
  const decoder = new TextDecoder('utf-8', { fatal: true })
  for (let i = 0; i < count; i++) {
    if (view.getUint32(at, true) !== 0x02014b50) throw new Error('bad central record')
    const flags = view.getUint16(at + 8, true)
    if (view.getUint16(at + 10, true) !== 0) throw new Error('compressed entry')
    const crc = view.getUint32(at + 16, true)
    const size = view.getUint32(at + 24, true)
    const nameLength = view.getUint16(at + 28, true)
    const extra = view.getUint16(at + 30, true)
    const comment = view.getUint16(at + 32, true)
    const external = view.getUint32(at + 38, true)
    const offset = view.getUint32(at + 42, true)
    const path = decoder.decode(zip.subarray(at + 46, at + 46 + nameLength))
    if (view.getUint32(offset, true) !== 0x04034b50) throw new Error('bad local header')
    if (view.getUint32(offset + 14, true) !== crc || view.getUint32(offset + 22, true) !== size) throw new Error('local header differs')
    const start = offset + 30 + view.getUint16(offset + 26, true) + view.getUint16(offset + 28, true)
    const bytes = zip.slice(start, start + size)
    if (crc32(bytes) !== crc) throw new Error(`CRC of ${path} is wrong`)
    out.push({ path, bytes, folder: (external & 0x10) !== 0 && path.endsWith('/'), utf8: (flags & 0x0800) !== 0 })
    at += 46 + nameLength + extra + comment
  }
  return out
}
