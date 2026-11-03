import type { FieldLists } from '../lib/fields'
import { fileNameFor, FILE_NAME_PIECES } from '../lib/fileName'
import type { FileSettings, TemplateBody } from '../lib/template'
import { FieldSelect } from './CellEditor'

/** Whether a template writes its file as the MRA's own files are: Windows-1252, CRLF, commas, no quotes, every line padded. */
export const asTheMraRequires = (settings: FileSettings) =>
  settings.encoding === 'windows-1252' && settings.lineEnding === 'crlf' && settings.separator === ',' && settings.quotes === 'never' && settings.pad

/**
 * The template's file settings: one line saying whether the file is written as the MRA requires,
 * then, under "Advanced settings" (closed at first), how the bytes are written, the file's name
 * and who is left out.
 */
export function FileSettingsEditor({
  body,
  onChange,
  disabled,
  example,
  fields,
  companyName,
}: {
  body: TemplateBody
  onChange: (body: TemplateBody) => void
  disabled: boolean
  /** The company and month the file name example is shown for. */
  example: { name: string; brn: string; period: string }
  fields: FieldLists
  companyName: string
}) {
  const settings = body.settings
  const set = (change: Partial<FileSettings>) => onChange({ ...body, settings: { ...settings, ...change } })
  return (
    <section className="card flex flex-col gap-3 p-4" aria-labelledby="settings-title" data-testid="file-settings">
      <h3 id="settings-title" className="m-0 text-base font-semibold">
        File settings
      </h3>
      <p className="m-0 text-sm" data-testid="settings-line">
        {asTheMraRequires(settings) ? 'As the MRA requires (Windows-1252, CRLF, no quotes).' : 'Not as the MRA requires. Check them under Advanced settings.'}
      </p>
      <details className="rounded-lg border border-line p-3" data-testid="advanced-settings">
        <summary className="cursor-pointer text-sm font-semibold">Advanced settings</summary>
        <div className="mt-3 flex flex-col gap-4">
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
              <FieldSelect
                label="No pay means this column is 0 or empty"
                value={body.noPay.key}
                groups={[{ label: 'Payroll columns', names: fields.columns }]}
                fields={fields}
                companyName={companyName}
                disabled={disabled}
                onChange={(key) => onChange({ ...body, noPay: { key } })}
              />
            )}
          </div>
        </div>
      </details>
    </section>
  )
}
