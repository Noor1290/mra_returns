import { Building2, FileUp, History, LayoutTemplate, RotateCcw, Save, Trash2, Undo2 } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { CellEditor, type RunKeys } from '../components/CellEditor'
import { Dialog } from '../components/Dialog'
import { FailurePanel } from '../components/FailurePanel'
import { FileSettingsEditor } from '../components/FileSettingsEditor'
import { FilePreview, TemplateGrid, type Selected } from '../components/TemplateGrid'
import { buildFile, previewCell, templateProblems, type FileContext } from '../lib/evaluate'
import { failure as failureOf, type Failure } from '../lib/hubWire'
import { companyInfo } from '../lib/returnFile'
import type { SavedRun } from '../lib/runStore'
import { newCellId, templateBodySchema, type Cell, type OwnValues, type TemplateBody } from '../lib/template'
import type { TemplateCompany, TemplateRevision, TemplateStore, TemplateSummary } from '../lib/templateStore'
import { readUpload, templateFromUpload, type Upload, type UploadKind } from '../lib/upload'
import { cellProblemText, employeeName, problemText, ROW_KIND_LABELS } from '../lib/wording'

/** The identity fields and payroll columns every saved run has, before one is loaded. */
const KNOWN_IDENTITY = ['ID', 'Surname', 'Other names', 'Date of Employment', 'Full time / Part time']
const KNOWN_COLUMNS = ['Basic Salary', 'Govt Increment', 'New Basic Salary', 'Allowances', 'Emoluments', 'Travelling', 'Gross Pay', 'CSG', 'NSF', 'PAYE', 'Employee CSG', 'Employee NSF', 'Total deductions', 'Net Pay', 'Levy', 'PRGF', 'Total MRA contributions', 'EDF', 'EDF (monthly)', 'Total']
const COMPANY_KEYS = new Set(['Company Name', 'Address', 'BRN', 'VAT'])

/** The keys of the saved run, for the lists: text values are identity fields, numbers are columns. */
export function runKeys(run: SavedRun | null): RunKeys {
  const identity = new Set(KNOWN_IDENTITY)
  const columns = new Set(KNOWN_COLUMNS)
  for (const row of run?.employees ?? []) {
    for (const [key, value] of Object.entries(row)) {
      if (COMPANY_KEYS.has(key)) continue
      if (typeof value === 'number') columns.add(key)
      else if (typeof value === 'string' && !columns.has(key)) identity.add(key)
    }
  }
  return { identity: [...identity], columns: [...columns] }
}

interface Editing {
  /** Null for a new template, not saved yet. */
  summary: TemplateSummary | null
  id: string
  name: string
  body: TemplateBody
  own: OwnValues
  bodyChanged: boolean
  ownChanged: boolean
  /** The text of the uploaded file, row by row of the template, while a new upload is set up. Never saved. */
  uploaded: string[][] | null
}

type List = { status: 'loading' } | { status: 'failed'; failure: Failure } | { status: 'loaded'; templates: TemplateSummary[] }

type Open = null | { kind: 'history' } | { kind: 'attach' } | { kind: 'remove' }

export function TemplatesPanel({
  store,
  company,
  previewRun,
  onChanged,
}: {
  store: TemplateStore
  company: { name: string; brn: string }
  /** The saved run the preview shows; null when none has been fetched. */
  previewRun: SavedRun | null
  /** A template was saved, made or removed: the export reads them again. */
  onChanged: () => void
}) {
  const [list, setList] = useState<List>({ status: 'loading' })
  const [reload, setReload] = useState(0)
  const [editing, setEditing] = useState<Editing | null>(null)
  const [loadingId, setLoadingId] = useState<string | null>(null)
  const [upload, setUpload] = useState<{ upload: Upload; kinds: UploadKind[]; name: string } | null>(null)
  const [selected, setSelected] = useState<Selected | null>(null)
  const [failure, setFailure] = useState<Failure | null>(null)
  const [status, setStatus] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [open, setOpen] = useState<Open>(null)
  const fileInput = useRef<HTMLInputElement>(null)
  const dirty = editing !== null && (editing.bodyChanged || editing.ownChanged || editing.summary === null)

  useEffect(() => {
    window.PayrollHubBridge.setUnsaved(dirty)
  }, [dirty])

  useEffect(() => {
    let current = true
    setList({ status: 'loading' })
    void store.list().then((answer) => {
      if (!current) return
      setList(answer.ok ? { status: 'loaded', templates: answer.value } : { status: 'failed', failure: answer.failure })
    })
    return () => {
      current = false
    }
  }, [store, reload])

  const openTemplate = useCallback(
    async (id: string) => {
      setLoadingId(id)
      setFailure(null)
      setStatus(null)
      const answer = await store.load(id)
      setLoadingId(null)
      if (!answer.ok) return setFailure(answer.failure)
      const { body, own, ...summary } = answer.value
      setEditing({ summary, id, name: summary.name, body, own, bodyChanged: false, ownChanged: false, uploaded: null })
      setSelected(null)
    },
    [store],
  )

  const keys = useMemo(() => runKeys(previewRun), [previewRun])

  const context: FileContext | null = useMemo(
    () => (previewRun && editing ? { company: companyInfo(previewRun), period: previewRun.period, own: editing.own } : null),
    [previewRun, editing],
  )
  const built = useMemo(() => (editing && context && previewRun ? buildFile(editing.body, context, previewRun.employees) : null), [editing, context, previewRun])
  const general = useMemo(() => (editing ? templateProblems(editing.body) : []), [editing])

  /** The preview of each cell: the employer row, and the first employee written. */
  const previews = useMemo(() => {
    if (!editing || !context || !previewRun || !built) return null
    const first = built.written[0]
    const out = new Map<string, string>()
    editing.body.rows.forEach((row, rowIndex) => {
      if (row.kind === 'copy') return
      row.cells.forEach((cell, column) => {
        if (!cell) return
        const employee = row.kind === 'employee' ? (first === undefined ? null : previewRun.employees[first]) : null
        if (row.kind === 'employee' && employee === null) return
        out.set(`${rowIndex}:${column}`, previewCell(editing.body, cell, context, employee).text)
      })
    })
    return out
  }, [editing, context, previewRun, built])

  const chooseFile = async (file: File) => {
    setFailure(null)
    setStatus(null)
    try {
      const read = await readUpload(file.name, new Uint8Array(await file.arrayBuffer()))
      setUpload({ upload: read, kinds: read.kinds, name: read.name })
      setEditing(null)
    } catch (error) {
      setFailure({ ...failureOf('invalid'), title: 'This file could not be read', detail: `${error instanceof Error ? error.message : ''} Upload the .csv file from the MRA portal, or an Excel (.xlsx) copy of it.`.trim(), hubError: null })
    }
  }

  const startFromUpload = () => {
    if (!upload) return
    const body = templateFromUpload(upload.upload, upload.kinds)
    const uploaded = upload.upload.grid.filter((_, row) => upload.kinds[row] !== 'example')
    setEditing({ summary: null, id: crypto.randomUUID(), name: upload.name, body, own: { values: {} }, bodyChanged: true, ownChanged: false, uploaded })
    setUpload(null)
    setSelected(null)
  }

  const setCell = (cell: Cell | null) => {
    if (!editing || !selected) return
    const rows = editing.body.rows.map((row, index) => {
      if (index !== selected.row || row.kind === 'copy') return row
      const cells = [...row.cells]
      while (cells.length <= selected.column) cells.push(null)
      cells[selected.column] = cell
      return { ...row, cells }
    })
    const removed = editing.body.rows[selected.row]
    const oldId = removed.kind !== 'copy' ? removed.cells[selected.column]?.id : undefined
    const own = oldId && (!cell || cell.source.type !== 'fixed') && oldId in editing.own.values ? { values: Object.fromEntries(Object.entries(editing.own.values).filter(([id]) => id !== oldId)) } : editing.own
    setEditing({ ...editing, body: { ...editing.body, rows }, bodyChanged: true, own, ownChanged: editing.ownChanged || own !== editing.own })
  }

  const setOwn = (id: string, value: string | undefined) => {
    if (!editing) return
    const values = { ...editing.own.values }
    if (value === undefined) delete values[id]
    else values[id] = value
    setEditing({ ...editing, own: { values }, ownChanged: true })
  }

  const saveAll = async () => {
    if (!editing) return
    const name = editing.name.trim()
    if (name === '' || name.length > 80) return setFailure({ ...failureOf('invalid'), title: 'The template needs a name', detail: 'Give it a name of 1 to 80 characters, such as MRA CSG (PACO).', hubError: null })
    const checked = templateBodySchema.safeParse(editing.body)
    if (!checked.success) return setFailure({ ...failureOf('invalid'), title: 'The template is not complete', detail: 'A template has one employer row and one employee row at most. Check the rows of the upload.', hubError: null })
    setBusy(true)
    setFailure(null)
    setStatus(null)
    let summary = editing.summary
    const canChange = summary === null || summary.can_change
    if ((editing.bodyChanged || summary === null) && canChange) {
      const saved = await store.save({ id: editing.id, name, body: checked.data, expectedRevision: summary?.revision ?? 0 })
      if (!saved.ok) {
        setBusy(false)
        return setFailure(saved.failure)
      }
    }
    if (editing.ownChanged) {
      // A new template starts with no own values: revision 1.
      const valuesRevision = summary?.values_revision ?? 1
      const saved = await store.saveValues({ id: editing.id, own: editing.own, expectedRevision: valuesRevision })
      if (!saved.ok) {
        setBusy(false)
        return setFailure(saved.failure)
      }
    }
    const fresh = await store.load(editing.id)
    setBusy(false)
    if (fresh.ok) {
      const { body, own, ...rest } = fresh.value
      summary = rest
      setEditing({ summary, id: editing.id, name: rest.name, body, own, bodyChanged: false, ownChanged: false, uploaded: null })
    }
    setStatus('Saved in the dashboard.')
    setReload((n) => n + 1)
    onChanged()
  }

  const undo = () => {
    if (!editing) return
    if (editing.summary) void openTemplate(editing.id)
    else setEditing(null)
    setStatus(null)
    setFailure(null)
  }

  const canChange = editing ? editing.summary === null || editing.summary.can_change : false
  const selectedRow = editing && selected ? editing.body.rows[selected.row] : null
  const selectedCell = selectedRow && selectedRow.kind !== 'copy' ? (selectedRow.cells[selected!.column] ?? null) : null

  return (
    <section className="card rise-in" aria-labelledby="templates-title">
      <div className="card-header">
        <h2 id="templates-title" className="card-title">
          Templates
        </h2>
        <div className="flex flex-wrap gap-2">
          <input
            ref={fileInput}
            id="template-file"
            type="file"
            accept=".csv,.xlsx"
            className="sr-only"
            disabled={dirty || busy}
            onChange={(event) => {
              const file = event.target.files?.[0]
              event.target.value = ''
              if (file) void chooseFile(file)
            }}
          />
          <label htmlFor="template-file" className={`btn btn-sm ${dirty || busy ? 'opacity-50' : ''}`} aria-disabled={dirty || busy}>
            <FileUp aria-hidden="true" />
            Upload a template
          </label>
        </div>
      </div>

      <div className="flex flex-col gap-4 p-5">
        <p className="m-0 text-sm text-muted">
          Upload the CSV file from the MRA portal, or an Excel copy of it, once. Then say what goes in each cell. Templates are kept in the dashboard, so they work on any laptop.
        </p>

        {list.status === 'loading' && (
          <div role="status" className="flex flex-col gap-2">
            <span className="sr-only">Loading</span>
            <div className="skeleton h-10 w-full" />
            <div className="skeleton h-10 w-full" />
          </div>
        )}
        {list.status === 'failed' && <FailurePanel failure={list.failure} onRetry={() => setReload((n) => n + 1)} />}
        {list.status === 'loaded' && list.templates.length === 0 && !upload && !editing && (
          <div className="panel" data-testid="no-templates">
            <LayoutTemplate aria-hidden="true" />
            <div className="flex flex-col gap-1">
              <p className="m-0 font-semibold">No templates yet for {company.name}</p>
              <p className="m-0 text-sm">Upload the CSG or PRGF file from the MRA portal to start one.</p>
            </div>
          </div>
        )}
        {list.status === 'loaded' && list.templates.length > 0 && (
          <ul className="m-0 flex list-none flex-col gap-2 p-0" aria-label="Templates of this company">
            {list.templates.map((template) => {
              const current = editing?.id === template.template_id
              return (
                <li key={template.template_id}>
                  <button
                    type="button"
                    className={`card flex w-full flex-wrap items-center gap-3 px-4 py-3 text-left ${current ? 'row-current' : ''}`}
                    aria-current={current ? 'true' : undefined}
                    disabled={dirty || busy || loadingId !== null}
                    onClick={() => void openTemplate(template.template_id)}
                  >
                    <span className="font-semibold">{template.name}</span>
                    <span className="text-sm text-muted">Version {template.revision}</span>
                    {template.companies > 1 && <span className="badge tone-glow">Used by {template.companies} companies</span>}
                    {!template.can_change && <span className="badge tone-warn">Read only</span>}
                  </button>
                </li>
              )
            })}
          </ul>
        )}
        {dirty && <p className="m-0 text-sm text-muted">Save or undo the changes before opening another template.</p>}

        {failure && <FailurePanel failure={failure} />}
        {status && (
          <p className="m-0 text-sm" role="status">
            {status}
          </p>
        )}

        {upload && (
          <UploadRows
            upload={upload}
            onKinds={(kinds) => setUpload({ ...upload, kinds })}
            onName={(name) => setUpload({ ...upload, name })}
            onCancel={() => setUpload(null)}
            onStart={startFromUpload}
          />
        )}

        {editing && (
          <div className="flex flex-col gap-4" data-testid="template-editor">
            <div className="flex flex-wrap items-end gap-3">
              <label className="field min-w-64 flex-1">
                <span className="field-label">Template name</span>
                <input
                  className="input input-sm"
                  value={editing.name}
                  maxLength={80}
                  disabled={!canChange}
                  onChange={(event) => setEditing({ ...editing, name: event.target.value, bodyChanged: true })}
                />
              </label>
              <button type="button" className="btn btn-primary" disabled={!dirty || busy} onClick={() => void saveAll()}>
                <Save aria-hidden="true" />
                {busy ? 'Saving' : 'Save'}
              </button>
              <button type="button" className="btn" disabled={!dirty || busy} onClick={undo}>
                <Undo2 aria-hidden="true" />
                Undo the changes
              </button>
              {editing.summary && (
                <>
                  <button type="button" className="btn" disabled={dirty || busy} onClick={() => setOpen({ kind: 'history' })}>
                    <History aria-hidden="true" />
                    History
                  </button>
                  <button type="button" className="btn" disabled={dirty || busy || !editing.summary.can_change} onClick={() => setOpen({ kind: 'attach' })}>
                    <Building2 aria-hidden="true" />
                    Also use it in
                  </button>
                  <button type="button" className="btn btn-danger" disabled={dirty || busy} onClick={() => setOpen({ kind: 'remove' })}>
                    <Trash2 aria-hidden="true" />
                    Remove from this company
                  </button>
                </>
              )}
            </div>
            {dirty && <span className="badge tone-warn w-fit">Unsaved changes</span>}
            {editing.summary && !editing.summary.can_change && (
              <div className="panel tone-warn" role="note" data-testid="read-only">
                <LayoutTemplate aria-hidden="true" />
                <p className="m-0 text-sm">
                  Only an admin of every company using this template can change it. You are an admin of {editing.summary.admin_of} of the {editing.summary.companies}. You can still change the values for {company.name} only.
                </p>
              </div>
            )}
            {editing.uploaded && <p className="m-0 text-sm text-muted">The text of the employer and employee rows of the upload is shown while you set up the cells. It is not saved.</p>}

            <TemplateGrid body={editing.body} selected={selected} onSelect={setSelected} previews={previews} />

            <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
              {selected && selectedRow && selectedRow.kind !== 'copy' ? (
                <CellEditor
                  key={`${selected.row}:${selected.column}`}
                  body={editing.body}
                  row={selected.row}
                  column={selected.column}
                  cell={selectedCell}
                  canChange={canChange}
                  companyName={company.name}
                  ownValue={selectedCell ? editing.own.values[selectedCell.id] : undefined}
                  keys={keys}
                  uploaded={editing.uploaded?.[selected.row]?.[selected.column] ?? null}
                  preview={
                    selectedCell && context && previewRun && built
                      ? (() => {
                          const first = built.written[0]
                          const employee = selectedRow.kind === 'employee' ? (first === undefined ? null : previewRun.employees[first]) : null
                          if (selectedRow.kind === 'employee' && employee === null) return null
                          const result = previewCell(editing.body, selectedCell, context, employee)
                          return {
                            text: result.text,
                            problem: result.problem ? cellProblemText(result.problem) : null,
                            who: selectedRow.kind === 'employee' ? `For ${employeeName(employee ?? undefined, first ?? 0)}, ${previewRun.name}.` : `For ${previewRun.name}.`,
                          }
                        })()
                      : null
                  }
                  onChange={setCell}
                  onOwnChange={(value) => selectedCell && setOwn(selectedCell.id, value)}
                  newId={() => newCellId(editing.body)}
                />
              ) : (
                <div className="panel" data-testid="no-cell">
                  <LayoutTemplate aria-hidden="true" />
                  <p className="m-0 text-sm">Click a cell of the employer or employee row, or a column letter, to say what goes in it.</p>
                </div>
              )}
              <FileSettingsEditor
                body={editing.body}
                disabled={!canChange}
                columns={keys.columns}
                example={{ name: previewRun?.name ?? company.name, brn: previewRun?.brn ?? company.brn, period: previewRun?.period ?? '2026-08' }}
                onChange={(body) => setEditing({ ...editing, body, bodyChanged: true })}
              />
            </div>

            <section className="card flex flex-col gap-3 p-4" aria-labelledby="preview-title" data-testid="file-preview">
              <h3 id="preview-title" className="m-0 text-base font-semibold">
                Preview of the file
              </h3>
              {general.length > 0 && (
                <div className="panel tone-danger" role="alert">
                  <LayoutTemplate aria-hidden="true" />
                  <ul className="m-0 flex list-none flex-col gap-1 p-0 text-sm">
                    {general.map((problem) => (
                      <li key={`${problem.cell}:${problem.kind}`}>{problemText(problem)}</li>
                    ))}
                  </ul>
                </div>
              )}
              {built && previewRun ? (
                <>
                  <p className="m-0 text-sm text-muted">
                    With the saved run of {previewRun.name} for that month: {built.written.length} {built.written.length === 1 ? 'employee' : 'employees'} in the file
                    {built.leftOut.length > 0 ? `, ${built.leftOut.length} left out with no pay` : ''}.
                  </p>
                  <FilePreview lines={built.lines.slice(0, 12)} separator={editing.body.settings.separator} more={Math.max(0, built.lines.length - 12)} />
                </>
              ) : (
                <p className="m-0 text-sm text-muted">Get a saved run under Make the files to see the file with real figures.</p>
              )}
            </section>
          </div>
        )}
      </div>

      {open?.kind === 'history' && editing?.summary && (
        <HistoryDialog
          store={store}
          template={editing.summary}
          onClose={() => setOpen(null)}
          onRestore={(body, revision) => {
            setEditing({ ...editing, body, bodyChanged: true })
            setStatus(`Version ${revision} is in the editor. Save to make it the newest version.`)
            setOpen(null)
          }}
        />
      )}
      {open?.kind === 'attach' && editing?.summary && (
        <AttachDialog
          store={store}
          template={editing.summary}
          onClose={() => setOpen(null)}
          onDone={(names) => {
            setOpen(null)
            setReload((n) => n + 1)
            // Reopened first: opening clears the message, which must stay.
            void openTemplate(editing.id).then(() => setStatus(names.length > 0 ? `Now also used by ${names.join(', ')}.` : null))
          }}
        />
      )}
      {open?.kind === 'remove' && editing?.summary && (
        <RemoveDialog
          template={editing.summary}
          companyName={company.name}
          onClose={() => setOpen(null)}
          onRemove={async () => {
            const answer = await store.detach(editing.id, editing.summary!.revision)
            if (!answer.ok) return answer.failure
            setOpen(null)
            setEditing(null)
            setSelected(null)
            setStatus(answer.value.deleted ? `${editing.name} was deleted, with its history.` : `${editing.name} was removed from ${company.name}.`)
            setReload((n) => n + 1)
            onChanged()
            return null
          }}
        />
      )}
    </section>
  )
}

/** The rows of a new upload: what each one is, before the cells are set up. */
function UploadRows({
  upload,
  onKinds,
  onName,
  onCancel,
  onStart,
}: {
  upload: { upload: Upload; kinds: UploadKind[]; name: string }
  onKinds: (kinds: UploadKind[]) => void
  onName: (name: string) => void
  onCancel: () => void
  onStart: () => void
}) {
  const employers = upload.kinds.filter((kind) => kind === 'employer').length
  const employees = upload.kinds.filter((kind) => kind === 'employee').length
  const wrong = employers > 1 || employees !== 1
  return (
    <section className="card flex flex-col gap-4 p-4" aria-labelledby="upload-title" data-testid="upload-rows">
      <h3 id="upload-title" className="m-0 text-base font-semibold">
        The rows of the uploaded file
      </h3>
      <p className="m-0 text-sm text-muted">
        Say what each row is. Copied rows are written exactly as uploaded. The employer row is written once; the employee row once for each employee paid that month. Example rows are left out and not saved.
      </p>
      <label className="field">
        <span className="field-label">Template name</span>
        <input className="input input-sm" value={upload.name} maxLength={80} onChange={(event) => onName(event.target.value)} />
      </label>
      <div className="table-scroll card" style={{ maxHeight: 360 }}>
        <table className="table">
          <caption className="sr-only">The rows of the uploaded file</caption>
          <thead>
            <tr>
              <th scope="col">Row</th>
              <th scope="col">What it is</th>
              <th scope="col">Starts with</th>
            </tr>
          </thead>
          <tbody>
            {upload.upload.grid.map((cells, row) => (
              <tr key={row}>
                <th scope="row" className="num" data-values>
                  {row + 1}
                </th>
                <td>
                  <select
                    className="input input-sm"
                    aria-label={`What row ${row + 1} is`}
                    value={upload.kinds[row]}
                    onChange={(event) => onKinds(upload.kinds.map((kind, i) => (i === row ? (event.target.value as UploadKind) : kind)))}
                  >
                    {(Object.keys(ROW_KIND_LABELS) as UploadKind[]).map((kind) => (
                      <option key={kind} value={kind}>
                        {ROW_KIND_LABELS[kind]}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="grid-copy">{cells.slice(0, 4).join(', ')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {wrong && (
        <p className="m-0 text-sm text-warn" role="alert">
          Choose one employee row, and one employer row at most.
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <button type="button" className="btn btn-primary" disabled={wrong || upload.name.trim() === ''} onClick={onStart}>
          <LayoutTemplate aria-hidden="true" />
          Set up the cells
        </button>
        <button type="button" className="btn" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </section>
  )
}

const when = (stamp: string) => {
  const date = new Date(stamp)
  return Number.isNaN(date.getTime()) ? stamp : date.toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

function HistoryDialog({ store, template, onClose, onRestore }: { store: TemplateStore; template: TemplateSummary; onClose: () => void; onRestore: (body: TemplateBody, revision: number) => void }) {
  const [rows, setRows] = useState<TemplateRevision[] | null>(null)
  const [failure, setFailure] = useState<Failure | null>(null)
  useEffect(() => {
    void store.history(template.template_id).then((answer) => (answer.ok ? setRows(answer.value) : setFailure(answer.failure)))
  }, [store, template.template_id])
  return (
    <Dialog
      title={`History of ${template.name}`}
      description="Every saved version is kept. Restoring one puts it in the editor; saving it makes it the newest version, and nothing earlier is changed."
      icon={<History />}
      onClose={onClose}
      width={620}
      actions={
        <button type="button" className="btn" onClick={onClose}>
          Close
        </button>
      }
    >
      {failure && <FailurePanel failure={failure} />}
      {!rows && !failure && (
        <div role="status" className="flex flex-col gap-2">
          <span className="sr-only">Loading</span>
          <div className="skeleton h-8 w-full" />
        </div>
      )}
      {rows && (
        <ul className="m-0 flex list-none flex-col gap-2 p-0" data-testid="history">
          {rows.map((row) => (
            <li key={row.revision} className="flex flex-wrap items-center gap-3 border-b border-line pb-2">
              <span className="font-semibold">Version {row.revision}</span>
              <span className="text-sm text-muted">
                <span data-values>{when(row.saved_at)}</span>, {row.saved_by_you ? 'by you' : 'by another admin'}
              </span>
              {row.revision === template.revision ? (
                <span className="badge tone-accent">In use now</span>
              ) : (
                <button
                  type="button"
                  className="btn btn-sm ml-auto"
                  onClick={async () => {
                    const answer = await store.revision(template.template_id, row.revision)
                    if (answer.ok) onRestore(answer.value, row.revision)
                    else setFailure(answer.failure)
                  }}
                >
                  <RotateCcw aria-hidden="true" />
                  Restore this version
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </Dialog>
  )
}

function AttachDialog({ store, template, onClose, onDone }: { store: TemplateStore; template: TemplateSummary; onClose: () => void; onDone: (names: string[]) => void }) {
  const [companies, setCompanies] = useState<TemplateCompany[] | null>(null)
  const [ticked, setTicked] = useState<Set<string>>(new Set())
  const [failure, setFailure] = useState<Failure | null>(null)
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    void store.companies(template.template_id).then((answer) => (answer.ok ? setCompanies(answer.value) : setFailure(answer.failure)))
  }, [store, template.template_id])
  const others = companies?.filter((company) => !company.uses) ?? []
  return (
    <Dialog
      title={`Use ${template.name} in other companies`}
      description="The template is then shared: a change reaches every company using it, and only an admin of all of them can make one. Each company keeps its own values."
      icon={<Building2 />}
      onClose={onClose}
      width={560}
      actions={
        <>
          <button type="button" className="btn" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button
            type="button"
            className="btn btn-primary"
            disabled={busy || ticked.size === 0}
            onClick={async () => {
              setBusy(true)
              const names: string[] = []
              for (const brn of ticked) {
                const answer = await store.attach(template.template_id, brn)
                if (!answer.ok) {
                  setFailure(answer.failure)
                  setBusy(false)
                  if (names.length > 0) onDone(names)
                  return
                }
                names.push(answer.value.company)
              }
              onDone(names)
            }}
          >
            <Building2 aria-hidden="true" />
            Use it in the ticked companies
          </button>
        </>
      }
    >
      {failure && <FailurePanel failure={failure} />}
      {!companies && !failure && (
        <div role="status">
          <span className="sr-only">Loading</span>
          <div className="skeleton h-8 w-full" />
        </div>
      )}
      {companies && others.length === 0 && <p className="m-0 text-sm text-muted">Every company where you are an admin already uses it.</p>}
      {others.map((company) => (
        <label key={company.brn} className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={ticked.has(company.brn)}
            onChange={(event) => {
              const next = new Set(ticked)
              if (event.target.checked) next.add(company.brn)
              else next.delete(company.brn)
              setTicked(next)
            }}
          />
          {company.name}
        </label>
      ))}
    </Dialog>
  )
}

/** Asks before removing; from the last company using it, says plainly it deletes it for good. */
export function RemoveDialog({ template, companyName, onClose, onRemove }: { template: TemplateSummary; companyName: string; onClose: () => void; onRemove: () => Promise<Failure | null> }) {
  const [busy, setBusy] = useState(false)
  const [failure, setFailure] = useState<Failure | null>(null)
  const last = template.companies <= 1
  const others = template.companies - 1
  return (
    <Dialog
      title={last ? `Delete ${template.name}?` : `Remove ${template.name} from ${companyName}?`}
      icon={<Trash2 />}
      tone="tone-danger"
      onClose={onClose}
      actions={
        <>
          <button type="button" className="btn" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button
            type="button"
            className="btn btn-danger"
            disabled={busy}
            onClick={async () => {
              setBusy(true)
              const problem = await onRemove()
              setBusy(false)
              setFailure(problem)
            }}
          >
            <Trash2 aria-hidden="true" />
            {last ? 'Delete the template' : `Remove from ${companyName}`}
          </button>
        </>
      }
    >
      <p className="m-0 text-sm" data-testid="remove-text">
        {last
          ? `${companyName} is the only company using this template, so removing it deletes the template and all its history. This can't be undone.`
          : `The template stays for the ${others} other ${others === 1 ? 'company' : 'companies'} using it. ${companyName}'s own values for it are deleted.`}
      </p>
      {failure && <FailurePanel failure={failure} />}
    </Dialog>
  )
}
