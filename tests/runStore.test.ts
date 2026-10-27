import { describe, expect, it } from 'vitest'
import { createFakeHub } from '../scripts/lib/fake-hub.mjs'
import { DEMO_RUN } from '../src/data/demoRun'
import { formatPeriod, lastMonth, recentMonths } from '../src/lib/dates'
import type { HubPort } from '../src/lib/hubWire'
import { askForCompanies, listCompanies, loadRun } from '../src/lib/runStore'

/** The fake dashboard (scripts/lib/fake-hub.mjs) as a port, and every payload sent to it. */
function fakePort(answer?: (type: string, payload: unknown) => unknown) {
  const hub = createFakeHub()
  const sent: unknown[] = []
  const port: HubPort = {
    send: async (type, payload) => {
      sent.push(payload)
      return answer ? answer(type, payload) : hub.handle(type, payload as { dataType: string })
    },
    requestTimeoutMs: 50,
  }
  return { hub, port, sent }
}

describe('the companies: only the user admin companies, the selected one first', () => {
  it('lists them and names the company selected in the dashboard', async () => {
    const { port } = fakePort()
    expect(await listCompanies(port)).toEqual({
      ok: true,
      companies: [
        { brn: 'C1234567', name: 'ABC Co Ltd', selected: true },
        { brn: 'C3333333', name: 'DEF Ltd', selected: false },
      ],
      selectedBrn: 'C1234567',
      selectedName: 'ABC Co Ltd',
    })
  })

  it('shows that the user is not an admin of the selected company: it is not in the list', async () => {
    const { hub, port } = fakePort()
    hub.state.selected = 'C2222222'
    const answer = await listCompanies(port)
    expect(answer.ok && answer.companies.some((one) => one.selected)).toBe(false)
  })

  it('does not use an answer whose selected company is not the one it names', async () => {
    const { port } = fakePort(() => ({
      ok: true,
      dataType: 'mra-batch',
      rows: [{ brn: 'C3333333', name: 'DEF Ltd', selected: true }],
      meta: { label: 'ABC Co Ltd', brn: 'C1234567' },
    }))
    expect(await listCompanies(port)).toMatchObject({ ok: false, failure: { kind: 'bad-answer' } })
  })
})

describe('one question, then one company per load', () => {
  it('asks for the month and the companies, then loads the saved run exactly as stored', async () => {
    const { hub, port, sent } = fakePort()
    expect(await askForCompanies(port, 'C1234567', '2026-08', ['C1234567'])).toEqual({ ok: true, companies: [{ brn: 'C1234567', name: 'ABC Co Ltd' }] })
    expect(hub.state.asked).toEqual([{ period: '2026-08', names: ['ABC Co Ltd'] }])
    const loaded = await loadRun(port, 'C1234567', '2026-08', 'C1234567')
    expect(loaded.ok).toBe(true)
    if (!loaded.ok) return
    expect(loaded.run).toMatchObject({ brn: 'C1234567', name: 'ABC Co Ltd', period: '2026-08', run: true })
    expect(loaded.run.employees).toEqual(hub.state.companies[0].runs['2026-08'])
    // Every message names the selected company.
    expect(sent).toEqual([
      { dataType: 'mra-batch', params: { action: 'ask', period: '2026-08', companies: ['C1234567'], brn: 'C1234567' } },
      { dataType: 'mra-batch', params: { action: 'load', period: '2026-08', company_brn: 'C1234567', brn: 'C1234567' } },
    ])
  })

  it('says when the month was never sent to the dashboard', async () => {
    const { port } = fakePort()
    await askForCompanies(port, 'C1234567', '2026-07', ['C1234567'])
    expect(await loadRun(port, 'C1234567', '2026-07', 'C1234567')).toMatchObject({ ok: true, run: { run: false, employees: [] } })
  })

  it('turns each refusal into what happened and what to do, with the dashboard sentence', async () => {
    for (const [answer, kind] of [
      ['deny', 'denied'],
      ['timeout', 'timeout'],
      ['locked', 'locked'],
    ] as const) {
      const { hub, port } = fakePort()
      hub.state.answer = answer
      const asked = await askForCompanies(port, 'C1234567', '2026-08', ['C1234567'])
      expect(asked).toMatchObject({ ok: false, failure: { kind } })
      if (!asked.ok) expect(asked.failure.hubError).toBeTruthy()
    }
    const { port } = fakePort()
    expect(await askForCompanies(port, 'C1234567', '2026-08', ['C2222222'])).toMatchObject({
      ok: false,
      failure: { kind: 'forbidden', title: 'Only an admin of the company can do this', hubError: 'Only companies where you are an admin can be chosen.' },
    })
    expect(await loadRun(port, 'C1234567', '2026-08', 'C1234567')).toMatchObject({ ok: false, failure: { kind: 'denied' } })
  })

  it('does not use an answer to the question for another month', async () => {
    const { port } = fakePort(() => ({
      ok: true,
      dataType: 'mra-batch',
      rows: [{ brn: 'C1234567', name: 'ABC Co Ltd' }],
      meta: { label: 'ABC Co Ltd', brn: 'C1234567', period: '2026-07' },
    }))
    expect(await askForCompanies(port, 'C1234567', '2026-08', ['C1234567'])).toMatchObject({ ok: false, failure: { kind: 'bad-answer' } })
  })

  it('never asks for no company or for more than 200', async () => {
    const { port, sent } = fakePort()
    expect(await askForCompanies(port, 'C1234567', '2026-08', [])).toMatchObject({ ok: false, failure: { kind: 'invalid' } })
    const many = Array.from({ length: 201 }, (_, n) => `B${n}`)
    expect(await askForCompanies(port, 'C1234567', '2026-08', many)).toMatchObject({ ok: false, failure: { kind: 'invalid' } })
    expect(sent).toEqual([])
  })

  it('does not use an answer about another company or month, or one that does not hold together', async () => {
    const run = (more: Record<string, unknown>) => () => ({
      ok: true,
      dataType: 'mra-batch',
      rows: [{ brn: 'C1234567', name: 'ABC Co Ltd', address: null, period: '2026-08', run: true, employees: [], ...more }],
      meta: { label: 'ABC Co Ltd', brn: 'C1234567', period: '2026-08' },
    })
    const load = (answer: () => unknown) => loadRun(fakePort(answer).port, 'C1234567', '2026-08', 'C1234567')
    expect(await load(run({}))).toMatchObject({ ok: true })
    expect(await load(run({ brn: 'C3333333' }))).toMatchObject({ ok: false, failure: { kind: 'bad-answer' } })
    expect(await load(run({ period: '2026-07' }))).toMatchObject({ ok: false, failure: { kind: 'bad-answer' } })
    // "No run" with employees in it is not a saved run of anything.
    expect(await load(run({ run: false, employees: [{ ID: 'X' }] }))).toMatchObject({ ok: false, failure: { kind: 'bad-answer' } })
    expect(await load(() => ({ ok: true, dataType: 'mra-batch', rows: [], meta: { brn: 'C9999999' } }))).toMatchObject({
      ok: false,
      failure: { kind: 'other-company' },
    })
    expect(await load(() => ({ ok: true, dataType: 'mra-batch', rows: [] }))).toMatchObject({ ok: false, failure: { kind: 'no-company-brn' } })
    expect(await load(() => 'nonsense')).toMatchObject({ ok: false, failure: { kind: 'bad-answer' } })
    // The bridge's own refusal, with no code (for example "not registered"), is no answer.
    expect(await load(() => ({ ok: false, error: 'This app is not registered for that data type.' }))).toMatchObject({
      ok: false,
      failure: { kind: 'no-answer', hubError: 'This app is not registered for that data type.' },
    })
  })

  it('stops waiting for the companies when the dashboard does not answer', async () => {
    const { port } = fakePort(() => new Promise(() => undefined))
    expect(await listCompanies(port)).toMatchObject({ ok: false, failure: { kind: 'no-answer' } })
  })
})

describe('months and the fake sample', () => {
  it('names months and offers this month and the 23 before, defaulting to last month', () => {
    expect(formatPeriod('2026-08')).toBe('August 2026')
    const now = new Date(2026, 9, 27)
    expect(recentMonths(now)).toHaveLength(24)
    expect(recentMonths(now)[0]).toBe('2026-10')
    expect(recentMonths(now).at(-1)).toBe('2024-11')
    expect(lastMonth(now)).toBe('2026-09')
    expect(lastMonth(new Date(2027, 0, 5))).toBe('2026-12')
  })

  it('the fake sample is a saved run as the dashboard sends it, with invented IDs only', () => {
    expect(DEMO_RUN).toMatchObject({ brn: 'C1234567', name: 'ABC Co Ltd', period: '2026-08', run: true })
    for (const row of DEMO_RUN.employees) {
      expect(row.ID).toMatch(/^X0{9}\d{4}$/)
      expect(row['Company Name']).toBe('ABC Co Ltd')
      expect(row['Date of Employment']).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    }
  })
})
