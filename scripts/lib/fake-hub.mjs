// An in-memory stand-in for the Payroll Hub dashboard's side of "mra-batch", following
// docs/INTEGRATION.md in the payroll_hub repo. Used by the unit tests (tests/runStore.test.ts)
// and, turned into text with toString(), inside the fake dashboard page of check-bridge.mjs, so
// it must stay self-contained: no imports, nothing from outside the function. FAKE data only.
export function createFakeHub() {
  const employee = (id, surname, otherNames, gross) => ({
    ID: id,
    Surname: surname,
    'Other names': otherNames,
    'New Basic Salary': gross,
    Emoluments: gross,
    'Gross Pay': gross,
    'Employee CSG': Math.round(gross * 1.5) / 100,
    'Employee NSF': Math.round(gross) / 100,
    'Company Name': 'ABC Co Ltd',
    BRN: 'C1234567',
    'Date of Employment': '2020-02-01',
  })
  const state = {
    /** The company selected in the dashboard. */
    selected: 'C1234567',
    /** The user's companies: role, and saved runs by month. */
    companies: [
      {
        brn: 'C1234567',
        name: 'ABC Co Ltd',
        address: '1 Fake Street, Port Louis',
        role: 'admin',
        runs: {
          '2026-08': [
            employee('X0000000000001', 'DOE', 'JANE', 18750),
            employee('X0000000000002', 'ROE', 'RICHARD', 18546),
            employee('X0000000000003', 'POE', 'ALEX', 17745),
          ],
        },
      },
      { brn: 'C3333333', name: 'DEF Ltd', address: null, role: 'admin', runs: {} },
      { brn: 'C2222222', name: 'XYZ Trading Ltd', address: null, role: 'member', runs: {} },
    ],
    /** How the user answers the question: 'allow', 'deny', 'locked' (gate stays closed), 'timeout' or 'hold' (not yet). */
    answer: 'allow',
    /** A refusal for every request, e.g. { code: 'unavailable', error: '...' }; null for none. */
    refuseAll: null,
    /** Whether the password gate is open. */
    unlocked: true,
    /** What was allowed: { period, brns }. */
    allowed: null,
    /** Every question asked, as the dashboard would show it. */
    asked: [],
    /** Every request seen, in order. */
    requests: [],
    /** The MRA details of each company (mra-batch load), by BRN, and the user's email. */
    mra: { C1234567: { ern: '001234', telephone: '2000000', mobile: '52000000', declarant: 'JANE SAMPLE' } },
    email: 'returns@example.org',
    /**
     * The MRA templates (mra-template), as the dashboard keeps them: the body exactly as sent,
     * every revision, and each company's own values. FAKE content.
     */
    templates: [],
    /** Every save seen, in order (one row each), and every template request. */
    saves: [],
    templateRequests: [],
  }
  const norm = (brn) => String(brn).trim().toUpperCase()
  const refuse = (code, error) => ({ ok: false, code, error })
  const selected = () => state.companies.find((one) => norm(one.brn) === norm(state.selected))
  const meta = (period) => ({ label: selected().name, brn: selected().brn, role: selected().role, ...(period ? { period } : {}) })
  const admins = () => {
    const mine = state.companies.filter((one) => one.role === 'admin')
    return [...mine.filter((one) => norm(one.brn) === norm(state.selected)), ...mine.filter((one) => norm(one.brn) !== norm(state.selected)).sort((a, b) => a.name.localeCompare(b.name))]
  }
  const isMonth = (value) => typeof value === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(value)

  const now = () => new Date('2026-10-28T09:00:00Z').toISOString()
  const templateOf = (id) => state.templates.find((one) => one.template_id === id)
  const usedHere = (one) => one && one.companies.some((company) => norm(company.brn) === norm(state.selected))
  const linkHere = (one) => one.companies.find((company) => norm(company.brn) === norm(state.selected))
  const isAdminOf = (brn) => state.companies.some((one) => norm(one.brn) === norm(brn) && one.role === 'admin')
  const access = (one) => ({
    can_change: one.companies.every((company) => isAdminOf(company.brn)),
    companies: one.companies.length,
    admin_of: one.companies.filter((company) => isAdminOf(company.brn)).length,
  })
  const summary = (one) => ({
    template_id: one.template_id,
    name: one.name,
    revision: one.revision,
    updated_at: now(),
    updated_by_you: true,
    ...access(one),
    values_revision: linkHere(one).values_revision,
  })

  /** "mra-template": requests and saves, as payroll_hub docs/INTEGRATION.md says. */
  function handleTemplate(type, payload) {
    if (selected().role !== 'admin') return refuse('forbidden', 'Only an admin of this company can see or change its MRA templates.')
    const answer = (rows) => ({ ok: true, dataType: 'mra-template', rows, meta: meta() })
    if (type === 'request-data') {
      const params = payload.params ?? {}
      state.templateRequests.push(params)
      if (params.brn !== undefined && norm(params.brn) !== norm(state.selected)) return refuse('wrong-company', 'The BRN sent is not the selected company.')
      if (params.action === 'list') return answer(state.templates.filter(usedHere).map(summary))
      const one = templateOf(params.template_id)
      if (!usedHere(one)) return refuse('not-found', 'This company does not use that MRA template. Reload the list.')
      if (params.action === 'load') return answer([{ ...summary(one), body: one.body, own_values: linkHere(one).own_values }])
      if (params.action === 'history') return answer([...one.history].reverse().map(({ revision, name, saved_at }) => ({ revision, name, saved_at, saved_by_you: true })))
      if (params.action === 'revision') {
        const kept = one.history.find((row) => row.revision === params.revision)
        return kept ? answer([{ template_id: one.template_id, revision: kept.revision, name: kept.name, body: kept.body, saved_at: kept.saved_at, saved_by_you: true }]) : refuse('not-found', 'This MRA template has no such revision.')
      }
      if (params.action === 'companies') {
        return answer(admins().map((company) => ({ brn: company.brn, name: company.name, selected: norm(company.brn) === norm(state.selected), uses: one.companies.some((c) => norm(c.brn) === norm(company.brn)) })))
      }
      return refuse('invalid', 'The request is not valid.')
    }
    const row = payload.rows?.[0] ?? {}
    state.saves.push(row)
    if (payload.rows?.length !== 1) return refuse('invalid', 'Send exactly one row: one command per message.')
    if (norm(row.brn ?? '') !== norm(state.selected)) return refuse('wrong-company', 'The BRN sent is not the selected company.')
    const one = templateOf(row.template_id)
    if (row.action === 'save') {
      if (!one) {
        if (row.expected_revision !== 0) return refuse('not-found', 'The dashboard has no such item.')
        const made = { template_id: row.template_id, name: row.name.trim(), revision: 1, body: row.body, history: [], companies: [{ brn: state.selected, own_values: {}, values_revision: 1 }] }
        made.history.push({ revision: 1, name: made.name, body: row.body, saved_at: now() })
        state.templates.push(made)
        return { ok: true, result: { action: 'save', template_id: made.template_id, name: made.name, revision: 1, updated_at: now() } }
      }
      if (!usedHere(one)) return refuse('not-found', 'The dashboard has no such item.')
      if (!access(one).can_change) return refuse('forbidden', 'Only an admin of this company can do this.')
      if (one.revision !== row.expected_revision) return refuse('stale', 'It was saved by someone else since you loaded it. Reload, then make the change again.')
      one.revision += 1
      one.name = row.name.trim()
      one.body = row.body
      one.history.push({ revision: one.revision, name: one.name, body: row.body, saved_at: now() })
      return { ok: true, result: { action: 'save', template_id: one.template_id, name: one.name, revision: one.revision, updated_at: now() } }
    }
    if (!usedHere(one)) return refuse('not-found', 'This company does not use that MRA template. Reload the list.')
    const link = linkHere(one)
    if (row.action === 'values') {
      if (link.values_revision !== row.expected_revision) return refuse('stale', 'It was saved by someone else since you loaded it. Reload, then make the change again.')
      link.values_revision += 1
      link.own_values = row.own_values
      return { ok: true, result: { action: 'values', template_id: one.template_id, name: one.name, company: selected().name, values_revision: link.values_revision, updated_at: now() } }
    }
    if (row.action === 'attach') {
      const target = admins().find((company) => norm(company.brn) === norm(row.company_brn))
      if (!target) return refuse('forbidden', 'Only a company where you are an admin can use this template.')
      if (one.companies.some((company) => norm(company.brn) === norm(target.brn))) return refuse('stale', 'That company already uses this MRA template. Reload, then try again.')
      one.companies.push({ brn: target.brn, own_values: row.own_values ?? {}, values_revision: 1 })
      return { ok: true, result: { action: 'attach', template_id: one.template_id, name: one.name, brn: target.brn, company: target.name, values_revision: 1 } }
    }
    if (row.action === 'detach') {
      if (one.revision !== row.expected_revision) return refuse('stale', 'It was saved by someone else since you loaded it. Reload, then make the change again.')
      one.companies = one.companies.filter((company) => company !== link)
      const deleted = one.companies.length === 0
      if (deleted) state.templates = state.templates.filter((other) => other !== one)
      return { ok: true, result: { action: 'detach', template_id: one.template_id, name: one.name, company: selected().name, deleted } }
    }
    return refuse('invalid', 'The request is not valid.')
  }

  function handle(type, payload) {
    if (payload.dataType === 'mra-template' && (type === 'request-data' || type === 'send-data')) {
      if (state.refuseAll) return refuse(state.refuseAll.code, state.refuseAll.error)
      return handleTemplate(type, payload)
    }
    if (type !== 'request-data' || payload.dataType !== 'mra-batch') return { ok: false, error: 'This app is not registered for that data type.' }
    const params = payload.params ?? {}
    state.requests.push(params)
    if (state.refuseAll) return refuse(state.refuseAll.code, state.refuseAll.error)
    if (params.brn !== undefined && norm(params.brn) !== norm(state.selected)) return refuse('wrong-company', 'The BRN sent is not the selected company.')
    if (params.action === 'companies') {
      return { ok: true, dataType: 'mra-batch', rows: admins().map((one) => ({ brn: one.brn, name: one.name, selected: norm(one.brn) === norm(state.selected) })), meta: meta() }
    }
    if (params.action === 'ask') {
      if (!params.brn || !isMonth(params.period) || !Array.isArray(params.companies) || params.companies.length < 1 || params.companies.length > 200) {
        return refuse('invalid', 'The request is not valid.')
      }
      const mine = admins()
      const chosen = [...new Set(params.companies.map(norm))].map((brn) => mine.find((one) => norm(one.brn) === brn))
      if (chosen.some((one) => !one)) return refuse('forbidden', 'Only companies where you are an admin can be chosen.')
      state.asked.push({ period: params.period, names: chosen.map((one) => one.name) })
      // Still on the dashboard's screen: no answer yet.
      if (state.answer === 'hold') return undefined
      if (state.answer === 'deny') return refuse('denied', 'The request was declined in the dashboard.')
      if (state.answer === 'timeout') return refuse('timeout', 'Nobody answered in the dashboard.')
      if (state.answer === 'locked' || !state.unlocked) return refuse('locked', 'The dashboard is locked.')
      state.allowed = { period: params.period, brns: chosen.map((one) => norm(one.brn)) }
      return { ok: true, dataType: 'mra-batch', rows: chosen.map((one) => ({ brn: one.brn, name: one.name })), meta: meta(params.period) }
    }
    if (params.action === 'load') {
      if (!params.brn || !isMonth(params.period) || !params.company_brn) return refuse('invalid', 'The request is not valid.')
      const wanted = norm(params.company_brn)
      if (!state.allowed || state.allowed.period !== params.period || !state.allowed.brns.includes(wanted)) {
        return refuse('denied', 'That company and month were not allowed in the dashboard for this app. Ask again.')
      }
      if (!state.unlocked) return refuse('locked', 'The dashboard is locked. Confirm your password there to unlock it, then ask again.')
      const target = admins().find((one) => norm(one.brn) === wanted)
      if (!target) return refuse('forbidden', 'Only an admin of that company can make its MRA returns.')
      const employees = target.runs[params.period]
      return {
        ok: true,
        dataType: 'mra-batch',
        rows: [
          {
            brn: target.brn,
            name: target.name,
            address: target.address,
            period: params.period,
            run: employees !== undefined,
            employees: employees ?? [],
            mra: state.mra[target.brn] ?? { ern: '', telephone: '', mobile: '', declarant: '' },
            email: state.email,
            templates: state.templates
              .flatMap((one) => one.companies.filter((company) => norm(company.brn) === norm(target.brn)).map((company) => ({ template_id: one.template_id, own_values: company.own_values, values_revision: company.values_revision }))),
          },
        ],
        meta: meta(params.period),
      }
    }
    return refuse('invalid', 'The request is not valid.')
  }

  return { state, handle }
}
