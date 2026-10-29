// FAKE companies for "Several companies at once" in the app opened on its own: ABC Co Ltd (the
// fake sample, with its templates), DEF Ltd (MRA details not filled in, one employee with no
// surname, uses the CSG template only) and GHI Ltd (the month was never sent to the dashboard).
// Invented companies, names, IDs and figures.

import type { BatchSource } from '../lib/batch'
import type { BatchCompany, SavedRun } from '../lib/runStore'
import type { TemplateStore } from '../lib/templateStore'
import { DEMO_TEMPLATE_IDS } from '../lib/templateStore'
import { DEMO_RUN } from './demoRun'

export const DEMO_COMPANIES: BatchCompany[] = [
  { brn: 'C1234567', name: 'ABC Co Ltd', selected: true },
  { brn: 'C3333333', name: 'DEF Ltd', selected: false },
  { brn: 'C4444444', name: 'GHI Ltd', selected: false },
]

const [first, second] = DEMO_RUN.employees
const defEmployees = [
  { ...first, ID: 'X0000000000011', Surname: 'SAMPLE', 'Other names': 'ANNE', 'Company Name': 'DEF Ltd', BRN: 'C3333333' },
  { ...second, ID: 'X0000000000012', Surname: '', 'Other names': 'BEN', 'Company Name': 'DEF Ltd', BRN: 'C3333333' },
]

const NO_DETAILS = { ern: '', telephone: '', mobile: '', declarant: '' }

/** The fake sample's companies, reading ABC Co Ltd's templates and own values from the fake store. */
export function demoBatchSource(store: TemplateStore): BatchSource {
  const pause = () => new Promise((resolve) => setTimeout(resolve, 300))
  return {
    async ask(_period, brns) {
      await pause()
      return { ok: true, companies: DEMO_COMPANIES.filter((company) => brns.includes(company.brn)).map(({ brn, name }) => ({ brn, name })) }
    },
    async load(period, brn) {
      await pause()
      if (brn === 'C1234567') {
        const list = await store.list()
        const templates: SavedRun['templates'] = []
        for (const summary of list.ok ? list.value : []) {
          const one = await store.load(summary.template_id)
          if (one.ok) templates.push({ template_id: summary.template_id, own_values: one.value.own, values_revision: one.value.values_revision })
        }
        return { ok: true, run: { ...DEMO_RUN, period, templates } }
      }
      const csgOnly = [{ template_id: DEMO_TEMPLATE_IDS.csg, own_values: {}, values_revision: 1 }]
      if (brn === 'C3333333') {
        return { ok: true, run: { brn, name: 'DEF Ltd', address: null, period, run: true, employees: defEmployees, mra: NO_DETAILS, email: DEMO_RUN.email, templates: csgOnly } }
      }
      return { ok: true, run: { brn, name: 'GHI Ltd', address: null, period, run: false, employees: [], mra: NO_DETAILS, email: DEMO_RUN.email, templates: csgOnly } }
    },
  }
}
