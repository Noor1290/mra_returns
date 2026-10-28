// Makes a small .xlsx file in memory for the tests: a zip of the XML parts Excel writes, the
// sheet and the shared strings compressed ("deflate"), the rest stored. Fake content only.

async function deflate(bytes: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([bytes as Uint8Array<ArrayBuffer>]).stream().pipeThrough(new CompressionStream('deflate-raw'))
  return new Uint8Array(await new Response(stream).arrayBuffer())
}

export async function makeZip(files: { name: string; text: string; compress: boolean }[]): Promise<Uint8Array> {
  const encoder = new TextEncoder()
  const locals: Uint8Array[] = []
  const centrals: Uint8Array[] = []
  let offset = 0
  for (const file of files) {
    const name = encoder.encode(file.name)
    const raw = encoder.encode(file.text)
    const data = file.compress ? await deflate(raw) : raw
    const local = new Uint8Array(30 + name.length + data.length)
    const lv = new DataView(local.buffer)
    lv.setUint32(0, 0x04034b50, true)
    lv.setUint16(8, file.compress ? 8 : 0, true)
    lv.setUint32(18, data.length, true)
    lv.setUint32(22, raw.length, true)
    lv.setUint16(26, name.length, true)
    local.set(name, 30)
    local.set(data, 30 + name.length)
    const central = new Uint8Array(46 + name.length)
    const cv = new DataView(central.buffer)
    cv.setUint32(0, 0x02014b50, true)
    cv.setUint16(10, file.compress ? 8 : 0, true)
    cv.setUint32(20, data.length, true)
    cv.setUint32(24, raw.length, true)
    cv.setUint16(28, name.length, true)
    cv.setUint32(42, offset, true)
    central.set(name, 46)
    locals.push(local)
    centrals.push(central)
    offset += local.length
  }
  const centralSize = centrals.reduce((sum, part) => sum + part.length, 0)
  const end = new Uint8Array(22)
  const ev = new DataView(end.buffer)
  ev.setUint32(0, 0x06054b50, true)
  ev.setUint16(8, files.length, true)
  ev.setUint16(10, files.length, true)
  ev.setUint32(12, centralSize, true)
  ev.setUint32(16, offset, true)
  const all = [...locals, ...centrals, end]
  const out = new Uint8Array(all.reduce((sum, part) => sum + part.length, 0))
  let at = 0
  for (const part of all) {
    out.set(part, at)
    at += part.length
  }
  return out
}

const escape = (text: string) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

/** An Excel file whose first sheet has these rows: text as shared strings, numbers as numbers. */
export function makeXlsx(rows: (string | number | null)[][], sheetName = 'Sheet1'): Promise<Uint8Array> {
  const shared: string[] = []
  const column = (index: number) => String.fromCharCode(65 + index)
  const sheetRows = rows
    .map((row, r) => {
      const cells = row
        .map((value, c) => {
          if (value === null) return ''
          const ref = `${column(c)}${r + 1}`
          if (typeof value === 'number') return `<c r="${ref}"><v>${value}</v></c>`
          shared.push(value)
          return `<c r="${ref}" t="s"><v>${shared.length - 1}</v></c>`
        })
        .join('')
      return `<row r="${r + 1}">${cells}</row>`
    })
    .join('')
  return makeZip([
    { name: '[Content_Types].xml', text: '<?xml version="1.0"?><Types/>', compress: false },
    {
      name: 'xl/workbook.xml',
      text: `<?xml version="1.0"?><workbook xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="${escape(sheetName)}" sheetId="1" r:id="rId1"/></sheets></workbook>`,
      compress: false,
    },
    {
      name: 'xl/_rels/workbook.xml.rels',
      text: '<?xml version="1.0"?><Relationships><Relationship Id="rId2" Target="styles.xml"/><Relationship Id="rId1" Target="worksheets/sheet1.xml"/></Relationships>',
      compress: false,
    },
    {
      name: 'xl/sharedStrings.xml',
      text: `<?xml version="1.0"?><sst>${shared.map((text) => `<si><t xml:space="preserve">${escape(text)}</t></si>`).join('')}</sst>`,
      compress: true,
    },
    { name: 'xl/worksheets/sheet1.xml', text: `<?xml version="1.0"?><worksheet><sheetData>${sheetRows}</sheetData></worksheet>`, compress: true },
  ])
}
