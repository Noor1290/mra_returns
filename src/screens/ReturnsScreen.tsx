import { ArrowLeft, CircleAlert, Download, FlaskConical, Plus, Sparkles } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { Checklist } from '../components/Checklist'
import { CompanyHome, type HomeCompany } from '../components/CompanyHome'
import { FailurePanel } from '../components/FailurePanel'
import { AddReadyMade } from '../components/ReadyMade'
import { DEMO_COMPANIES, demoBatchSource } from '../data/demoBatch'
import { DEMO_OVERVIEW, DEMO_RUN } from '../data/demoRun'
import type { BatchSource } from '../lib/batch'
import { formatPeriod, lastMonth, recentMonths } from '../lib/dates'
import { fieldLists, type OverviewState } from '../lib/fields'
import { isListed, loadCompanyList, offTheList, openCompany, openPicker, type ListedCompany } from '../lib/companyList'
import { failure, normaliseBrn, type Failure, type HubPort } from '../lib/hubWire'
import { askForCompanies, hubBatchSource, listCompanies, loadOverview, loadRun, openProfile, type BatchCompany, type SavedRun } from '../lib/runStore'
import { demoTemplateStore, hubTemplateStore, type TemplateStore } from '../lib/templateStore'
import { BatchPanel } from './BatchPanel'
import { ExportPanel } from './ExportPanel'
import { TemplatesPanel } from './TemplatesPanel'
import { useTemplates } from './useTemplates'

type Companies =
  | { status: 'loading' }
  | { status: 'failed'; failure: Failure }
  | { status: 'loaded'; selectedBrn: string; selectedName: string; isAdmin: boolean; companies: BatchCompany[] }

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

type Tab = 'files' | 'templates'

/** This app's list of companies (company-list): which are on the CSG or PRGF list. */
type ListState =
  | { status: 'loading' }
  /** A dashboard from before the lists: the app opens on the selected company, as it did. */
  | { status: 'legacy' }
  | { status: 'failed'; failure: Failure }
  | { status: 'loaded'; companies: ListedCompany[]; selected: ListedCompany }

/** "CSG", "PRGF": the lists a company is on, as small labels on its card. */
const LIST_LABELS = { csg: 'CSG', prgf: 'PRGF' } as const
const tagsOf = (company: HomeCompany & Partial<Pick<ListedCompany, 'lists'>>) => (company.lists ?? []).map((list) => LIST_LABELS[list])

/** Several companies at once: where their runs come from, and which companies may be chosen. */
interface Batch {
  source: BatchSource
  companies: BatchCompany[]
  months: string[]
  initialPeriod: string
  /** Opens a company's Company profile in the dashboard; null for the fake sample. */
  openProfile: ((brn: string) => Promise<Failure | null>) | null
}

/** The two parts of the app: making the files, and the templates they are made with. */
function Workspace({
  store,
  company,
  run,
  filesPart,
  batch,
  overview,
  period,
  onRefreshOverview,
}: {
  store: TemplateStore
  company: { name: string; brn: string }
  run: SavedRun | null
  filesPart: ReactNode
  batch: Batch
  /** What the dashboard says of the company before a month is asked for. */
  overview: OverviewState
  /** The month chosen under "Saved payroll run". */
  period: string
  onRefreshOverview: () => void
}) {
  const [tab, setTab] = useState<Tab>('files')
  // A template saved, made or removed: the files are made again from the templates.
  const [version, setVersion] = useState(0)
  const { loaded, retry } = useTemplates(store, version)
  const templates = loaded.status === 'loaded' ? loaded.templates : null
  const fields = useMemo(() => fieldLists(overview, run?.run ? run : null), [overview, run])
  const openSelectedProfile = batch.openProfile ? () => batch.openProfile!(company.brn) : null
  const tabs: { id: Tab; label: string }[] = [
    { id: 'files', label: 'Make the files' },
    { id: 'templates', label: 'Templates' },
  ]
  return (
    <div className="flex flex-col gap-4">
      <div role="tablist" aria-label="MRA Returns" className="flex flex-wrap gap-2">
        {tabs.map((one) => (
          <button
            key={one.id}
            type="button"
            role="tab"
            id={`tab-${one.id}`}
            aria-selected={tab === one.id}
            aria-controls={`panel-${one.id}`}
            className={`btn btn-sm ${tab === one.id ? 'btn-primary' : ''}`}
            onClick={() => setTab(one.id)}
          >
            {one.label}
          </button>
        ))}
      </div>
      <div role="tabpanel" id="panel-files" aria-labelledby="tab-files" hidden={tab !== 'files'} className="flex flex-col gap-4">
        {templates && templates.length === 0 && (
          <section className="card rise-in" aria-labelledby="start-title" data-testid="start-ready-made">
            <div className="card-header">
              <h2 id="start-title" className="card-title flex items-center gap-2">
                <Sparkles aria-hidden="true" className="size-5" />
                Start with the ready-made MRA templates
              </h2>
            </div>
            <div className="p-5">
              <AddReadyMade store={store} templates={templates} companyName={company.name} onAdded={() => setVersion((n) => n + 1)} />
            </div>
          </section>
        )}
        {loaded.status === 'failed' && <FailurePanel failure={loaded.failure} onRetry={retry} />}
        <Checklist
          companyName={company.name}
          period={period}
          overview={overview}
          templates={templates}
          onRefresh={() => {
            onRefreshOverview()
            retry()
          }}
          onOpenProfile={openSelectedProfile}
          onOpenTemplates={() => setTab('templates')}
        />
        {filesPart}
        {run?.run && <ExportPanel store={store} run={run} version={version} onOpenProfile={batch.openProfile ? () => batch.openProfile!(run.brn) : null} />}
        <BatchPanel
          store={store}
          source={batch.source}
          companies={batch.companies}
          selectedBrn={company.brn}
          months={batch.months}
          initialPeriod={batch.initialPeriod}
          version={version}
          openProfile={batch.openProfile}
        />
      </div>
      <div role="tabpanel" id="panel-templates" aria-labelledby="tab-templates" hidden={tab !== 'templates'}>
        {/* Mounted only when shown: the list is read from the dashboard when the tab opens. */}
        {tab === 'templates' && <TemplatesPanel store={store} company={company} previewRun={run?.run ? run : null} fields={fields} onChanged={() => setVersion((n) => n + 1)} />}
      </div>
    </div>
  )
}

export function ReturnsScreen({ port, embedded, connected }: { port: HubPort; embedded: boolean; connected: boolean }) {
  const months = useMemo(() => recentMonths(), [])
  const [period, setPeriod] = useState(lastMonth)
  const [companies, setCompanies] = useState<Companies>({ status: 'loading' })
  const [companiesReload, setCompaniesReload] = useState(0)
  // The saved run lives in this state only: memory, never stored.
  const [fetched, setFetched] = useState<Fetch>({ status: 'idle' })
  const selectedBrn = companies.status === 'loaded' ? companies.selectedBrn : null
  const hubStore = useMemo(() => (selectedBrn ? hubTemplateStore(port, selectedBrn) : null), [port, selectedBrn])
  const hubBatch = useMemo(() => (selectedBrn ? hubBatchSource(port, selectedBrn) : null), [port, selectedBrn])
  // Opened on its own: fake templates in memory, made again each time the sample is opened.
  const [demoStore, setDemoStore] = useState<TemplateStore | null>(null)
  // The selected company's fields, MRA details filled in or not, and months saved: names only.
  const [overview, setOverview] = useState<OverviewState>({ status: 'loading' })
  const [overviewReload, setOverviewReload] = useState(0)
  const isAdmin = companies.status === 'loaded' && companies.isAdmin
  // Your companies (the main page) or the selected company's own screen.
  const [list, setList] = useState<ListState>({ status: 'loading' })
  const [listReload, setListReload] = useState(0)
  const [view, setView] = useState<'home' | 'company'>('home')
  const [opening, setOpening] = useState<string | null>(null)
  const [homeFailure, setHomeFailure] = useState<Failure | null>(null)

  useEffect(() => {
    if (!embedded || !connected) return
    let current = true
    // Read again on the way back to Your companies: quietly, keeping what is shown.
    setList((now) => (now.status === 'loaded' ? now : { status: 'loading' }))
    void loadCompanyList(port).then((answer) => {
      if (!current) return
      if (answer.ok) {
        setList({ status: 'loaded', companies: answer.companies, selected: answer.selected })
        // Right after a card was tapped (the dashboard then reloaded this app): straight to it.
        if (answer.open) {
          if (answer.open.period) setPeriod(answer.open.period)
          setView('company')
        }
        return
      }
      if (answer.legacy) {
        setList({ status: 'legacy' })
        setView('company')
        return
      }
      setList({ status: 'failed', failure: answer.failure })
    })
    return () => {
      current = false
    }
  }, [embedded, connected, port, listReload])

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
        companies: answer.companies,
      })
    })
    return () => {
      current = false
    }
  }, [embedded, connected, port, companiesReload])

  useEffect(() => {
    if (!embedded || !connected || !selectedBrn || !isAdmin) return
    let current = true
    setOverview({ status: 'loading' })
    void loadOverview(port, selectedBrn).then((answer) => {
      if (current) setOverview(answer.ok ? { status: 'loaded', overview: answer.overview } : { status: 'failed', failure: answer.failure })
    })
    return () => {
      current = false
    }
  }, [embedded, connected, port, selectedBrn, isAdmin, overviewReload])

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
    const demo = fetched.status === 'done' && fetched.demo && demoStore
    return (
      <>
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
            {!demo && (
              <div>
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => {
                    setDemoStore(demoTemplateStore())
                    setFetched({ status: 'done', run: DEMO_RUN, demo: true })
                  }}
                >
                  <FlaskConical aria-hidden="true" />
                  Try with fake sample data
                </button>
              </div>
            )}
          </div>
        </section>
        {demo && (
          <Workspace
            store={demoStore}
            company={{ name: DEMO_RUN.name, brn: DEMO_RUN.brn }}
            run={fetched.run}
            batch={{ source: demoBatchSource(demoStore), companies: DEMO_COMPANIES, months, initialPeriod: DEMO_RUN.period, openProfile: null }}
            overview={{ status: 'loaded', overview: DEMO_OVERVIEW }}
            period={DEMO_RUN.period}
            onRefreshOverview={() => {}}
            filesPart={
              <section className="card rise-in" aria-labelledby="sample-title">
                <div className="card-header">
                  <h2 id="sample-title" className="card-title">
                    Saved payroll run
                  </h2>
                </div>
                <div className="p-5">
                  <RunView
                    run={fetched.run}
                    demo
                    onClose={() => {
                      setFetched({ status: 'idle' })
                      setDemoStore(null)
                    }}
                  />
                </div>
              </section>
            }
          />
        )}
      </>
    )
  }

  const runCard = (
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
                  data-values
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

  if (view === 'home' && list.status !== 'legacy') {
    const loaded = list.status === 'loaded' ? list : null
    const selectedBrn = loaded?.selected.brn ?? null
    return (
      <CompanyHome
        companies={loaded ? loaded.companies.filter(isListed) : []}
        loading={!connected || list.status === 'loading'}
        canChoose={loaded ? loaded.companies.some((one) => one.admin) : false}
        months={months}
        period={period}
        onPeriod={(next) => {
          setPeriod(next)
          setFetched({ status: 'idle' })
        }}
        opening={opening}
        tags={tagsOf}
        extra={
          loaded && offTheList(loaded.selected)
            ? {
                company: loaded.selected,
                onAdd: loaded.selected.admin
                  ? () => {
                      setHomeFailure(null)
                      void openPicker(port, loaded.selected.brn).then(setHomeFailure)
                    }
                  : null,
              }
            : null
        }
        failure={list.status === 'failed' ? list.failure : homeFailure}
        onRetry={list.status === 'failed' ? () => setListReload((n) => n + 1) : undefined}
        onChoose={() => {
          if (!selectedBrn) return
          setHomeFailure(null)
          void openPicker(port, selectedBrn).then(setHomeFailure)
        }}
        onOpen={(company) => {
          if (!selectedBrn) return
          setHomeFailure(null)
          setOpening(company.company_id)
          void openCompany(port, selectedBrn, company.company_id, period).then((answer) => {
            // Switched: the dashboard reloads this app, which then opens that company.
            if (answer.ok && answer.switched) return
            setOpening(null)
            if (!answer.ok) return setHomeFailure(answer.failure)
            setView('company')
          })
        }}
      />
    )
  }

  const back =
    list.status === 'loaded' ? (
      <BackBar
        notListed={!isListed(list.selected)}
        canAdd={list.selected.admin}
        onBack={() => {
          setView('home')
          setListReload((n) => n + 1)
        }}
        onAdd={() => void openPicker(port, list.selected.brn).then(setHomeFailure)}
      />
    ) : null

  if (!(connected && companies.status === 'loaded' && companies.isAdmin && hubStore && hubBatch)) {
    return (
      <>
        {back}
        {homeFailure && <FailurePanel failure={homeFailure} />}
        {runCard}
      </>
    )
  }
  return (
    <>
    {back}
    {homeFailure && <FailurePanel failure={homeFailure} />}
    <Workspace
      store={hubStore}
      company={{ name: companies.selectedName, brn: companies.selectedBrn }}
      run={fetched.status === 'done' ? fetched.run : null}
      filesPart={runCard}
      batch={{
        source: hubBatch,
        companies: onTheList(companies.companies, list, companies.selectedBrn),
        months,
        initialPeriod: lastMonth(),
        openProfile: (brn) => openProfile(port, companies.selectedBrn, brn),
      }}
      overview={overview}
      period={period}
      onRefreshOverview={() => setOverviewReload((n) => n + 1)}
    />
    </>
  )
}

/**
 * The companies several files can be made for: the ones on this app's list, and the one
 * selected in the dashboard. With a dashboard from before the lists, or while the list is not
 * known, every company as before.
 */
export function onTheList<T extends { brn: string }>(companies: readonly T[], list: ListState, selectedBrn: string): T[] {
  if (list.status !== 'loaded') return [...companies]
  const listed = new Set(list.companies.filter(isListed).map((one) => normaliseBrn(one.brn)))
  return companies.filter((one) => listed.has(normaliseBrn(one.brn)) || normaliseBrn(one.brn) === normaliseBrn(selectedBrn))
}

/** Back to Your companies; and a small label when the selected company is not on the list. */
function BackBar({ notListed, canAdd, onBack, onAdd }: { notListed: boolean; canAdd: boolean; onBack: () => void; onAdd: () => void }) {
  return (
    <div className="back-bar">
      <button type="button" className="btn btn-sm btn-ghost" onClick={onBack}>
        <ArrowLeft aria-hidden="true" />
        Your companies
      </button>
      {notListed && (
        <>
          <span className="badge tone-warn" data-testid="not-listed">
            Not on the list
          </span>
          {canAdd && (
            <button type="button" className="btn btn-sm btn-ghost" onClick={onAdd}>
              <Plus aria-hidden="true" />
              Add
            </button>
          )}
        </>
      )}
    </div>
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
