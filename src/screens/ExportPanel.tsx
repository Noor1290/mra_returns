import { CircleAlert, Download, FileCheck2, TriangleAlert } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { MissingDetails, RequiredDialog, RequiredList, type RequiredGroup } from '../components/Alerts'
import { FailurePanel } from '../components/FailurePanel'
import { missingDetails } from '../lib/batch'
import { formatPeriod } from '../lib/dates'
import type { Failure } from '../lib/hubWire'
import { EXCEL_REMINDER, requiredLines } from '../lib/report'
import { makeReturnFile } from '../lib/returnFile'
import type { SavedRun } from '../lib/runStore'
import type { TemplateStore } from '../lib/templateStore'
import { employeeName, halfNoteText, problemText, writeProblemText } from '../lib/wording'
import { useTemplates } from './useTemplates'

/** Hands a file to the browser as a download. Made in memory; nothing is kept. */
export function download(file: { fileName: string; bytes: Uint8Array }, type = 'text/csv') {
  const url = URL.createObjectURL(new Blob([file.bytes as Uint8Array<ArrayBuffer>], { type }))
  const link = document.createElement('a')
  link.href = url
  link.download = file.fileName
  document.body.appendChild(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1_000)
}

/**
 * One company's return files for the month of its saved run. `onOpenProfile` opens its Company
 * profile in the dashboard (null for the fake sample).
 */
export function ExportPanel({ store, run, version, onOpenProfile }: { store: TemplateStore; run: SavedRun; version: number; onOpenProfile: (() => Promise<Failure | null>) | null }) {
  const [unticked, setUnticked] = useState<Set<string>>(new Set())
  const [done, setDone] = useState<string[] | null>(null)
  const [confirming, setConfirming] = useState<RequiredGroup[] | null>(null)
  const { loaded, retry } = useTemplates(store, version)

  // The templates are read again: what was downloaded may no longer be what is shown.
  useEffect(() => setDone(null), [store, version])

  // The files, made in memory from the run and the templates.
  const files = useMemo(
    () =>
      loaded.status === 'loaded'
        ? loaded.templates.map((template) => ({ template, file: makeReturnFile(template.body, template.own, run, run.period, run.employees) }))
        : [],
    [loaded, run],
  )
  const chosen = files.filter(({ template }) => !unticked.has(template.template_id))
  const month = formatPeriod(run.period)
  const details = loaded.status === 'loaded' ? missingDetails(loaded.templates, run) : []
  const downloadChosen = () => {
    for (const { file } of chosen) download(file)
    setDone(chosen.map(({ file }) => file.fileName))
  }

  return (
    <section className="card rise-in" aria-labelledby="export-title" data-testid="export">
      <div className="card-header">
        <h2 id="export-title" className="card-title">
          Return files for {month}
        </h2>
      </div>
      <div className="flex flex-col gap-4 p-5">
        <div className="panel tone-warn" role="note" data-testid="excel-reminder">
          <TriangleAlert aria-hidden="true" />
          <p className="m-0 text-sm">{EXCEL_REMINDER}</p>
        </div>
        {details.length > 0 && <MissingDetails fields={details} another={false} onOpen={onOpenProfile} />}

        {loaded.status === 'loading' && (
          <div role="status" className="flex flex-col gap-2">
            <span className="sr-only">Loading</span>
            <div className="skeleton h-16 w-full" />
          </div>
        )}
        {loaded.status === 'failed' && <FailurePanel failure={loaded.failure} onRetry={retry} />}
        {loaded.status === 'loaded' && files.length === 0 && (
          <div className="panel" data-testid="export-no-templates">
            <CircleAlert aria-hidden="true" />
            <p className="m-0 text-sm">This company has no templates yet. Make one under Templates first.</p>
          </div>
        )}

        {files.map(({ template, file }) => {
          const ticked = !unticked.has(template.template_id)
          const { written, leftOut, halfNotes } = file.built
          return (
            <article key={template.template_id} className="card flex flex-col gap-3 p-4" data-testid="export-file">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={ticked}
                  onChange={(event) => {
                    const next = new Set(unticked)
                    if (event.target.checked) next.delete(template.template_id)
                    else next.add(template.template_id)
                    setUnticked(next)
                  }}
                />
                <span className="font-semibold">{template.name}</span>
              </label>
              <p className="m-0 text-sm">
                <span className="num" data-values>
                  {file.fileName}
                </span>
              </p>
              <p className="m-0 text-sm text-muted" data-testid="export-counts">
                {written.length} {written.length === 1 ? 'employee' : 'employees'} in the file.
                {leftOut.length > 0 && ` Left out with no pay: ${leftOut.map((index) => employeeName(run.employees[index], index)).join(', ')}.`}
              </p>
              {(file.problems.length > 0 || file.writeProblems.length > 0) && (
                <div className="panel tone-danger" role="alert" data-testid="export-problems">
                  <CircleAlert aria-hidden="true" />
                  <div className="flex flex-col gap-1">
                    <p className="m-0 font-semibold">Check these before uploading the file</p>
                    <ul className="m-0 flex list-none flex-col gap-1 p-0 text-sm">
                      {file.problems.map((problem, index) => (
                        <li key={`p${index}`}>
                          {problem.employee !== null ? `${employeeName(run.employees[problem.employee], problem.employee)}: ` : ''}
                          {problemText(problem)}
                        </li>
                      ))}
                      {file.writeProblems.map((problem, index) => (
                        <li key={`w${index}`}>{writeProblemText(problem, template.body.settings.separator)}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              )}
              {file.built.missing.length > 0 && (
                <div className="panel tone-warn" role="note" data-testid="export-required">
                  <CircleAlert aria-hidden="true" />
                  <div className="flex flex-col gap-1">
                    <p className="m-0 font-semibold">Required values that are empty</p>
                    <RequiredList groups={[{ title: run.name, lines: requiredLines(file, run.employees) }]} />
                  </div>
                </div>
              )}
              {halfNotes.length > 0 && (
                <details className="rounded-lg border border-line p-3 text-sm" data-testid="half-notes">
                  <summary className="cursor-pointer font-semibold">
                    {halfNotes.length} {halfNotes.length === 1 ? 'value ends' : 'values end'} in exactly .50 before rounding
                  </summary>
                  <p className="m-0 mt-2 text-muted">
                    The saved run keeps 2 decimals, so a figure that ends in .50 may itself have been rounded up from just under .50. The whole-rupee amount can then be 1 more than from the full figure. Check these in Payroll System if it matters.
                  </p>
                  <ul className="m-0 mt-2 flex list-none flex-col gap-1 p-0">
                    {halfNotes.map((note, index) => (
                      <li key={index}>
                        {employeeName(run.employees[note.employee], note.employee)}: {halfNoteText(note)}
                      </li>
                    ))}
                  </ul>
                </details>
              )}
            </article>
          )
        })}

        {files.length > 0 && (
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              className="btn btn-primary"
              disabled={chosen.length === 0}
              onClick={() => {
                const groups = chosen
                  .filter(({ file }) => file.built.missing.length > 0)
                  .map(({ template, file }) => ({ title: `${run.name}, ${template.name}`, lines: requiredLines(file, run.employees) }))
                if (groups.length > 0) setConfirming(groups)
                else downloadChosen()
              }}
            >
              <Download aria-hidden="true" />
              {chosen.length === 1 ? 'Download the file' : `Download ${chosen.length} files`}
            </button>
            {done && (
              <p className="m-0 flex items-center gap-2 text-sm" role="status" data-testid="downloaded">
                <FileCheck2 aria-hidden="true" className="size-4" />
                Downloaded: <span data-values>{done.join(', ')}</span>
              </p>
            )}
          </div>
        )}
      </div>
      {confirming && (
        <RequiredDialog
          groups={confirming}
          onClose={() => setConfirming(null)}
          onExport={() => {
            setConfirming(null)
            downloadChosen()
          }}
        />
      )}
    </section>
  )
}
