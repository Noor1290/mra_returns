// The return files of a FAKE company, byte for byte, in the MRA's own format: Windows-1252 (the
// "e" with an accent in the CSG headings), CRLF after every line and the last one, every line
// padded to the full width, the trailing spaces of the headings, the ERN's leading zeros, the
// month as YYMM, dates as YYYYMMDD, Y/N from text, capitals, half-up rounding and "round each
// then add". And the calculation rules themselves. Fake values only.
import { describe, expect, it } from 'vitest'
import { standardTemplate } from '../src/data/mraLayouts'
import { writeCsv } from '../src/lib/csvFile'
import { toText } from '../src/lib/decimal'
import { buildFile, templateProblems, type FileContext } from '../src/lib/evaluate'
import { makeReturnFile } from '../src/lib/returnFile'
import { NO_OWN_VALUES, templateBodySchema, type Cell, type TemplateBody, type Term } from '../src/lib/template'
import { ABC, cp1252Bytes, EXPECTED_CSG, EXPECTED_PRGF, FAKE_EMPLOYEES } from './fixtures/fakeCompany'

const csg = () => standardTemplate('csg')
const prgf = () => standardTemplate('prgf')
const bytesOf = (file: { bytes: Uint8Array }) => [...file.bytes]

describe('the CSG file (MRA "PACO"), byte for byte', () => {
  const file = makeReturnFile(csg(), NO_OWN_VALUES, ABC, '2026-08', FAKE_EMPLOYEES)

  it('is exactly the MRA format', () => {
    expect(bytesOf(file)).toEqual([...cp1252Bytes(EXPECTED_CSG)])
    expect(file.fileName).toBe('CSG AUGUST 2026 ABC CO LTD.csv')
  })

  it('is Windows-1252 with no byte-order mark: the accented e is the one byte 0xE9', () => {
    expect(file.bytes.slice(0, 3)).toEqual(Uint8Array.from([0x4d, 0x52, 0x41]))
    const header = new TextDecoder('latin1').decode(file.bytes)
    expect(header).toContain('G\u00e9n\u00e9ralis\u00e9e')
    expect(file.bytes.filter((byte) => byte === 0xe9)).toHaveLength(6)
    expect(file.bytes.filter((byte) => byte === 0xc3)).toHaveLength(0)
  })

  it('ends every line with CRLF, the last one too, and has 19 fields on every line', () => {
    const text = new TextDecoder('latin1').decode(file.bytes)
    expect(text.endsWith('\r\n')).toBe(true)
    expect(text.replace(/\r\n/g, '')).not.toMatch(/[\r\n]/)
    for (const line of text.split('\r\n').slice(0, -1)) expect(line.split(',')).toHaveLength(19)
    expect(text).toContain('Employer Business Registration Number ,')
    expect(text).toContain(',Frequency ,')
    expect(text).not.toContain('"')
  })

  it('leaves out the employee with no pay, and says so', () => {
    expect(file.built.written).toEqual([0, 1, 2, 4])
    expect(file.built.leftOut).toEqual([3])
  })

  it('lists the values used in a rounded cell that end in exactly .50 (double rounding)', () => {
    expect(file.built.halfNotes.map((note) => [note.employee, note.cell, note.key, toText(note.value)])).toEqual([
      [0, 'J5', 'CSG', '562.5'],
      [0, 'K5', 'Employee NSF', '187.5'],
    ])
    expect(file.problems).toEqual([])
    expect(file.writeProblems).toEqual([])
  })
})

describe('the PRGF file, byte for byte', () => {
  it('is exactly the MRA format: plain ASCII, 12 fields, 4.5 % rounded once', () => {
    const file = makeReturnFile(prgf(), NO_OWN_VALUES, ABC, '2026-08', FAKE_EMPLOYEES)
    expect(bytesOf(file)).toEqual([...cp1252Bytes(EXPECTED_PRGF)])
    expect(file.bytes.every((byte) => byte < 0x80)).toBe(true)
    expect(file.fileName).toBe('PRGF AUGUST 2026 ABC CO LTD.csv')
  })
})

describe('file settings', () => {
  const withSettings = (settings: Partial<TemplateBody['settings']>) => ({ ...csg(), settings: { ...csg().settings, ...settings } })

  it('writes UTF-8, with or without a byte-order mark, and LF line endings', () => {
    const utf8 = makeReturnFile(withSettings({ encoding: 'utf-8', lineEnding: 'lf' }), NO_OWN_VALUES, ABC, '2026-08', FAKE_EMPLOYEES)
    const text = new TextDecoder().decode(utf8.bytes)
    expect(text).toBe(`${EXPECTED_CSG.join('\n')}\n`)
    expect(utf8.bytes[0]).toBe(0x4d)
    const bom = makeReturnFile(withSettings({ encoding: 'utf-8-bom' }), NO_OWN_VALUES, ABC, '2026-08', FAKE_EMPLOYEES)
    expect(Array.from(bom.bytes.subarray(0, 3))).toEqual([0xef, 0xbb, 0xbf])
  })

  it('pads a short line with empty fields to the full width', () => {
    const file = writeCsv([['MRA', 'PACO', 'V1.0'], ['001234']], 5, csg().settings)
    expect(new TextDecoder('latin1').decode(file.bytes)).toBe('MRA,PACO,V1.0,,\r\n001234,,,,\r\n')
  })

  it('without padding, ends each line at its last field that is not empty', () => {
    const file = makeReturnFile(withSettings({ pad: false }), NO_OWN_VALUES, ABC, '2026-08', FAKE_EMPLOYEES)
    const lines = new TextDecoder('latin1').decode(file.bytes).split('\r\n')
    expect(lines[0]).toBe('MRA,PACO,V1.0')
    expect(lines[2]).toBe('001234,C1234567,ABC CO LTD,2608,2000000,52000000,JANE SAMPLE,returns@example.org')
  })

  it('uses semicolons, and quotes when needed or always', () => {
    const fixed = csg()
    const employee = fixed.rows[4]
    if (employee.kind !== 'employee') throw new Error('layout')
    employee.cells[6] = { id: 'e6', source: { type: 'fixed', value: 'S;"x"' }, format: { type: 'text', capitals: false, tidy: false } }
    const needed = makeReturnFile({ ...fixed, settings: { ...fixed.settings, separator: ';', quotes: 'needed' } }, NO_OWN_VALUES, ABC, '2026-08', FAKE_EMPLOYEES.slice(0, 1))
    const line = new TextDecoder('latin1').decode(needed.bytes).split('\r\n')[4]
    expect(line).toBe('X0000000000001;DOE;JANE ANN;18750;0;18750;"S;""x""";M;1;844;657;Y;18750;Y;0;0;0;0;18750')
    const always = makeReturnFile({ ...csg(), settings: { ...csg().settings, quotes: 'always' } }, NO_OWN_VALUES, ABC, '2026-08', [])
    expect(new TextDecoder('latin1').decode(always.bytes).split('\r\n')[0]).toBe(`"MRA","PACO","V1.0"${',""'.repeat(16)}`)
  })

  it('lists, before export, a value that cannot be written without quotes, and a character Windows-1252 cannot hold', () => {
    const odd = { ...ABC, name: 'ABC, \u0141odz Ltd' }
    const file = makeReturnFile(csg(), NO_OWN_VALUES, odd, '2026-08', [])
    expect(file.writeProblems).toEqual([
      { line: 2, field: 2, kind: 'separator' },
      { line: 2, field: 2, kind: 'character', character: '\u0141' },
    ])
  })
})

describe('cells', () => {
  const context = (own = NO_OWN_VALUES): FileContext => ({
    company: { name: 'ABC Co Ltd', brn: 'C1', address: '', ern: '001234', telephone: '', mobile: '', declarant: '', email: 'returns@example.org' },
    period: '2026-08',
    own,
  })
  /** A template with one employee row of these cells. */
  const withCells = (cells: (Cell | null)[]): TemplateBody =>
    templateBodySchema.parse({ ...csg(), width: cells.length, rows: [{ kind: 'employee', cells }], noPay: null })
  const text = { type: 'text', capitals: false, tidy: false } as const
  const whole = { type: 'number', decimals: 0, width: 0 } as const
  const calc = (id: string, terms: Term[]): Cell => ({ id, source: { type: 'calc', terms }, format: whole })
  const term = (of: Term['of'], more: Partial<Term> = {}): Term => ({ sign: 1, of, times: null, round: 'none', ...more })

  it('a fixed value is the same for all companies unless a company has its own', () => {
    const body = withCells([{ id: 'a1', source: { type: 'fixed', value: 'shared@example.org' }, format: text }])
    expect(buildFile(body, context(), [{}]).lines).toEqual([['shared@example.org']])
    expect(buildFile(body, context({ values: { a1: 'own@example.org' } }), [{}]).lines).toEqual([['own@example.org']])
    // Another cell's own value does not apply here.
    expect(buildFile(body, context({ values: { zz: 'x' } }), [{}]).lines).toEqual([['shared@example.org']])
  })

  it('maps text to a code, ignoring capitals and spaces, with a default', () => {
    const body = withCells([
      {
        id: 'a1',
        source: { type: 'map', key: 'Type', pairs: [{ from: 'Full time', to: 'Y' }, { from: 'Part time', to: 'N' }], otherwise: '?' },
        format: text,
      },
    ])
    const rows = [{ Type: ' FULL   time ' }, { Type: 'part time' }, { Type: 'Casual' }, {}]
    expect(buildFile(body, context(), rows).lines).toEqual([['Y'], ['N'], ['?'], ['?']])
  })

  it('adds, subtracts, multiplies by a rate and rounds each part, with other cells', () => {
    const body = withCells([
      { id: 'a1', source: { type: 'employee', key: 'Basic Salary', group: 'column' }, format: whole },
      { id: 'a2', source: { type: 'employee', key: 'Govt Increment', group: 'column' }, format: whole },
      calc('a3', [term({ type: 'cell', id: 'a1' }), term({ type: 'cell', id: 'a2' })]),
      calc('a4', [term({ type: 'cell', id: 'a3' }, { times: '0.045' })]),
      calc('a5', [term({ type: 'number', value: '1000' }), term({ type: 'column', key: 'PAYE' }, { sign: -1, round: 'whole' })]),
    ])
    const [line] = buildFile(body, context(), [{ 'Basic Salary': 17110, 'Govt Increment': 635, PAYE: 907.69 }]).lines
    expect(line).toEqual(['17110', '635', '17745', '799', '92'])
  })

  it('reports a cell that refers to itself, a loop, and a cell that is not there', () => {
    const body = withCells([
      calc('a1', [term({ type: 'cell', id: 'a1' })]),
      calc('a2', [term({ type: 'cell', id: 'a3' })]),
      calc('a3', [term({ type: 'cell', id: 'a2' })]),
      calc('a4', [term({ type: 'cell', id: 'nope' })]),
    ])
    expect(templateProblems(body).map((problem) => [problem.cell, problem.kind])).toEqual([
      ['A1', 'self-reference'],
      ['B1', 'loop'],
      ['C1', 'loop'],
      ['D1', 'unknown-cell'],
    ])
    expect(buildFile(body, context(), [{}]).lines).toEqual([['', '', '', '']])
  })

  it('an employer cell cannot use an employee cell', () => {
    const body = templateBodySchema.parse({
      ...csg(),
      width: 1,
      rows: [
        { kind: 'employer', cells: [calc('m1', [term({ type: 'cell', id: 'e1' })])] },
        { kind: 'employee', cells: [{ id: 'e1', source: { type: 'fixed', value: '1' }, format: text }] },
      ],
    })
    expect(templateProblems(body).map((problem) => problem.kind)).toEqual(['employee-cell-in-employer-row'])
  })

  it('a text that is not a number, in a calculation, is reported and the cell left empty', () => {
    const body = withCells([calc('a1', [term({ type: 'column', key: 'PAYE' })])])
    const built = buildFile(body, context(), [{ PAYE: '1,000' }])
    expect(built.lines).toEqual([['']])
    expect(built.problems).toEqual([{ cell: 'A1', heading: '', employee: 0, kind: 'not-a-number' }])
  })

  it('a missing value is 0 in a calculation and in a number, empty in a text', () => {
    const body = withCells([
      calc('a1', [term({ type: 'column', key: 'Missing' })]),
      { id: 'a2', source: { type: 'employee', key: 'Missing', group: 'column' }, format: whole },
      { id: 'a3', source: { type: 'employee', key: 'Missing', group: 'identity' }, format: text },
    ])
    expect(buildFile(body, context(), [{}]).lines).toEqual([['0', '0', '']])
  })

  it('leaves out an employee when the chosen column is 0 or empty, and the column is chosen per template', () => {
    const body = { ...withCells([{ id: 'a1', source: { type: 'employee', key: 'ID', group: 'identity' }, format: text }] as Cell[]), noPay: { key: 'Emoluments' } }
    const rows = [{ ID: 'A', Emoluments: 1 }, { ID: 'B', Emoluments: 0 }, { ID: 'C' }, { ID: 'D', Emoluments: '' }, { ID: 'E', Emoluments: '0.00' }]
    expect(buildFile(body, context(), rows).lines).toEqual([['A']])
    expect(buildFile({ ...body, noPay: null }, context(), rows).lines).toHaveLength(5)
  })
})

describe('the template format', () => {
  it('refuses two employer rows, two employee rows, a row wider than the template and an unknown key', () => {
    const body = csg()
    const employer = body.rows[2]
    expect(templateBodySchema.safeParse({ ...body, rows: [...body.rows, employer] }).success).toBe(false)
    expect(templateBodySchema.safeParse({ ...body, rows: [...body.rows, body.rows[4]] }).success).toBe(false)
    expect(templateBodySchema.safeParse({ ...body, width: 3 }).success).toBe(false)
    expect(templateBodySchema.safeParse({ ...body, extra: 1 }).success).toBe(false)
    expect(templateBodySchema.safeParse(body).success).toBe(true)
  })

  it('allows at most 20 parts in a calculation, and only exact decimal rates', () => {
    const body = csg()
    const row = body.rows[4]
    if (row.kind !== 'employee') throw new Error('layout')
    const part = { sign: 1, of: { type: 'number', value: '1' }, times: null, round: 'none' }
    row.cells[5] = { id: 'e5', source: { type: 'calc', terms: Array(21).fill(part) }, format: { type: 'number', decimals: 0, width: 0 } } as Cell
    expect(templateBodySchema.safeParse(body).success).toBe(false)
    row.cells[5] = { id: 'e5', source: { type: 'calc', terms: [{ ...part, times: '4.5%' }] }, format: { type: 'number', decimals: 0, width: 0 } } as Cell
    expect(templateBodySchema.safeParse(body).success).toBe(false)
  })

  it('survives being stored as JSON and read back', () => {
    const body = csg()
    expect(templateBodySchema.parse(JSON.parse(JSON.stringify(body)))).toEqual(body)
  })
})
