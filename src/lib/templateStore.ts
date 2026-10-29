// The templates, kept in the dashboard ("mra-template", payroll_hub docs/INTEGRATION.md): the
// list for the selected company, one template with its body and this company's own values, its
// History, and the saves. Every answer is checked with Zod and must be about the company the app
// is showing; a body that is not a template this app understands is not used.
//
// Opened on its own, the app has no dashboard: demoTemplateStore() keeps FAKE templates in
// memory instead, with the same rules, so "Try with fake sample data" can be used end to end.

import { z } from 'zod'
import { demoTemplate } from '../data/mraLayouts'
import { ask, failure, normaliseBrn, save, type Failure, type HubPort } from './hubWire'
import { NO_OWN_VALUES, readOwnValues, templateBodySchema, type OwnValues, type TemplateBody } from './template'

export const MRA_TEMPLATE = 'mra-template'

const uuid = z.uuid()
const name = z.string().min(1).max(80)
const stamp = z.string().max(40)

const summarySchema = z.object({
  template_id: uuid,
  name,
  revision: z.number().int().min(1),
  updated_at: stamp,
  updated_by_you: z.boolean(),
  can_change: z.boolean(),
  companies: z.number().int().min(0),
  admin_of: z.number().int().min(0),
  values_revision: z.number().int().min(1),
})
export type TemplateSummary = z.infer<typeof summarySchema>

const loadedSchema = summarySchema.extend({ body: z.unknown(), own_values: z.unknown() })

export interface LoadedTemplate extends TemplateSummary {
  body: TemplateBody
  own: OwnValues
}

const historySchema = z.object({ revision: z.number().int().min(1), name, saved_at: stamp, saved_by_you: z.boolean() })
export type TemplateRevision = z.infer<typeof historySchema>

const keptSchema = historySchema.extend({ template_id: uuid, body: z.unknown() })

const companySchema = z.object({ brn: z.string().min(1).max(50), name: z.string().max(120), selected: z.boolean(), uses: z.boolean() })
export type TemplateCompany = z.infer<typeof companySchema>

const savedSchema = z.object({ template_id: uuid, name, revision: z.number().int().min(1) })
const valuesSavedSchema = z.object({ template_id: uuid, values_revision: z.number().int().min(1) })
const attachedSchema = z.object({ template_id: uuid, brn: z.string(), company: z.string(), values_revision: z.number().int().min(1) })
const detachedSchema = z.object({ template_id: uuid, name, deleted: z.boolean() })

export type StoreAnswer<T> = { ok: true; value: T } | { ok: false; failure: Failure }

export interface TemplateStore {
  list(): Promise<StoreAnswer<TemplateSummary[]>>
  load(id: string): Promise<StoreAnswer<LoadedTemplate>>
  history(id: string): Promise<StoreAnswer<TemplateRevision[]>>
  revision(id: string, revision: number): Promise<StoreAnswer<TemplateBody>>
  companies(id: string): Promise<StoreAnswer<TemplateCompany[]>>
  /** Makes the template (expectedRevision 0, for this company) or saves over it. */
  save(input: { id: string; name: string; body: TemplateBody; expectedRevision: number }): Promise<StoreAnswer<{ revision: number; name: string }>>
  saveValues(input: { id: string; own: OwnValues; expectedRevision: number }): Promise<StoreAnswer<{ valuesRevision: number }>>
  attach(id: string, companyBrn: string): Promise<StoreAnswer<{ company: string }>>
  /** Takes it out of this company; from the last one, deletes it with its history. */
  detach(id: string, expectedRevision: number): Promise<StoreAnswer<{ deleted: boolean }>>
}

const bad = <T>(): StoreAnswer<T> => ({ ok: false, failure: failure('bad-answer') })

/** A body from the dashboard, as a template this app understands, or null. */
function readBody(body: unknown): TemplateBody | null {
  const parsed = templateBodySchema.safeParse(body)
  return parsed.success ? parsed.data : null
}

/** The templates of the company selected in the dashboard, which has this BRN. */
export function hubTemplateStore(port: HubPort, brn: string): TemplateStore {
  const request = <T>(params: Record<string, unknown>, rowSchema: z.ZodType<T>) => ask(port, MRA_TEMPLATE, params, brn, rowSchema, { maxRows: 5_000 })
  const send = <T>(row: Record<string, unknown>, resultSchema: z.ZodType<T>) => save(port, MRA_TEMPLATE, { ...row, brn }, resultSchema)

  return {
    async list() {
      const answer = await request({ action: 'list' }, summarySchema)
      return answer.ok ? { ok: true, value: answer.rows } : answer
    },
    async load(id) {
      const answer = await request({ action: 'load', template_id: id }, loadedSchema)
      if (!answer.ok) return answer
      const [row] = answer.rows
      if (answer.rows.length !== 1 || row.template_id !== id) return bad()
      const body = readBody(row.body)
      if (!body) return bad()
      const { body: _body, own_values: own, ...summary } = row
      return { ok: true, value: { ...summary, body, own: readOwnValues(own) } }
    },
    async history(id) {
      const answer = await request({ action: 'history', template_id: id }, historySchema)
      return answer.ok ? { ok: true, value: answer.rows } : answer
    },
    async revision(id, revision) {
      const answer = await request({ action: 'revision', template_id: id, revision }, keptSchema)
      if (!answer.ok) return answer
      const [row] = answer.rows
      const body = answer.rows.length === 1 && row.template_id === id && row.revision === revision ? readBody(row.body) : null
      return body ? { ok: true, value: body } : bad()
    },
    async companies(id) {
      const answer = await request({ action: 'companies', template_id: id }, companySchema)
      return answer.ok ? { ok: true, value: answer.rows } : answer
    },
    async save({ id, name: templateName, body, expectedRevision }) {
      const saved = await send({ action: 'save', template_id: id, name: templateName, body, expected_revision: expectedRevision }, savedSchema)
      if (!saved.ok) return saved
      return saved.result.template_id === id ? { ok: true, value: { revision: saved.result.revision, name: saved.result.name } } : bad()
    },
    async saveValues({ id, own, expectedRevision }) {
      const saved = await send({ action: 'values', template_id: id, own_values: own, expected_revision: expectedRevision }, valuesSavedSchema)
      if (!saved.ok) return saved
      return saved.result.template_id === id ? { ok: true, value: { valuesRevision: saved.result.values_revision } } : bad()
    },
    async attach(id, companyBrn) {
      const saved = await send({ action: 'attach', template_id: id, company_brn: companyBrn }, attachedSchema)
      if (!saved.ok) return saved
      return saved.result.template_id === id && normaliseBrn(saved.result.brn) === normaliseBrn(companyBrn) ? { ok: true, value: { company: saved.result.company } } : bad()
    },
    async detach(id, expectedRevision) {
      const saved = await send({ action: 'detach', template_id: id, expected_revision: expectedRevision }, detachedSchema)
      if (!saved.ok) return saved
      return saved.result.template_id === id ? { ok: true, value: { deleted: saved.result.deleted } } : bad()
    },
  }
}

/** The fake sample's templates, as if uploaded from the MRA portal and set up. */
export const DEMO_TEMPLATE_IDS = { csg: '00000000-0000-4000-8000-00000000c560', prgf: '00000000-0000-4000-8000-0000000097f0' } as const

/**
 * FAKE templates in memory for the app opened on its own: ABC Co Ltd with the CSG and PRGF
 * templates, and a second fake company, DEF Ltd, to use one in. The same rules as the dashboard.
 */
export function demoTemplateStore(): TemplateStore {
  interface Stored {
    summary: TemplateSummary
    body: TemplateBody
    own: OwnValues
    history: (TemplateRevision & { body: TemplateBody })[]
    usedBy: Set<string>
  }
  const at = '2026-10-28T09:00:00+04:00'
  const make = (id: string, templateName: string, body: TemplateBody): Stored => ({
    summary: { template_id: id, name: templateName, revision: 1, updated_at: at, updated_by_you: true, can_change: true, companies: 1, admin_of: 1, values_revision: 1 },
    body,
    own: NO_OWN_VALUES,
    history: [{ revision: 1, name: templateName, saved_at: at, saved_by_you: true, body }],
    usedBy: new Set(['C1234567']),
  })
  const store = new Map<string, Stored>([
    [DEMO_TEMPLATE_IDS.csg, make(DEMO_TEMPLATE_IDS.csg, 'MRA CSG (PACO)', demoTemplate('csg'))],
    [DEMO_TEMPLATE_IDS.prgf, make(DEMO_TEMPLATE_IDS.prgf, 'MRA PRGF', demoTemplate('prgf'))],
  ])
  const companies = [
    { brn: 'C1234567', name: 'ABC Co Ltd' },
    { brn: 'C3333333', name: 'DEF Ltd' },
  ]
  const copy = <T>(value: T): T => structuredClone(value)
  const missing = <T>(): StoreAnswer<T> => ({ ok: false, failure: failure('not-found') })
  const ok = <T>(value: T): StoreAnswer<T> => ({ ok: true, value })
  const pause = () => new Promise((resolve) => setTimeout(resolve, 150))
  const summary = (one: Stored): TemplateSummary => ({ ...one.summary, companies: one.usedBy.size, admin_of: one.usedBy.size })

  return {
    async list() {
      await pause()
      return ok([...store.values()].map(summary).sort((a, b) => a.name.localeCompare(b.name)))
    },
    async load(id) {
      await pause()
      const one = store.get(id)
      return one ? ok({ ...summary(one), body: copy(one.body), own: copy(one.own) }) : missing()
    },
    async history(id) {
      await pause()
      const one = store.get(id)
      return one ? ok(one.history.map(({ body: _body, ...row }) => row).reverse()) : missing()
    },
    async revision(id, revision) {
      const one = store.get(id)
      const kept = one?.history.find((row) => row.revision === revision)
      return kept ? ok(copy(kept.body)) : missing()
    },
    async companies(id) {
      const one = store.get(id)
      if (!one) return missing()
      return ok(companies.map((company) => ({ ...company, selected: company.brn === 'C1234567', uses: one.usedBy.has(company.brn) })))
    },
    async save({ id, name: templateName, body, expectedRevision }) {
      await pause()
      const one = store.get(id)
      if (!one) {
        if (expectedRevision !== 0) return missing()
        const made = make(id, templateName.trim(), copy(body))
        store.set(id, made)
        return ok({ revision: 1, name: made.summary.name })
      }
      if (one.summary.revision !== expectedRevision) return { ok: false, failure: failure('stale') }
      const revision = one.summary.revision + 1
      one.summary = { ...one.summary, name: templateName.trim(), revision, updated_at: new Date().toISOString() }
      one.body = copy(body)
      one.history.push({ revision, name: one.summary.name, saved_at: one.summary.updated_at, saved_by_you: true, body: copy(body) })
      return ok({ revision, name: one.summary.name })
    },
    async saveValues({ id, own, expectedRevision }) {
      await pause()
      const one = store.get(id)
      if (!one) return missing()
      if (one.summary.values_revision !== expectedRevision) return { ok: false, failure: failure('stale') }
      one.own = copy(own)
      one.summary = { ...one.summary, values_revision: expectedRevision + 1 }
      return ok({ valuesRevision: expectedRevision + 1 })
    },
    async attach(id, companyBrn) {
      await pause()
      const one = store.get(id)
      const company = companies.find((candidate) => candidate.brn === companyBrn)
      if (!one || !company) return missing()
      if (one.usedBy.has(company.brn)) return { ok: false, failure: failure('stale') }
      one.usedBy.add(company.brn)
      return ok({ company: company.name })
    },
    async detach(id, expectedRevision) {
      await pause()
      const one = store.get(id)
      if (!one) return missing()
      if (one.summary.revision !== expectedRevision) return { ok: false, failure: failure('stale') }
      one.usedBy.delete('C1234567')
      const deleted = one.usedBy.size === 0
      store.delete(id)
      return ok({ deleted })
    },
  }
}
