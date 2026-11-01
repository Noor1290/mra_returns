import { CircleAlert, FileArchive, FileCheck2, TriangleAlert } from 'lucide-react'
import { useId, useMemo, useState } from 'react'
import { BeforeDownload, MissingDetails, NotApproved, RequiredList, SumNotes } from '../components/Alerts'
import { FailurePanel } from '../components/FailurePanel'
import { madeFiles, runBatch, type BatchResult, type BatchSource, type CompanyOutcome, type Progress } from '../lib/batch'
import { formatPeriod } from '../lib/dates'
import type { Failure } from '../lib/hubWire'
import { batchZip, countsOf, downloadChecks, EXCEL_REMINDER, hasChecks, madeAt, requiredLines, sumLines, unwritableLines, type DownloadChecks } from '../lib/report'
import { isDraft, type BatchCompany } from '../lib/runStore'
import type { TemplateStore } from '../lib/templateStore'
import { batchCountText, employeeName, halfNoteText, madeText, notApprovedText, problemText, skipText } from '../lib/wording'
import { download } from './ExportPanel'
import { useTemplates } from './useTemplates'

type Phase =
  | { status: 'idle' }
  | { status: 'asking' }
  | { status: 'running'; progress: Progress }
  | { status: 'failed'; failure: Failure }
  | { status: 'done'; result: BatchResult }

export interface BatchPanelProps {
  store: TemplateStore
  source: BatchSource
  /** The companies where the user is an admin: the dashboard lists no others. */
  companies: BatchCompany[]
  selectedBrn: string
  months: string[]
  initialPeriod: string
  version: number
  /** Opens a company's Company profile in the dashboard; null for the fake sample. */
  openProfile: ((brn: string) => Promise<Failure | null>) | null
}

/** The files of several companies at once: one question in the dashboard, one zip. */
export function BatchPanel({ store, source, companies, selectedBrn, months, initialPeriod, version, openProfile }: BatchPanelProps) {
  const { loaded, retry } = useTemplates(store, version)
  const [period, setPeriod] = useState(initialPeriod)
  const [untickedTemplates, setUntickedTemplates] = useState<Set<string>>(new Set())
  const [chosen, setChosen] = useState<Set<string>>(() => new Set(companies.map((company) => company.brn)))
  const [search, setSearch] = useState('')
  const [phase, setPhase] = useState<Phase>({ status: 'idle' })
  const [confirming, setConfirming] = useState<DownloadChecks | null>(null)
  const [downloaded, setDownloaded] = useState<string | null>(null)
  const searchId = useId()

  const templates = loaded.status === 'loaded' ? loaded.templates : []
  const tickedTemplates = templates.filter((template) => !untickedTemplates.has(template.template_id))
  const shown = useMemo(() => {
    const wanted = search.trim().toLowerCase()
    return wanted === '' ? companies : companies.filter((company) => company.name.toLowerCase().includes(wanted) || company.brn.toLowerCase().includes(wanted))
  }, [companies, search])
  const chosenCompanies = companies.filter((company) => chosen.has(company.brn))
  const busy = phase.status === 'asking' || phase.status === 'running'

  // A new choice: the report shown is no longer about it.
  const changed = () => {
    setPhase({ status: 'idle' })
    setDownloaded(null)
  }
  const setCompanies = (next: Set<string>) => {
    setChosen(next)
    changed()
  }

  const make = async () => {
    setPhase({ status: 'asking' })
    setDownloaded(null)
    const answer = await runBatch(source, { period, templates: tickedTemplates, companies: chosenCompanies.map(({ brn, name }) => ({ brn, name })) }, (progress) =>
      setPhase({ status: 'running', progress }),
    )
    setPhase(answer.ok ? { status: 'done', result: answer.result } : { status: 'failed', failure: answer.failure })
  }

  const downloadZip = (result: BatchResult) => {
    const zip = batchZip(result)
    download(zip, 'application/zip')
    setDownloaded(zip.fileName)
  }

  return (
    <section className="card rise-in" aria-labelledby="batch-title" data-testid="batch">
      <div className="card-header">
        <h2 id="batch-title" className="card-title">
          Several companies at once
        </h2>
      </div>
      <div className="flex flex-col gap-4 p-5">
        <p className="m-0 text-sm text-muted">
          One zip with a folder per template, one file per company in each, and a report. The dashboard asks you once for all of them.
        </p>

        {loaded.status === 'loading' && (
          <div role="status" className="flex flex-col gap-2">
            <span className="sr-only">Loading</span>
            <div className="skeleton h-16 w-full" />
          </div>
        )}
        {loaded.status === 'failed' && <FailurePanel failure={loaded.failure} onRetry={retry} />}
        {loaded.status === 'loaded' && templates.length === 0 && (
          <div className="panel" data-testid="batch-no-templates">
            <CircleAlert aria-hidden="true" />
            <p className="m-0 text-sm">This company has no templates yet. Make one under Templates first.</p>
          </div>
        )}

        {templates.length > 0 && (
          <>
            <label className="field w-fit">
              <span className="field-label">Month</span>
              <select
                className="input input-sm"
                data-values
                value={period}
                disabled={busy}
                onChange={(event) => {
                  setPeriod(event.target.value)
                  changed()
                }}
              >
                {months.map((month) => (
                  <option key={month} value={month}>
                    {formatPeriod(month)}
                  </option>
                ))}
              </select>
            </label>

            <fieldset className="flex flex-col gap-2 rounded-lg border border-line p-3" disabled={busy}>
              <legend className="field-label px-1">Templates</legend>
              {templates.map((template) => (
                <label key={template.template_id} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={!untickedTemplates.has(template.template_id)}
                    onChange={(event) => {
                      const next = new Set(untickedTemplates)
                      if (event.target.checked) next.delete(template.template_id)
                      else next.add(template.template_id)
                      setUntickedTemplates(next)
                      changed()
                    }}
                  />
                  {template.name}
                </label>
              ))}
            </fieldset>

            <fieldset className="flex flex-col gap-3 rounded-lg border border-line p-3" disabled={busy}>
              <legend className="field-label px-1">Companies</legend>
              <p className="m-0 text-sm text-muted">Only the companies where you are an admin are listed.</p>
              <div className="flex flex-wrap items-end gap-2">
                <label className="field" htmlFor={searchId}>
                  <span className="field-label">Search companies</span>
                  <input id={searchId} className="input input-sm" type="search" value={search} onChange={(event) => setSearch(event.target.value)} />
                </label>
                <button type="button" className="btn btn-sm" onClick={() => setCompanies(new Set([...chosen, ...shown.map((company) => company.brn)]))}>
                  Select all
                </button>
                <button type="button" className="btn btn-sm btn-ghost" onClick={() => setCompanies(new Set([...chosen].filter((brn) => !shown.some((company) => company.brn === brn))))}>
                  Clear
                </button>
              </div>
              <ul className="m-0 flex max-h-64 list-none flex-col gap-1 overflow-auto p-0" aria-label="Companies to include">
                {shown.map((company) => (
                  <li key={company.brn}>
                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={chosen.has(company.brn)}
                        onChange={(event) => {
                          const next = new Set(chosen)
                          if (event.target.checked) next.add(company.brn)
                          else next.delete(company.brn)
                          setCompanies(next)
                        }}
                      />
                      <span data-values>
                        {company.name}, BRN {company.brn}
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
              {shown.length === 0 && <p className="m-0 text-sm text-muted">No company matches the search.</p>}
              <p className="m-0 text-sm text-muted" data-testid="batch-chosen">
                {chosenCompanies.length} of {companies.length} {companies.length === 1 ? 'company' : 'companies'} chosen.
              </p>
            </fieldset>

            <div>
              <button type="button" className="btn btn-primary" disabled={busy || tickedTemplates.length === 0 || chosenCompanies.length === 0} onClick={() => void make()}>
                <FileArchive aria-hidden="true" />
                Make the zip
              </button>
            </div>
          </>
        )}

        {phase.status === 'asking' && (
          <p className="m-0 text-sm text-muted" role="status">
            Waiting for the dashboard. Allow it there when it asks.
          </p>
        )}
        {phase.status === 'running' && (
          <div className="flex flex-col gap-2" role="status" data-testid="batch-progress">
            <p className="m-0 text-sm">
              Company {phase.progress.number} of {phase.progress.total}: <span data-values>{phase.progress.name}</span>
            </p>
            <progress className="w-full" max={phase.progress.total} value={phase.progress.number - 1} aria-label="Companies done" />
          </div>
        )}
        {phase.status === 'failed' && <FailurePanel failure={phase.failure} />}

        {phase.status === 'done' && (
          <BatchReport
            result={phase.result}
            selectedBrn={selectedBrn}
            openProfile={openProfile}
            downloaded={downloaded}
            onDownload={() => {
              const checks = batchChecks(phase.result)
              if (hasChecks(checks)) setConfirming(checks)
              else downloadZip(phase.result)
            }}
          />
        )}
      </div>
      {confirming && phase.status === 'done' && (
        <BeforeDownload
          checks={confirming}
          onClose={() => setConfirming(null)}
          onDownload={() => {
            setConfirming(null)
            downloadZip(phase.result)
          }}
        />
      )}
    </section>
  )
}

/** What must be seen before the zip, by company and template. */
function batchChecks(result: BatchResult): DownloadChecks {
  return downloadChecks(madeFiles(result).map(({ company, template, file }) => ({ title: `${company.name}, ${template.name}`, file, employees: company.run?.employees ?? [] })))
}

function BatchReport({
  result,
  selectedBrn,
  openProfile,
  downloaded,
  onDownload,
}: {
  result: BatchResult
  selectedBrn: string
  openProfile: ((brn: string) => Promise<Failure | null>) | null
  downloaded: string | null
  onDownload: () => void
}) {
  const { made, skipped } = countsOf(result)
  return (
    <section className="flex flex-col gap-4" aria-labelledby="report-title" data-testid="batch-report">
      <div className="flex flex-col gap-1">
        <h3 id="report-title" className="m-0 text-base font-semibold">
          Report
        </h3>
        <p className="m-0 text-sm" data-testid="batch-counts">
          {batchCountText(made, skipped)}
        </p>
        <p className="m-0 text-sm text-muted">
          Made on <span data-values>{madeAt(result.at)}</span>. The report is also in the zip, as Report.txt.
        </p>
      </div>
      {result.companies.map((company) => (
        <CompanyReport key={company.brn} company={company} period={result.period} another={company.brn !== selectedBrn} openProfile={openProfile} />
      ))}
      <div className="panel tone-warn" role="note" data-testid="batch-excel-reminder">
        <TriangleAlert aria-hidden="true" />
        <p className="m-0 text-sm">{EXCEL_REMINDER}</p>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" className="btn btn-primary" disabled={made === 0} onClick={onDownload}>
          <FileArchive aria-hidden="true" />
          Download the zip
        </button>
        {downloaded && (
          <p className="m-0 flex items-center gap-2 text-sm" role="status" data-testid="batch-downloaded">
            <FileCheck2 aria-hidden="true" className="size-4" />
            Downloaded: <span data-values>{downloaded}</span>
          </p>
        )}
      </div>
    </section>
  )
}

function CompanyReport({ company, period, another, openProfile }: { company: CompanyOutcome; period: string; another: boolean; openProfile: ((brn: string) => Promise<Failure | null>) | null }) {
  const month = formatPeriod(period)
  const employees = company.run?.employees ?? []
  return (
    <article className="card flex flex-col gap-3 p-4" data-testid="batch-company">
      <h4 className="m-0 font-semibold">
        {company.name}, BRN {company.brn}
      </h4>
      {company.failure && <FailurePanel failure={company.failure} />}
      {company.run && isDraft(company.run) && <NotApproved text={notApprovedText(month, company.name)} testId="batch-not-approved" />}
      <ul className="m-0 flex list-none flex-col gap-3 p-0 text-sm">
        {company.files.map((outcome) => (
          <li key={outcome.template.template_id} className="flex flex-col gap-2" data-testid="batch-file">
            <p className="m-0">
              <span className="font-semibold">{outcome.template.name}:</span> {outcome.made ? madeText(outcome.path, outcome.file.built.written.length) : skipText(outcome.reason, month)}
            </p>
            {outcome.made && outcome.file.built.leftOut.length > 0 && (
              <p className="m-0 text-muted">Left out with no pay: {outcome.file.built.leftOut.map((index) => employeeName(employees[index], index)).join(', ')}.</p>
            )}
            {outcome.made && outcome.file.problems.length + outcome.file.unwritable.length > 0 && (
              <div className="panel tone-danger" role="alert">
                <CircleAlert aria-hidden="true" />
                <div className="flex flex-col gap-1">
                  <p className="m-0 font-semibold">Check these before uploading the file</p>
                  <ul className="m-0 flex list-none flex-col gap-1 p-0">
                    {outcome.file.problems.map((problem, index) => (
                      <li key={`p${index}`}>
                        {problem.employee !== null ? `${employeeName(employees[problem.employee], problem.employee)}: ` : ''}
                        {problemText(problem)}
                      </li>
                    ))}
                    {unwritableLines(outcome.file, employees).map((line, index) => (
                      <li key={`w${index}`} data-values>
                        {line}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            )}
            {outcome.made && outcome.file.built.missing.length > 0 && (
              <div className="panel tone-warn" role="note" data-testid="batch-required">
                <CircleAlert aria-hidden="true" />
                <div className="flex flex-col gap-1">
                  <p className="m-0 font-semibold">Required values that are empty</p>
                  <RequiredList groups={[{ title: `${company.name}, ${outcome.template.name}`, lines: requiredLines(outcome.file, employees) }]} />
                </div>
              </div>
            )}
            {outcome.made && outcome.file.built.halfNotes.length > 0 && (
              <details className="rounded-lg border border-line p-3" data-testid="batch-half-notes">
                <summary className="cursor-pointer font-semibold">
                  {outcome.file.built.halfNotes.length} {outcome.file.built.halfNotes.length === 1 ? 'value ends' : 'values end'} in exactly .50 before rounding
                </summary>
                <p className="m-0 mt-2 text-muted">
                  The saved run keeps 2 decimals, so a figure that ends in .50 may itself have been rounded up from just under .50. The whole-rupee amount can then be 1 more than from the full figure. Check these in Payroll System if it matters.
                </p>
                <ul className="m-0 mt-2 flex list-none flex-col gap-1 p-0">
                  {outcome.file.built.halfNotes.map((note, index) => (
                    <li key={index}>
                      {employeeName(employees[note.employee], note.employee)}: {halfNoteText(note)}
                    </li>
                  ))}
                </ul>
              </details>
            )}
            {outcome.made && outcome.file.built.sumNotes.length > 0 && <SumNotes lines={sumLines(outcome.file, employees)} testId="batch-sum-notes" />}
          </li>
        ))}
      </ul>
      {company.missingDetails.length > 0 && <MissingDetails fields={company.missingDetails} another={another} onOpen={openProfile ? () => openProfile(company.brn) : null} />}
    </article>
  )
}
