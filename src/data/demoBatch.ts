// FAKE companies for "Several companies at once" in the app opened on its own: ABC Co Ltd (the
// fake sample, with its templates), DEF Ltd (MRA details not filled in, one employee with no
// surname, uses the CSG template only), GHI Ltd (the month was never sent to the dashboard) and
// JKL Ltd (a month not approved, names a file cannot hold, a total with cents). Invented companies, names, IDs and figures.

import type { BatchSource } from '../lib/batch'
import type { BatchCompany, SavedRun } from '../lib/runStore'
import type { TemplateStore } from '../lib/templateStore'
import { DEMO_TEMPLATE_IDS } from '../lib/templateStore'
import { DEMO_RUN } from './demoRun'

export const DEMO_COMPANIES: BatchCompany[] = [
  { brn: 'C1234567', name: 'ABC Co Ltd', selected: true },
  { brn: 'C3333333', name: 'DEF Ltd', selected: false },
  { brn: 'C4444444', name: 'GHI Ltd', selected: false },
  { brn: 'C5555555', name: 'JKL Ltd', selected: false },
]

const [first, second] = DEMO_RUN.employees
const defEmployees = [
  { ...first, ID: 'X0000000000011', Surname: 'SAMPLE', 'Other names': 'ANNE', 'Company Name': 'DEF Ltd', BRN: 'C3333333' },
  { ...second, ID: 'X0000000000012', Surname: '', 'Other names': 'BEN', 'Company Name': 'DEF Ltd', BRN: 'C3333333' },
]

const third = DEMO_RUN.employees[2]
const jklEmployees = [
  { ...first, ID: 'X0000000000021', Surname: 'SAMPLE', 'Other names': 'Paul, Jr', 'Company Name': 'JKL Ltd', BRN: 'C5555555' },
  { ...second, ID: 'X0000000000022', Surname: 'Mihai\u0219or', 'Other names': 'ANA', 'Company Name': 'JKL Ltd', BRN: 'C5555555' },
  { ...third, ID: 'X0000000000023', Surname: 'TEST', 'Other names': 'CARA', 'New Basic Salary': 20000.5, Allowances: 1000.5, Emoluments: 21001, 'Gross Pay': 21001, 'Company Name': 'JKL Ltd', BRN: 'C5555555' },
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
        return { ok: true, run: { brn, name: 'DEF Ltd', address: null, period, run: true, status: 'approved', employees: defEmployees, mra: NO_DETAILS, email: DEMO_RUN.email, templates: csgOnly } }
      }
      if (brn === 'C5555555') {
        const both = [csgOnly[0], { template_id: DEMO_TEMPLATE_IDS.prgf, own_values: {}, values_revision: 1 }]
        return { ok: true, run: { brn, name: 'JKL Ltd', address: null, period, run: true, status: 'draft', employees: jklEmployees, mra: DEMO_RUN.mra, email: DEMO_RUN.email, templates: both } }
      }
      return { ok: true, run: { brn, name: 'GHI Ltd', address: null, period, run: false, employees: [], mra: NO_DETAILS, email: DEMO_RUN.email, templates: csgOnly } }
    },
  }
}
