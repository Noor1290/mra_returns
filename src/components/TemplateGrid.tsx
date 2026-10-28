import { cellName, columnName, headingOf, type TemplateBody } from '../lib/template'
import { ROW_KIND_LABELS, sourceSummary } from '../lib/wording'

export interface Selected {
  row: number
  column: number
}

/**
 * The template as a grid, like a spreadsheet. Copied rows show their text; every cell of the
 * employer and employee rows is a button that selects it, showing what goes in it and, with a
 * saved run, its value for the first employee. A column's letter selects that column's cell in
 * the employee row.
 */
export function TemplateGrid({
  body,
  selected,
  onSelect,
  previews,
}: {
  body: TemplateBody
  selected: Selected | null
  onSelect: (selected: Selected) => void
  /** The text of each cell for the preview's first employee (or the employer row), by "row:column". */
  previews: Map<string, string> | null
}) {
  const employeeRow = body.rows.findIndex((row) => row.kind === 'employee')
  const columns = Array.from({ length: body.width }, (_, index) => index)
  return (
    <div className="table-scroll card" style={{ maxHeight: 460 }}>
      <table className="table grid-table" data-testid="template-grid" data-values>
        <caption className="sr-only">The template, row by row</caption>
        <thead>
          <tr>
            <th scope="col" className="grid-pin-1">
              Row
            </th>
            <th scope="col" className="grid-pin-2">
              Kind
            </th>
            {columns.map((column) => (
              <th key={column} scope="col">
                {employeeRow >= 0 ? (
                  <button type="button" className="row-button" aria-label={`Column ${columnName(column)}: select its cell in the employee row`} onClick={() => onSelect({ row: employeeRow, column })}>
                    {columnName(column)}
                  </button>
                ) : (
                  columnName(column)
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {body.rows.map((row, rowIndex) => (
            <tr key={rowIndex} data-kind={row.kind}>
              <th scope="row" className="num grid-pin-1">
                {rowIndex + 1}
              </th>
              <th scope="row" className="grid-pin-2 whitespace-nowrap font-normal text-muted">
                {ROW_KIND_LABELS[row.kind]}
              </th>
              {columns.map((column) => {
                if (row.kind === 'copy') {
                  return (
                    <td key={column} className="grid-copy" title={row.cells[column] ?? ''}>
                      {row.cells[column] ?? ''}
                    </td>
                  )
                }
                const cell = row.cells[column] ?? null
                const isSelected = selected?.row === rowIndex && selected.column === column
                const preview = previews?.get(`${rowIndex}:${column}`)
                const heading = headingOf(body, rowIndex, column)
                return (
                  <td key={column} className={isSelected ? 'grid-selected' : undefined}>
                    <button
                      type="button"
                      className="grid-cell"
                      aria-pressed={isSelected}
                      aria-label={`Cell ${cellName(rowIndex, column)}${heading ? `, ${heading}` : ''}: ${cell ? sourceSummary(cell.source) : 'Empty'}`}
                      onClick={() => onSelect({ row: rowIndex, column })}
                    >
                      <span className="grid-source">{cell ? sourceSummary(cell.source) : '\u00a0'}</span>
                      {preview !== undefined && <span className="grid-value num">{preview === '' ? '\u00a0' : preview}</span>}
                    </button>
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/** The first lines of the file as it will be written: the separator between fields, no quotes shown. */
export function FilePreview({ lines, separator, more }: { lines: string[][]; separator: string; more: number }) {
  return (
    <div className="flex flex-col gap-2">
      <pre className="file-preview num" data-values aria-label="The file as it will be written">
        {lines.map((fields) => fields.join(separator)).join('\n')}
      </pre>
      {more > 0 && <p className="m-0 text-sm text-muted">And {more} more {more === 1 ? 'line' : 'lines'}.</p>}
    </div>
  )
}
