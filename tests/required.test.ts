// Required fields (Stage 2): a cell marked "Required" that comes out empty is listed before any
// export, with the employee (by name and ID) and the column. Text cells empty, number cells with
// no value (written 0 as always); a 0 in a number cell only when "0 counts as missing" is ticked.
// Marking a cell required never changes a byte of the file. Fake values only.
import { describe, expect, it } from 'vitest'
import { demoTemplate, standardTemplate, withRequired } from '../src/data/mraLayouts'
import { buildFile, type FileContext } from '../src/lib/evaluate'
import { requiredLines } from '../src/lib/report'
import { makeReturnFile } from '../src/lib/returnFile'
import { NO_OWN_VALUES, templateBodySchema, type Cell, type TemplateBody, type Term } from '../src/lib/template'
import { employeeWithId } from '../src/lib/wording'
import { ABC, FAKE_EMPLOYEES } from './fixtures/fakeCompany'

const context: FileContext = {
  company: { name: 'ABC Co Ltd', brn: 'C1', address: '', ern: '', telephone: '', mobile: '', declarant: '', email: '' },
  period: '2026-08',
  own: NO_OWN_VALUES,
}
const text = { type: 'text', capitals: false, tidy: false } as const
const whole = { type: 'number', decimals: 0, width: 0 } as const
const term = (of: Term['of']): Term => ({ sign: 1, of, times: null, round: 'whole' })

/** Headings above an employee row of these cells. */
const withCells = (headings: string[], cells: Cell[]): TemplateBody =>
  templateBodySchema.parse({
    ...standardTemplate('csg'),
    width: cells.length,
    rows: [
      { kind: 'copy', cells: headings },
      { kind: 'employee', cells },
    ],
    noPay: null,
  })

describe('required cells', () => {
  const body = withCells(
    ['Employee ID', 'Surname', 'PAYE', 'CSG amount', 'Bonus'],
    [
      { id: 'a1', source: { type: 'employee', key: 'ID', group: 'identity' }, format: text, required: true },
      { id: 'a2', source: { type: 'employee', key: 'Surname', group: 'identity' }, format: text, required: true },
      { id: 'a3', source: { type: 'employee', key: 'PAYE', group: 'column' }, format: whole, required: true },
      { id: 'a4', source: { type: 'calc', terms: [term({ type: 'column', key: 'Employee CSG' }), term({ type: 'column', key: 'CSG' })] }, format: whole, required: true },
      // Not required: never listed.
      { id: 'a5', source: { type: 'employee', key: 'Bonus', group: 'identity' }, format: text },
    ],
  )
  const rows = [
    { ID: 'X0000000000001', Surname: 'DOE', PAYE: 0, 'Employee CSG': 281.25, CSG: 562.5 },
    // No surname (empty text), PAYE and both CSG columns absent (no value).
    { ID: 'X0000000000002', Surname: '  ' },
    // Spaces only, with tidying on, is empty too; CSG of 0 + 0 is a value, 0.
    { ID: '', Surname: 'POE', PAYE: 907.69, 'Employee CSG': 0, CSG: 0 },
  ]

  it('lists an empty text cell and a number cell with no value, written as always (empty, 0)', () => {
    const built = buildFile(body, context, rows)
    expect(built.lines.slice(1)).toEqual([
      ['X0000000000001', 'DOE', '0', '844', ''],
      ['X0000000000002', '  ', '0', '0', ''],
      ['', 'POE', '908', '0', ''],
    ])
    expect(built.missing).toEqual([
      { cell: 'B2', heading: 'Surname', employee: 1 },
      { cell: 'C2', heading: 'PAYE', employee: 1 },
      { cell: 'D2', heading: 'CSG amount', employee: 1 },
      { cell: 'A2', heading: 'Employee ID', employee: 2 },
    ])
  })

  it('counts a 0 in a required number cell as missing only with "0 counts as missing"', () => {
    const cells = (zero: { zeroMissing?: true }) =>
      withCells(['PAYE', 'CSG amount'], [
        { id: 'a3', source: { type: 'employee', key: 'PAYE', group: 'column' }, format: whole, required: true, ...zero },
        { id: 'a4', source: { type: 'calc', terms: [term({ type: 'column', key: 'Employee CSG' }), term({ type: 'column', key: 'CSG' })] }, format: whole, required: true, ...zero },
      ])
    expect(buildFile(cells({ zeroMissing: true }), context, rows).missing).toEqual([
      { cell: 'A2', heading: 'PAYE', employee: 0 },
      { cell: 'A2', heading: 'PAYE', employee: 1 },
      { cell: 'B2', heading: 'CSG amount', employee: 1 },
      { cell: 'B2', heading: 'CSG amount', employee: 2 },
    ])
    // Without it, the same 0s are values; only "no value at all" is missing.
    expect(buildFile(cells({}), context, rows).missing).toEqual([
      { cell: 'A2', heading: 'PAYE', employee: 1 },
      { cell: 'B2', heading: 'CSG amount', employee: 1 },
    ])
    expect(buildFile(cells({}), context, [{ PAYE: 0, CSG: 0 }, { PAYE: '0.00', CSG: 0.4 }]).missing).toEqual([])
  })

  it('lists the employer row, and a date written empty', () => {
    const built = buildFile(demoTemplate('prgf'), context, [])
    // ERN and declarant are required in the fake sample's templates, and empty here.
    expect(built.missing).toEqual([
      { cell: 'A3', heading: 'Employer Registration Number', employee: null },
      { cell: 'G3', heading: 'Name of Declarant', employee: null },
    ])
    const dated = withCells(['Start'], [{ id: 'a1', source: { type: 'employee', key: 'Date of Employment', group: 'identity' }, format: { type: 'date', pattern: 'YYYYMMDD' }, required: true }])
    expect(buildFile(dated, context, [{ 'Date of Employment': '2020-02-01' }, {}]).missing).toEqual([{ cell: 'A2', heading: 'Start', employee: 1 }])
  })

  it('names the employee by name and ID, and the column by its cell and heading', () => {
    const file = makeReturnFile(body, NO_OWN_VALUES, ABC, '2026-08', rows)
    expect(requiredLines(file, rows)).toEqual([
      'ID X0000000000002 (row 2): B2 (Surname) is required and has no value.',
      'ID X0000000000002 (row 2): C2 (PAYE) is required and has no value.',
      'ID X0000000000002 (row 2): D2 (CSG amount) is required and has no value.',
      'POE (row 3): A2 (Employee ID) is required and has no value.',
    ])
    expect(employeeWithId(FAKE_EMPLOYEES[0], 0)).toBe('DOE JANE ANN, ID X0000000000001 (row 1)')
  })

  it('never changes a byte of the file', () => {
    const plain = makeReturnFile(standardTemplate('csg'), NO_OWN_VALUES, ABC, '2026-08', FAKE_EMPLOYEES)
    const marked = makeReturnFile(withRequired(standardTemplate('csg'), ['m0', 'm6', 'e0', 'e1', 'e9', 'e14']), NO_OWN_VALUES, ABC, '2026-08', FAKE_EMPLOYEES)
    expect([...marked.bytes]).toEqual([...plain.bytes])
    expect(plain.built.missing).toEqual([])
    expect(marked.built.missing).toEqual([])
  })
})

describe('the Required ticks in the template format', () => {
  it('are kept when on and left out when off, so templates without them read as before', () => {
    const cell = (more: object) =>
      templateBodySchema.safeParse({ ...standardTemplate('csg'), width: 1, rows: [{ kind: 'employee', cells: [{ id: 'a1', source: { type: 'empty' }, format: whole, ...more }] }], noPay: null })
    expect(cell({}).success).toBe(true)
    expect(cell({ required: true, zeroMissing: true }).success).toBe(true)
    expect(cell({ required: false }).success).toBe(false)
    expect(cell({ required: 'yes' }).success).toBe(false)
    const stored = JSON.parse(JSON.stringify(demoTemplate('csg')))
    expect(templateBodySchema.parse(stored)).toEqual(demoTemplate('csg'))
    expect(JSON.stringify(standardTemplate('csg'))).not.toContain('required')
  })
})
