// What the screens call things: cell sources, company details, row kinds and problems, in plain
// words. Every text here is on the approved list (tests/textCheck/approved.json) once shown.

import { toText } from './decimal'
import type { SkipReason } from './batch'
import type { CellProblem, HalfNote, MissingValue, Problem, SumNote } from './evaluate'
import type { CompanyField, Source, SourceType } from './template'
import type { Unwritable } from './unwritable'
import type { UploadKind } from './upload'

export const SOURCE_LABELS: Record<SourceType | 'identity' | 'column', string> = {
  empty: 'Empty',
  fixed: 'Fixed value',
  company: 'Company detail',
  employee: 'Employee value',
  identity: 'Identity field',
  column: 'Payroll column',
  month: 'The month',
  calc: 'A small calculation',
  map: 'Mapping from text',
}

export const COMPANY_FIELD_LABELS: Record<CompanyField, string> = {
  name: 'Company name',
  brn: 'BRN',
  address: 'Address',
  ern: 'Employer Registration Number (ERN)',
  telephone: 'Telephone number',
  mobile: 'Mobile number',
  declarant: 'Name of declarant',
  email: 'Your email',
}

export const ROW_KIND_LABELS: Record<UploadKind, string> = {
  copy: 'Copied exactly',
  employer: 'Employer row',
  employee: 'Employee row',
  example: 'Example (not saved)',
}

/** A cell's source in a few words, for the grid. */
export function sourceSummary(source: Source): string {
  switch (source.type) {
    case 'empty':
      return 'Empty'
    case 'fixed':
      return source.value === '' ? 'Fixed: empty' : `Fixed: ${source.value}`
    case 'company':
      return COMPANY_FIELD_LABELS[source.field]
    case 'employee':
      return source.key
    case 'month':
      return 'The month'
    case 'calc':
      return 'Calculation'
    case 'map':
      return `Mapping of ${source.key}`
  }
}

const PROBLEMS: Record<CellProblem, string> = {
  'self-reference': 'refers to itself',
  loop: 'is part of a loop of cells that refer to each other',
  'unknown-cell': 'refers to a cell that is not in the template',
  'employee-cell-in-employer-row': 'uses a cell of the employee row, which the employer row cannot',
  'not-a-number': 'has a value that is not a number, so it is left empty',
  'not-a-date': 'has a value that is not a date, so it is left empty',
  'too-precise': 'multiplies by a rate with too many decimals',
}

/** "J5 (CSG amount) refers to itself." The employee is named by the caller when there is one. */
export function problemText(problem: Pick<Problem, 'cell' | 'heading' | 'kind'>): string {
  const where = problem.heading ? `${problem.cell} (${problem.heading})` : problem.cell
  return `${where} ${PROBLEMS[problem.kind]}.`
}

/** "This cell refers to itself." */
export const cellProblemText = (kind: CellProblem) => `This cell ${PROBLEMS[kind]}.`

/** "Employee NSF is 187.5 in the saved run (cell K5)." */
export function halfNoteText(note: HalfNote): string {
  return `${note.key} is ${toText(note.value)} in the saved run (cell ${note.cell}).`
}

/** "J5 (Total Remuneration): the rounded parts 20001 + 1001 + 0 make 21002, but the total is 21001." */
export function sumNoteText(note: SumNote): string {
  const where = note.heading ? `${note.cell} (${note.heading})` : note.cell
  const parts = note.parts.map((part, index) => `${index === 0 ? (part.sign === 1 ? '' : '- ') : part.sign === 1 ? '+ ' : '- '}${part.text}`).join(' ')
  return `${where}: the rounded parts ${parts} make ${note.sum}, but the total is ${note.total}.`
}

/** "DOE PAUL, ID X0000000000001 (row 2), Other names: Paul, Jr to Paul Jr": who, column, change. */
export function unwritableText(one: Unwritable, employees: readonly Record<string, unknown>[]): string {
  const who = one.kind === 'employee' ? employeeWithId(employees[one.employee!], one.employee!) : one.kind === 'employer' ? 'Employer row' : 'Copied row'
  const column = one.heading || one.cell
  return one.to === null ? `${who}, ${column}: ${one.from} has a character with no plain letter.` : `${who}, ${column}: ${one.from} \u2192 ${one.to === '' ? '(empty)' : one.to}`
}

/** "August 2026 isn't approved in the dashboard for ABC Co Ltd." */
export const notApprovedText = (month: string, company: string) => `${month} isn't approved in the dashboard for ${company}.`

/** "E5 (Surname of Employee) is required and has no value." */
export function missingText(missing: Pick<MissingValue, 'cell' | 'heading'>): string {
  const where = missing.heading ? `${missing.cell} (${missing.heading})` : missing.cell
  return `${where} is required and has no value.`
}

/** Who a required value is missing for: an employee by name and ID, or the employer row. */
export function missingWho(missing: MissingValue, employees: readonly Record<string, unknown>[]): string {
  return missing.employee === null ? 'Employer row' : employeeWithId(employees[missing.employee], missing.employee)
}

/** "MRA details missing: Employer Registration Number (ERN), Name of declarant." */
export function detailsMissingText(fields: readonly CompanyField[]): string {
  return `MRA details missing: ${fields.map((field) => COMPANY_FIELD_LABELS[field]).join(', ')}.`
}

/** Why a file of the batch was not made. */
export function skipText(reason: SkipReason, month: string): string {
  switch (reason) {
    case 'not-allowed':
      return 'Skipped: the dashboard did not allow this company. You may no longer be its admin.'
    case 'refused':
      return "Skipped: the dashboard did not send this company's saved run."
    case 'no-run':
      return `Skipped: ${month} has not been sent to the dashboard for this company.`
    case 'not-used':
      return 'Skipped: this company does not use this template.'
  }
}

/** "Made: MRA CSG (PACO)/CSG AUGUST 2026 ABC CO LTD.csv, 3 employees." */
export function madeText(path: string, employees: number): string {
  return `Made: ${path}, ${employees} ${employees === 1 ? 'employee' : 'employees'}.`
}

/** "Made: 3 files. Skipped: 2." */
export function batchCountText(made: number, skipped: number): string {
  return `Made: ${made} ${made === 1 ? 'file' : 'files'}. Skipped: ${skipped}.`
}

/** An employee by name and ID, as the required-value lists name them: "DOE JANE, ID X0000000000001 (row 1)". */
export function employeeWithId(row: Record<string, unknown> | undefined, index: number): string {
  const id = typeof row?.ID === 'string' ? row.ID.trim() : ''
  const name = employeeName(row, index)
  if (id === '') return name
  return name.startsWith('Row ') ? `ID ${id} (row ${index + 1})` : name.replace(/ \(row \d+\)$/, `, ID ${id} (row ${index + 1})`)
}

/** An employee of the saved run, as the lists name them: "DOE JANE (row 1)". */
export function employeeName(row: Record<string, unknown> | undefined, index: number): string {
  const name = [row?.Surname, row?.['Other names']]
    .filter((part) => typeof part === 'string' && part.trim() !== '')
    .join(' ')
    .trim()
  return name ? `${name} (row ${index + 1})` : `Row ${index + 1}`
}
