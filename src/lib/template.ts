// A template of ONE return file (the CSG file, MRA "PACO", or the PRGF file), as it is stored in
// the dashboard ("mra-template", payroll_hub docs/INTEGRATION.md). It is the app's own JSON: the
// dashboard keeps it exactly as sent and never looks inside, so everything is checked here, with
// Zod, every time a template is read, from the dashboard or from a file.
//
// The grid has four kinds of rows:
//   copy      written exactly as uploaded: the title line and the headings. Only these rows
//             keep their text, so a template never holds an employee or a figure;
//   employer  once per file: ERN, BRN, name, month...;
//   employee  repeated, one line per employee who was paid that month;
//   (example  rows of an uploaded file that are left out: never saved.)
// Every cell of an employer or employee row says what goes in it (its source) and how it is
// written (its format). Padding to the full width is a file setting.

import { z } from 'zod'

export const TEMPLATE_FORMAT = 'mra-returns-template'
export const TEMPLATE_VERSION = 1
/** The widest and longest grid a template may have. The MRA files have 19 and 12 columns. */
export const MAX_COLUMNS = 60
export const MAX_ROWS = 60
/** A small calculation has at most this many parts. */
export const MAX_TERMS = 20
const MAX_TEXT = 200

const text = z.string().max(MAX_TEXT)
const key = z.string().trim().min(1).max(120)
export const cellIdSchema = z.string().regex(/^[a-z0-9]{1,12}$/)
/** A decimal number written as text, so it is exact: "0.045", "29710", "-1". */
const decimalText = z.string().regex(/^-?\d{1,12}(\.\d{1,8})?$/)

export const COMPANY_FIELDS = ['name', 'brn', 'address', 'ern', 'telephone', 'mobile', 'declarant', 'email'] as const
export type CompanyField = (typeof COMPANY_FIELDS)[number]

const operandSchema = z.discriminatedUnion('type', [
  /** A column of the saved run, by its key ("Employee CSG"). */
  z.strictObject({ type: z.literal('column'), key }),
  /** The value of another cell of the template. */
  z.strictObject({ type: z.literal('cell'), id: cellIdSchema }),
  z.strictObject({ type: z.literal('number'), value: decimalText }),
])
export type Operand = z.infer<typeof operandSchema>

export const ROUNDINGS = ['none', 'whole', 'two'] as const
export type Rounding = (typeof ROUNDINGS)[number]

const termSchema = z.strictObject({
  /** Added (1) or subtracted (-1). */
  sign: z.union([z.literal(1), z.literal(-1)]),
  of: operandSchema,
  /** Multiplied by this rate before rounding: "0.045" for 4.5 %. */
  times: decimalText.nullable(),
  /** Rounded on its own, half up, before it is added: round(employee CSG) + round(employer CSG). */
  round: z.enum(ROUNDINGS),
})
export type Term = z.infer<typeof termSchema>

const sourceSchema = z.discriminatedUnion('type', [
  z.strictObject({ type: z.literal('empty') }),
  /** The same text for all companies; a company may have its own (see OwnValues). */
  z.strictObject({ type: z.literal('fixed'), value: text }),
  z.strictObject({ type: z.literal('company'), field: z.enum(COMPANY_FIELDS) }),
  /**
   * A value of the employee's row in the saved run: an identity field (ID, Surname, Other names,
   * Date of Employment...) or a payroll column, formula columns included. `group` only says
   * where the user found it.
   */
  z.strictObject({ type: z.literal('employee'), key, group: z.enum(['identity', 'column']) }),
  z.strictObject({ type: z.literal('month') }),
  z.strictObject({ type: z.literal('calc'), terms: z.array(termSchema).min(1).max(MAX_TERMS) }),
  /** Text turned into a code: "Full Time" -> Y. Capitals and spaces are ignored. */
  z.strictObject({
    type: z.literal('map'),
    key,
    pairs: z.array(z.strictObject({ from: text, to: text })).max(50),
    otherwise: text,
  }),
])
export type Source = z.infer<typeof sourceSchema>
export type SourceType = Source['type']

const formatSchema = z.discriminatedUnion('type', [
  /** Capitals on or off; trim and collapse double spaces on or off. Leading zeros always stay. */
  z.strictObject({ type: z.literal('text'), capitals: z.boolean(), tidy: z.boolean() }),
  /** Whole rupees or 2 decimals, half up; no thousands separators; optional width with leading zeros. */
  z.strictObject({ type: z.literal('number'), decimals: z.union([z.literal(0), z.literal(2)]), width: z.number().int().min(0).max(20) }),
  /** Built from pieces: YYYY, YY, MM, DD, MONTH (the month's name in capitals), anything else as written. */
  z.strictObject({ type: z.literal('date'), pattern: z.string().min(1).max(40) }),
])
export type Format = z.infer<typeof formatSchema>

const cellSchema = z.strictObject({ id: cellIdSchema, source: sourceSchema, format: formatSchema })
export type Cell = z.infer<typeof cellSchema>

const rowSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('copy'), cells: z.array(text).max(MAX_COLUMNS) }),
  z.strictObject({ kind: z.literal('employer'), cells: z.array(cellSchema.nullable()).max(MAX_COLUMNS) }),
  z.strictObject({ kind: z.literal('employee'), cells: z.array(cellSchema.nullable()).max(MAX_COLUMNS) }),
])
export type Row = z.infer<typeof rowSchema>
export type RowKind = Row['kind']

export const ENCODINGS = ['windows-1252', 'utf-8', 'utf-8-bom'] as const
export type Encoding = (typeof ENCODINGS)[number]

const settingsSchema = z.strictObject({
  encoding: z.enum(ENCODINGS),
  lineEnding: z.enum(['crlf', 'lf']),
  separator: z.enum([',', ';']),
  quotes: z.enum(['never', 'needed', 'always']),
  /** Every line gets the full width of the grid, short lines padded with empty fields. */
  pad: z.boolean(),
})
export type FileSettings = z.infer<typeof settingsSchema>

export const templateBodySchema = z
  .strictObject({
    format: z.literal(TEMPLATE_FORMAT),
    version: z.literal(TEMPLATE_VERSION),
    /** The number of columns: every line has this many fields when `pad` is on. */
    width: z.number().int().min(1).max(MAX_COLUMNS),
    rows: z.array(rowSchema).min(1).max(MAX_ROWS),
    settings: settingsSchema,
    fileName: z.strictObject({
      /** {MONTH} AUGUST, {MM} 08, {YYYY} 2026, {YY} 26, {COMPANY} the company's name, {BRN}. */
      pattern: z.string().min(1).max(120),
      capitals: z.boolean(),
    }),
    /** An employee whose value in this column is 0 or empty is left out ("no pay that month"). */
    noPay: z.strictObject({ key }).nullable(),
  })
  .superRefine((body, ctx) => {
    const ids = new Set<string>()
    let employer = 0
    let employee = 0
    body.rows.forEach((row, index) => {
      if (row.cells.length > body.width) ctx.addIssue({ code: 'custom', message: `Row ${index + 1} is wider than the template.`, path: ['rows', index] })
      if (row.kind === 'employer') employer += 1
      if (row.kind === 'employee') employee += 1
      if (row.kind === 'copy') return
      for (const cell of row.cells) {
        if (!cell) continue
        if (ids.has(cell.id)) ctx.addIssue({ code: 'custom', message: 'Two cells have the same id.', path: ['rows', index] })
        ids.add(cell.id)
      }
    })
    if (employer > 1) ctx.addIssue({ code: 'custom', message: 'A template has one employer row at most.', path: ['rows'] })
    if (employee > 1) ctx.addIssue({ code: 'custom', message: 'A template has one employee row at most.', path: ['rows'] })
  })
export type TemplateBody = z.infer<typeof templateBodySchema>

/**
 * A company's own values for a template ("mra-template" `own_values`): a fixed value "for this
 * company only", by cell id. A cell with no entry here uses the value for all companies.
 */
export const ownValuesSchema = z.strictObject({ values: z.record(cellIdSchema, text) })
export type OwnValues = z.infer<typeof ownValuesSchema>
export const NO_OWN_VALUES: OwnValues = { values: {} }

/** Reads what the dashboard stored as own values; anything not in this shape counts as none. */
export function readOwnValues(stored: unknown): OwnValues {
  const parsed = ownValuesSchema.safeParse(stored)
  return parsed.success ? parsed.data : NO_OWN_VALUES
}

/** The format a cell starts with for each kind of source. */
export function defaultFormat(source: SourceType): Format {
  switch (source) {
    case 'month':
      return { type: 'date', pattern: 'YYMM' }
    case 'calc':
      return { type: 'number', decimals: 0, width: 0 }
    default:
      return { type: 'text', capitals: false, tidy: false }
  }
}

/** "A", "B", ... "Z", "AA": a column's name, as a spreadsheet names it. */
export function columnName(index: number): string {
  let name = ''
  for (let n = index + 1; n > 0; n = Math.floor((n - 1) / 26)) name = String.fromCharCode(65 + ((n - 1) % 26)) + name
  return name
}

/** "E5": a cell's name, as a spreadsheet names it (row and column from 0). */
export const cellName = (row: number, column: number) => `${columnName(column)}${row + 1}`

/** Every cell of the employer and employee rows, with where it is. */
export function cellsOf(body: Pick<TemplateBody, 'rows'>): { cell: Cell; row: number; column: number; kind: 'employer' | 'employee' }[] {
  const out: { cell: Cell; row: number; column: number; kind: 'employer' | 'employee' }[] = []
  body.rows.forEach((row, rowIndex) => {
    if (row.kind === 'copy') return
    row.cells.forEach((cell, column) => {
      if (cell) out.push({ cell, row: rowIndex, column, kind: row.kind })
    })
  })
  return out
}

/** A new cell id that the template does not use yet. */
export function newCellId(body: Pick<TemplateBody, 'rows'>, random: () => number = Math.random): string {
  const used = new Set(cellsOf(body).map(({ cell }) => cell.id))
  for (;;) {
    const id = `c${Math.floor(random() * 36 ** 6).toString(36)}`
    if (!used.has(id)) return id
  }
}

/**
 * The heading of a column, for labels: the text of the nearest copied row above `row` that has
 * text in that column ("Employee ID"). Empty when there is none.
 */
export function headingOf(body: Pick<TemplateBody, 'rows'>, row: number, column: number): string {
  for (let r = row - 1; r >= 0; r--) {
    const above = body.rows[r]
    if (above.kind === 'copy' && (above.cells[column] ?? '').trim() !== '') return above.cells[column].trim()
  }
  return ''
}
