// The values a return file cannot hold as they are: a separator, quote or line break when the
// file is written without quotes, and a character its encoding has no byte for. Each one stops the
// download until the user chooses, so every case names the employee and the column, and says what
// "Fix in this file only" would write. That changes the file, never the payroll.

import { unencodable, type WriteProblem } from './csvFile'
import type { BuiltFile } from './evaluate'
import { cellName, headingOf, type Encoding, type FileSettings, type TemplateBody } from './template'

export interface Unwritable {
  /** Line and field of the file, from 0. */
  line: number
  field: number
  kind: 'copy' | 'employer' | 'employee'
  /** Which employee, by position in the saved run (from 0), when it is about one. */
  employee: number | null
  cell: string
  heading: string
  /** As it is in the data. */
  from: string
  /** What the file would hold instead. Null when a character has no plain letter. */
  to: string | null
}

/** Letters that have no accent to take off: the rest come from Unicode's own decomposition. */
const PLAIN: Record<string, string> = { '\u0142': 'l', '\u0141': 'L', '\u0111': 'd', '\u0110': 'D', '\u0127': 'h', '\u0126': 'H', '\u0131': 'i' }

/** The plain letter for a character the encoding cannot hold, or null when it has none. */
function plainLetter(character: string, encoding: Encoding): string | null {
  const plain = PLAIN[character] ?? character.normalize('NFD').replace(/\p{M}/gu, '')
  return plain !== '' && unencodable(plain, encoding).length === 0 ? plain : null
}

/**
 * The value as a file can hold it: a separator, quote or line break becomes one space, with the
 * spaces beside it ("Paul, Jr" becomes "Paul Jr"), and a character becomes its plain letter. Null
 * when one has none.
 */
export function fixedText(value: string, separator: boolean, settings: Pick<FileSettings, 'encoding' | 'separator'>): string | null {
  const breaks = `${settings.separator}"\\r\\n`
  const spaced = separator ? value.replace(new RegExp(`[ ${breaks}]*[${breaks}][ ${breaks}]*`, 'g'), ' ').trim() : value
  let out = ''
  for (const character of spaced) {
    if (unencodable(character, settings.encoding).length === 0) {
      out += character
      continue
    }
    const plain = plainLetter(character, settings.encoding)
    if (plain === null) return null
    out += plain
  }
  return out
}

/** One case per value, in the order of the file. */
export function findUnwritable(built: BuiltFile, body: Pick<TemplateBody, 'rows' | 'settings'>, problems: readonly WriteProblem[]): Unwritable[] {
  const cases = new Map<string, Unwritable>()
  for (const { line, field } of problems) {
    const key = `${line}:${field}`
    if (cases.has(key)) continue
    const place = built.places[line]
    const separator = problems.some((one) => one.line === line && one.field === field && one.kind === 'separator')
    cases.set(key, {
      line,
      field,
      kind: place.kind,
      employee: place.employee,
      cell: cellName(place.row, field),
      heading: headingOf(body, place.row, field),
      from: built.originals[line][field],
      to: fixedText(built.lines[line][field], separator, body.settings),
    })
  }
  return [...cases.values()]
}

/** The lines with every case written as fixed. */
export function fixedLines(lines: readonly (readonly string[])[], cases: readonly Unwritable[]): string[][] {
  const out = lines.map((line) => [...line])
  for (const { line, field, to } of cases) out[line][field] = to ?? ''
  return out
}
