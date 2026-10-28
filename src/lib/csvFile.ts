// Writes the lines of a return file as the bytes of a .csv file, exactly as the template's file
// settings say: the encoding (Windows-1252, or UTF-8 with or without a byte-order mark), the line
// endings (CRLF or LF, and one after the last line too), the separator, the quotes and the
// padding of every line to the full width. Also reads an uploaded .csv back into its fields.
//
// Before a file is made, everything it cannot hold is listed: a character the encoding has no
// byte for, or (with "never" quotes) a value holding the separator, a quote or a line break.

import type { Encoding, FileSettings } from './template'

/** Windows-1252 bytes 0x80 to 0x9F; the rest of 0x00-0xFF are the same code points as Latin-1. */
const CP1252_HIGH: (number | null)[] = [
  0x20ac, null, 0x201a, 0x0192, 0x201e, 0x2026, 0x2020, 0x2021, 0x02c6, 0x2030, 0x0160, 0x2039, 0x0152, null, 0x017d, null,
  null, 0x2018, 0x2019, 0x201c, 0x201d, 0x2022, 0x2013, 0x2014, 0x02dc, 0x2122, 0x0161, 0x203a, 0x0153, null, 0x017e, 0x0178,
]
const TO_CP1252 = new Map<number, number>()
for (let byte = 0; byte < 256; byte++) {
  const code = byte >= 0x80 && byte <= 0x9f ? CP1252_HIGH[byte - 0x80] : byte
  if (code !== null) TO_CP1252.set(code, byte)
}

/** The byte Windows-1252 has for a character, or null when it has none. */
export function cp1252Byte(character: string): number | null {
  return TO_CP1252.get(character.codePointAt(0)!) ?? null
}

/** Bytes read as Windows-1252. The five bytes it leaves undefined come back as their C1 controls. */
export function decodeCp1252(bytes: Uint8Array): string {
  let out = ''
  for (const byte of bytes) {
    const code = byte >= 0x80 && byte <= 0x9f ? (CP1252_HIGH[byte - 0x80] ?? byte) : byte
    out += String.fromCodePoint(code)
  }
  return out
}

export interface WriteProblem {
  /** Line and field, from 0. */
  line: number
  field: number
  kind: 'character' | 'separator'
  /** The character the encoding cannot hold. */
  character?: string
}

export interface WrittenFile {
  bytes: Uint8Array
  problems: WriteProblem[]
}

const SPECIAL = /["\r\n]/

function quoteField(value: string, separator: string, quotes: FileSettings['quotes']): { text: string; unsafe: boolean } {
  const needs = value.includes(separator) || SPECIAL.test(value)
  if (quotes === 'always' || (quotes === 'needed' && needs)) return { text: `"${value.replace(/"/g, '""')}"`, unsafe: false }
  return { text: value, unsafe: needs }
}

/**
 * The file's bytes. `width` is the template's: with `pad` on, every line has exactly that many
 * fields; with it off, each line ends at its last field that is not empty. A character the
 * encoding cannot hold is written as "?" and listed; so is a field that cannot be written
 * without quotes when the settings say "never".
 */
export function writeCsv(lines: readonly (readonly string[])[], width: number, settings: FileSettings): WrittenFile {
  const problems: WriteProblem[] = []
  const eol = settings.lineEnding === 'crlf' ? '\r\n' : '\n'
  const text = lines
    .map((fields, line) => {
      let row = [...fields]
      if (settings.pad) {
        while (row.length < width) row.push('')
        row = row.slice(0, Math.max(width, 1))
      } else {
        let end = row.length
        while (end > 1 && row[end - 1] === '') end -= 1
        row = row.slice(0, end)
      }
      return row
        .map((value, field) => {
          const { text: written, unsafe } = quoteField(value, settings.separator, settings.quotes)
          if (unsafe) problems.push({ line, field, kind: 'separator' })
          for (const character of unencodable(value, settings.encoding)) problems.push({ line, field, kind: 'character', character })
          return written
        })
        .join(settings.separator)
    })
    .map((line) => line + eol)
    .join('')
  return { bytes: encode(text, settings.encoding), problems }
}

/** The text as bytes. A character Windows-1252 has no byte for becomes "?" (listed beforehand). */
function encode(text: string, encoding: Encoding): Uint8Array {
  if (encoding !== 'windows-1252') {
    const body = new TextEncoder().encode(text)
    if (encoding === 'utf-8') return body
    const withMark = new Uint8Array(body.length + 3)
    withMark.set([0xef, 0xbb, 0xbf])
    withMark.set(body, 3)
    return withMark
  }
  return Uint8Array.from([...text], (character) => cp1252Byte(character) ?? 0x3f)
}

/** The characters of a text that Windows-1252 cannot hold, each once. */
export function unencodable(text: string, encoding: Encoding): string[] {
  if (encoding !== 'windows-1252') return []
  return [...new Set([...text].filter((character) => cp1252Byte(character) === null))]
}

// ---------- reading an uploaded .csv ----------

export interface ReadCsv {
  rows: string[][]
  encoding: Encoding
  lineEnding: FileSettings['lineEnding']
  separator: FileSettings['separator']
  quotes: FileSettings['quotes']
  /** Every line has the same number of fields. */
  pad: boolean
}

/** The text of an uploaded file, and which encoding it is in. */
export function decodeUpload(bytes: Uint8Array): { text: string; encoding: Encoding } {
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    return { text: new TextDecoder('utf-8').decode(bytes.subarray(3)), encoding: 'utf-8-bom' }
  }
  const ascii = bytes.every((byte) => byte < 0x80)
  if (!ascii) {
    try {
      return { text: new TextDecoder('utf-8', { fatal: true }).decode(bytes), encoding: 'utf-8' }
    } catch {
      // Not UTF-8: Windows-1252, as the MRA's own files are.
    }
  }
  // Plain ASCII is the same in every encoding; the MRA files are Windows-1252.
  return { text: decodeCp1252(bytes), encoding: 'windows-1252' }
}

/** Reads a .csv file's fields exactly: spaces kept, quotes understood ("a, b" and "" inside). */
export function readCsv(bytes: Uint8Array): ReadCsv {
  const { text, encoding } = decodeUpload(bytes)
  const firstLine = text.split(/\r?\n/, 1)[0]
  const outside = firstLine.replace(/"[^"]*"/g, '')
  const separator = (outside.match(/;/g)?.length ?? 0) > (outside.match(/,/g)?.length ?? 0) ? ';' : ','
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let quoted = false
  let anyQuoted = false
  let i = 0
  const endField = () => {
    row.push(field)
    field = ''
  }
  while (i < text.length) {
    const character = text[i]
    if (quoted) {
      if (character === '"' && text[i + 1] === '"') {
        field += '"'
        i += 2
        continue
      }
      if (character === '"') quoted = false
      else field += character
      i += 1
      continue
    }
    if (character === '"' && field === '') {
      quoted = true
      anyQuoted = true
    } else if (character === separator) {
      endField()
    } else if (character === '\r' && text[i + 1] === '\n') {
      endField()
      rows.push(row)
      row = []
      i += 1
    } else if (character === '\n') {
      endField()
      rows.push(row)
      row = []
    } else {
      field += character
    }
    i += 1
  }
  // A last line without a line ending still counts; the line ending after the last line does not
  // make an empty one.
  if (field !== '' || row.length > 0) {
    endField()
    rows.push(row)
  }
  const widths = new Set(rows.map((one) => one.length))
  return {
    rows,
    encoding,
    lineEnding: text.includes('\r\n') ? 'crlf' : 'lf',
    separator,
    quotes: anyQuoted ? 'needed' : 'never',
    pad: widths.size <= 1,
  }
}
