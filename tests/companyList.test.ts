import { describe, expect, it } from 'vitest'
import { createFakeHub } from '../scripts/lib/fake-hub.mjs'
import { isListed, loadCompanyList, openCompany, openPicker } from '../src/lib/companyList'
import type { HubPort } from '../src/lib/hubWire'
import { onTheList } from '../src/screens/ReturnsScreen'
import { hueOf, initialsOf } from '../src/lib/companyLook'

/** company-list with the fake dashboard (scripts/lib/fake-hub.mjs). FAKE companies only. */
function fakePort() {
  const hub = createFakeHub()
  hub.state.openOnStart = false
  const port: HubPort = { send: async (type, payload) => hub.handle(type, payload as { dataType: string }), requestTimeoutMs: 50 }
  return { hub, port }
}
const ABC = '10000000-0000-4000-8000-000000000001'
const DEF = '10000000-0000-4000-8000-000000000003'

describe('the companies of this app', () => {
  it('lists every company of the user with its CSG and PRGF lists, the selected one marked', async () => {
    const { port } = fakePort()
    const answer = await loadCompanyList(port)
    if (!answer.ok) throw new Error('refused')
    expect(answer.companies.map((one) => [one.name, one.lists, one.admin])).toEqual([
      ['ABC Co Ltd', ['csg', 'prgf'], true],
      ['DEF Ltd', ['csg'], true],
      ['XYZ Trading Ltd', [], false],
    ])
    expect(answer.selected.brn).toBe('C1234567')
    expect(answer.open).toBeNull()
    expect(answer.companies.filter(isListed).map((one) => one.name)).toEqual(['ABC Co Ltd', 'DEF Ltd'])
  })

  it('works as before with a dashboard from before the lists', async () => {
    const { hub, port } = fakePort()
    hub.state.legacy = true
    expect(await loadCompanyList(port)).toEqual({ ok: false, legacy: true })
  })

  it('says why when the dashboard refuses', async () => {
    const { hub, port } = fakePort()
    hub.state.refuseAll = { code: 'unavailable', error: 'The owner needs to run supabase/migrations/0024_company_lists_and_status.sql.' }
    const answer = await loadCompanyList(port)
    expect(answer).toMatchObject({ ok: false, legacy: false, failure: { kind: 'unavailable' } })
  })
})

describe('opening a company from its card', () => {
  it('the selected one opens here at once', async () => {
    const { hub, port } = fakePort()
    expect(await openCompany(port, 'C1234567', ABC, '2026-08')).toEqual({ ok: true, switched: false })
    expect(hub.state.reload).toBe(false)
  })

  it('another one is selected in the dashboard, and the app is told to open it, in that month', async () => {
    const { hub, port } = fakePort()
    expect(await openCompany(port, 'C1234567', DEF, '2026-07')).toEqual({ ok: true, switched: true })
    expect(hub.state.reload).toBe(true)
    const after = await loadCompanyList(port)
    if (!after.ok) throw new Error('refused')
    expect(after.selected.name).toBe('DEF Ltd')
    expect(after.open).toEqual({ period: '2026-07' })
    // Only once.
    const again = await loadCompanyList(port)
    expect(again.ok && again.open).toBeNull()
  })

  it('opens the picker in the dashboard', async () => {
    const { hub, port } = fakePort()
    expect(await openPicker(port, 'C1234567')).toBeNull()
    expect(hub.state.pickerOpened).toBe(1)
  })
})

describe('several companies at once', () => {
  it('offers only the companies on the list, and the selected one', () => {
    const companies = [{ brn: 'C1234567' }, { brn: 'C3333333' }, { brn: 'C9999999' }]
    const list = {
      status: 'loaded' as const,
      selected: { company_id: ABC, brn: 'C9999999', name: 'Z', admin: true, selected: true, lists: [] },
      companies: [
        { company_id: ABC, brn: 'C1234567', name: 'A', admin: true, selected: false, lists: ['csg' as const] },
        { company_id: DEF, brn: 'C3333333', name: 'D', admin: true, selected: false, lists: [] },
      ],
    }
    expect(onTheList(companies, list, 'C9999999').map((one) => one.brn)).toEqual(['C1234567', 'C9999999'])
    expect(onTheList(companies, { status: 'legacy' }, 'C9999999')).toHaveLength(3)
  })
})

describe('the company circle', () => {
  it('is the same as in the dashboard', () => {
    expect(initialsOf('ABC Co Ltd')).toBe('AB')
    expect(initialsOf('The Coral (Mauritius) Ltd')).toBe('CM')
    // The dashboard's pickerModel gives these same hues: keep the two rules the same.
    expect([hueOf('C1234567'), hueOf('C0000101'), hueOf('C3333333')]).toEqual([200, 75, 162])
  })
})
