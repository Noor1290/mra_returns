import { Building2, CircleAlert, ListChecks } from 'lucide-react'
import { useState } from 'react'
import type { Failure } from '../lib/hubWire'
import { PROFILE_HINT } from '../lib/report'
import type { CompanyField } from '../lib/template'
import { detailsMissingText } from '../lib/wording'
import { Dialog } from './Dialog'
import { FailurePanel } from './FailurePanel'

/** The required values that are empty in one file: "ABC Co Ltd, MRA CSG (PACO)" and its lines. */
export interface RequiredGroup {
  title: string
  lines: string[]
}

export const requiredCount = (groups: readonly RequiredGroup[]) => groups.reduce((sum, group) => sum + group.lines.length, 0)

/** Before an export: every required value that comes out empty, and the choice. */
export function RequiredDialog({ groups, onExport, onClose }: { groups: RequiredGroup[]; onExport: () => void; onClose: () => void }) {
  const count = requiredCount(groups)
  return (
    <Dialog
      title={count === 1 ? '1 required value is empty' : `${count} required values are empty`}
      description="Fill these in, or export anyway."
      icon={<ListChecks />}
      tone="tone-warn"
      onClose={onClose}
      width={640}
      actions={
        <>
          <button type="button" className="btn" onClick={onClose}>
            Go back
          </button>
          <button type="button" className="btn btn-primary" onClick={onExport}>
            Export anyway
          </button>
        </>
      }
    >
      <div data-testid="required-dialog">
        <RequiredList groups={groups} />
      </div>
    </Dialog>
  )
}

export function RequiredList({ groups }: { groups: RequiredGroup[] }) {
  return (
    <div className="flex flex-col gap-3 text-sm">
      {groups.map((group, index) => (
        <div key={index} className="flex flex-col gap-1">
          <p className="m-0 font-semibold" data-values>
            {group.title}
          </p>
          <ul className="m-0 flex list-none flex-col gap-1 p-0">
            {group.lines.map((line, n) => (
              <li key={n}>{line}</li>
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
