// The lists a cell's identity field or payroll column is chosen from: the company's own fields,
// as the dashboard names them before any month is asked for (mra-batch `overview`: its column
// setup and its newest saved run). Never a fixed sample list. When the dashboard cannot list
// them, a saved run fetched under Make the files gives its keys instead; with neither, the
// editor says a month must be fetched first.

import type { Failure } from './hubWire'
import type { Overview, SavedRun } from './runStore'

export type OverviewState = { status: 'loading' } | { status: 'failed'; failure: Failure } | { status: 'loaded'; overview: Overview }

export interface FieldLists {
  identity: string[]
  columns: string[]
  /**
   * known: the company's fields are listed. loading: the dashboard has not answered yet. empty:
   * the company has no column setup and no saved run. unknown: the dashboard did not list them
   * and no saved run was fetched.
   */
  state: 'known' | 'loading' | 'empty' | 'unknown'
}

/** The keys of a saved run that are the company's, not the payroll's. */
const COMPANY_KEYS = new Set(['Company Name', 'Address', 'BRN', 'VAT'])
/** The identity fields of every saved run. */
const RUN_IDENTITY = new Set(['ID', 'Surname', 'Other names', 'Date of Employment'])

/** Every key of a saved run's rows, in the order first seen: identity fields, then the rest. */
function runFields(run: SavedRun): Pick<FieldLists, 'identity' | 'columns'> {
  const identity: string[] = []
  const columns: string[] = []
  const seen = new Set<string>()
  for (const row of run.employees) {
    for (const key of Object.keys(row)) {
      if (seen.has(key) || COMPANY_KEYS.has(key)) continue
      seen.add(key)
      ;(RUN_IDENTITY.has(key) ? identity : columns).push(key)
    }
  }
  return { identity, columns }
}

export function fieldLists(overview: OverviewState, run: SavedRun | null): FieldLists {
  const fetched = run?.run && run.employees.length > 0 ? run : null
  if (overview.status === 'loaded' && (overview.overview.columns.length > 0 || !fetched)) {
    const { identity, columns } = overview.overview
    return { identity: [...identity], columns: [...columns], state: columns.length === 0 ? 'empty' : 'known' }
  }
  if (fetched) return { ...runFields(fetched), state: 'known' }
  return { identity: [], columns: [], state: overview.status === 'loading' ? 'loading' : 'unknown' }
}
