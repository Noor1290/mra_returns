// Several companies at once (Stage 2): ONE question for the month and every company, then one
// company at a time; one zip with a folder per template, ONE file per company in each, byte for
// byte the file that company's single download gives; companies with a problem skipped with the
// reason, the others still made; the report (made, skipped and why, required values, MRA details
// missing, the .50 list) on screen and as Report.txt. Fake companies and values only.
import { describe, expect, it } from 'vitest'
import { createFakeHub } from '../scripts/lib/fake-hub.mjs'
import { demoTemplate, standardTemplate } from '../src/data/mraLayouts'
import { runBatch, type BatchSource, type BatchTemplate, type Progress } from '../src/lib/batch'
import { fileNameFor } from '../src/lib/fileName'
import { failure, type HubPort } from '../src/lib/hubWire'
import { batchZip, reportLines } from '../src/lib/report'
import { makeReturnFile } from '../src/lib/returnFile'
import { hubBatchSource, openProfile, type SavedRun } from '../src/lib/runStore'
import { NO_OWN_VALUES, readOwnValues } from '../src/lib/template'
import { ABC, cp1252Bytes, EXPECTED_CSG, EXPECTED_PRGF, FAKE_EMPLOYEES } from './fixtures/fakeCompany'
import { readZip } from './lib/readZip'

const CSG_ID = '00000000-0000-4000-8000-00000000c560'
const PRGF_ID = '00000000-0000-4000-8000-0000000097f0'
// The standard layouts; the CSG one with the ERN, declarant, ID and surname required.
const CSG: BatchTemplate = { template_id: CSG_ID, name: 'MRA CSG (PACO)', body: demoTemplate('csg') }
const PRGF: BatchTemplate = { template_id: PRGF_ID, name: 'MRA PRGF', body: standardTemplate('prgf') }
const link = (template_id: string, own_values: unknown = {}) => ({ template_id, own_values, values_revision: 1 })

const abcRun: SavedRun = { brn: ABC.brn, name: ABC.name, address: ABC.address, period: '2026-08', run: true, employees: FAKE_EMPLOYEES, mra: ABC.mra, email: ABC.email, templates: [link(CSG_ID), link(PRGF_ID)] }
// DEF Ltd: MRA details not filled in, one employee with no surname, uses the CSG template only,
// with its own value for the frequency cell (I5).
const defRun: SavedRun = {
  brn: 'C3333333',
  name: 'DEF Ltd',
  address: null,
  period: '2026-08',
  run: true,
  employees: [FAKE_EMPLOYEES[0], { ...FAKE_EMPLOYEES[1], Surname: '' }],
  mra: { ern: '', telephone: '', mobile: '', declarant: '' },
  email: ABC.email,
  templates: [link(CSG_ID, { values: { e8: '2' } })],
}
// GHI Ltd: the month was never sent to the dashboard.
const ghiRun: SavedRun = { ...defRun, brn: 'C4444444', name: 'GHI Ltd', run: false, employees: [], mra: ABC.mra, templates: [link(CSG_ID), link(PRGF_ID)] }

const COMPANIES = [
  { brn: 'C1234567', name: 'ABC Co Ltd' },
  { brn: 'C3333333', name: 'DEF Ltd' },
  { brn: 'C4444444', name: 'GHI Ltd' },
  // The dashboard refuses its run (no longer its admin when it is read).
  { brn: 'C5555555', name: 'JKL Ltd' },
  // Left out of the dashboard's answer to the question.
  { brn: 'C6666666', name: 'MNO Ltd' },
]

/** A stand-in for the dashboard: what it allows, and each company's run. */
function fakeSource(runs: SavedRun[] = [abcRun, defRun, ghiRun]) {
  const calls: string[] = []
  const source: BatchSource = {
    async ask(period, brns) {
      calls.push(`ask ${period} ${brns.join(' ')}`)
      return { ok: true, companies: brns.filter((brn) => brn !== 'C6666666').map((brn) => ({ brn, name: brn })) }
    },
    async load(period, brn) {
      calls.push(`load ${brn}`)
      const run = runs.find((one) => one.brn === brn)
      return run ? { ok: true, run: { ...run, period } } : { ok: false, failure: failure('forbidden', 'Only an admin of that company can make its MRA returns.') }
    },
  }
  return { source, calls }
}

const AT = new Date(2026, 9, 29, 14, 5, 0)
async function batch(source: BatchSource, companies = COMPANIES, templates = [CSG, PRGF]) {
  const progress: Progress[] = []
  const answer = await runBatch(source, { period: '2026-08', templates, companies }, (one) => progress.push(one), () => AT)
  if (!answer.ok) throw new Error(answer.failure.title)
  return { result: answer.result, progress }
}

describe('several companies in one zip', () => {
  it('asks ONCE for every company, then reads them one at a time, saying which', async () => {
    const { source, calls } = fakeSource()
    const { progress } = await batch(source)
    expect(calls).toEqual(['ask 2026-08 C1234567 C3333333 C4444444 C5555555 C6666666', 'load C1234567', 'load C3333333', 'load C4444444', 'load C5555555'])
    expect(progress.map((one) => `Company ${one.number} of ${one.total}: ${one.name}`)).toEqual([
      'Company 1 of 5: ABC Co Ltd',
      'Company 2 of 5: DEF Ltd',
      'Company 3 of 5: GHI Ltd',
      'Company 4 of 5: JKL Ltd',
      'Company 5 of 5: MNO Ltd',
    ])
  })

  it('has one folder per template, named after it, with ONE file per company, and the report', async () => {
    const { result } = await batch(fakeSource().source)
    const zip = batchZip(result)
    expect(zip.fileName).toBe('MRA AUGUST 2026.zip')
    const entries = readZip(zip.bytes)
    expect(entries.map((entry) => entry.path)).toEqual([
      'MRA CSG (PACO)/',
      'MRA CSG (PACO)/CSG AUGUST 2026 ABC CO LTD.csv',
      'MRA PRGF/',
      'MRA PRGF/PRGF AUGUST 2026 ABC CO LTD.csv',
      'MRA CSG (PACO)/CSG AUGUST 2026 DEF LTD.csv',
      'Report.txt',
    ])
    expect(entries.every((entry) => entry.utf8)).toBe(true)
    expect(entries.filter((entry) => entry.folder).map((entry) => entry.path)).toEqual(['MRA CSG (PACO)/', 'MRA PRGF/'])
    // Never several companies in one file: each file has one employer line, of its company.
    const csv = (path: string) => new TextDecoder('latin1').decode(entries.find((entry) => entry.path === path)!.bytes)
    expect(csv('MRA CSG (PACO)/CSG AUGUST 2026 DEF LTD.csv').split('\r\n')[2]).toBe(`,C3333333,DEF LTD,2608,,,,returns@example.org${','.repeat(11)}`)
    expect(csv('MRA CSG (PACO)/CSG AUGUST 2026 DEF LTD.csv')).not.toContain('C1234567')
    expect(csv('MRA CSG (PACO)/CSG AUGUST 2026 ABC CO LTD.csv')).not.toContain('C3333333')
  })

  it("keeps each company's file byte for byte the file its single download gives", async () => {
    const { result } = await batch(fakeSource().source)
    const entries = readZip(batchZip(result).bytes)
    const bytesAt = (path: string) => [...entries.find((entry) => entry.path === path)!.bytes]
    const single = (template: BatchTemplate, run: SavedRun, own: unknown) => [...makeReturnFile(template.body, readOwnValues(own), run, '2026-08', run.employees).bytes]
    expect(bytesAt('MRA CSG (PACO)/CSG AUGUST 2026 ABC CO LTD.csv')).toEqual(single(CSG, abcRun, {}))
    expect(bytesAt('MRA PRGF/PRGF AUGUST 2026 ABC CO LTD.csv')).toEqual(single(PRGF, abcRun, {}))
    // DEF's own value for I5 is in its file, as in its single download.
    expect(bytesAt('MRA CSG (PACO)/CSG AUGUST 2026 DEF LTD.csv')).toEqual(single(CSG, defRun, { values: { e8: '2' } }))
    expect(new TextDecoder('latin1').decode(Uint8Array.from(bytesAt('MRA CSG (PACO)/CSG AUGUST 2026 DEF LTD.csv'))).split('\r\n')[4]).toMatch(/^X0000000000001,DOE,JANE ANN,18750,0,18750,S,M,2,/)
    // And still exactly the MRA format.
    expect(bytesAt('MRA CSG (PACO)/CSG AUGUST 2026 ABC CO LTD.csv')).toEqual([...cp1252Bytes(EXPECTED_CSG)])
    expect(bytesAt('MRA PRGF/PRGF AUGUST 2026 ABC CO LTD.csv')).toEqual([...cp1252Bytes(EXPECTED_PRGF)])
    expect(single(CSG, abcRun, {})).toEqual([...makeReturnFile(standardTemplate('csg'), NO_OWN_VALUES, ABC, '2026-08', FAKE_EMPLOYEES).bytes])
  })

  it('skips a company with a problem, says why, and still makes the others', async () => {
    const { result } = await batch(fakeSource().source)
    const outcome = (brn: string) => result.companies.find((company) => company.brn === brn)!.files.map((file) => (file.made ? `${file.template.name}: made` : `${file.template.name}: ${file.reason}`))
    expect(outcome('C1234567')).toEqual(['MRA CSG (PACO): made', 'MRA PRGF: made'])
    expect(outcome('C3333333')).toEqual(['MRA CSG (PACO): made', 'MRA PRGF: not-used'])
    expect(outcome('C4444444')).toEqual(['MRA CSG (PACO): no-run', 'MRA PRGF: no-run'])
    expect(outcome('C5555555')).toEqual(['MRA CSG (PACO): refused', 'MRA PRGF: refused'])
    expect(outcome('C6666666')).toEqual(['MRA CSG (PACO): not-allowed', 'MRA PRGF: not-allowed'])
    expect(result.companies.find((company) => company.brn === 'C5555555')!.failure).toMatchObject({ kind: 'forbidden' })
    // Only the templates ticked are made: PRGF alone.
    const prgfOnly = await batch(fakeSource().source, COMPANIES.slice(0, 2), [PRGF])
    expect(readZip(batchZip(prgfOnly.result).bytes).map((entry) => entry.path)).toEqual(['MRA PRGF/', 'MRA PRGF/PRGF AUGUST 2026 ABC CO LTD.csv', 'Report.txt'])
  })

  it('lists the MRA details missing, only those the templates mark Required', async () => {
    const { result } = await batch(fakeSource().source)
    const details = Object.fromEntries(result.companies.map((company) => [company.name, company.missingDetails]))
    expect(details).toEqual({ 'ABC Co Ltd': [], 'DEF Ltd': ['ern', 'declarant'], 'GHI Ltd': [], 'JKL Ltd': [], 'MNO Ltd': [] })
  })

  it('writes the report: made, skipped and why, the required values, the MRA details missing and the .50 list', async () => {
    const { result } = await batch(fakeSource().source)
    expect(reportLines(result)).toEqual([
      'MRA return files, August 2026',
      'Made on 29 October 2026 at 14:05.',
      'Made: 3 files. Skipped: 7.',
      '',
      'Upload each file to the MRA portal exactly as it is downloaded. Do not open it in Excel and save it again first: Excel changes dates and drops leading zeros.',
      '',
      'ABC Co Ltd, BRN C1234567',
      '  MRA CSG (PACO): Made: MRA CSG (PACO)/CSG AUGUST 2026 ABC CO LTD.csv, 4 employees.',
      '    Left out with no pay: LEFT OUT (ID X0000000000004, row 4).',
      '    Values that end in exactly .50 before rounding (check them in Payroll System):',
      '      DOE JANE ANN (ID X0000000000001, row 1): CSG is 562.5 in the saved run (cell J5).',
      '      DOE JANE ANN (ID X0000000000001, row 1): Employee NSF is 187.5 in the saved run (cell K5).',
      '  MRA PRGF: Made: MRA PRGF/PRGF AUGUST 2026 ABC CO LTD.csv, 4 employees.',
      '    Left out with no pay: LEFT OUT (ID X0000000000004, row 4).',
      '',
      'DEF Ltd, BRN C3333333',
      '  MRA CSG (PACO): Made: MRA CSG (PACO)/CSG AUGUST 2026 DEF LTD.csv, 2 employees.',
      '    Required values that are empty:',
      '      Employer row: A3 (Employer Registration Number) is required and has no value.',
      '      Employer row: G3 (Name of Declarant) is required and has no value.',
      '      RICHARD (ID X0000000000002, row 2): B5 (Surname of Employee) is required and has no value.',
      '    Values that end in exactly .50 before rounding (check them in Payroll System):',
      '      DOE JANE ANN (ID X0000000000001, row 1): CSG is 562.5 in the saved run (cell J5).',
      '      DOE JANE ANN (ID X0000000000001, row 1): Employee NSF is 187.5 in the saved run (cell K5).',
      '  MRA PRGF: Skipped: this company does not use this template.',
      '  MRA details missing: Employer Registration Number (ERN), Name of declarant. Fill them in on its Company profile in the dashboard.',
      '',
      'GHI Ltd, BRN C4444444',
      '  MRA CSG (PACO): Skipped: August 2026 has not been sent to the dashboard for this company.',
      '  MRA PRGF: Skipped: August 2026 has not been sent to the dashboard for this company.',
      '',
      'JKL Ltd, BRN C5555555',
      '  Only an admin of the company can do this. MRA returns hold national IDs and pay, so the dashboard gives them only to its admins.',
      "  MRA CSG (PACO): Skipped: the dashboard did not send this company's saved run.",
      "  MRA PRGF: Skipped: the dashboard did not send this company's saved run.",
      '',
      'MNO Ltd, BRN C6666666',
      '  MRA CSG (PACO): Skipped: the dashboard did not allow this company. You may no longer be its admin.',
      '  MRA PRGF: Skipped: the dashboard did not allow this company. You may no longer be its admin.',
    ])
    // In the zip as a text file: UTF-8 with a byte-order mark, CRLF.
    const report = readZip(batchZip(result).bytes).find((entry) => entry.path === 'Report.txt')!
    expect(Array.from(report.bytes.subarray(0, 3))).toEqual([0xef, 0xbb, 0xbf])
    expect(new TextDecoder().decode(report.bytes)).toBe(`${reportLines(result).join('\r\n')}\r\n`)
  })

  it('stops before reading anything when the question itself is refused', async () => {
    const calls: string[] = []
    const source: BatchSource = {
      ask: async () => ({ ok: false, failure: failure('denied') }),
      load: async () => {
        calls.push('load')
        return { ok: false, failure: failure('denied') }
      },
    }
    const answer = await runBatch(source, { period: '2026-08', templates: [CSG], companies: COMPANIES }, () => calls.push('progress'))
    expect(answer).toMatchObject({ ok: false, failure: { kind: 'denied' } })
    expect(calls).toEqual([])
  })

  it('gives two files Windows would take for the same name their own names, and never an underscore', async () => {
    const twin = { ...abcRun, brn: 'C7777777', name: 'abc co ltd' }
    const under = { ...abcRun, brn: 'C8888888', name: 'XYZ_Trading Ltd' }
    const { result } = await batch(fakeSource([abcRun, twin, under]).source, [
      { brn: 'C1234567', name: 'ABC Co Ltd' },
      { brn: 'C7777777', name: 'abc co ltd' },
      { brn: 'C8888888', name: 'XYZ_Trading Ltd' },
    ], [CSG])
    expect(readZip(batchZip(result).bytes).map((entry) => entry.path)).toEqual([
      'MRA CSG (PACO)/',
      'MRA CSG (PACO)/CSG AUGUST 2026 ABC CO LTD.csv',
      'MRA CSG (PACO)/CSG AUGUST 2026 ABC CO LTD (2).csv',
      'MRA CSG (PACO)/CSG AUGUST 2026 XYZ TRADING LTD.csv',
      'Report.txt',
    ])
    expect(fileNameFor({ pattern: 'CSG_{MONTH}_{YYYY}_{COMPANY}', capitals: false }, '2026-08', { name: 'A_B Ltd', brn: 'C1' })).toBe('CSG AUGUST 2026 A B Ltd.csv')
  })
})

describe('admins only, also when the app is bypassed (the fake dashboard)', () => {
  function hubPort() {
    const hub = createFakeHub()
    const port: HubPort = { send: async (type, payload) => hub.handle(type, payload as { dataType: string }), requestTimeoutMs: 50 }
    return { hub, port }
  }

  it('refuses the whole question when a company the user is only a member of is named', async () => {
    const { hub, port } = hubPort()
    const answer = await runBatch(hubBatchSource(port, 'C1234567'), { period: '2026-08', templates: [CSG], companies: [{ brn: 'C1234567', name: 'ABC Co Ltd' }, { brn: 'C2222222', name: 'XYZ Trading Ltd' }] }, () => {})
    expect(answer).toMatchObject({ ok: false, failure: { kind: 'forbidden' } })
    expect(hub.state.asked).toEqual([])
    expect(hub.state.requests.filter((params) => params.action === 'load')).toEqual([])
  })

  it('asks once for the admin companies, and skips one that stopped being an admin company before its turn', async () => {
    const { hub, port } = hubPort()
    hub.state.templates.push({ template_id: CSG_ID, name: 'MRA CSG (PACO)', revision: 1, body: CSG.body, history: [], companies: [{ brn: 'C1234567', own_values: {}, values_revision: 1 }] })
    const source = hubBatchSource(port, 'C1234567')
    const turned: BatchSource = {
      ask: source.ask,
      load: async (period, brn) => {
        // DEF Ltd: the user is made a member after agreeing, before its turn.
        if (brn === 'C3333333') hub.state.companies.find((one) => one.brn === 'C3333333')!.role = 'member'
        return source.load(period, brn)
      },
    }
    const { result } = await batch(turned, [
      { brn: 'C1234567', name: 'ABC Co Ltd' },
      { brn: 'C3333333', name: 'DEF Ltd' },
    ], [CSG])
    expect(hub.state.asked).toEqual([{ period: '2026-08', names: ['ABC Co Ltd', 'DEF Ltd'] }])
    expect(result.companies.map((company) => [company.name, company.files.map((file) => (file.made ? 'made' : file.reason)), company.failure?.kind ?? null])).toEqual([
      ['ABC Co Ltd', ['made'], null],
      ['DEF Ltd', ['refused'], 'forbidden'],
    ])
  })

  it("opens only an admin company's profile in the dashboard", async () => {
    const { hub, port } = hubPort()
    expect(await openProfile(port, 'C1234567', 'C3333333')).toBeNull()
    expect(await openProfile(port, 'C1234567', 'C2222222')).toMatchObject({ kind: 'forbidden' })
    expect(hub.state.opened).toEqual(['C3333333'])
    expect(hub.state.requests.at(-1)).toEqual({ action: 'open-profile', company_brn: 'C2222222', brn: 'C1234567' })
  })
})
