import { Building2, CircleCheck, CircleDashed, LayoutTemplate, RefreshCw } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { READY_MADE, readyMadeTemplate } from '../data/readyMade'
import { formatPeriod } from '../lib/dates'
import type { OverviewState } from '../lib/fields'
import type { Failure } from '../lib/hubWire'
import { cellsOf, type CompanyField, type TemplateBody } from '../lib/template'
import { detailsMissingText } from '../lib/wording'
import { FailurePanel } from './FailurePanel'

/** The MRA details the dashboard says are filled in or not (the name, BRN and address are the company's own). */
const CHECKED: readonly CompanyField[] = ['ern', 'telephone', 'mobile', 'declarant', 'email']

/** The details these templates mark Required; with none yet, those the ready-made ones do. */
function requiredDetails(bodies: readonly TemplateBody[]): CompanyField[] {
  const used = new Set<CompanyField>()
  for (const body of bodies.length > 0 ? bodies : READY_MADE.map((one) => readyMadeTemplate(one.layout))) {
    for (const { cell } of cellsOf(body)) if (cell.required && cell.source.type === 'company') used.add(cell.source.field)
  }
  return CHECKED.filter((field) => used.has(field))
}

function Item({ done, children }: { done: boolean; children: ReactNode }) {
  return (
    <li className="flex items-start gap-3" data-testid="checklist-item" data-done={done}>
      {done ? <CircleCheck aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-accent" /> : <CircleDashed aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-warn" />}
      <div className="flex flex-1 flex-col gap-2 text-sm">
        <span className="sr-only">{done ? 'Done:' : 'To do:'}</span>
        {children}
      </div>
    </li>
  )
}

/**
 * What must be ready before the files are made, at the top of "Make the files": the company's MRA
 * details, its templates, and the month in the dashboard. Each is ticked, or says how to fix it.
 */
export function Checklist({
  companyName,
  period,
  overview,
  templates,
  onRefresh,
  onOpenProfile,
  onOpenTemplates,
}: {
  companyName: string
  period: string
  overview: OverviewState
  /** The company's templates, once read; null while they are read. */
  templates: { name: string; body: TemplateBody }[] | null
  onRefresh: () => void
  /** Opens its Company profile in the dashboard; null for the fake sample. */
  onOpenProfile: (() => Promise<Failure | null>) | null
  onOpenTemplates: () => void
}) {
  const [busy, setBusy] = useState(false)
  const [failure, setFailure] = useState<Failure | null>(null)
  const month = formatPeriod(period)
  const loaded = overview.status === 'loaded' ? overview.overview : null
  const missing = loaded && templates ? requiredDetails(templates.map((one) => one.body)).filter((field) => !loaded.filled[field as keyof typeof loaded.filled]) : []
  const saved = loaded?.months.some((one) => one.period === period) ?? false

  return (
    <section className="card rise-in" aria-labelledby="checklist-title" data-testid="checklist">
      <div className="card-header">
        <h2 id="checklist-title" className="card-title">
          Before you make the files
        </h2>
        <button type="button" className="btn btn-sm btn-ghost" onClick={onRefresh} disabled={overview.status === 'loading'}>
          <RefreshCw aria-hidden="true" />
          Check again
        </button>
      </div>
      <div className="flex flex-col gap-3 p-5">
        {overview.status === 'failed' && <FailurePanel failure={overview.failure} onRetry={onRefresh} />}
        {(overview.status === 'loading' || templates === null) && overview.status !== 'failed' && (
          <div role="status" className="flex flex-col gap-2">
            <span className="sr-only">Loading</span>
            <div className="skeleton h-5 w-80" />
            <div className="skeleton h-5 w-72" />
          </div>
        )}
        {loaded && templates && (
          <ul className="m-0 flex list-none flex-col gap-3 p-0" aria-label="Before you make the files">
            <Item done={missing.length === 0}>
              {missing.length === 0 ? (
                <span>The MRA details of {companyName} are filled in.</span>
              ) : (
                <>
                  <span>{detailsMissingText(missing)}</span>
                  {onOpenProfile && (
                    <div>
                      <button
                        type="button"
                        className="btn btn-sm"
                        disabled={busy}
                        onClick={async () => {
                          setBusy(true)
                          setFailure(await onOpenProfile())
                          setBusy(false)
                        }}
                      >
                        <Building2 aria-hidden="true" />
                        Open its Company profile
                      </button>
                    </div>
                  )}
                  {failure && <FailurePanel failure={failure} />}
                </>
              )}
            </Item>
            <Item done={templates.length > 0}>
              {templates.length > 0 ? (
                <span>
                  Templates: <span data-values>{templates.map((one) => one.name).join(', ')}</span>.
                </span>
              ) : (
                <>
                  <span>{companyName} has no templates yet.</span>
                  <div>
                    <button type="button" className="btn btn-sm" onClick={onOpenTemplates}>
                      <LayoutTemplate aria-hidden="true" />
                      Go to Templates
                    </button>
                  </div>
                </>
              )}
            </Item>
            <Item done={saved}>
              {saved ? (
                <span>{month} is in the dashboard.</span>
              ) : (
                <span>
                  {month} has not been sent to the dashboard. Open Payroll System, choose {month} and use Send to dashboard.
                </span>
              )}
            </Item>
          </ul>
        )}
      </div>
    </section>
  )
}
