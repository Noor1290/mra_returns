// The lists a cell's identity field or payroll column is chosen from: the company's own fields,
// from the dashboard's overview (its column setup and newest saved run), before any month is
// fetched. The bug they fix: the lists offered only "ID", or only "Basic Salary" and "New Basic
// Salary". FAKE names only.
import { describe, expect, it } from 'vitest'
import { createFakeHub } from '../scripts/lib/fake-hub.mjs'
import { DEMO_RUN } from '../src/data/demoRun'
import { fieldLists, type OverviewState } from '../src/lib/fields'
import { failure, type HubPort } from '../src/lib/hubWire'
import { loadOverview, type Overview } from '../src/lib/runStore'

/** A company set up like the owner's: four identity fields and about twenty columns. */
const IDENTITY = ['ID', 'Surname', 'Other names', 'Date of Employment']
const COLUMNS = [
  'Basic Salary',
  'Govt Increment',
  'New Basic Salary',
  'Full time / Part time',
  'Allowances',
  'Emoluments',
  'Travelling',
  'Gross Pay',
  'Age 60+',
  'Employee CSG',
  'Employee NSF',
  'PAYE',
  'Total deductions',
  'Net Pay',
  'CSG',
  'NSF',
  'Levy',
  'PRGF',
  'Total MRA contributions',
  'EDF',
]

function fakePort() {
  const hub = createFakeHub()
  const port: HubPort = { send: async (type, payload) => hub.handle(type, payload as { dataType: string }), requestTimeoutMs: 50 }
  return { hub, port }
}

const loaded = (overview: Overview): OverviewState => ({ status: 'loaded', overview })

describe("the lists are the company's own fields, before any month is fetched", () => {
  it('offers every identity field and every column, text, checkbox and date ones too', async () => {
    const { hub, port } = fakePort()
    hub.state.fields.C1234567 = { identity: [...IDENTITY, 'Department'], columns: [...COLUMNS, 'Bonus'] }
    const answer = await loadOverview(port, 'C1234567')
    if (!answer.ok) throw new Error(answer.failure.title)
    expect(hub.state.asked).toEqual([])
    const lists = fieldLists(loaded(answer.overview), null)
    expect(lists.state).toBe('known')
    expect(lists.identity).toEqual([...IDENTITY, 'Department'])
    expect(lists.columns).toEqual(expect.arrayContaining([...COLUMNS, 'Bonus']))
    for (const name of ['Emoluments', 'Employee CSG', 'CSG', 'Employee NSF', 'NSF', 'PAYE', 'PRGF', 'Gross Pay', 'Allowances', 'Full time / Part time']) expect(lists.columns).toContain(name)
    expect(lists.columns.length).toBeGreaterThanOrEqual(20)
  })

  it('offers a column added to the setup later, once the dashboard is asked again', async () => {
    const { hub, port } = fakePort()
    hub.state.fields.C1234567 = { identity: IDENTITY, columns: COLUMNS }
    const before = await loadOverview(port, 'C1234567')
    if (!before.ok) throw new Error(before.failure.title)
    expect(fieldLists(loaded(before.overview), null).columns).not.toContain('Overtime')
    hub.state.fields.C1234567 = { identity: IDENTITY, columns: [...COLUMNS, 'Overtime'] }
    const after = await loadOverview(port, 'C1234567')
    if (!after.ok) throw new Error(after.failure.title)
    expect(fieldLists(loaded(after.overview), null).columns).toContain('Overtime')
  })

  it('with no column setup, lists the columns of the newest saved run', async () => {
    const { port } = fakePort()
    const answer = await loadOverview(port, 'C1234567')
    if (!answer.ok) throw new Error(answer.failure.title)
    expect(answer.overview).toMatchObject({ setup: false, run_period: '2026-08' })
    const lists = fieldLists(loaded(answer.overview), null)
    expect(lists.identity).toEqual(IDENTITY)
    expect(lists.columns).toEqual(['New Basic Salary', 'Emoluments', 'Gross Pay', 'Employee CSG', 'Employee NSF'])
  })

  it('says when the company has neither, and when the dashboard did not answer, rather than a short list', () => {
    const empty: Overview = { brn: 'C1234567', name: 'ABC Co Ltd', identity: IDENTITY, columns: [], setup: false, run_period: null, filled: { ern: true, telephone: true, mobile: true, declarant: true, email: true }, months: [] }
    expect(fieldLists(loaded(empty), null)).toMatchObject({ state: 'empty', columns: [] })
    expect(fieldLists({ status: 'failed', failure: failure('invalid') }, null)).toEqual({ identity: [], columns: [], state: 'unknown' })
    expect(fieldLists({ status: 'loading' }, null).state).toBe('loading')
  })

  it('falls back on a saved run fetched under Make the files, with all its keys', () => {
    const lists = fieldLists({ status: 'failed', failure: failure('invalid') }, DEMO_RUN)
    expect(lists.state).toBe('known')
    expect(lists.identity).toEqual(IDENTITY)
    expect(lists.columns).toEqual(expect.arrayContaining(['Basic Salary', 'Full time / Part time', 'Age 60+', 'Employee CSG', 'Total']))
    for (const key of ['Company Name', 'Address', 'BRN', 'VAT', 'ID']) expect(lists.columns).not.toContain(key)
  })
})

describe('the overview request', () => {
  it('names the selected company, asks nothing, and says which MRA details are filled in and the months saved', async () => {
    const { hub, port } = fakePort()
    hub.state.drafts.push('C1234567 2026-08')
    const answer = await loadOverview(port, 'C1234567')
    expect(hub.state.requests).toEqual([{ action: 'overview', brn: 'C1234567' }])
    expect(answer).toMatchObject({
      ok: true,
      overview: { filled: { ern: true, telephone: true, mobile: true, declarant: true, email: true }, months: [{ period: '2026-08', status: 'draft' }] },
    })
  })

  it('is refused for a company where the user is not an admin', async () => {
    const { hub, port } = fakePort()
    hub.state.selected = 'C2222222'
    expect(await loadOverview(port, 'C2222222')).toMatchObject({ ok: false, failure: { kind: 'forbidden' } })
  })

  it('does not use an answer about another company', async () => {
    const port: HubPort = {
      send: async () => ({
        ok: true,
        dataType: 'mra-batch',
        rows: [{ brn: 'C3333333', name: 'DEF Ltd', identity: [], columns: [], setup: false, run_period: null, filled: { ern: true, telephone: true, mobile: true, declarant: true, email: true }, months: [] }],
        meta: { label: 'ABC Co Ltd', brn: 'C1234567' },
      }),
    }
    expect(await loadOverview(port, 'C1234567')).toMatchObject({ ok: false, failure: { kind: 'bad-answer' } })
  })
})
