// The name of a return file, from the template's pattern: "CSG {MONTH} {YYYY} {COMPANY}" for
// August 2026 and ABC Co Ltd is "CSG AUGUST 2026 ABC CO LTD.csv". No underscores are added, and
// the characters Windows does not allow in a file name are removed. Always a .csv file.

import { monthName } from './formats'

export const FILE_NAME_PIECES = ['{MONTH}', '{MM}', '{YYYY}', '{YY}', '{COMPANY}', '{BRN}'] as const

/** Windows refuses these in a file name, and the control characters (below a space). */
const NOT_ALLOWED = new Set('<>:"/\\|?*')
const allowed = (character: string) => character >= ' ' && !NOT_ALLOWED.has(character)
/** Names Windows keeps for devices: a file may not be called that. */
const RESERVED = /^(con|prn|aux|nul|com\d|lpt\d)$/i

export function fileNameFor(
  pattern: { pattern: string; capitals: boolean },
  period: string,
  company: { name: string; brn: string },
): string {
  const [year, month] = period.split('-')
  let name = pattern.pattern
    .replaceAll('{MONTH}', monthName(Number(month)))
    .replaceAll('{MM}', month)
    .replaceAll('{YYYY}', year)
    .replaceAll('{YY}', year.slice(2))
    .replaceAll('{COMPANY}', company.name)
    .replaceAll('{BRN}', company.brn)
  if (pattern.capitals) name = name.toUpperCase()
  name = [...name].filter(allowed).join('').replace(/\s+/g, ' ').trim()
  // Windows also drops dots and spaces at the end of a name.
  name = name.replace(/\.csv$/i, '').replace(/[. ]+$/, '')
  if (name === '' || RESERVED.test(name)) name = `MRA ${period}`
  return `${name.slice(0, 150)}.csv`
}
