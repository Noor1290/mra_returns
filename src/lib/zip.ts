// A zip file made in memory: the files are stored as they are (no compression), so every return
// file inside is byte for byte the file a single download gives. Names are UTF-8 (flag bit 11),
// folders get their own entries ("CSG/"). Nothing here is stored anywhere.

export interface ZipEntry {
  /** "MRA CSG (PACO)/CSG AUGUST 2026 ABC CO LTD.csv": folders separated by "/". */
  path: string
  bytes: Uint8Array
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[n] = c >>> 0
  }
  return table
})()

export function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff
  for (const byte of bytes) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8)
  return (crc ^ 0xffffffff) >>> 0
}

/** The date and time as a zip writes them (local time, 2-second steps, from 1980). */
function dosStamp(at: Date): { time: number; date: number } {
  const year = Math.min(Math.max(at.getFullYear(), 1980), 2107)
  return {
    time: (at.getHours() << 11) | (at.getMinutes() << 5) | (at.getSeconds() >> 1),
    date: ((year - 1980) << 9) | ((at.getMonth() + 1) << 5) | at.getDate(),
  }
}

const UTF8_NAMES = 0x0800
const STORED = 0
const VERSION = 20
const DIRECTORY = 0x10

/** The zip of these files, with a folder entry before the first file of each folder. */
export function makeZip(entries: readonly ZipEntry[], at: Date): Uint8Array {
  const encoder = new TextEncoder()
  const { time, date } = dosStamp(at)
  const items: { name: Uint8Array; bytes: Uint8Array; folder: boolean }[] = []
  const folders = new Set<string>()
  for (const entry of entries) {
    const parts = entry.path.split('/')
    for (let depth = 1; depth < parts.length; depth++) {
      const folder = `${parts.slice(0, depth).join('/')}/`
      if (folders.has(folder)) continue
      folders.add(folder)
      items.push({ name: encoder.encode(folder), bytes: new Uint8Array(0), folder: true })
    }
    items.push({ name: encoder.encode(entry.path), bytes: entry.bytes, folder: false })
  }

  const local: Uint8Array[] = []
  const central: Uint8Array[] = []
  let offset = 0
  for (const item of items) {
    const crc = crc32(item.bytes)
    const head = new DataView(new ArrayBuffer(30))
    head.setUint32(0, 0x04034b50, true)
    head.setUint16(4, VERSION, true)
    head.setUint16(6, UTF8_NAMES, true)
    head.setUint16(8, STORED, true)
    head.setUint16(10, time, true)
    head.setUint16(12, date, true)
    head.setUint32(14, crc, true)
    head.setUint32(18, item.bytes.length, true)
    head.setUint32(22, item.bytes.length, true)
    head.setUint16(26, item.name.length, true)
    head.setUint16(28, 0, true)
    local.push(new Uint8Array(head.buffer), item.name, item.bytes)

    const record = new DataView(new ArrayBuffer(46))
    record.setUint32(0, 0x02014b50, true)
    record.setUint16(4, VERSION, true)
    record.setUint16(6, VERSION, true)
    record.setUint16(8, UTF8_NAMES, true)
    record.setUint16(10, STORED, true)
    record.setUint16(12, time, true)
    record.setUint16(14, date, true)
    record.setUint32(16, crc, true)
    record.setUint32(20, item.bytes.length, true)
    record.setUint32(24, item.bytes.length, true)
    record.setUint16(28, item.name.length, true)
    record.setUint32(38, item.folder ? DIRECTORY : 0, true)
    record.setUint32(42, offset, true)
    central.push(new Uint8Array(record.buffer), item.name)
    offset += 30 + item.name.length + item.bytes.length
  }

  const centralSize = central.reduce((sum, part) => sum + part.length, 0)
  const end = new DataView(new ArrayBuffer(22))
  end.setUint32(0, 0x06054b50, true)
  end.setUint16(8, items.length, true)
  end.setUint16(10, items.length, true)
  end.setUint32(12, centralSize, true)
  end.setUint32(16, offset, true)

  const parts = [...local, ...central, new Uint8Array(end.buffer)]
  const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0))
  let position = 0
  for (const part of parts) {
    out.set(part, position)
    position += part.length
  }
  return out
}
