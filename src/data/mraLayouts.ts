// The MRA's two file layouts, as the MRA portal gives them: the CSG file ("PACO") and the PRGF
// file, with their headings exactly (the trailing spaces and the "e" with an accent are the
// MRA's own), and what goes in each cell as the owner set them up. Used for the fake sample
// templates and the tests. Nothing here is about a real company or person.

import { TEMPLATE_FORMAT, TEMPLATE_VERSION, type Cell, type Format, type Source, type TemplateBody, type Term } from '../lib/template'

const e = '\u00e9'
const pad = (cells: string[], width: number) => [...cells, ...Array<string>(width - cells.length).fill('')]

const EMPLOYER_HEADINGS = [
  'Employer Registration Number',
  'Employer Business Registration Number ',
  'Employer Name',
  'Tax Period',
  'Telephone Number',
  'Mobile Number',
  'Name of Declarant',
  'Email Address',
]

export const CSG_HEADINGS = [
  'Employee ID',
  'Surname of Employee',
  'Other Names of Employee',
  'Wage Bill excluding Wage Relativity Adjustment (MUR)',
  'Wage Relativity Adjustment (MUR)',
  'Total Wage Bill (MUR)',
  'Contribution Code',
  'Pay Code',
  'Frequency ',
  `Contribution Sociale G${e}n${e}ralis${e}e Amount (CSG) on Wage Bill (MUR)`,
  'National Savings Fund Amount (NSF) (MUR)',
  'LEVY Applicable? (Y/N)',
  'Emoluments excluding travelling',
  'Full Time Employment (Y/N)',
  'PAYE for Income Tax (MUR)',
  'PAYE for Solidarity Levy (MUR)',
  'End of Year Bonus (MUR)',
  `Contribution Sociale G${e}n${e}ralis${e}e Amount (CSG) on End-of-Year Bonus (MUR)`,
  'Emoluments excluding Exempt Emoluments and Statutory End-of-Year Bonus (MUR)',
]

export const PRGF_HEADINGS = [
  'Employee ID',
  'Surname of Employee',
  'Other Names of Employee',
  'Pension Scheme',
  'Full Time Employment',
  'Start Date of Employment',
  'Monthly basic wage or salary (MUR)',
  'Allowances (MUR)',
  'Commission (MUR)',
  'Total Remuneration on which PRGF contribution amount is calculated (MUR) (MUR)',
  'PRGF Contribution Amount (MUR)',
  'Reason for no remuneration',
]

const TEXT: Format = { type: 'text', capitals: false, tidy: false }
const CAPITALS: Format = { type: 'text', capitals: true, tidy: false }
const WHOLE: Format = { type: 'number', decimals: 0, width: 0 }

const cell = (id: string, source: Source, format: Format = TEXT): Cell => ({ id, source, format })
const fixed = (id: string, value: string) => cell(id, { type: 'fixed', value })
const identity = (id: string, key: string, format: Format = TEXT) => cell(id, { type: 'employee', key, group: 'identity' }, format)
const column = (id: string, key: string) => cell(id, { type: 'employee', key, group: 'column' }, WHOLE)
const part = (of: Term['of'], round: Term['round'] = 'none', times: string | null = null): Term => ({ sign: 1, of, times, round })
const fullTime = (id: string) =>
  cell(id, {
    type: 'map',
    key: 'Full time / Part time',
    pairs: [
      { from: 'Full time', to: 'Y' },
      { from: 'Part time', to: 'N' },
    ],
    otherwise: '',
  })

/** The employer line of both files: ERN, BRN, name, the month as YYMM, phones, declarant, email. */
const employerCells = (width: number): (Cell | null)[] =>
  pad8(
    [
      cell('m0', { type: 'company', field: 'ern' }),
      cell('m1', { type: 'company', field: 'brn' }),
      cell('m2', { type: 'company', field: 'name' }, CAPITALS),
      cell('m3', { type: 'month' }, { type: 'date', pattern: 'YYMM' }),
      cell('m4', { type: 'company', field: 'telephone' }),
      cell('m5', { type: 'company', field: 'mobile' }),
      cell('m6', { type: 'company', field: 'declarant' }),
      cell('m7', { type: 'company', field: 'email' }),
    ],
    width,
  )

function pad8(cells: (Cell | null)[], width: number) {
  return [...cells, ...Array<null>(width - cells.length).fill(null)]
}

/** CSG (PACO): "CSG amount" = round(employee CSG) + round(employer CSG), each half up first. */
export function csgEmployeeCells(): Cell[] {
  return [
    identity('e0', 'ID'),
    identity('e1', 'Surname', CAPITALS),
    identity('e2', 'Other names', CAPITALS),
    column('e3', 'Emoluments'),
    fixed('e4', '0'),
    cell('e5', { type: 'calc', terms: [part({ type: 'cell', id: 'e3' }), part({ type: 'cell', id: 'e4' })] }, WHOLE),
    fixed('e6', 'S'),
    fixed('e7', 'M'),
    fixed('e8', '1'),
    cell('e9', { type: 'calc', terms: [part({ type: 'column', key: 'Employee CSG' }, 'whole'), part({ type: 'column', key: 'CSG' }, 'whole')] }, WHOLE),
    cell('e10', { type: 'calc', terms: [part({ type: 'column', key: 'Employee NSF' }, 'whole'), part({ type: 'column', key: 'NSF' }, 'whole')] }, WHOLE),
    fixed('e11', 'Y'),
    column('e12', 'Emoluments'),
    fullTime('e13'),
    column('e14', 'PAYE'),
    fixed('e15', '0'),
    fixed('e16', '0'),
    fixed('e17', '0'),
    column('e18', 'Emoluments'),
  ]
}

/** PRGF: "PRGF Contribution Amount" = round(4.5 % of the total remuneration), rounded once. */
export function prgfEmployeeCells(): (Cell | null)[] {
  return [
    identity('e0', 'ID'),
    identity('e1', 'Surname', CAPITALS),
    identity('e2', 'Other names', CAPITALS),
    fixed('e3', 'N'),
    fullTime('e4'),
    identity('e5', 'Date of Employment', { type: 'date', pattern: 'YYYYMMDD' }),
    column('e6', 'New Basic Salary'),
    column('e7', 'Allowances'),
    fixed('e8', '0'),
    cell('e9', { type: 'calc', terms: [part({ type: 'cell', id: 'e6' }), part({ type: 'cell', id: 'e7' }), part({ type: 'cell', id: 'e8' })] }, WHOLE),
    cell('e10', { type: 'calc', terms: [part({ type: 'cell', id: 'e9' }, 'none', '0.045')] }, WHOLE),
    null,
  ]
}

export type Layout = 'csg' | 'prgf'

/**
 * Gives an uploaded MRA file's template its cells, column by column, as the owner set them up:
 * the employer row and the employee row. Copied rows are not touched.
 */
export function withStandardCells(body: TemplateBody, layout: Layout): TemplateBody {
  const employee = layout === 'csg' ? csgEmployeeCells() : prgfEmployeeCells()
  return {
    ...body,
    rows: body.rows.map((row) => {
      if (row.kind === 'employer') return { kind: 'employer', cells: employerCells(body.width) }
      if (row.kind === 'employee') return { kind: 'employee', cells: [...employee, ...Array<null>(body.width - employee.length).fill(null)] }
      return row
    }),
  }
}

/** A complete template of either file, as if uploaded from the MRA portal and set up. */
export function standardTemplate(layout: Layout): TemplateBody {
  const headings = layout === 'csg' ? CSG_HEADINGS : PRGF_HEADINGS
  const width = headings.length
  const body: TemplateBody = {
    format: TEMPLATE_FORMAT,
    version: TEMPLATE_VERSION,
    width,
    rows: [
      { kind: 'copy', cells: pad(['MRA', layout === 'csg' ? 'PACO' : 'PRGF', 'V1.0'], width) },
      { kind: 'copy', cells: pad(EMPLOYER_HEADINGS, width) },
      { kind: 'employer', cells: [] },
      { kind: 'copy', cells: [...headings] },
      { kind: 'employee', cells: [] },
    ],
    settings: { encoding: 'windows-1252', lineEnding: 'crlf', separator: ',', quotes: 'never', pad: true },
    fileName: { pattern: `${layout === 'csg' ? 'CSG' : 'PRGF'} {MONTH} {YYYY} {COMPANY}`, capitals: true },
    noPay: { key: 'Gross Pay' },
  }
  return withStandardCells(body, layout)
}
