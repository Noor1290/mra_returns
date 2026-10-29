// Works out every cell of a template for one company and one month: the lines of the file, as
// fields, before they are written (csvFile.ts). A small calculation is a list of terms (JSON,
// checked by template.ts) worked out here by a fixed interpreter: add, subtract, multiply by a
// rate, round each part, with exact decimals. Nothing is ever run as code (no eval, no new
// Function).

import { add, endsInHalf, isZero, multiply, parseDecimal, roundHalfUp, subtract, ZERO, type Decimal } from './decimal'
import { asNumber, monthValue, NONE, valueOf, writeValue, type Value } from './formats'
import { cellName, cellsOf, headingOf, type Cell, type CompanyField, type OwnValues, type TemplateBody, type Term } from './template'

/** What the employer row can name about the company. */
export type CompanyInfo = Record<CompanyField, string>

export interface FileContext {
  company: CompanyInfo
  /** "YYYY-MM". */
  period: string
  /** The company's own values: a fixed value "for this company only". */
  own: OwnValues
}

export type EmployeeRow = Record<string, unknown>

/** Something about one cell that the user should see before exporting. */
export interface Problem {
  /** The cell, as a spreadsheet names it ("J5"), and its heading. */
  cell: string
  heading: string
  /** Which employee, by position in the saved run (from 0), when it is about one. */
  employee: number | null
  kind: CellProblem
}

export type CellProblem =
  | 'self-reference'
  | 'loop'
  | 'unknown-cell'
  | 'employee-cell-in-employer-row'
  | 'not-a-number'
  | 'not-a-date'
  | 'too-precise'

/**
 * A value used in a cell that is rounded to whole rupees, which ends in exactly .50 in the saved
 * run. The saved run keeps 2 decimals, so .50 may itself be a rounding (of 187.495, say): the
 * whole-rupee figure can then be 1 more than from the full value. Listed so it can be checked.
 */
export interface HalfNote {
  employee: number
  cell: string
  heading: string
  key: string
  value: Decimal
}

/**
 * A cell marked "Required" that comes out empty: a text or date cell written empty, a number
 * cell with no value (written 0), or a number cell written 0 when "0 counts as missing" is on.
 */
export interface MissingValue {
  cell: string
  heading: string
  /** Which employee, by position in the saved run (from 0); null for the employer row. */
  employee: number | null
}

export interface BuiltFile {
  /** Every line, as its fields, in order. */
  lines: string[][]
  /** The positions (from 0) of the employees written, and of those left out for no pay. */
  written: number[]
  leftOut: number[]
  problems: Problem[]
  halfNotes: HalfNote[]
  missing: MissingValue[]
}

interface Evaluated {
  value: Value
  text: string
  /** The saved-run columns this cell's value comes from, directly or through other cells. */
  uses: { key: string; value: Decimal }[]
  /** Whether working it out rounded to whole rupees somewhere. */
  roundsWhole: boolean
  /** No value came from the data: an empty source, or a calculation of empty values only. */
  empty: boolean
  problem: CellProblem | null
}

const located = (body: TemplateBody) => {
  const where = new Map(cellsOf(body).map((found) => [found.cell.id, found]))
  return where
}

/** Whether a row's value in this column means "no pay": missing, empty, or 0. */
export function hasNoPay(row: EmployeeRow, key: string): boolean {
  const value = asNumber(valueOf(row[key]))
  if (value === 'none') return true
  return value !== null && isZero(value)
}

class Evaluator {
  private readonly where: ReturnType<typeof located>
  private readonly memo = new Map<string, Evaluated>()
  private readonly stack: string[] = []

  constructor(
    body: TemplateBody,
    private readonly context: FileContext,
    private readonly employee: EmployeeRow | null,
  ) {
    this.where = located(body)
  }

  cell(cell: Cell): Evaluated {
    const done = this.memo.get(cell.id)
    if (done) return done
    // Only reached through operand(), which tells a self-reference from a loop first.
    if (this.stack.includes(cell.id)) return { value: NONE, text: '', uses: [], roundsWhole: false, empty: true, problem: 'loop' }
    this.stack.push(cell.id)
    const worked = this.work(cell)
    this.stack.pop()
    const written = writeValue(worked.value, cell.format)
    const result: Evaluated = {
      value: worked.value,
      text: worked.problem ? '' : written.text,
      uses: worked.uses,
      roundsWhole: worked.roundsWhole || (cell.format.type === 'number' && cell.format.decimals === 0),
      empty: worked.empty,
      problem: worked.problem ?? written.problem,
    }
    this.memo.set(cell.id, result)
    return result
  }

  private work(cell: Cell): Omit<Evaluated, 'text'> {
    const plain = (value: Value) => ({ value, uses: [], roundsWhole: false, empty: value.kind === 'none', problem: null })
    const source = cell.source
    switch (source.type) {
      case 'empty':
        return plain(NONE)
      case 'fixed': {
        const own = this.context.own.values[cell.id]
        const text = own ?? source.value
        return plain(text === '' ? NONE : { kind: 'text', text })
      }
      case 'company': {
        const text = this.context.company[source.field] ?? ''
        return plain(text === '' ? NONE : { kind: 'text', text })
      }
      case 'month':
        return plain(monthValue(this.context.period))
      case 'employee': {
        const value = valueOf(this.employee?.[source.key])
        return { value, uses: value.kind === 'number' ? [{ key: source.key, value: value.value }] : [], roundsWhole: false, empty: value.kind === 'none', problem: null }
      }
      case 'map': {
        const loose = (text: string) => text.trim().replace(/\s+/g, ' ').toLowerCase()
        const raw = valueOf(this.employee?.[source.key])
        const wanted = raw.kind === 'text' ? loose(raw.text) : raw.kind === 'number' ? loose(String(this.employee?.[source.key])) : ''
        const pair = wanted === '' ? undefined : source.pairs.find((one) => loose(one.from) === wanted)
        const text = pair ? pair.to : source.otherwise
        return plain(text === '' ? NONE : { kind: 'text', text })
      }
      case 'calc':
        return this.calc(source.terms)
    }
  }

  private calc(terms: Term[]): Omit<Evaluated, 'text'> {
    let total = ZERO
    const uses: Evaluated['uses'] = []
    let roundsWhole = false
    // Empty when it reads columns or cells and every one of them is empty (a number is not data).
    let reads = false
    let anyValue = false
    for (const term of terms) {
      const part = this.operand(term)
      if (part.problem) return { value: NONE, uses, roundsWhole, empty: true, problem: part.problem }
      uses.push(...part.uses)
      roundsWhole ||= part.roundsWhole
      if (term.of.type !== 'number') {
        reads = true
        anyValue ||= !part.empty
      }
      let value = part.value
      if (term.times !== null) {
        const product = multiply(value, parseDecimal(term.times)!)
        if (!product) return { value: NONE, uses, roundsWhole, empty: true, problem: 'too-precise' }
        value = product
      }
      if (term.round === 'whole') {
        value = roundHalfUp(value, 0)
        roundsWhole = true
      } else if (term.round === 'two') {
        value = roundHalfUp(value, 2)
      }
      total = term.sign === 1 ? add(total, value) : subtract(total, value)
    }
    return { value: { kind: 'number', value: total }, uses, roundsWhole, empty: reads && !anyValue, problem: null }
  }

  private operand(term: Term): { value: Decimal; uses: Evaluated['uses']; roundsWhole: boolean; empty: boolean; problem: CellProblem | null } {
    const of = term.of
    const wrong = (problem: CellProblem, uses: Evaluated['uses'] = [], roundsWhole = false) => ({ value: ZERO, uses, roundsWhole, empty: true, problem })
    if (of.type === 'number') return { value: parseDecimal(of.value)!, uses: [], roundsWhole: false, empty: false, problem: null }
    if (of.type === 'column') {
      const number = asNumber(valueOf(this.employee?.[of.key]))
      if (number === null) return wrong('not-a-number')
      const value = number === 'none' ? ZERO : number
      return { value, uses: number === 'none' ? [] : [{ key: of.key, value }], roundsWhole: false, empty: number === 'none', problem: null }
    }
    const found = this.where.get(of.id)
    if (!found) return wrong('unknown-cell')
    if (found.kind === 'employee' && this.employee === null) return wrong('employee-cell-in-employer-row')
    if (this.stack.includes(of.id)) return wrong(this.stack.at(-1) === of.id ? 'self-reference' : 'loop')
    const referred = this.cell(found.cell)
    if (referred.problem) return wrong(referred.problem === 'self-reference' ? 'loop' : referred.problem, referred.uses, referred.roundsWhole)
    // The value as written in that cell of the file (a figure already rounded there stays rounded).
    const number = found.cell.format.type === 'number' ? parseDecimal(referred.text) : asNumber(referred.value)
    if (number === null) return wrong('not-a-number', referred.uses, referred.roundsWhole)
    return { value: number === 'none' ? ZERO : number, uses: referred.uses, roundsWhole: referred.roundsWhole, empty: referred.empty || number === 'none', problem: null }
  }
}

/** The text of one cell, for one employee (or the employer row): what the preview shows. */
export function previewCell(body: TemplateBody, cell: Cell, context: FileContext, employee: EmployeeRow | null) {
  const result = new Evaluator(body, context, employee).cell(cell)
  return { text: result.text, problem: result.problem }
}

/** Everything wrong with the template itself, whatever the data: loops, unknown cells... */
export function templateProblems(body: TemplateBody): Problem[] {
  const fake: FileContext = { company: { name: '', brn: '', address: '', ern: '', telephone: '', mobile: '', declarant: '', email: '' }, period: '2000-01', own: { values: {} } }
  const out: Problem[] = []
  for (const { cell, row, column, kind } of cellsOf(body)) {
    if (cell.source.type !== 'calc') continue
    const result = new Evaluator(body, fake, kind === 'employee' ? {} : null).cell(cell)
    if (result.problem && !['not-a-number', 'not-a-date'].includes(result.problem)) {
      out.push({ cell: cellName(row, column), heading: headingOf(body, row, column), employee: null, kind: result.problem })
    }
  }
  return out
}

/** The lines of one company's file for the month, from its saved run. */
export function buildFile(body: TemplateBody, context: FileContext, employees: readonly EmployeeRow[]): BuiltFile {
  const lines: string[][] = []
  const problems: Problem[] = []
  const halfNotes: HalfNote[] = []
  const missing: MissingValue[] = []
  const written: number[] = []
  const leftOut: number[] = []
  const noPay = body.noPay
  employees.forEach((row, index) => (noPay && hasNoPay(row, noPay.key) ? leftOut : written).push(index))

  const line = (rowIndex: number, cells: (Cell | null)[], employee: EmployeeRow | null, position: number | null) => {
    const evaluator = new Evaluator(body, context, employee)
    const seen = new Set<string>()
    return cells.map((cell, column) => {
      if (!cell) return ''
      const result = evaluator.cell(cell)
      const name = cellName(rowIndex, column)
      if (result.problem) problems.push({ cell: name, heading: headingOf(body, rowIndex, column), employee: position, kind: result.problem })
      if (cell.required && isMissing(cell, result)) missing.push({ cell: name, heading: headingOf(body, rowIndex, column), employee: position })
      if (position !== null && result.roundsWhole) {
        for (const use of result.uses) {
          const key = `${use.key}`
          if (!endsInHalf(use.value) || seen.has(key)) continue
          seen.add(key)
          halfNotes.push({ employee: position, cell: name, heading: headingOf(body, rowIndex, column), key: use.key, value: use.value })
        }
      }
      return result.text
    })
  }

  body.rows.forEach((row, rowIndex) => {
    if (row.kind === 'copy') lines.push([...row.cells])
    else if (row.kind === 'employer') lines.push(line(rowIndex, row.cells, null, null))
    else for (const index of written) lines.push(line(rowIndex, row.cells, employees[index], index))
  })
  return { lines, written, leftOut, problems: dedupe(problems), halfNotes, missing }
}

/**
 * Whether a required cell comes out empty. Text and dates: written empty. Numbers: no value
 * (written 0, as always), or written 0 when "0 counts as missing" is ticked for that cell.
 */
function isMissing(cell: Cell, result: Evaluated): boolean {
  if (result.text.trim() === '') return true
  if (cell.format.type !== 'number') return false
  if (result.empty) return true
  const written = parseDecimal(result.text)
  return cell.zeroMissing === true && written !== null && isZero(written)
}

/** A problem with the template itself is found once per employee: list it once. */
function dedupe(problems: Problem[]): Problem[] {
  const out: Problem[] = []
  const once = new Set<string>()
  for (const problem of problems) {
    const general = ['self-reference', 'loop', 'unknown-cell', 'employee-cell-in-employer-row', 'too-precise'].includes(problem.kind)
    const key = general ? `${problem.cell}:${problem.kind}` : `${problem.cell}:${problem.kind}:${problem.employee}`
    if (once.has(key)) continue
    once.add(key)
    out.push(general ? { ...problem, employee: null } : problem)
  }
  return out
}
