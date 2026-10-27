import { CircleAlert } from 'lucide-react'
import type { Failure } from '../lib/hubWire'

/** What went wrong with the dashboard, what to do next, and the dashboard's own sentence. */
export function FailurePanel({ failure, onRetry }: { failure: Failure; onRetry?: () => void }) {
  return (
    <div className="panel tone-danger" role="alert" data-testid="failure">
      <CircleAlert aria-hidden="true" />
      <div className="flex flex-1 flex-col gap-1">
        <p className="m-0 font-semibold">{failure.title}</p>
        <p className="m-0 text-sm">{failure.detail}</p>
        {failure.hubError && <p className="m-0 text-sm text-muted">The dashboard said: {failure.hubError}</p>}
      </div>
      {onRetry && (
        <button type="button" className="btn btn-sm shrink-0" onClick={onRetry}>
          Try again
        </button>
      )}
    </div>
  )
}
