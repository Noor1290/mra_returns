// The templates kept in the dashboard ("mra-template"), against the stand-in dashboard
// (scripts/lib/fake-hub.mjs): made for this company, read back exactly, saved over with the
// revision last seen, this company's own values, History, use in another company, removal; and
// every answer checked (the company, the shape, a body that is not a template). And the MRA
// details in the saved run (mra-batch load). Fake data only.
import { describe, expect, it } from 'vitest'
import { createFakeHub } from '../scripts/lib/fake-hub.mjs'
import { demoTemplate, standardTemplate } from '../src/data/mraLayouts'
import type { HubPort } from '../src/lib/hubWire'
import { askForCompanies, loadRun } from '../src/lib/runStore'
import { demoTemplateStore, DEMO_TEMPLATE_IDS, hubTemplateStore } from '../src/lib/templateStore'

const ID = '60000000-0000-4000-8000-000000000001'

function fakePort(answer?: (type: string, payload: unknown) => unknown) {
  const hub = createFakeHub()
  const sent: { type: string; payload: Record<string, unknown> }[] = []
  const port: HubPort = {
    send: async (type, payload) => {
      sent.push({ type, payload: payload as Record<string, unknown> })
      return answer ? answer(type, payload) : hub.handle(type, payload as { dataType: string })
    },
    requestTimeoutMs: 50,
  }
  return { hub, port, sent, store: hubTemplateStore(port, 'C1234567') }
}

describe('templates in the dashboard', () => {
  it('makes a template for this company and reads it back exactly', async () => {
    const { store, sent, hub } = fakePort()
    const body = standardTemplate('csg')
    expect(await store.save({ id: ID, name: ' MRA CSG (PACO) ', body, expectedRevision: 0 })).toEqual({ ok: true, value: { revision: 1, name: 'MRA CSG (PACO)' } })
    // One row per message, about the selected company.
    expect(sent.at(-1)).toEqual({ type: 'send-data', payload: { dataType: 'mra-template', rows: [{ action: 'save', template_id: ID, name: ' MRA CSG (PACO) ', body, expected_revision: 0, brn: 'C1234567' }] } })
    expect(hub.state.templates[0].body).toEqual(body)
    const loaded = await store.load(ID)
    expect(loaded).toMatchObject({ ok: true, value: { template_id: ID, name: 'MRA CSG (PACO)', revision: 1, can_change: true, values_revision: 1, own: { values: {} } } })
    expect(loaded.ok && loaded.value.body).toEqual(body)
  })

  it('saves over the revision last seen only: an older one is refused as stale', async () => {
    const { store } = fakePort()
    await store.save({ id: ID, name: 'MRA PRGF', body: standardTemplate('prgf'), expectedRevision: 0 })
    expect(await store.save({ id: ID, name: 'MRA PRGF', body: standardTemplate('prgf'), expectedRevision: 1 })).toMatchObject({ ok: true, value: { revision: 2 } })
    const stale = await store.save({ id: ID, name: 'MRA PRGF', body: standardTemplate('prgf'), expectedRevision: 1 })
    expect(stale).toMatchObject({ ok: false, failure: { kind: 'stale', title: 'Someone else saved this since you opened it' } })
  })

  it("saves this company's own values with their own revision", async () => {
    const { store } = fakePort()
    await store.save({ id: ID, name: 'MRA PRGF', body: standardTemplate('prgf'), expectedRevision: 0 })
    expect(await store.saveValues({ id: ID, own: { values: { m7: 'own@example.org' } }, expectedRevision: 1 })).toEqual({ ok: true, value: { valuesRevision: 2 } })
    expect(await store.load(ID)).toMatchObject({ ok: true, value: { own: { values: { m7: 'own@example.org' } }, values_revision: 2, revision: 1 } })
    expect(await store.saveValues({ id: ID, own: { values: {} }, expectedRevision: 1 })).toMatchObject({ ok: false, failure: { kind: 'stale' } })
  })

  it('keeps every version: History, and a version read back to restore it', async () => {
    const { store } = fakePort()
    const first = standardTemplate('csg')
    await store.save({ id: ID, name: 'MRA CSG', body: first, expectedRevision: 0 })
    await store.save({ id: ID, name: 'MRA CSG', body: { ...first, noPay: null }, expectedRevision: 1 })
    expect(await store.history(ID)).toMatchObject({ ok: true, value: [{ revision: 2 }, { revision: 1 }] })
    expect(await store.revision(ID, 1)).toEqual({ ok: true, value: first })
  })

  it('uses a template in another admin company, and removes it, deleting it from the last one', async () => {
    const { store, hub } = fakePort()
    await store.save({ id: ID, name: 'MRA CSG', body: standardTemplate('csg'), expectedRevision: 0 })
    expect(await store.companies(ID)).toMatchObject({ ok: true, value: [{ brn: 'C1234567', uses: true }, { brn: 'C3333333', uses: false }] })
    expect(await store.attach(ID, 'C3333333')).toEqual({ ok: true, value: { company: 'DEF Ltd' } })
    expect(await store.attach(ID, 'C2222222')).toMatchObject({ ok: false, failure: { kind: 'forbidden' } })
    expect(await store.list()).toMatchObject({ ok: true, value: [{ companies: 2, admin_of: 2 }] })
    expect(await store.detach(ID, 1)).toEqual({ ok: true, value: { deleted: false } })
    expect(await store.list()).toEqual({ ok: true, value: [] })
    hub.state.selected = 'C3333333'
    const def = hubTemplateStore({ send: async (type, payload) => hub.handle(type, payload as { dataType: string }) }, 'C3333333')
    expect(await def.detach(ID, 1)).toEqual({ ok: true, value: { deleted: true } })
    expect(hub.state.templates).toEqual([])
  })

  it('refuses a member, and says when a save could not be confirmed', async () => {
    const { store, hub } = fakePort()
    hub.state.selected = 'C2222222'
    const member = hubTemplateStore({ send: async (type, payload) => hub.handle(type, payload as { dataType: string }) }, 'C2222222')
    expect(await member.list()).toMatchObject({ ok: false, failure: { kind: 'forbidden', hubError: 'Only an admin of this company can see or change its MRA templates.' } })
    const silent = hubTemplateStore({ send: () => new Promise(() => {}), requestTimeoutMs: 20 }, 'C1234567')
    expect(await silent.save({ id: ID, name: 'X', body: standardTemplate('csg'), expectedRevision: 0 })).toMatchObject({ ok: false, failure: { kind: 'unconfirmed', title: 'The dashboard could not confirm the save' } })
    hub.state.selected = 'C1234567'
    hub.state.refuseAll = { code: 'unavailable', error: 'The dashboard could not do it.' }
    expect(await store.save({ id: ID, name: 'X', body: standardTemplate('csg'), expectedRevision: 0 })).toMatchObject({ ok: false, failure: { kind: 'unconfirmed' } })
  })

  it('does not use an answer about another company, another template, or a body that is not a template', async () => {
    const body = standardTemplate('csg')
    const row = { template_id: ID, name: 'X', revision: 1, updated_at: 't', updated_by_you: true, can_change: true, companies: 1, admin_of: 1, values_revision: 1, own_values: {} }
    const reply = (meta: Record<string, unknown>, rows: unknown[]) => () => ({ ok: true, dataType: 'mra-template', rows, meta })
    const other = fakePort(reply({ brn: 'C3333333', label: 'DEF Ltd' }, [{ ...row, body }]))
    expect(await other.store.load(ID)).toMatchObject({ ok: false, failure: { kind: 'other-company' } })
    const wrongId = fakePort(reply({ brn: 'C1234567' }, [{ ...row, template_id: '60000000-0000-4000-8000-000000000009', body }]))
    expect(await wrongId.store.load(ID)).toMatchObject({ ok: false, failure: { kind: 'bad-answer' } })
    const notTemplate = fakePort(reply({ brn: 'C1234567' }, [{ ...row, body: { rows: 'x' } }]))
    expect(await notTemplate.store.load(ID)).toMatchObject({ ok: false, failure: { kind: 'bad-answer' } })
    // Own values in another shape count as none, never as something else.
    const oddValues = fakePort(reply({ brn: 'C1234567' }, [{ ...row, body, own_values: { values: { m7: 3 } } }]))
    expect(await oddValues.store.load(ID)).toMatchObject({ ok: true, value: { own: { values: {} } } })
  })
})

describe('the MRA details in the saved run', () => {
  it('come with the run: ERN as text with its leading zeros, the user email, the own values', async () => {
    const { port, hub } = fakePort()
    hub.state.templates.push({ template_id: ID, name: 'X', revision: 1, body: {}, history: [], companies: [{ brn: 'C1234567', own_values: { values: { m7: 'a@example.org' } }, values_revision: 2 }] })
    await askForCompanies(port, 'C1234567', '2026-08', ['C1234567'])
    const loaded = await loadRun(port, 'C1234567', '2026-08', 'C1234567')
    expect(loaded).toMatchObject({
      ok: true,
      run: {
        mra: { ern: '001234', telephone: '2000000', mobile: '52000000', declarant: 'JANE SAMPLE' },
        email: 'returns@example.org',
        templates: [{ template_id: ID, own_values: { values: { m7: 'a@example.org' } }, values_revision: 2 }],
      },
    })
  })

  it('are empty, not missing, from a dashboard that does not send them yet', async () => {
    const { port, hub } = fakePort()
    await askForCompanies(port, 'C1234567', '2026-08', ['C1234567'])
    const old = (type: string, payload: unknown) => {
      const answer = hub.handle(type, payload as { dataType: string }) as { rows: Record<string, unknown>[] }
      return { ...answer, rows: answer.rows.map(({ mra: _m, email: _e, templates: _t, ...rest }) => rest) }
    }
    const loaded = await loadRun({ send: async (type, payload) => old(type, payload) }, 'C1234567', '2026-08', 'C1234567')
    expect(loaded).toMatchObject({ ok: true, run: { mra: { ern: '', telephone: '', mobile: '', declarant: '' }, email: '', templates: [] } })
  })
})

describe('the fake templates of the sample (app opened on its own)', () => {
  it('has the CSG and PRGF templates of ABC Co Ltd, and follows the same rules', async () => {
    const store = demoTemplateStore()
    expect(await store.list()).toMatchObject({ ok: true, value: [{ name: 'MRA CSG (PACO)' }, { name: 'MRA PRGF' }] })
    const loaded = await store.load(DEMO_TEMPLATE_IDS.csg)
    expect(loaded.ok && loaded.value.body).toEqual(demoTemplate('csg'))
    expect(await store.save({ id: DEMO_TEMPLATE_IDS.csg, name: 'MRA CSG', body: standardTemplate('csg'), expectedRevision: 3 })).toMatchObject({ ok: false, failure: { kind: 'stale' } })
    expect(await store.detach(DEMO_TEMPLATE_IDS.prgf, 1)).toEqual({ ok: true, value: { deleted: true } })
  })
})
