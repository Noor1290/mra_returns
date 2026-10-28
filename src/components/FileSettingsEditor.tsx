import { fileNameFor, FILE_NAME_PIECES } from '../lib/fileName'
import type { FileSettings, TemplateBody } from '../lib/template'

/** The template's file settings: how the bytes are written, the file's name, who is left out. */
export function FileSettingsEditor({
  body,
  onChange,
  disabled,
  example,
  columns,
}: {
  body: TemplateBody
  onChange: (body: TemplateBody) => void
  disabled: boolean
  /** The company and month the file name example is shown for. */
  example: { name: string; brn: string; period: string }
  columns: string[]
}) {
  const settings = body.settings
  const set = (change: Partial<FileSettings>) => onChange({ ...body, settings: { ...settings, ...change } })
  return (
    <section className="card flex flex-col gap-4 p-4" aria-labelledby="settings-title" data-testid="file-settings">
      <h3 id="settings-title" className="m-0 text-base font-semibold">
        File settings
      </h3>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="field">
          <span className="field-label">Encoding</span>
          <select className="input input-sm w-full" value={settings.encoding} disabled={disabled} onChange={(event) => set({ encoding: event.target.value as FileSettings['encoding'] })}>
            <option value="windows-1252">Windows-1252 (as the MRA files)</option>
            <option value="utf-8">UTF-8</option>
            <option value="utf-8-bom">UTF-8 with a byte-order mark</option>
          </select>
        </label>
        <label className="field">
          <span className="field-label">Line endings</span>
          <select className="input input-sm w-full" value={settings.lineEnding} disabled={disabled} onChange={(event) => set({ lineEnding: event.target.value === 'lf' ? 'lf' : 'crlf' })}>
            <option value="crlf">CRLF (Windows, as the MRA files)</option>
            <option value="lf">LF</option>
          </select>
        </label>
        <label className="field">
          <span className="field-label">Separator</span>
          <select className="input input-sm w-full" value={settings.separator} disabled={disabled} onChange={(event) => set({ separator: event.target.value === ';' ? ';' : ',' })}>
            <option value=",">Comma</option>
            <option value=";">Semicolon</option>
          </select>
        </label>
        <label className="field">
          <span className="field-label">Quotes</span>
          <select className="input input-sm w-full" value={settings.quotes} disabled={disabled} onChange={(event) => set({ quotes: event.target.value as FileSettings['quotes'] })}>
            <option value="never">Never (as the MRA files)</option>
            <option value="needed">When needed</option>
            <option value="always">Always</option>
          </select>
        </label>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={settings.pad} disabled={disabled} onChange={(event) => set({ pad: event.target.checked })} />
        Pad every line to the full width ({body.width} fields)
      </label>

      <div className="flex flex-col gap-2">
        <label className="field">
          <span className="field-label">File name</span>
          <input
            className="input input-sm"
            value={body.fileName.pattern}
            maxLength={120}
            disabled={disabled}
            onChange={(event) => event.target.value.trim() !== '' && onChange({ ...body, fileName: { ...body.fileName, pattern: event.target.value } })}
          />
          <span className="field-hint">Pieces: {FILE_NAME_PIECES.join(' ')}. Characters Windows does not allow in a file name are left out.</span>
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={body.fileName.capitals} disabled={disabled} onChange={(event) => onChange({ ...body, fileName: { ...body.fileName, capitals: event.target.checked } })} />
          File name in capitals
        </label>
        <p className="m-0 text-sm text-muted">
          For example: <span className="num" data-values>{fileNameFor(body.fileName, example.period, example)}</span>
        </p>
      </div>

      <div className="flex flex-col gap-2">
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={body.noPay !== null} disabled={disabled} onChange={(event) => onChange({ ...body, noPay: event.target.checked ? { key: 'Gross Pay' } : null })} />
          Leave out employees with no pay that month
        </label>
        {body.noPay && (
          <label className="field">
            <span className="field-label">No pay means this column is 0 or empty</span>
            <input className="input input-sm" list="no-pay-columns" value={body.noPay.key} disabled={disabled} onChange={(event) => event.target.value.trim() !== '' && onChange({ ...body, noPay: { key: event.target.value } })} />
            <datalist id="no-pay-columns">
              {columns.map((column) => (
                <option key={column} value={column} />
              ))}
            </datalist>
          </label>
        )}
      </div>
    </section>
  )
}
