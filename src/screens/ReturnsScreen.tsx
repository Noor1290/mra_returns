import { CircleAlert, Download, FlaskConical } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { FailurePanel } from '../components/FailurePanel'
import { DEMO_RUN } from '../data/demoRun'
import { formatPeriod, lastMonth, recentMonths } from '../lib/dates'
import { failure, type Failure, type HubPort } from '../lib/hubWire'
import { askForCompanies, listCompanies, loadRun, type SavedRun } from '../lib/runStore'

type Companies =
  | { status: 'loading' }
  | { status: 'failed'; failure: Failure }
  | { status: 'loaded'; selectedBrn: string; selectedName: string; isAdmin: boolean }

type Fetch =
  | { status: 'idle' }
  | { status: 'asking' }
  | { status: 'failed'; failure: Failure }
  | { status: 'done'; run: SavedRun; demo: boolean }

/** The columns shown from a saved run: enough to see whose run it is, not the whole payroll. */
const SHOWN = [
  { key: 'ID', label: 'Employee ID' },
  { key: 'Surname', label: 'Surname' },
  { key: 'Other names', label: 'Other names' },
  { key: 'Gross Pay', label: 'Gross Pay', number: true },
] as const

/** A value exactly as the dashboard stored it: never rounded or reformatted here. */
const shown = (value: unknown) => (value === undefined || value === null ? '' : String(value))

export function ReturnsScreen({ port, embedded, connected }: { port: HubPort; embedded: boolean; connected: boolean }) {
  const months = useMemo(() => recentMonths(), [])
  const [period, setPeriod] = useState(lastMonth)
  const [companies, setCompanies] = useState<Companies>({ status: 'loading' })
  const [companiesReload, setCompaniesReload] = useState(0)
  // The saved run lives in this state only: memory, never stored.
  const [fetched, setFetched] = useState<Fetch>({ status: 'idle' })

  useEffect(() => {
    if (!embedded || !connected) return
    let current = true
    setCompanies({ status: 'loading' })
    void listCompanies(port).then((answer) => {
      if (!current) return
      if (!answer.ok) return setCompanies({ status: 'failed', failure: answer.failure })
      setCompanies({
        status: 'loaded',
        selectedBrn: answer.selectedBrn,
        selectedName: answer.selectedName,
        // The dashboard lists only the companies the user is an admin of.
        isAdmin: answer.companies.some((company) => company.selected),
      })
    })
    return () => {
      current = false
    }
  }, [embedded, connected, port, companiesReload])

  const getRun = useCallback(async () => {
    if (companies.status !== 'loaded') return
    const { selectedBrn } = companies
    setFetched({ status: 'asking' })
    const allowed = await askForCompanies(port, selectedBrn, period, [selectedBrn])
    if (!allowed.ok) return setFetched({ status: 'failed', failure: allowed.failure })
    if (allowed.companies.length === 0) {
      // The user stopped being its admin while the question was open.
      return setFetched({ status: 'failed', failure: failure('forbidden') })
    }
    const loaded = await loadRun(port, selectedBrn, period, selectedBrn)
    setFetched(loaded.ok ? { status: 'done', run: loaded.run, demo: false } : { status: 'failed', failure: loaded.failure })
  }, [companies, period, port])

  if (!embedded) {
    return (
      <section className="card rise-in" aria-labelledby="standalone-title">
        <div className="card-header">
          <h2 id="standalone-title" className="card-title">
            Open this app from the dashboard
          </h2>
        </div>
        <div className="flex flex-col gap-4 p-5">
          <p className="m-0 text-sm text-muted">
            MRA Returns makes the return files from the payroll runs saved in the Payroll Hub dashboard. Opened on its own, it can only show fake sample data.
          </p>
          {fetched.status === 'done' ? (
            <RunView run={fetched.run} demo={fetched.demo} onClose={() => setFetched({ status: 'idle' })} />
          ) : (
            <div>
              <button type="button" className="btn btn-primary" onClick={() => setFetched({ status: 'done', run: DEMO_RUN, demo: true })}>
                <FlaskConical aria-hidden="true" />
                Try with fake sample data
              </button>
            </div>
          )}
        </div>
      </section>
    )
  }

  return (
    <section className="card rise-in" aria-labelledby="run-title">
      <div className="card-header">
        <h2 id="run-title" className="card-title">
          Saved payroll run
        </h2>
      </div>
      <div className="flex flex-col gap-4 p-5">
        <p className="m-0 text-sm text-muted">The return files are made from the payroll run saved in the dashboard for the month. The dashboard asks you before it sends it.</p>

        {(companies.status === 'loading' || !connected) && (
          <div role="status" className="flex flex-col gap-2">
            <span className="sr-only">Loading</span>
            <div className="skeleton h-5 w-64" />
            <div className="skeleton h-10 w-80" />
          </div>
        )}
        {connected && companies.status === 'failed' && <FailurePanel failure={companies.failure} onRetry={() => setCompaniesReload((n) => n + 1)} />}
        {connected && companies.status === 'loaded' && !companies.isAdmin && (
          <div className="panel tone-warn" role="alert" data-testid="not-admin">
            <CircleAlert aria-hidden="true" />
            <div className="flex flex-col gap-1">
              <p className="m-0 font-semibold">Only an admin of {companies.selectedName} can make its MRA returns.</p>
              <p className="m-0 text-sm">Ask an admin of the company, or select a company you are an admin of in the dashboard.</p>
            </div>
          </div>
        )}
        {connected && companies.status === 'loaded' && companies.isAdmin && (
          <>
            <dl className="m-0 flex flex-col gap-1 text-sm">
              <dt className="field-label">Company</dt>
              <dd className="m-0" data-testid="company">
                {companies.selectedName}, BRN {companies.selectedBrn}
              </dd>
            </dl>
            <div className="flex flex-wrap items-end gap-3">
              <label className="field">
                <span className="field-label">Month</span>
                <select
                  className="input input-sm"
                  value={period}
                  onChange={(event) => {
                    setPeriod(event.target.value)
                    setFetched({ status: 'idle' })
                  }}
                  disabled={fetched.status === 'asking'}
                >
                  {months.map((month) => (
                    <option key={month} value={month}>
                      {formatPeriod(month)}
                    </option>
                  ))}
                </select>
              </label>
              <button type="button" className="btn btn-primary" onClick={() => void getRun()} disabled={fetched.status === 'asking'}>
                <Download aria-hidden="true" />
                Get the saved run
              </button>
            </div>
            {fetched.status === 'asking' && (
              <p className="m-0 text-sm text-muted" role="status">
                Waiting for the dashboard. Allow it there when it asks.
              </p>
            )}
            {fetched.status === 'failed' && <FailurePanel failure={fetched.failure} />}
            {fetched.status === 'done' && <RunView run={fetched.run} demo={false} />}
          </>
        )}
      </div>
    </section>
  )
}

/** What the dashboard sent for one company and month: its employees, or that it has no run. */
function RunView({ run, demo, onClose }: { run: SavedRun; demo: boolean; onClose?: () => void }) {
  const month = formatPeriod(run.period)
  if (!run.run) {
    return (
      <div className="panel tone-warn" role="alert" data-testid="no-run">
        <CircleAlert aria-hidden="true" />
        <div className="flex flex-col gap-1">
          <p className="m-0 font-semibold">
            {month} has not been sent to the dashboard for {run.name}.
          </p>
          <p className="m-0 text-sm">Open Payroll System, choose {month} and use Send to dashboard. Then get it here.</p>
        </div>
      </div>
    )
  }
  const count = run.employees.length
  return (
    <div className="flex flex-col gap-3" data-testid="run">
      <div className="flex flex-wrap items-center gap-3">
        <h3 className="m-0 text-base font-semibold">
          {run.name}, {month}
        </h3>
        {demo && <span className="badge tone-glow">Fake sample data</span>}
        <p className="m-0 text-sm text-muted" data-testid="run-count">
          {count} {count === 1 ? 'employee' : 'employees'} in the saved run.
        </p>
        {onClose && (
          <button type="button" className="btn btn-sm btn-ghost ml-auto" onClick={onClose}>
            Close the sample data
          </button>
        )}
      </div>
      <div className="table-scroll card" style={{ maxHeight: 420 }}>
        <table className="table">
          <caption className="sr-only">Employees in the saved run</caption>
          <thead>
            <tr>
              {SHOWN.map((column) => (
                <th key={column.key} scope="col" className={'number' in column ? 'right' : undefined}>
                  {column.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {run.employees.map((row, index) => (
              <tr key={index}>
                {SHOWN.map((column) => (
                  <td key={column.key} className={'number' in column ? 'right num' : undefined}>
                    {shown(row[column.key])}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
