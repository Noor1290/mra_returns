// THE PROOF with the owner's own samples: the CSG and PRGF files of August 2026 come out byte for
// byte identical. The samples are real return files, so they are NEVER in this repository: this
// test reads them at run time from the folder next to it (Payroll\MRA_SAMPLES: the two .csv
// files and the payroll workbook whose sheet "August 26" they were made from), and is skipped on
// a machine that does not have them (it says so). Nothing from them is written anywhere.
//
// Two fake companies, each with its own sample's identity data (the samples were altered
// differently) and the same August figures, as the saved run keeps them (2 decimals). The fake
// companies' columns are set up as the files show: employer NSF 2.5 % of New Basic Salary
// capped at 29,710; PRGF 4.5 % worked out in the template.
//
//   1. The file reader and writer: each sample read and written again gives the same bytes.
//   2. The whole template, with the sample's exact texts: the sample uploaded as the template,
//      its cells set up, the figures from the workbook -> the sample, byte for byte.
//   3. The full path through a saved run: names trimmed as the dashboard stores them, the run as
//      mra-batch sends it, checked as the app checks it -> the sample with its names trimmed
//      (which is fine for the MRA, the owner decided).
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { withStandardCells, type Layout } from '../src/data/mraLayouts'
import { readCsv, writeCsv } from '../src/lib/csvFile'
import { fromNumber, multiply, parseDecimal, roundHalfUp, toText } from '../src/lib/decimal'
import { makeReturnFile, type CompanyForFile } from '../src/lib/returnFile'
import { runSchema } from '../src/lib/runStore'
import { templateBodySchema, type OwnValues, type TemplateBody } from '../src/lib/template'
import { readUpload, templateFromUpload } from '../src/lib/upload'
import { readXlsx } from '../src/lib/xlsx'

const folder = resolve(dirname(fileURLToPath(import.meta.url)), '../../MRA_SAMPLES')
const files = existsSync(folder) ? readdirSync(folder) : []
const find = (test: (name: string) => boolean) => files.find(test)
const csgFile = find((name) => /^CSG .*\.csv$/i.test(name))
const prgfFile = find((name) => /^PRGF .*\.csv$/i.test(name))
const workbookFile = find((name) => /\.xlsx$/i.test(name))
const here = csgFile !== undefined && prgfFile !== undefined && workbookFile !== undefined
if (!here) console.log(`samples.test.ts: SKIPPED, the owner's samples are not on this machine (${folder}).`)

const bytesOf = (name: string) => new Uint8Array(readFileSync(join(folder, name)))

/** 2 decimals, half up, as a saved run keeps every figure. */
const twoDecimals = (value: number) => Number(toText(roundHalfUp(fromNumber(value)!, 2)))
/** The fake companies' employer NSF: 2.5 % of New Basic Salary, capped at 29,710. */
const employerNsf = (newBasic: number) => Number(toText(roundHalfUp(multiply(fromNumber(Math.min(newBasic, 29710))!, parseDecimal('0.025')!)!, 2)))

/** The August figures of the workbook, one row per employee, in the sheet's order. */
async function augustFigures() {
  const sheet = await readXlsx(bytesOf(workbookFile!), 'August 26')
  const heading = sheet.findIndex((row) => row[0] === 'Id')
  const rows = sheet.slice(heading + 1).filter((row) => /^[A-Z]\d+$/.test((row[0] ?? '').trim()))
  const n = (row: string[], column: number) => (row[column] === '' || row[column] === undefined ? 0 : twoDecimals(Number(row[column])))
  return rows.map((row) => ({
    type: row[3],
    'Basic Salary': n(row, 4),
    'Govt Increment': n(row, 5),
    'New Basic Salary': n(row, 6),
    Allowances: n(row, 7),
    Emoluments: n(row, 8),
    Travelling: n(row, 9),
    'Gross Pay': n(row, 10),
    'Employee CSG': n(row, 11),
    'Employee NSF': n(row, 12),
    PAYE: n(row, 13),
    CSG: n(row, 16),
    NSF: employerNsf(n(row, 6)),
  }))
}

/** A sample's own identity data: the employer line and each employee's ID and names. */
function identityOf(sample: Uint8Array, layout: Layout) {
  const { rows } = readCsv(sample)
  const [ern, brn, name, period, telephone, mobile, declarant, email] = rows[2]
  const employees = rows.slice(4).map((row) => ({
    ID: row[0],
    Surname: row[1],
    'Other names': row[2],
    ...(layout === 'prgf' ? { 'Date of Employment': `${row[5].slice(0, 4)}-${row[5].slice(4, 6)}-${row[5].slice(6, 8)}` } : {}),
  }))
  return { ern, brn, name, period: `20${period.slice(0, 2)}-${period.slice(2, 4)}`, telephone, mobile, declarant, email, employees }
}

/**
 * The sample uploaded as the template, its cells set up, stored as JSON and read back. In the
 * PRGF one, the email is a fixed value for this company only (its sample has its own address).
 */
async function templateOf(sample: Uint8Array, name: string, layout: Layout, email: string): Promise<{ body: TemplateBody; own: OwnValues }> {
  const upload = await readUpload(name, sample)
  let body = withStandardCells(templateFromUpload(upload, upload.kinds), layout)
  let own: OwnValues = { values: {} }
  if (layout === 'prgf') {
    body = {
      ...body,
      rows: body.rows.map((row) =>
        row.kind === 'employer' ? { ...row, cells: row.cells.map((cell) => (cell?.id === 'm7' ? { ...cell, source: { type: 'fixed' as const, value: '' } } : cell)) } : row,
      ),
    }
    own = { values: { m7: email } }
  }
  return { body: templateBodySchema.parse(JSON.parse(JSON.stringify(body))), own }
}

async function companyOf(layout: Layout, trimmed: boolean) {
  const sample = bytesOf(layout === 'csg' ? csgFile! : prgfFile!)
  const identity = identityOf(sample, layout)
  const figures = await augustFigures()
  expect(figures).toHaveLength(identity.employees.length)
  const trim = (text: string) => (trimmed ? text.trim() : text)
  const employees = identity.employees.map((person, index) => ({
    ...Object.fromEntries(Object.entries(person).map(([key, value]) => [key, trim(value)])),
    'Full time / Part time': trim(figures[index].type),
    ...Object.fromEntries(Object.entries(figures[index]).filter(([key]) => key !== 'type')),
    'Company Name': identity.name,
    BRN: identity.brn,
  }))
  const company: CompanyForFile = {
    name: identity.name,
    brn: identity.brn,
    address: null,
    mra: { ern: identity.ern, telephone: identity.telephone, mobile: identity.mobile, declarant: identity.declarant },
    // The user's own email: the CSG template uses it; the PRGF one has its company's own.
    email: layout === 'csg' ? identity.email : 'someone.else@example.org',
  }
  return { sample, identity, employees, company }
}

describe.runIf(here)("the owner's samples, byte for byte", () => {
  it('1. the reader and writer give each sample back exactly (encoding, CRLF, padding, spaces)', () => {
    for (const name of [csgFile!, prgfFile!]) {
      const sample = bytesOf(name)
      const read = readCsv(sample)
      expect(read).toMatchObject({ encoding: 'windows-1252', lineEnding: 'crlf', separator: ',', quotes: 'never', pad: true })
      expect([...writeCsv(read.rows, read.rows[0].length, read).bytes]).toEqual([...sample])
    }
  })

  for (const layout of ['csg', 'prgf'] as const) {
    it(`2. ${layout.toUpperCase()}: the template made from the sample, with its exact texts, gives the sample byte for byte`, async () => {
      const { sample, identity, employees, company } = await companyOf(layout, false)
      const { body, own } = await templateOf(sample, layout === 'csg' ? csgFile! : prgfFile!, layout, identity.email)
      const file = makeReturnFile(body, own, company, identity.period, employees)
      expect(file.problems).toEqual([])
      expect(file.writeProblems).toEqual([])
      expect(file.built.leftOut).toEqual([])
      expect(file.bytes.length).toBe(sample.length)
      expect(Buffer.from(file.bytes).equals(Buffer.from(sample))).toBe(true)
    })

    it(`3. ${layout.toUpperCase()}: through a saved run, names trimmed, gives the sample with its names trimmed`, async () => {
      const { sample, identity, employees, company } = await companyOf(layout, true)
      const { body, own } = await templateOf(sample, layout === 'csg' ? csgFile! : prgfFile!, layout, identity.email)
      // As the dashboard sends it, and as the app checks it.
      const answer = runSchema.parse(
        JSON.parse(
          JSON.stringify({
            brn: company.brn,
            name: company.name,
            address: null,
            period: identity.period,
            run: true,
            employees,
            mra: company.mra,
            email: company.email,
            templates: [{ template_id: '60000000-0000-4000-8000-000000000001', own_values: own, values_revision: 1 }],
          }),
        ),
      )
      const file = makeReturnFile(body, own, { ...answer, mra: answer.mra, email: answer.email }, answer.period, answer.employees)
      const read = readCsv(sample)
      const expected = read.rows.map((row, line) => (line >= 4 ? row.map((field, column) => (column <= 2 ? field.trim() : field)) : row))
      expect([...file.bytes]).toEqual([...writeCsv(expected, read.rows[0].length, read).bytes])
      expect(file.fileName).toBe(`${layout.toUpperCase()} AUGUST 2026 ${identity.name.toUpperCase()}.csv`)
    })
  }

  it('lists the rows whose values end in exactly .50 before rounding (the double rounding note)', async () => {
    const { sample, identity, employees, company } = await companyOf('csg', true)
    const { body, own } = await templateOf(sample, csgFile!, 'csg', identity.email)
    const file = makeReturnFile(body, own, company, identity.period, employees)
    // Every note is a saved value that ends in .50, used in a cell rounded to whole rupees.
    expect(file.built.halfNotes.length).toBeGreaterThan(0)
    for (const note of file.built.halfNotes) expect(toText(note.value)).toMatch(/\.5$/)
  })
})
