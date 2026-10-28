// An uploaded file (.csv or .xlsx) made into a first template: the grid as uploaded, its file
// settings as the file has them, and a first guess at which row is which (the MRA files have the
// title, the employer headings, the employer line, the employee headings, then the employees).
//
// Only copied rows keep their text. The text of the employer row and of the employee rows of
// the upload is kept in memory as a hint while the template is set up, and never saved: it is
// a real company's and real people's.

import { readCsv } from './csvFile'
import { MAX_COLUMNS, MAX_ROWS, TEMPLATE_FORMAT, TEMPLATE_VERSION, type FileSettings, type TemplateBody } from './template'
import { readXlsx } from './xlsx'

/** A row of the upload: what it is, and its text as uploaded. */
export type UploadKind = 'copy' | 'employer' | 'employee' | 'example'

export interface Upload {
  /** The grid as uploaded, every row as wide as the widest. */
  grid: string[][]
  kinds: UploadKind[]
  settings: FileSettings
  width: number
  /** The name it suggests for the template: the file's name without its extension. */
  name: string
}

export class UploadTooLarge extends Error {
  constructor() {
    super(`A template has at most ${MAX_ROWS} rows and ${MAX_COLUMNS} columns.`)
    this.name = 'UploadTooLarge'
  }
}

export class UploadEmpty extends Error {
  constructor() {
    super('The file has no rows.')
    this.name = 'UploadEmpty'
  }
}

/** The MRA's own file settings: what an Excel upload, which has none, starts with. */
export const MRA_SETTINGS: FileSettings = { encoding: 'windows-1252', lineEnding: 'crlf', separator: ',', quotes: 'never', pad: true }

/** Where a row's first cell names it: "Employer ..." headings, then "Employee ..." headings. */
export function guessKinds(grid: readonly string[][]): UploadKind[] {
  const first = (row: number) => (grid[row]?.[0] ?? '').trim().toLowerCase()
  const kinds: UploadKind[] = grid.map(() => 'copy')
  const employeeHeading = grid.findIndex((_, row) => first(row).startsWith('employee'))
  const employerHeading = grid.findIndex((_, row) => first(row).startsWith('employer'))
  if (employerHeading >= 0 && employerHeading + 1 < grid.length && employerHeading + 1 !== employeeHeading) {
    kinds[employerHeading + 1] = 'employer'
  }
  if (employeeHeading >= 0 && employeeHeading + 1 < grid.length) {
    kinds[employeeHeading + 1] = 'employee'
    for (let row = employeeHeading + 2; row < grid.length; row++) kinds[row] = 'example'
  }
  return kinds
}

/** Reads an uploaded template file. A name ending in .xlsx is read as Excel, anything else as CSV. */
export async function readUpload(fileName: string, bytes: Uint8Array): Promise<Upload> {
  const excel = /\.xlsx$/i.test(fileName)
  let rows: string[][]
  let settings: FileSettings
  if (excel) {
    rows = await readXlsx(bytes)
    settings = MRA_SETTINGS
  } else {
    const read = readCsv(bytes)
    rows = read.rows
    settings = { encoding: read.encoding, lineEnding: read.lineEnding, separator: read.separator, quotes: read.quotes, pad: read.pad }
  }
  if (rows.length === 0) throw new UploadEmpty()
  const width = Math.max(1, ...rows.map((row) => row.length))
  if (rows.length > MAX_ROWS + 500 || width > MAX_COLUMNS) throw new UploadTooLarge()
  const grid = rows.map((row) => [...row, ...Array<string>(width - row.length).fill('')])
  const kinds = guessKinds(grid)
  // Example rows go; what is left must fit in a template.
  if (kinds.filter((kind) => kind !== 'example').length > MAX_ROWS) throw new UploadTooLarge()
  const name = fileName.replace(/\.(csv|xlsx|txt)$/i, '').trim().slice(0, 80) || 'MRA return'
  return { grid, kinds, settings, width, name }
}

/**
 * The template an upload gives, with the kinds chosen: copied rows with their text, the employer
 * and employee rows with no cells set yet, example rows left out. A row's kind can be changed
 * later only from the upload (the text of rows that are not copied is not kept).
 */
export function templateFromUpload(upload: Upload, kinds: readonly UploadKind[]): TemplateBody {
  const rows: TemplateBody['rows'] = []
  upload.grid.forEach((cells, row) => {
    const kind = kinds[row]
    if (kind === 'example') return
    if (kind === 'copy') rows.push({ kind: 'copy', cells: [...cells] })
    else rows.push({ kind, cells: cells.map(() => null) })
  })
  return {
    format: TEMPLATE_FORMAT,
    version: TEMPLATE_VERSION,
    width: upload.width,
    rows,
    settings: upload.settings,
    fileName: { pattern: `${defaultPrefix(upload.name)} {MONTH} {YYYY} {COMPANY}`, capitals: true },
    noPay: { key: 'Gross Pay' },
  }
}

/** "CSG AUGUST 2026 (2)" -> "CSG"; a name that does not start that way is used as it is. */
function defaultPrefix(name: string): string {
  const first = /^(CSG|PRGF|PACO)\b/i.exec(name.trim())?.[1]
  return first ? first.toUpperCase() : name.trim().slice(0, 40) || 'MRA'
}
