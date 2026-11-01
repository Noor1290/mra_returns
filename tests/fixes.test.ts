// The fixes from the MRA rehearsal (November 2026). P1: a value the file cannot hold is named by
// employee and column, and fixed in the file only by choice. P4: the total is the exact sum rounded
// once, the contribution is worked out from that total, and a line whose rounded parts miss the
// total is listed. P7: only Required cells warn about MRA details. P8: a Payroll column starts as
// a whole-rupee number. P11: a month not approved is said, and never stops anything. Fake values only.
import { describe, expect, it } from 'vitest'
import { prgfEmployeeCells, standardTemplate, withRequired } from '../src/data/mraLayouts'
import { missingDetails, type BatchTemplate } from '../src/lib/batch'
import { writeCsv } from '../src/lib/csvFile'
import { buildFile, type FileContext } from '../src/lib/evaluate'
import { batchZip, downloadChecks, hasChecks, reportLines, unwritableLines } from '../src/lib/report'
import { fileBytes, makeReturnFile } from '../src/lib/returnFile'
import { isDraft, runSchema, type SavedRun } from '../src/lib/runStore'
import { defaultFormat, formatFor, NO_OWN_VALUES, templateBodySchema, type Cell, type TemplateBody } from '../src/lib/template'
import { fixedText } from '../src/lib/unwritable'
import { ABC } from './fixtures/fakeCompany'
import { readZip } from './lib/readZip'

const context: FileContext = {
  company: { name: 'ABC Co Ltd', brn: 'C1', address: '', ern: '', telephone: '', mobile: '', declarant: '', email: '' },
  period: '2026-08',
  own: NO_OWN_VALUES,
}
const text = { type: 'text', capitals: false, tidy: false } as const
const capitals = { type: 'text', capitals: true, tidy: false } as const
const whole = { type: 'number', decimals: 0, width: 0 } as const
const windows = { encoding: 'windows-1252', separator: ',' } as const

const withCells = (headings: string[], cells: Cell[], settings = {}): TemplateBody => {
  const base = standardTemplate('prgf')
  return templateBodySchema.parse({
    ...base,
    width: cells.length,
    rows: [
      { kind: 'copy', cells: headings },
      { kind: 'employee', cells },
    ],
    settings: { ...base.settings, ...settings },
    noPay: null,
  })
}

const NAMES = withCells(
  ['Employee ID', 'Surname', 'Other names'],
  [
    { id: 'a1', source: { type: 'employee', key: 'ID', group: 'identity' }, format: text },
    { id: 'a2', source: { type: 'employee', key: 'Surname', group: 'identity' }, format: capitals },
    { id: 'a3', source: { type: 'employee', key: 'Other names', group: 'identity' }, format: text },
  ],
)
const namesFile = (rows: Record<string, unknown>[], body = NAMES) => makeReturnFile(body, NO_OWN_VALUES, ABC, '2026-08', rows)

describe('P1: fixing a value in the file only', () => {
  it('writes a comma as one space, and a character as its plain letter', () => {
    expect(fixedText('Paul, Jr', true, windows)).toBe('Paul Jr')
    expect(fixedText('Paul,Jr', true, windows)).toBe('Paul Jr')
    expect(fixedText('Paul,', true, windows)).toBe('Paul')
    expect(fixedText('A , , B', true, windows)).toBe('A B')
    expect(fixedText('Say "hi"', true, windows)).toBe('Say hi')
    expect(fixedText('Line\r\nbreak', true, windows)).toBe('Line break')
    expect(fixedText('MIHAI\u0218OR', false, windows)).toBe('MIHAISOR')
    expect(fixedText('Mihai\u0219or \u021bar\u0103', false, windows)).toBe('Mihaisor tara')
    expect(fixedText('\u0141ukasz', false, windows)).toBe('Lukasz')
  })

  it('keeps what the encoding can hold, and has no answer for a character with no plain letter', () => {
    expect(fixedText('Ren\u00e9e No\u00eblle', false, windows)).toBe('Ren\u00e9e No\u00eblle')
    expect(fixedText('Wei \u738b', false, windows)).toBeNull()
  })

  it('names the employee and the column, and shows what would be written', () => {
    const file = namesFile([
      { ID: 'X0000000000001', Surname: 'Doe', 'Other names': 'Jane' },
      { ID: 'X0000000000002', Surname: 'Roe', 'Other names': 'Paul, Jr' },
      { ID: 'X0000000000003', Surname: 'Mihai\u0219or', 'Other names': 'Alex' },
    ])
    expect(unwritableLines(file, [{ ID: 'X0000000000001', Surname: 'Doe' }, { ID: 'X0000000000002', Surname: 'Roe', 'Other names': 'Paul, Jr' }, { ID: 'X0000000000003', Surname: 'Mihai\u0219or', 'Other names': 'Alex' }])).toEqual([
      'Roe Paul, Jr (ID X0000000000002, row 2), Other names: Paul, Jr \u2192 Paul Jr',
      'Mihai\u0219or Alex (ID X0000000000003, row 3), Surname: Mihai\u0219or \u2192 MIHAISOR',
    ])
    expect(unwritableLines(file, []).join()).not.toMatch(/Line \d|field \d/)
  })

  it('one value with a comma and a character is one case', () => {
    const file = namesFile([{ ID: 'X1', Surname: 'Doe', 'Other names': 'Ana, Mihai\u0219or' }])
    expect(file.unwritable).toHaveLength(1)
    expect(file.unwritable[0].to).toBe('Ana Mihaisor')
  })

  it('the fixed file has the right number of fields and no question mark; the plain one is not the one sent', () => {
    const file = namesFile([{ ID: 'X1', Surname: 'Mihai\u0219or', 'Other names': 'Paul, Jr' }])
    expect(new TextDecoder().decode(file.bytes)).toContain('MIHAI?OR,Paul, Jr')
    expect(new TextDecoder().decode(fileBytes(file))).toBe('Employee ID,Surname,Other names\r\nX1,MIHAISOR,Paul Jr\r\n')
    expect(file.fixedBytes).toBe(fileBytes(file))
    expect(writeCsv(new TextDecoder().decode(fileBytes(file)).trim().split('\r\n').map((line) => line.split(',')), 3, NAMES.settings).problems).toEqual([])
  })

  it('a value with no plain letter cannot be fixed: only Go back is left', () => {
    const file = namesFile([{ ID: 'X1', Surname: 'Doe', 'Other names': 'Wei \u738b' }])
    expect(file.fixedBytes).toBeNull()
    const checks = downloadChecks([{ title: 'ABC Co Ltd, MRA PRGF', file, employees: [{ ID: 'X1', Surname: 'Doe' }] }])
    expect(checks.canFix).toBe(false)
    expect(checks.unwritable[0].lines).toEqual(['Doe (ID X1, row 1), Other names: Wei \u738b has a character with no plain letter.'])
  })

  it('names the company for a value in the employer row', () => {
    const body = templateBodySchema.parse({
      ...withCells(['Employer Name'], [{ id: 'a1', source: { type: 'company', field: 'name' }, format: text }]),
      rows: [
        { kind: 'copy', cells: ['Employer Name'] },
        { kind: 'employer', cells: [{ id: 'a1', source: { type: 'company', field: 'name' }, format: text }] },
      ],
    })
    const file = makeReturnFile(body, NO_OWN_VALUES, { ...ABC, name: 'ABC, Co Ltd' }, '2026-08', [])
    expect(unwritableLines(file, [])).toEqual(['Employer row, Employer Name: ABC, Co Ltd \u2192 ABC Co Ltd'])
  })

  it('leaves a clean file, and a file with quotes when needed, alone', () => {
    expect(namesFile([{ ID: 'X1', Surname: 'Doe', 'Other names': 'Jane' }]).unwritable).toEqual([])
    const quoted = withCells(['Other names'], [{ id: 'a1', source: { type: 'employee', key: 'Other names', group: 'identity' }, format: text }], { quotes: 'needed' })
    const file = namesFile([{ 'Other names': 'Paul, Jr' }], quoted)
    expect(file.unwritable).toEqual([])
    expect(hasChecks(downloadChecks([{ title: 'x', file, employees: [] }]))).toBe(false)
  })
})

/** The PRGF cells the way the standard layout sets them, with a test's figures. */
const prgf = (basic: number, allowances: number) => {
  const body = standardTemplate('prgf')
  const built = buildFile(body, context, [{ ID: 'X1', Surname: 'DOE', 'Other names': 'JANE', 'New Basic Salary': basic, Allowances: allowances, 'Gross Pay': basic + allowances }])
  const line = built.lines.at(-1)!
  return { basic: line[6], allowances: line[7], total: line[9], prgf: line[10], built }
}

describe('P4: PRGF with cents', () => {
  it('the total is the exact sum of its parts, rounded once', () => {
    expect(prgf(21000.5, 1000.5)).toMatchObject({ total: '22001' })
    expect(prgf(20000.5, 1000.5)).toMatchObject({ total: '21001' })
  })

  it('the contribution is worked out from the total in the same line', () => {
    expect(prgf(18099.9, 0)).toMatchObject({ total: '18100', prgf: '815' })
    expect(prgf(20000.5, 1000.5)).toMatchObject({ total: '21001', prgf: '945' })
  })

  it('stays as it was for whole-rupee pay', () => {
    expect(prgf(18750, 0)).toMatchObject({ basic: '18750', allowances: '0', total: '18750', prgf: '844' })
  })

  it('"round each part" still rounds each part: both can be said in a template', () => {
    const cells: Cell[] = [
      { id: 'a1', source: { type: 'employee', key: 'A', group: 'column' }, format: whole },
      { id: 'a2', source: { type: 'employee', key: 'B', group: 'column' }, format: whole },
      {
        id: 'a3',
        source: {
          type: 'calc',
          terms: [
            { sign: 1, of: { type: 'cell', id: 'a1' }, times: null, round: 'none' },
            { sign: 1, of: { type: 'cell', id: 'a2' }, times: null, round: 'none' },
          ],
        },
        format: whole,
      },
      {
        id: 'a4',
        source: {
          type: 'calc',
          terms: [
            { sign: 1, of: { type: 'column', key: 'A' }, times: null, round: 'whole' },
            { sign: 1, of: { type: 'column', key: 'B' }, times: null, round: 'whole' },
          ],
        },
        format: whole,
      },
      {
        id: 'a5',
        source: {
          type: 'calc',
          once: true,
          terms: [
            { sign: 1, of: { type: 'cell', id: 'a1' }, times: null, round: 'none' },
            // Rounding a part means nothing when the total is rounded once.
            { sign: 1, of: { type: 'cell', id: 'a2' }, times: null, round: 'whole' },
          ],
        },
        format: whole,
      },
    ]
    const body = withCells(['A', 'B', 'As written', 'Each part', 'Once'], cells)
    expect(buildFile(body, context, [{ A: 20000.5, B: 1000.5 }]).lines.at(-1)).toEqual(['20001', '1001', '21002', '21002', '21001'])
  })

  it('a template saved before keeps working, and "once" survives being read back', () => {
    const body = standardTemplate('prgf')
    expect(templateBodySchema.parse(JSON.parse(JSON.stringify(body)))).toEqual(body)
    expect(prgfEmployeeCells()[9]!.source).toMatchObject({ type: 'calc', once: true })
    const old = JSON.parse(JSON.stringify(body).replace('"once":true', '"unused":0').replace(',"unused":0', ''))
    expect(templateBodySchema.safeParse(old).success).toBe(true)
  })
})

describe('P4: the lines whose rounded parts do not add up to the total', () => {
  it('lists the line, with the parts, what they make and the total', () => {
    const { built } = prgf(20000.5, 1000.5)
    expect(built.sumNotes).toEqual([
      {
        employee: 0,
        cell: 'J5',
        heading: 'Total Remuneration on which PRGF contribution amount is calculated (MUR) (MUR)',
        parts: [
          { sign: 1, text: '20001' },
          { sign: 1, text: '1001' },
          { sign: 1, text: '0' },
        ],
        sum: '21002',
        total: '21001',
      },
    ])
  })

  it('says nothing when they agree', () => {
    expect(prgf(21000.2, 1000.1).built.sumNotes).toEqual([])
    expect(prgf(18099.9, 0).built.sumNotes).toEqual([])
    expect(prgf(18750, 0).built.sumNotes).toEqual([])
  })

  it('does not list the CSG cells rounded part by part on purpose', () => {
    const built = buildFile(standardTemplate('csg'), context, [{ ID: 'X1', Surname: 'DOE', Emoluments: 100, 'Gross Pay': 100, 'Employee CSG': 278.19, CSG: 556.38, 'Employee NSF': 187.5, NSF: 468.75 }])
    expect(built.sumNotes).toEqual([])
  })

  it('counts a part to subtract', () => {
    const body = withCells(
      ['A'],
      [
        {
          id: 'a1',
          source: {
            type: 'calc',
            once: true,
            terms: [
              { sign: 1, of: { type: 'column', key: 'A' }, times: null, round: 'none' },
              { sign: -1, of: { type: 'column', key: 'B' }, times: null, round: 'none' },
            ],
          },
          format: whole,
        },
      ],
    )
    expect(buildFile(body, context, [{ A: 100.5, B: 1.4 }]).sumNotes[0]).toMatchObject({
      parts: [
        { sign: 1, text: '101' },
        { sign: -1, text: '1' },
      ],
      sum: '100',
      total: '99',
    })
  })

  it('goes in the step before the download', () => {
    const file = makeReturnFile(standardTemplate('prgf'), NO_OWN_VALUES, ABC, '2026-08', [{ ID: 'X1', Surname: 'DOE', 'Other names': 'JANE', 'New Basic Salary': 20000.5, Allowances: 1000.5, 'Gross Pay': 21001 }])
    const checks = downloadChecks([{ title: 'ABC Co Ltd, MRA PRGF', file, employees: [{ ID: 'X1', Surname: 'DOE', 'Other names': 'JANE' }] }])
    expect(hasChecks(checks)).toBe(true)
    expect(checks.sums).toEqual([
      {
        title: 'ABC Co Ltd, MRA PRGF',
        lines: ['DOE JANE (ID X1, row 1): J5 (Total Remuneration on which PRGF contribution amount is calculated (MUR) (MUR)): the rounded parts 20001 + 1001 + 0 make 21002, but the total is 21001.'],
      },
    ])
  })
})

const company = (run: Partial<SavedRun>): SavedRun => ({ brn: ABC.brn, name: ABC.name, address: null, period: '2026-08', run: true, employees: [], mra: ABC.mra, email: ABC.email, templates: [], ...run })
const template = (name: string, body: TemplateBody): BatchTemplate => ({ template_id: '00000000-0000-4000-8000-000000000001', name, body })

describe('P1, P4 and P11 in the report and the zip', () => {
  const employees = [{ ID: 'X1', Surname: 'Doe', 'Other names': 'Paul, Jr', 'New Basic Salary': 20000.5, Allowances: 1000.5, 'Gross Pay': 21001 }]
  const body = standardTemplate('prgf')
  const run = company({ status: 'draft', employees })
  const file = makeReturnFile(body, NO_OWN_VALUES, run, '2026-08', employees)
  const result = {
    period: '2026-08',
    at: new Date(2026, 10, 1, 9, 0),
    companies: [{ brn: ABC.brn, name: ABC.name, failure: null, run, missingDetails: [], files: [{ template: template('MRA PRGF', body), made: true as const, file, path: 'MRA PRGF/PRGF.csv' }] }],
  }

  it('Report.txt says the month is not approved, what was fixed, and which lines do not add up', () => {
    const lines = reportLines(result)
    expect(lines).toContain('  August 2026 isn\'t approved in the dashboard for ABC Co Ltd.')
    expect(lines).toContain('    Fixed in this file only (the payroll is not changed):')
    expect(lines).toContain('      Doe Paul, Jr (ID X1, row 1), Other Names of Employee: Paul, Jr \u2192 PAUL JR')
    expect(lines).toContain("    Lines where the rounded parts don't add up to the total (check them before uploading):")
    expect(lines.join('\n')).toContain('the rounded parts 20001 + 1001 + 0 make 21002, but the total is 21001.')
  })

  it('the zip holds the fixed file', () => {
    const entries = readZip(batchZip(result).bytes)
    const csv = new TextDecoder().decode(entries.find((entry) => entry.path.endsWith('.csv'))!.bytes)
    expect(csv).toContain('PAUL JR')
    expect(csv).not.toContain('PAUL, JR')
  })

  it('says nothing about a month that is approved, or when the dashboard does not say', () => {
    for (const status of ['approved', null, undefined] as const) {
      expect(reportLines({ ...result, companies: [{ ...result.companies[0], run: company({ status, employees }) }] }).join()).not.toContain("isn't approved")
    }
  })
})

describe('P11: a month not approved', () => {
  it('is known from what the dashboard sends, and an older dashboard is taken as saying nothing', () => {
    const row = { brn: 'C1', name: 'ABC', address: null, period: '2026-08', run: true, employees: [] }
    expect(isDraft(runSchema.parse({ ...row, status: 'draft' }))).toBe(true)
    expect(isDraft(runSchema.parse({ ...row, status: 'approved' }))).toBe(false)
    expect(isDraft(runSchema.parse(row))).toBe(false)
    expect(isDraft(runSchema.parse({ ...row, run: false, status: null }))).toBe(false)
  })
})

describe('P7: MRA details', () => {
  it('warns only about cells marked Required', () => {
    const run = company({ mra: { ern: '', telephone: '', mobile: '', declarant: 'JANE SAMPLE' } })
    expect(missingDetails([{ body: standardTemplate('csg') }], run)).toEqual([])
    expect(missingDetails([{ body: withRequired(standardTemplate('csg'), ['m0', 'm6']) }], run)).toEqual(['ern'])
  })
})

describe('P8: how a new cell starts', () => {
  it('a Payroll column is a number in whole rupees, half up', () => {
    expect(formatFor({ type: 'employee', key: 'PAYE', group: 'column' })).toEqual({ type: 'number', decimals: 0, width: 0 })
  })

  it('an identity field stays text, and the rest as they were', () => {
    expect(formatFor({ type: 'employee', key: 'ID', group: 'identity' })).toEqual(defaultFormat('employee'))
    expect(formatFor({ type: 'month' })).toEqual({ type: 'date', pattern: 'YYMM' })
    expect(formatFor({ type: 'fixed', value: '' })).toEqual({ type: 'text', capitals: false, tidy: false })
  })
})
