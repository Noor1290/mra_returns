// The start date of employment in the PRGF file (mra-date-fix). The dashboard keeps the date per
// employee, whatever the payroll app called it, and sends it in every run's rows as "Date of
// Employment", YYYY-MM-DD: from an identity field "Date of Employment" of type Date (a), from an
// older Global text column "Date of employment" typed DD/MM/YYYY (b, Payroll System sends it as
// YYYY-MM-DD), from the Data explorer only (c), in a run sent before or after the date column (d).
// The owner's template names it "Date of employment", as the company's setup does: it came out
// empty for everyone. FAKE companies and people only.
import { describe, expect, it } from 'vitest'
import { createFakeHub } from '../scripts/lib/fake-hub.mjs'
import { readyMadeTemplate } from '../src/data/readyMade'
import type { HubPort } from '../src/lib/hubWire'
import { downloadChecks, hasChecks } from '../src/lib/report'
import { makeReturnFile, type ReturnFile } from '../src/lib/returnFile'
import { askForCompanies, loadRun, type SavedRun } from '../src/lib/runStore'
import type { TemplateBody } from '../src/lib/template'

/** The PRGF template with its start date cell (F5) naming the field as given. */
function prgfNaming(key: string): TemplateBody {
  const body = readyMadeTemplate('prgf')
  return {
    ...body,
    rows: body.rows.map((row) =>
      row.kind === 'employee' ? { ...row, cells: row.cells.map((cell) => (cell?.id === 'e5' ? { ...cell, source: { type: 'employee' as const, key, group: 'identity' as const } } : cell)) } : row,
    ),
  }
}

/** The F5 field of each employee line. */
const startDates = (file: ReturnFile) =>
  new TextDecoder('windows-1252')
    .decode(file.bytes)
    .split('\r\n')
    .slice(4)
    .filter((line) => line !== '')
    .map((line) => line.split(',')[5])

/** A run of ABC Co Ltd as the dashboard sends it: one question, one load. */
async function runFromDashboard(change: (employees: Record<string, unknown>[]) => void = () => {}): Promise<SavedRun> {
  const hub = createFakeHub()
  change(hub.state.companies[0].runs['2026-08'])
  const port: HubPort = { send: async (type, payload) => hub.handle(type, payload as { dataType: string }), requestTimeoutMs: 50 }
  await askForCompanies(port, 'C1234567', '2026-08', ['C1234567'])
  const loaded = await loadRun(port, 'C1234567', '2026-08', 'C1234567')
  if (!loaded.ok) throw new Error(loaded.failure.title)
  return loaded.run
}

const make = (body: TemplateBody, run: SavedRun) => makeReturnFile(body, { values: {} }, run, run.period, run.employees)

describe('the start date of employment, as the dashboard sends it', () => {
  it('a, c, d: "Date of Employment" in the rows is written 20200201, by the ready-made template', async () => {
    const run = await runFromDashboard()
    expect(run.employees.every((row) => row['Date of Employment'] === '2020-02-01')).toBe(true)
    expect(startDates(make(readyMadeTemplate('prgf'), run))).toEqual(['20200201', '20200201', '20200201'])
  })

  it('a template naming it "Date of employment", as the setup does, finds it whatever the capitals and spaces', async () => {
    const run = await runFromDashboard()
    for (const key of ['Date of employment', 'date of employment', ' Date  of Employment ']) {
      const file = make(prgfNaming(key), run)
      expect(startDates(file)).toEqual(['20200201', '20200201', '20200201'])
      expect(file.problems).toEqual([])
    }
  })

  it('b: a date typed day first in an older column, under its own name, is read as the payslip app reads it', async () => {
    for (const typed of ['01/02/2020', '1/2/2020', '01-02-2020', '01.02.2020', '2020-02-01']) {
      const run = await runFromDashboard((employees) => {
        for (const row of employees) {
          delete row['Date of Employment']
          row['Date of employment'] = typed
        }
      })
      expect(startDates(make(prgfNaming('Date of employment'), run))).toEqual(['20200201', '20200201', '20200201'])
      expect(startDates(make(readyMadeTemplate('prgf'), run))).toEqual(['20200201', '20200201', '20200201'])
    }
  })

  it('an employee with no date is left empty, and listed only when the cell is Required', async () => {
    const run = await runFromDashboard((employees) => delete employees[1]['Date of Employment'])
    const file = make(readyMadeTemplate('prgf'), run)
    expect(startDates(file)).toEqual(['20200201', '', '20200201'])
    expect(file.problems).toEqual([])
  })
})

describe('a date that is there but cannot be read is never silently empty', () => {
  it('is listed before the download: the company and file, the employee by name and ID, the column, the value', async () => {
    const run = await runFromDashboard((employees) => {
      employees[1]['Date of Employment'] = '31/02/2020'
    })
    const file = make(prgfNaming('Date of employment'), run)
    expect(startDates(file)).toEqual(['20200201', '', '20200201'])
    const checks = downloadChecks([{ title: `${run.name}, MRA PRGF`, file, employees: run.employees }])
    // On its own, with nothing else to show, it still stops the download.
    expect(hasChecks({ ...checks, unwritable: [], required: [], sums: [] })).toBe(true)
    expect(checks.unreadable).toEqual([
      { title: 'ABC Co Ltd, MRA PRGF', lines: ['ROE RICHARD (ID X0000000000002, row 2): F5 (Start Date of Employment) is "31/02/2020", which can\'t be read as a date, so it is left empty.'] },
    ])
  })

  it('is not listed when every date is read', async () => {
    const run = await runFromDashboard()
    const file = make(prgfNaming('Date of employment'), run)
    expect(downloadChecks([{ title: 'ABC Co Ltd, MRA PRGF', file, employees: run.employees }]).unreadable).toEqual([])
  })
})
