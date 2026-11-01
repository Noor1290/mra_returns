// The return files of several companies at once: ONE question in the dashboard for the month and
// every company chosen (mra-batch `ask`), then each company's saved run, one at a time (`load`),
// made into one file per template. A company with a problem is skipped or partly made, and the
// others still go through. Everything is in memory: the runs, the files and the zip are never
// stored. A company's file is made exactly as its single download is (makeReturnFile).

import { folderNameFor, uniqueName } from './fileName'
import { normaliseBrn, type Failure } from './hubWire'
import { companyInfo, makeReturnFile, type ReturnFile } from './returnFile'
import type { Allowed, Loaded, SavedRun } from './runStore'
import { cellsOf, COMPANY_FIELDS, readOwnValues, type CompanyField, type TemplateBody } from './template'

export interface BatchTemplate {
  template_id: string
  name: string
  body: TemplateBody
}

/** The way to the companies' saved runs: the dashboard, or the fake sample. */
export interface BatchSource {
  ask(period: string, brns: readonly string[]): Promise<Allowed>
  load(period: string, brn: string): Promise<Loaded>
}

/**
 * Why a file was not made: the dashboard did not allow the company (no longer its admin), or did
 * not send its run; the month was never sent to the dashboard; the company does not use the
 * template.
 */
export type SkipReason = 'not-allowed' | 'refused' | 'no-run' | 'not-used'

export type FileOutcome =
  | { template: BatchTemplate; made: true; file: ReturnFile; path: string }
  | { template: BatchTemplate; made: false; reason: SkipReason }

export interface CompanyOutcome {
  brn: string
  name: string
  /** The dashboard's refusal, when it did not send this company's run. */
  failure: Failure | null
  /** Its saved run (memory only), to name the employees in the report. */
  run: SavedRun | null
  files: FileOutcome[]
  /** The company details its templates mark Required that are empty: ERN, declarant... */
  missingDetails: CompanyField[]
}

export interface BatchResult {
  period: string
  /** When the files were made: in the report and the zip. */
  at: Date
  companies: CompanyOutcome[]
}

export type BatchAnswer = { ok: true; result: BatchResult } | { ok: false; failure: Failure }

/** "Company 3 of 10: ABC Co Ltd". */
export interface Progress {
  number: number
  total: number
  name: string
}

/** The company details these templates mark Required that the company does not have. */
export function missingDetails(templates: readonly Pick<BatchTemplate, 'body'>[], run: SavedRun): CompanyField[] {
  const used = new Set<CompanyField>()
  for (const template of templates) {
    for (const { cell } of cellsOf(template.body)) if (cell.required && cell.source.type === 'company') used.add(cell.source.field)
  }
  const info = companyInfo(run)
  return COMPANY_FIELDS.filter((field) => used.has(field) && info[field].trim() === '')
}

/** One company's files from its saved run: one per template it uses. The paths come later. */
export function companyFiles(templates: readonly BatchTemplate[], run: SavedRun): Omit<CompanyOutcome, 'failure'> {
  const uses = (template: BatchTemplate) => run.templates.find((link) => link.template_id === template.template_id)
  const files: FileOutcome[] = templates.map((template) => {
    if (!run.run) return { template, made: false, reason: 'no-run' }
    const link = uses(template)
    if (!link) return { template, made: false, reason: 'not-used' }
    const file = makeReturnFile(template.body, readOwnValues(link.own_values), run, run.period, run.employees)
    return { template, made: true, file, path: '' }
  })
  return { brn: run.brn, name: run.name, run, files, missingDetails: missingDetails(templates.filter(uses), run) }
}

export const REPORT_NAME = 'Report.txt'

/**
 * Where each file goes in the zip: a folder per template, named after it, holding one file per
 * company. Two names that Windows would take for the same get " (2)".
 */
function place(templates: readonly BatchTemplate[], companies: CompanyOutcome[]): void {
  const folders = new Set<string>([REPORT_NAME.toLowerCase()])
  for (const template of templates) {
    let folder = folderNameFor(template.name)
    for (let n = 2; folders.has(folder.toLowerCase()); n++) folder = `${folderNameFor(template.name)} (${n})`
    folders.add(folder.toLowerCase())
    const names = new Set<string>()
    for (const company of companies) {
      for (const outcome of company.files) {
        if (outcome.made && outcome.template.template_id === template.template_id) outcome.path = `${folder}/${uniqueName(outcome.file.fileName, names)}`
      }
    }
  }
}

/**
 * Asks once for the month and every company chosen, then makes each company's files in turn.
 * Refused as a whole only when the question itself is (denied, locked, nobody answered...).
 */
export async function runBatch(
  source: BatchSource,
  input: { period: string; templates: readonly BatchTemplate[]; companies: readonly { brn: string; name: string }[] },
  onProgress: (progress: Progress) => void,
  now: () => Date = () => new Date(),
): Promise<BatchAnswer> {
  const { period, templates, companies } = input
  const allowed = await source.ask(
    period,
    companies.map((company) => company.brn),
  )
  if (!allowed.ok) return allowed
  const granted = new Set(allowed.companies.map((company) => normaliseBrn(company.brn)))
  const skipped = (reason: SkipReason): FileOutcome[] => templates.map((template) => ({ template, made: false, reason }))

  const outcomes: CompanyOutcome[] = []
  for (const [index, company] of companies.entries()) {
    onProgress({ number: index + 1, total: companies.length, name: company.name })
    // Left out of the dashboard's answer: the user stopped being its admin.
    if (!granted.has(normaliseBrn(company.brn))) {
      outcomes.push({ brn: company.brn, name: company.name, failure: null, run: null, files: skipped('not-allowed'), missingDetails: [] })
      continue
    }
    const loaded = await source.load(period, company.brn)
    if (!loaded.ok) {
      outcomes.push({ brn: company.brn, name: company.name, failure: loaded.failure, run: null, files: skipped('refused'), missingDetails: [] })
      continue
    }
    outcomes.push({ ...companyFiles(templates, loaded.run), failure: null })
  }
  place(templates, outcomes)
  return { ok: true, result: { period, at: now(), companies: outcomes } }
}

/** Every file made, with where it goes in the zip. */
export function madeFiles(result: BatchResult): { company: CompanyOutcome; template: BatchTemplate; file: ReturnFile; path: string }[] {
  return result.companies.flatMap((company) => company.files.flatMap((outcome) => (outcome.made ? [{ company, template: outcome.template, file: outcome.file, path: outcome.path }] : [])))
}
