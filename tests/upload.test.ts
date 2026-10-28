// Uploading a template as CSV or Excel: the grid exactly as uploaded (spaces, the accented e,
// quotes, leading zeros in text), the file settings read from the file, the first guess at the
// kinds of rows, and that only copied rows keep their text. Fake content only.
import { describe, expect, it } from 'vitest'
import { readCsv, writeCsv } from '../src/lib/csvFile'
import { guessKinds, readUpload, templateFromUpload } from '../src/lib/upload'
import { NotAnExcelFile, readXlsx } from '../src/lib/xlsx'
import { cp1252Bytes, EXPECTED_CSG, EXPECTED_PRGF } from './fixtures/fakeCompany'
import { makeXlsx } from './lib/makeXlsx'

describe('a CSV template', () => {
  it('reads the MRA format exactly, and writing it back gives the same bytes', () => {
    for (const lines of [EXPECTED_CSG, EXPECTED_PRGF]) {
      const bytes = cp1252Bytes(lines)
      const read = readCsv(bytes)
      expect(read).toMatchObject({ encoding: 'windows-1252', lineEnding: 'crlf', separator: ',', quotes: 'never', pad: true })
      expect(read.rows[3][8 % read.rows[3].length]).toBe(lines === EXPECTED_CSG ? 'Frequency ' : 'Commission (MUR)')
      const again = writeCsv(read.rows, read.rows[0].length, read)
      expect([...again.bytes]).toEqual([...bytes])
    }
  })

  it('tells UTF-8 (with or without a byte-order mark) from Windows-1252', () => {
    const utf8 = new TextEncoder().encode('Contribution Sociale G\u00e9n\u00e9ralis\u00e9e\n')
    expect(readCsv(utf8)).toMatchObject({ encoding: 'utf-8', lineEnding: 'lf', rows: [['Contribution Sociale G\u00e9n\u00e9ralis\u00e9e']] })
    const bom = Uint8Array.from([0xef, 0xbb, 0xbf, ...utf8])
    expect(readCsv(bom).encoding).toBe('utf-8-bom')
    expect(readCsv(Uint8Array.from([0x47, 0xe9, 0x0d, 0x0a]))).toMatchObject({ encoding: 'windows-1252', rows: [['G\u00e9']] })
  })

  it('understands quotes, semicolons and a last line with no line ending', () => {
    const text = 'a;"b;c";"say ""hi"""\r\n1;;3'
    const read = readCsv(new TextEncoder().encode(text))
    expect(read).toMatchObject({ separator: ';', quotes: 'needed', pad: true })
    expect(read.rows).toEqual([
      ['a', 'b;c', 'say "hi"'],
      ['1', '', '3'],
    ])
  })

  it('guesses the rows of an MRA file: title, headings, employer, headings, employee, then examples', () => {
    const read = readCsv(cp1252Bytes(EXPECTED_CSG))
    expect(guessKinds(read.rows)).toEqual(['copy', 'copy', 'employer', 'copy', 'employee', 'example', 'example', 'example'])
    expect(guessKinds([['Anything'], ['else']])).toEqual(['copy', 'copy'])
  })

  it('keeps only the text of copied rows: never the employer line or an employee of the upload', async () => {
    const upload = await readUpload('CSG AUGUST 2026.csv', cp1252Bytes(EXPECTED_CSG))
    expect(upload.name).toBe('CSG AUGUST 2026')
    expect(upload.width).toBe(19)
    const body = templateFromUpload(upload, upload.kinds)
    expect(body.rows.map((row) => row.kind)).toEqual(['copy', 'copy', 'employer', 'copy', 'employee'])
    const stored = JSON.stringify(body)
    for (const text of ['X0000000000001', 'DOE', 'JANE SAMPLE', '001234', 'returns@example.org', '18750']) {
      expect(stored, text).not.toContain(text)
    }
    expect(stored).toContain('Frequency ')
    expect(body.fileName).toEqual({ pattern: 'CSG {MONTH} {YYYY} {COMPANY}', capitals: true })
    expect(body.noPay).toEqual({ key: 'Gross Pay' })
  })

  it('refuses an empty file and one wider than 60 columns', async () => {
    await expect(readUpload('x.csv', new Uint8Array())).rejects.toThrow('The file has no rows.')
    await expect(readUpload('x.csv', new TextEncoder().encode(`${','.repeat(60)}\r\n`))).rejects.toThrow('at most 60 rows and 60 columns')
  })
})

describe('an Excel template', () => {
  it('reads the first sheet as text, with the text cells exactly as typed', async () => {
    const bytes = await makeXlsx([
      ['MRA', 'PRGF', 'V1.0'],
      ['Employer Registration Number', 'Employer Business Registration Number '],
      ['001234', 'C1234567', null, 2608],
      ['Employee ID', 'R&D <note>', 'Contribution Sociale G\u00e9n\u00e9ralis\u00e9e'],
      ['X0000000000001'],
    ])
    expect(await readXlsx(bytes)).toEqual([
      ['MRA', 'PRGF', 'V1.0'],
      ['Employer Registration Number', 'Employer Business Registration Number '],
      ['001234', 'C1234567', '', '2608'],
      ['Employee ID', 'R&D <note>', 'Contribution Sociale G\u00e9n\u00e9ralis\u00e9e'],
      ['X0000000000001'],
    ])
    const upload = await readUpload('PRGF.xlsx', bytes)
    expect(upload.settings).toEqual({ encoding: 'windows-1252', lineEnding: 'crlf', separator: ',', quotes: 'never', pad: true })
    expect(upload.kinds).toEqual(['copy', 'copy', 'employer', 'copy', 'employee'])
  })

  it('refuses a file that is not an Excel file', async () => {
    await expect(readXlsx(new TextEncoder().encode('not a zip'))).rejects.toBeInstanceOf(NotAnExcelFile)
  })
})
