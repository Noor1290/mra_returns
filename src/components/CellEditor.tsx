import { Eraser, Minus, Plus } from 'lucide-react'
import { useId, useState } from 'react'
import { multiply, parseDecimal, toText } from '../lib/decimal'
import { writeDate } from '../lib/formats'
import {
  COMPANY_FIELDS,
  MAX_TERMS,
  cellName,
  cellsOf,
  defaultFormat,
  headingOf,
  type Cell,
  type Format,
  type Source,
  type TemplateBody,
  type Term,
} from '../lib/template'
import { COMPANY_FIELD_LABELS, SOURCE_LABELS } from '../lib/wording'

/** The keys of the saved run, for the lists to choose from. */
export interface RunKeys {
  identity: string[]
  columns: string[]
}

type Choice = 'empty' | 'fixed' | 'company' | 'identity' | 'column' | 'month' | 'calc' | 'map'
const CHOICES: Choice[] = ['empty', 'fixed', 'company', 'identity', 'column', 'month', 'calc', 'map']

const choiceOf = (source: Source): Choice => (source.type === 'employee' ? source.group : source.type)

function sourceFor(choice: Choice, keys: RunKeys): Source {
  switch (choice) {
    case 'empty':
      return { type: 'empty' }
    case 'fixed':
      return { type: 'fixed', value: '' }
    case 'company':
      return { type: 'company', field: 'name' }
    case 'identity':
      return { type: 'employee', key: keys.identity[0] ?? 'ID', group: 'identity' }
    case 'column':
      return { type: 'employee', key: keys.columns[0] ?? 'Gross Pay', group: 'column' }
    case 'month':
      return { type: 'month' }
    case 'calc':
      return { type: 'calc', terms: [{ sign: 1, of: { type: 'column', key: keys.columns[0] ?? 'Gross Pay' }, times: null, round: 'none' }] }
    case 'map':
      return { type: 'map', key: 'Full time / Part time', pairs: [{ from: 'Full time', to: 'Y' }, { from: 'Part time', to: 'N' }], otherwise: '' }
  }
}

/** A number typed by the user: "0.045", or "4.5%" for 0.045. Null when it is not one. */
export function readRate(text: string): string | null {
  const trimmed = text.trim()
  const percent = trimmed.endsWith('%')
  const value = parseDecimal(percent ? trimmed.slice(0, -1) : trimmed)
  if (!value) return null
  const result = percent ? multiply(value, parseDecimal('0.01')!) : value
  if (!result) return null
  const written = toText(result)
  return /^-?\d{1,12}(\.\d{1,8})?$/.test(written) ? written : null
}

/** A text box for a number that keeps what is typed until it is a number. */
function NumberText({ label, value, onChange, disabled, allowEmpty, hint }: { label: string; value: string | null; onChange: (value: string | null) => void; disabled: boolean; allowEmpty: boolean; hint?: string }) {
  const [typed, setTyped] = useState(value ?? '')
  const [wrong, setWrong] = useState(false)
  const id = useId()
  return (
    <label className="field" htmlFor={id}>
      <span className="field-label">{label}</span>
      <input
        id={id}
        className="input input-sm num"
        value={typed}
        disabled={disabled}
        aria-invalid={wrong}
        onChange={(event) => {
          setTyped(event.target.value)
          if (allowEmpty && event.target.value.trim() === '') {
            setWrong(false)
            onChange(null)
            return
          }
          const read = readRate(event.target.value)
          setWrong(read === null)
          if (read !== null) onChange(read)
        }}
      />
      {wrong ? <span className="field-error">Write a number, such as 0.045 or 4.5%.</span> : hint && <span className="field-hint">{hint}</span>}
    </label>
  )
}

function KeyInput({ label, value, options, onChange, disabled }: { label: string; value: string; options: string[]; onChange: (value: string) => void; disabled: boolean }) {
  const id = useId()
  const listId = useId()
  return (
    <label className="field" htmlFor={id}>
      <span className="field-label">{label}</span>
      <input id={id} className="input input-sm" list={listId} value={value} disabled={disabled} onChange={(event) => onChange(event.target.value)} />
      <datalist id={listId}>
        {options.map((option) => (
          <option key={option} value={option} />
        ))}
      </datalist>
    </label>
  )
}

function CalcEditor({ body, cell, terms, onChange, keys, disabled }: { body: TemplateBody; cell: Cell; terms: Term[]; onChange: (terms: Term[]) => void; keys: RunKeys; disabled: boolean }) {
  const others = cellsOf(body).filter((found) => found.cell.id !== cell.id)
  const set = (index: number, change: Partial<Term>) => onChange(terms.map((term, i) => (i === index ? { ...term, ...change } : term)))
  return (
    <fieldset className="flex flex-col gap-3 rounded-lg border border-line p-3">
      <legend className="field-label px-1">Parts, worked out in order</legend>
      {terms.map((term, index) => (
        <div key={index} className="flex flex-col gap-2 border-b border-line pb-3 last:border-b-0 last:pb-0" data-testid="calc-part">
          <div className="flex flex-wrap items-end gap-2">
            <label className="field">
              <span className="field-label">Part {index + 1}</span>
              <select className="input input-sm" value={term.sign} disabled={disabled} onChange={(event) => set(index, { sign: Number(event.target.value) === -1 ? -1 : 1 })}>
                <option value={1}>Add</option>
                <option value={-1}>Subtract</option>
              </select>
            </label>
            <label className="field">
              <span className="field-label">What</span>
              <select
                className="input input-sm"
                value={term.of.type}
                disabled={disabled}
                onChange={(event) => {
                  const type = event.target.value
                  set(index, {
                    of: type === 'cell' ? { type: 'cell', id: others[0]?.cell.id ?? cell.id } : type === 'number' ? { type: 'number', value: '0' } : { type: 'column', key: keys.columns[0] ?? 'Gross Pay' },
                  })
                }}
              >
                <option value="column">Payroll column</option>
                <option value="cell">Another cell</option>
                <option value="number">A number</option>
              </select>
            </label>
            {term.of.type === 'column' && <KeyInput label="Column" value={term.of.key} options={keys.columns} disabled={disabled} onChange={(key) => set(index, { of: { type: 'column', key } })} />}
            {term.of.type === 'cell' && (
              <label className="field">
                <span className="field-label">Cell</span>
                <select className="input input-sm" value={term.of.id} disabled={disabled} onChange={(event) => set(index, { of: { type: 'cell', id: event.target.value } })}>
                  {!others.some((found) => found.cell.id === (term.of as { id: string }).id) && <option value={term.of.id}>This cell</option>}
                  {others.map((found) => (
                    <option key={found.cell.id} value={found.cell.id}>
                      {cellName(found.row, found.column)} {headingOf(body, found.row, found.column)}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {term.of.type === 'number' && (
              <NumberText key={`n${index}`} label="Number" value={term.of.value} allowEmpty={false} disabled={disabled} onChange={(value) => value !== null && set(index, { of: { type: 'number', value } })} />
            )}
          </div>
          <div className="flex flex-wrap items-end gap-2">
            <NumberText key={`r${index}`} label="Multiplied by (optional)" value={term.times} allowEmpty disabled={disabled} hint="0.045, or 4.5%" onChange={(times) => set(index, { times })} />
            <label className="field">
              <span className="field-label">Round this part first</span>
              <select className="input input-sm" value={term.round} disabled={disabled} onChange={(event) => set(index, { round: event.target.value as Term['round'] })}>
                <option value="none">No</option>
                <option value="whole">To whole rupees, half up</option>
                <option value="two">To 2 decimals, half up</option>
              </select>
            </label>
            <button type="button" className="btn btn-sm btn-ghost" disabled={disabled || terms.length === 1} onClick={() => onChange(terms.filter((_, i) => i !== index))} aria-label={`Remove part ${index + 1}`}>
              <Minus aria-hidden="true" />
              Remove
            </button>
          </div>
        </div>
      ))}
      <div>
        <button
          type="button"
          className="btn btn-sm"
          disabled={disabled || terms.length >= MAX_TERMS}
          onClick={() => onChange([...terms, { sign: 1, of: { type: 'column', key: keys.columns[0] ?? 'Gross Pay' }, times: null, round: 'none' }])}
        >
          <Plus aria-hidden="true" />
          Add a part
        </button>
      </div>
    </fieldset>
  )
}

function FormatEditor({ format, onChange, disabled }: { format: Format; onChange: (format: Format) => void; disabled: boolean }) {
  const example = { year: 2026, month: 8, day: 1 }
  return (
    <fieldset className="flex flex-col gap-3 rounded-lg border border-line p-3">
      <legend className="field-label px-1">How it is written</legend>
      <label className="field">
        <span className="field-label">Written as</span>
        <select
          className="input input-sm"
          value={format.type}
          disabled={disabled}
          onChange={(event) => onChange(defaultFormat(event.target.value === 'number' ? 'calc' : event.target.value === 'date' ? 'month' : 'fixed'))}
        >
          <option value="text">Text</option>
          <option value="number">Number</option>
          <option value="date">Date</option>
        </select>
      </label>
      {format.type === 'text' && (
        <div className="flex flex-col gap-2 text-sm">
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={format.capitals} disabled={disabled} onChange={(event) => onChange({ ...format, capitals: event.target.checked })} />
            In capitals
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={format.tidy} disabled={disabled} onChange={(event) => onChange({ ...format, tidy: event.target.checked })} />
            Trim spaces and collapse double spaces
          </label>
        </div>
      )}
      {format.type === 'number' && (
        <div className="flex flex-wrap items-end gap-2">
          <label className="field">
            <span className="field-label">Rounded to</span>
            <select className="input input-sm" value={format.decimals} disabled={disabled} onChange={(event) => onChange({ ...format, decimals: event.target.value === '2' ? 2 : 0 })}>
              <option value={0}>Whole rupees, half up</option>
              <option value={2}>2 decimals, half up</option>
            </select>
          </label>
          <label className="field">
            <span className="field-label">Width with leading zeros</span>
            <input
              className="input input-sm num"
              type="number"
              min={0}
              max={20}
              value={format.width}
              disabled={disabled}
              onChange={(event) => onChange({ ...format, width: Math.max(0, Math.min(20, Math.trunc(Number(event.target.value) || 0))) })}
            />
            <span className="field-hint">0 for none</span>
          </label>
        </div>
      )}
      {format.type === 'date' && (
        <label className="field">
          <span className="field-label">Pattern</span>
          <input className="input input-sm num" value={format.pattern} maxLength={40} disabled={disabled} onChange={(event) => event.target.value !== '' && onChange({ ...format, pattern: event.target.value })} />
          <span className="field-hint">
            YYYY, YY, MM, DD and MONTH are replaced; anything else is written as it is. 1 August 2026 is written {writeDate(format.pattern, example)}.
          </span>
        </label>
      )}
    </fieldset>
  )
}

export interface CellEditorProps {
  body: TemplateBody
  row: number
  column: number
  cell: Cell | null
  canChange: boolean
  companyName: string
  /** This company's own value for this cell, when it has one. */
  ownValue: string | undefined
  keys: RunKeys
  /** The cell's text in the uploaded file, while a new upload is set up (never saved). */
  uploaded: string | null
  preview: { text: string; problem: string | null; who: string } | null
  onChange: (cell: Cell | null) => void
  onOwnChange: (value: string | undefined) => void
  newId: () => string
}

/** What goes in one cell of the employer or employee row, how it is written, and its preview. */
export function CellEditor(props: CellEditorProps) {
  const { body, row, column, cell, canChange, companyName, ownValue, keys, uploaded, preview, onChange, onOwnChange, newId } = props
  const heading = headingOf(body, row, column)
  const source = cell?.source ?? { type: 'empty' }
  const choice = choiceOf(source)
  const locked = !canChange
  const setSource = (next: Source) => onChange({ id: cell?.id ?? newId(), source: next, format: cell?.format ?? defaultFormat(next.type) })
  const setChoice = (next: Choice) => {
    if (next === 'empty') return onChange(null)
    const nextSource = sourceFor(next, keys)
    onChange({ id: cell?.id ?? newId(), source: nextSource, format: defaultFormat(nextSource.type) })
  }

  return (
    <section className="card flex flex-col gap-4 p-4" aria-labelledby="cell-title" data-testid="cell-editor">
      <div className="flex flex-col gap-1">
        <h3 id="cell-title" className="m-0 text-base font-semibold">
          Cell {cellName(row, column)}
        </h3>
        {heading && <p className="m-0 text-sm text-muted">{heading}</p>}
        {uploaded !== null && uploaded !== '' && (
          <p className="m-0 text-sm text-muted">
            In the uploaded file: <span className="num">{uploaded}</span>
          </p>
        )}
      </div>

      <label className="field">
        <span className="field-label">What goes in it</span>
        <select className="input input-sm" value={choice} disabled={locked} onChange={(event) => setChoice(event.target.value as Choice)}>
          {CHOICES.map((one) => (
            <option key={one} value={one}>
              {SOURCE_LABELS[one]}
            </option>
          ))}
        </select>
      </label>

      {source.type === 'fixed' && (
        <div className="flex flex-col gap-3">
          <label className="field">
            <span className="field-label">Value for all companies</span>
            <input className="input input-sm" value={source.value} maxLength={200} disabled={locked} onChange={(event) => setSource({ type: 'fixed', value: event.target.value })} />
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={ownValue !== undefined} onChange={(event) => onOwnChange(event.target.checked ? source.value : undefined)} disabled={!cell} />
            {companyName} has its own value
          </label>
          {ownValue !== undefined && (
            <label className="field">
              <span className="field-label">Value for {companyName} only</span>
              <input className="input input-sm" value={ownValue} maxLength={200} onChange={(event) => onOwnChange(event.target.value)} />
            </label>
          )}
          <p className="m-0 text-sm" data-testid="applies">
            <span className={`badge ${ownValue !== undefined ? 'tone-glow' : ''}`}>{ownValue !== undefined ? `${companyName} only` : 'All companies'}</span>{' '}
            {ownValue !== undefined ? `This company's own value applies here.` : 'The value for all companies applies here.'}
          </p>
        </div>
      )}

      {source.type === 'company' && (
        <label className="field">
          <span className="field-label">Detail</span>
          <select className="input input-sm" value={source.field} disabled={locked} onChange={(event) => setSource({ type: 'company', field: event.target.value as (typeof COMPANY_FIELDS)[number] })}>
            {COMPANY_FIELDS.map((field) => (
              <option key={field} value={field}>
                {COMPANY_FIELD_LABELS[field]}
              </option>
            ))}
          </select>
          {source.field === 'email' && <span className="field-hint">Your own email for the returns, from the Company profile. Use a fixed value for another address.</span>}
        </label>
      )}

      {source.type === 'employee' && (
        <KeyInput
          label={source.group === 'identity' ? 'Identity field' : 'Payroll column'}
          value={source.key}
          options={source.group === 'identity' ? keys.identity : keys.columns}
          disabled={locked}
          onChange={(key) => setSource({ ...source, key })}
        />
      )}

      {source.type === 'month' && <p className="m-0 text-sm text-muted">The month of the return. Choose how it is written below.</p>}

      {source.type === 'calc' && <CalcEditor body={body} cell={cell!} terms={source.terms} keys={keys} disabled={locked} onChange={(terms) => setSource({ type: 'calc', terms })} />}

      {source.type === 'map' && (
        <div className="flex flex-col gap-3">
          <KeyInput label="Text from" value={source.key} options={keys.identity} disabled={locked} onChange={(key) => setSource({ ...source, key })} />
          <fieldset className="flex flex-col gap-2 rounded-lg border border-line p-3">
            <legend className="field-label px-1">Capitals and spaces are ignored</legend>
            {source.pairs.map((pair, index) => (
              <div key={index} className="flex flex-wrap items-end gap-2">
                <label className="field">
                  <span className="field-label">When it is</span>
                  <input className="input input-sm" value={pair.from} maxLength={200} disabled={locked} onChange={(event) => setSource({ ...source, pairs: source.pairs.map((p, i) => (i === index ? { ...p, from: event.target.value } : p)) })} />
                </label>
                <label className="field">
                  <span className="field-label">Write</span>
                  <input className="input input-sm" value={pair.to} maxLength={200} disabled={locked} onChange={(event) => setSource({ ...source, pairs: source.pairs.map((p, i) => (i === index ? { ...p, to: event.target.value } : p)) })} />
                </label>
                <button type="button" className="btn btn-sm btn-ghost" disabled={locked} aria-label={`Remove mapping ${index + 1}`} onClick={() => setSource({ ...source, pairs: source.pairs.filter((_, i) => i !== index) })}>
                  <Minus aria-hidden="true" />
                  Remove
                </button>
              </div>
            ))}
            <div>
              <button type="button" className="btn btn-sm" disabled={locked || source.pairs.length >= 50} onClick={() => setSource({ ...source, pairs: [...source.pairs, { from: '', to: '' }] })}>
                <Plus aria-hidden="true" />
                Add a mapping
              </button>
            </div>
          </fieldset>
          <label className="field">
            <span className="field-label">Anything else becomes</span>
            <input className="input input-sm" value={source.otherwise} maxLength={200} disabled={locked} onChange={(event) => setSource({ ...source, otherwise: event.target.value })} />
          </label>
        </div>
      )}

      {cell && <FormatEditor format={cell.format} disabled={locked} onChange={(format) => onChange({ ...cell, format })} />}

      <div className="flex flex-col gap-1 rounded-lg border border-line p-3" data-testid="cell-preview">
        <span className="field-label">In the file</span>
        {preview ? (
          <>
            <code className="num text-sm">{preview.text === '' ? '(empty)' : preview.text}</code>
            <span className="field-hint">{preview.who}</span>
            {preview.problem && <span className="field-error">{preview.problem}</span>}
          </>
        ) : (
          <span className="field-hint">Get a saved run under Make the files to see this cell with real figures.</span>
        )}
      </div>

      {cell && !locked && (
        <div>
          <button type="button" className="btn btn-sm btn-ghost" onClick={() => onChange(null)}>
            <Eraser aria-hidden="true" />
            Clear this cell
          </button>
        </div>
      )}
    </section>
  )
}
