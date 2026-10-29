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
  name = cleanName(name).replace(/\.csv$/i, '').replace(/[. ]+$/, '')
  if (name === '' || RESERVED.test(name)) name = `MRA ${period}`
  return `${name.slice(0, 150)}.csv`
}

/**
 * A name Windows accepts: no forbidden characters, no underscores (a space instead), single
 * spaces, and no dots or spaces at the end (Windows drops them).
 */
function cleanName(name: string): string {
  return [...name].filter(allowed).join('').replace(/_/g, ' ').replace(/\s+/g, ' ').trim().replace(/[. ]+$/, '')
}

/** A folder of the zip, named after a template: "MRA CSG (PACO)". */
export function folderNameFor(templateName: string): string {
  const name = cleanName(templateName).slice(0, 80)
  return name === '' || RESERVED.test(name) ? 'Template' : name
}

/**
 * The name again with " (2)", " (3)"... before its extension when it is already taken, ignoring
 * capitals as Windows does. `taken` gets the name that is returned.
 */
export function uniqueName(name: string, taken: Set<string>): string {
  const dot = name.lastIndexOf('.')
  const [stem, extension] = dot > 0 ? [name.slice(0, dot), name.slice(dot)] : [name, '']
  let candidate = name
  for (let n = 2; taken.has(candidate.toLowerCase()); n++) candidate = `${stem} (${n})${extension}`
  taken.add(candidate.toLowerCase())
  return candidate
}
