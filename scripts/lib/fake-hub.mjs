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

  function handle(type, payload) {
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
        rows: [{ brn: target.brn, name: target.name, address: target.address, period: params.period, run: employees !== undefined, employees: employees ?? [] }],
        meta: meta(params.period),
      }
    }
    return refuse('invalid', 'The request is not valid.')
  }

  return { state, handle }
}
