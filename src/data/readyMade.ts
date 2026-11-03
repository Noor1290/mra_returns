// The ready-made templates of the two MRA files, "MRA CSG (PACO)" and "MRA PRGF", set up as the
// MRA requires so nothing needs to be set by hand: the MRA's own titles and headings, the
// employer line (ERN, BRN, the name in capitals, the month as YYMM, phones, declarant, email),
// and the employee lines as the owner's samples are made:
//   - the names in capitals, trimmed, double spaces made single;
//   - the start date as YYYYMMDD; Full time / Part time as Y / N; the fixed codes S, M, 1, Y, N;
//   - CSG and NSF as round(employee) + round(employer), each half up first;
//   - PRGF: Total Remuneration is the exact sum of its parts, rounded once, and the contribution
//     is round(4.5 % of that total as written), so the line always agrees with itself;
//   - employees with no Gross Pay that month left out;
//   - Required: the ERN, BRN and declarant, the employee's ID (NIC) and surname, and the amounts;
//   - Windows-1252, CRLF, commas, no quotes, every line padded to the full width.
// Nothing here is about a real company or person.

import type { TemplateBody } from '../lib/template'
import { standardTemplate, withRequired, type Layout } from './mraLayouts'

export const READY_MADE: readonly { name: string; layout: Layout }[] = [
  { name: 'MRA CSG (PACO)', layout: 'csg' },
  { name: 'MRA PRGF', layout: 'prgf' },
]

/** The ERN, BRN and declarant; the ID and surname; the amounts that come from the payroll. */
const REQUIRED: Record<Layout, string[]> = {
  csg: ['m0', 'm1', 'm6', 'e0', 'e1', 'e3', 'e5', 'e9', 'e10', 'e12', 'e14', 'e18'],
  prgf: ['m0', 'm1', 'm6', 'e0', 'e1', 'e6', 'e7', 'e9', 'e10'],
}

/** The company's name and the employee's names: in capitals, trimmed, double spaces made single. */
const NAMES = ['m2', 'e1', 'e2']

export function readyMadeTemplate(layout: Layout): TemplateBody {
  const body = standardTemplate(layout)
  const tidied: TemplateBody = {
    ...body,
    rows: body.rows.map((row) =>
      row.kind === 'copy' ? row : { ...row, cells: row.cells.map((cell) => (cell && NAMES.includes(cell.id) ? { ...cell, format: { type: 'text' as const, capitals: true, tidy: true } } : cell)) },
    ),
  }
  return withRequired(tidied, REQUIRED[layout])
}

/** The ready-made templates this company does not have yet, by name (capitals ignored). */
export function missingReadyMade(names: readonly string[]) {
  const have = new Set(names.map((name) => name.trim().toLowerCase()))
  return READY_MADE.filter((one) => !have.has(one.name.toLowerCase()))
}
