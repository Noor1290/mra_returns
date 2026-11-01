// Saved payroll runs from the dashboard: "mra-batch" (docs/INTEGRATION.md in the payroll_hub
// repo). Read only: nothing is ever saved through it. The dashboard lists only the companies
// where the user is an admin, asks its user ONCE (password gate open) for the month and the
// companies, and then answers one company at a time with its saved run of that month. The rows
// are per-employee data: memory only, never stored.

import { z } from 'zod'
import type { BatchSource } from './batch'
import { ask, failure, normaliseBrn, type Failure, type HubPort } from './hubWire'

export const HUB_APP_ID = 'mra-returns'
export const MRA_BATCH = 'mra-batch'
/** The most companies one ask may name; the dashboard has the same limit. */
export const ASK_MAX_COMPANIES = 200
/** A company's run can be large: the app gives the dashboard this long to answer for one company. */
const LOAD_TIMEOUT_MS = 60_000

const brn = z.string().min(1).max(50)
const companyName = z.string().max(120)
const month = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/)

const companySchema = z.object({ brn, name: companyName, selected: z.boolean() })
export type BatchCompany = z.infer<typeof companySchema>

export type CompaniesAnswer =
  | { ok: true; companies: BatchCompany[]; selectedBrn: string; selectedName: string }
  | { ok: false; failure: Failure }

/** The companies where the user is an admin, the one selected in the dashboard first. Names only. */
export async function listCompanies(port: HubPort): Promise<CompaniesAnswer> {
  const answer = await ask(port, MRA_BATCH, { action: 'companies' }, null, companySchema, { maxRows: 5_000 })
  if (!answer.ok) return answer
  const selected = answer.rows.filter((row) => row.selected)
  // The dashboard names the selected company in meta; it must be the one marked in the rows.
  if (selected.length > 1 || (selected.length === 1 && normaliseBrn(selected[0].brn) !== normaliseBrn(answer.company.brn))) {
    return { ok: false, failure: failure('bad-answer') }
  }
  return { ok: true, companies: answer.rows, selectedBrn: answer.company.brn, selectedName: answer.company.name }
}

const grantedSchema = z.object({ brn, name: companyName })
export type Allowed = { ok: true; companies: z.infer<typeof grantedSchema>[] } | { ok: false; failure: Failure }

/**
 * Asks the dashboard's user, once, to allow that month for those companies (one or several).
 * Waits as long as the dashboard asks its user (up to two minutes).
 */
export async function askForCompanies(port: HubPort, selectedBrn: string, period: string, chosen: readonly string[]): Promise<Allowed> {
  if (chosen.length === 0 || chosen.length > ASK_MAX_COMPANIES) return { ok: false, failure: failure('invalid') }
  const answer = await ask(port, MRA_BATCH, { action: 'ask', period, companies: [...chosen] }, selectedBrn, grantedSchema, {
    timeoutMs: null,
    maxRows: ASK_MAX_COMPANIES,
  })
  if (!answer.ok) return answer
  if (answer.period !== period) return { ok: false, failure: failure('bad-answer') }
  return { ok: true, companies: answer.rows }
}

/** One employee's row of a saved run: the keys of the payroll export, exactly as stored. */
export type RunRow = Record<string, unknown>

const detail = (max: number) => z.string().max(max)

export const runSchema = z
  .object({
    brn,
    name: companyName,
    address: z.string().max(500).nullable(),
    period: month,
    run: z.boolean(),
    // Whether the saved run is approved in the dashboard; an older dashboard does not say.
    status: z.enum(['draft', 'approved']).nullable().optional(),
    employees: z.array(z.record(z.string(), z.unknown())).max(10_000),
    // Since the dashboard's migration 0020: the company's MRA details (from its Company profile),
    // the signed-in user's own email for the returns, and its own values for its templates.
    mra: z
      .object({ ern: detail(20), telephone: detail(30), mobile: detail(30), declarant: detail(120) })
      .default({ ern: '', telephone: '', mobile: '', declarant: '' }),
    email: detail(254).default(''),
    templates: z
      .array(z.object({ template_id: z.uuid(), own_values: z.unknown(), values_revision: z.number().int().min(1) }))
      .max(100)
      .default([]),
  })
  // A month that was never sent to the dashboard has no employees.
  .refine((row) => row.run || row.employees.length === 0)

/** One company's saved run of a month, as the dashboard sends it. */
export type SavedRun = z.infer<typeof runSchema>

/** A saved month the dashboard says is not approved. It can still be used. */
export const isDraft = (run: Pick<SavedRun, 'run' | 'status'>) => run.run && run.status === 'draft'

export type Loaded = { ok: true; run: SavedRun } | { ok: false; failure: Failure }

/** Several companies' runs through the dashboard: one question, then one company at a time. */
export function hubBatchSource(port: HubPort, selectedBrn: string): BatchSource {
  return {
    ask: (period, brns) => askForCompanies(port, selectedBrn, period, brns),
    load: (period, brn) => loadRun(port, selectedBrn, period, brn),
  }
}

/**
 * Asks the dashboard to show a company's Company profile, where its MRA details are filled in.
 * Nothing comes back but yes or no. For another company than the selected one, the dashboard
 * selects it first, which starts this app again.
 */
export async function openProfile(port: HubPort, selectedBrn: string, companyBrn: string): Promise<Failure | null> {
  const answer = await ask(port, MRA_BATCH, { action: 'open-profile', company_brn: companyBrn }, selectedBrn, z.never(), { maxRows: 0 })
  return answer.ok ? null : answer.failure
}

/** One company's saved run of the month. Only after the user allowed it in the dashboard. */
export async function loadRun(port: HubPort, selectedBrn: string, period: string, companyBrn: string): Promise<Loaded> {
  const answer = await ask(port, MRA_BATCH, { action: 'load', period, company_brn: companyBrn }, selectedBrn, runSchema, {
    maxRows: 1,
    timeoutMs: LOAD_TIMEOUT_MS,
  })
  if (!answer.ok) return answer
  const [run] = answer.rows
  // One row, about the company asked for and the month asked for: anything else is not used.
  if (answer.rows.length !== 1 || normaliseBrn(run.brn) !== normaliseBrn(companyBrn) || run.period !== period) {
    return { ok: false, failure: failure('bad-answer') }
  }
  return { ok: true, run }
}
