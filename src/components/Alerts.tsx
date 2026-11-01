import { Building2, CircleAlert, Download, ListChecks, TriangleAlert, WandSparkles } from 'lucide-react'
import { useState } from 'react'
import type { Failure } from '../lib/hubWire'
import { PROFILE_HINT, type CheckGroup, type DownloadChecks } from '../lib/report'
import type { CompanyField } from '../lib/template'
import { detailsMissingText } from '../lib/wording'
import { Dialog } from './Dialog'
import { FailurePanel } from './FailurePanel'

export const lineCount = (groups: readonly CheckGroup[]) => groups.reduce((sum, group) => sum + group.lines.length, 0)

/**
 * Before a download, one step at a time, and nothing is downloaded until the last choice. First the
 * values the file cannot hold: Go back, or Fix in this file only. Then the required values that
 * are empty and the lines whose rounded parts do not add up to their total.
 */
export function BeforeDownload({ checks, onDownload, onClose }: { checks: DownloadChecks; onDownload: () => void; onClose: () => void }) {
  const [fixed, setFixed] = useState(false)
  const { unwritable, canFix, required, sums } = checks
  const goBack = (
    <button type="button" className="btn" onClick={onClose}>
      Go back
    </button>
  )

  if (unwritable.length > 0 && !fixed) {
    const count = lineCount(unwritable)
    return (
      <Dialog
        title={count === 1 ? "1 value can't be written in the file" : `${count} values can't be written in the file`}
        description={canFix ? 'Nothing is downloaded until you choose. Go back to correct it in Payroll System, or fix it in this file only.' : "A character here has no plain letter, so it can't be fixed in the file. Go back and correct it in Payroll System."}
        icon={<TriangleAlert />}
        tone="tone-danger"
        onClose={onClose}
        width={680}
        actions={
          <>
            {goBack}
            {canFix && (
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => {
                  if (required.length + sums.length === 0) onDownload()
                  else setFixed(true)
                }}
              >
                <WandSparkles aria-hidden="true" />
                Fix in this file only
              </button>
            )}
          </>
        }
      >
        <div data-testid="unwritable-dialog">
          <RequiredList groups={unwritable} />
        </div>
      </Dialog>
    )
  }

  const empty = lineCount(required)
  const title = required.length === 0 ? "Check these lines before uploading" : empty === 1 ? '1 required value is empty' : `${empty} required values are empty`
  return (
    <Dialog
      title={title}
      description={required.length === 0 ? undefined : 'Fill these in, or export anyway.'}
      icon={<ListChecks />}
      tone="tone-warn"
      onClose={onClose}
      width={680}
      actions={
        <>
          {goBack}
          <button type="button" className="btn btn-primary" onClick={onDownload}>
            {required.length === 0 ? <Download aria-hidden="true" /> : null}
            {required.length === 0 ? 'Download' : 'Export anyway'}
          </button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {required.length > 0 && (
          <div data-testid="required-dialog">
            <RequiredList groups={required} />
          </div>
        )}
        {sums.length > 0 && (
          <div className="flex flex-col gap-2 text-sm" data-testid="sums-dialog">
            <p className="m-0 font-semibold">Lines where the rounded parts don't add up to the total</p>
            <p className="m-0 text-muted">{SUMS_HINT}</p>
            <RequiredList groups={sums} />
          </div>
        )}
      </div>
    </Dialog>
  )
}

const SUMS_HINT = 'The total is the exact sum rounded once, so it can differ from the rounded parts beside it. If the MRA portal adds them up itself, it could see a 1-rupee difference.'

/** Under a file: the lines whose rounded parts do not add up to their total, like the .50 list. */
export function SumNotes({ lines, testId }: { lines: string[]; testId: string }) {
  return (
    <details className="rounded-lg border border-line p-3 text-sm" data-testid={testId}>
      <summary className="cursor-pointer font-semibold">
        {lines.length} {lines.length === 1 ? 'line' : 'lines'} where the rounded parts don't add up to the total
      </summary>
      <p className="m-0 mt-2 text-muted">{SUMS_HINT}</p>
      <ul className="m-0 mt-2 flex list-none flex-col gap-1 p-0">
        {lines.map((line, index) => (
          <li key={index} data-values>
            {line}
          </li>
        ))}
      </ul>
    </details>
  )
}

/** A month the dashboard has not approved: said clearly, and it never stops a download. */
export function NotApproved({ text, testId }: { text: string; testId: string }) {
  return (
    <div className="panel tone-warn" role="note" data-testid={testId}>
      <TriangleAlert aria-hidden="true" />
      <p className="m-0 text-sm" data-values>
        {text}
      </p>
    </div>
  )
}

export function RequiredList({ groups }: { groups: CheckGroup[] }) {
  return (
    <div className="flex flex-col gap-3 text-sm">
      {groups.map((group, index) => (
        <div key={index} className="flex flex-col gap-1">
          <p className="m-0 font-semibold" data-values>
            {group.title}
          </p>
          <ul className="m-0 flex list-none flex-col gap-1 p-0">
            {group.lines.map((line, n) => (
              <li key={n} data-values>
                {line}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  )
}

/**
 * The company details its templates use that are not filled in, with a way to its Company
 * profile in the dashboard. `another`: the company is not the one selected there, so opening its
 * profile selects it and starts this app again.
 */
export function MissingDetails({ fields, another, onOpen }: { fields: CompanyField[]; another: boolean; onOpen: (() => Promise<Failure | null>) | null }) {
  const [busy, setBusy] = useState(false)
  const [failure, setFailure] = useState<Failure | null>(null)
  return (
    <div className="panel tone-warn" role="note" data-testid="missing-details">
      <CircleAlert aria-hidden="true" />
      <div className="flex flex-1 flex-col gap-2">
        <p className="m-0 font-semibold">{detailsMissingText(fields)}</p>
        <p className="m-0 text-sm">{PROFILE_HINT}</p>
        {onOpen && another && <p className="m-0 text-sm">The dashboard then selects that company, and this app starts again. Download the zip first.</p>}
        {onOpen && (
          <div>
            <button
              type="button"
              className="btn btn-sm"
              disabled={busy}
              onClick={async () => {
                setBusy(true)
                setFailure(await onOpen())
                setBusy(false)
              }}
            >
              <Building2 aria-hidden="true" />
              Open its Company profile
            </button>
          </div>
        )}
        {failure && <FailurePanel failure={failure} />}
      </div>
    </div>
  )
}
