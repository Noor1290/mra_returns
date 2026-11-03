// The ready-made templates "MRA CSG (PACO)" and "MRA PRGF": set up as the MRA requires, so
// nothing is set by hand. Byte for byte against the owner's samples: tests/samples.test.ts (4).
// Here, with the FAKE company: every rule of the cell plan, and the file it gives.
import { describe, expect, it } from 'vitest'
import { CSG_HEADINGS, PRGF_HEADINGS } from '../src/data/mraLayouts'
import { missingReadyMade, READY_MADE, readyMadeTemplate } from '../src/data/readyMade'
import { makeReturnFile } from '../src/lib/returnFile'
import { cellsOf, templateBodySchema, type Cell, type TemplateBody } from '../src/lib/template'
import { ABC, FAKE_EMPLOYEES } from './fixtures/fakeCompany'

const cellOf = (body: TemplateBody, id: string): Cell => cellsOf(body).find((found) => found.cell.id === id)!.cell
const requiredIds = (body: TemplateBody) => cellsOf(body).filter(({ cell }) => cell.required).map(({ cell }) => cell.id)

describe('the ready-made templates', () => {
  it('are the two MRA files, by name, each a template the dashboard keeps as it is', () => {
    expect(READY_MADE.map((one) => one.name)).toEqual(['MRA CSG (PACO)', 'MRA PRGF'])
    for (const { layout } of READY_MADE) {
      const body = readyMadeTemplate(layout)
      expect(templateBodySchema.parse(JSON.parse(JSON.stringify(body)))).toEqual(body)
      expect(body.rows.at(-2)).toEqual({ kind: 'copy', cells: layout === 'csg' ? CSG_HEADINGS : PRGF_HEADINGS })
    }
  })

  it('write the file as the MRA requires: Windows-1252, CRLF, commas, no quotes, padded; no pay left out', () => {
    for (const { layout } of READY_MADE) {
      const body = readyMadeTemplate(layout)
      expect(body.settings).toEqual({ encoding: 'windows-1252', lineEnding: 'crlf', separator: ',', quotes: 'never', pad: true })
      expect(body.noPay).toEqual({ key: 'Gross Pay' })
      expect(body.fileName).toEqual({ pattern: `${layout === 'csg' ? 'CSG' : 'PRGF'} {MONTH} {YYYY} {COMPANY}`, capitals: true })
    }
  })

  it('require the ERN, BRN, declarant, the ID, the surname and the amounts', () => {
    const csg = readyMadeTemplate('csg')
    expect(requiredIds(csg)).toEqual(['m0', 'm1', 'm6', 'e0', 'e1', 'e3', 'e5', 'e9', 'e10', 'e12', 'e14', 'e18'])
    expect(requiredIds(readyMadeTemplate('prgf'))).toEqual(['m0', 'm1', 'm6', 'e0', 'e1', 'e6', 'e7', 'e9', 'e10'])
    expect(cellOf(csg, 'm0').source).toEqual({ type: 'company', field: 'ern' })
    expect(cellOf(csg, 'm6').source).toEqual({ type: 'company', field: 'declarant' })
  })

  it('write the names in capitals, trimmed, double spaces made single; the period YYMM and the start date YYYYMMDD', () => {
    for (const { layout } of READY_MADE) {
      const body = readyMadeTemplate(layout)
      for (const id of ['m2', 'e1', 'e2']) expect(cellOf(body, id).format).toEqual({ type: 'text', capitals: true, tidy: true })
      expect(cellOf(body, 'm3').format).toEqual({ type: 'date', pattern: 'YYMM' })
    }
    expect(cellOf(readyMadeTemplate('prgf'), 'e5')).toMatchObject({ source: { type: 'employee', key: 'Date of Employment' }, format: { type: 'date', pattern: 'YYYYMMDD' } })
  })

  it('add employee and employer CSG and NSF each rounded first; PRGF from the total rounded once', () => {
    const csg = readyMadeTemplate('csg')
    expect(cellOf(csg, 'e9').source).toEqual({
      type: 'calc',
      terms: [
        { sign: 1, of: { type: 'column', key: 'Employee CSG' }, times: null, round: 'whole' },
        { sign: 1, of: { type: 'column', key: 'CSG' }, times: null, round: 'whole' },
      ],
    })
    expect(cellOf(csg, 'e10').source).toMatchObject({ terms: [{ of: { key: 'Employee NSF' }, round: 'whole' }, { of: { key: 'NSF' }, round: 'whole' }] })
    const prgf = readyMadeTemplate('prgf')
    expect(cellOf(prgf, 'e9').source).toMatchObject({ type: 'calc', once: true })
    expect(cellOf(prgf, 'e10').source).toEqual({ type: 'calc', terms: [{ sign: 1, of: { type: 'cell', id: 'e9' }, times: '0.045', round: 'none' }] })
  })

  it('give the fixed codes and Full time / Part time as Y / N, for the fake company', () => {
    const employees = [{ ...FAKE_EMPLOYEES[0], Surname: '  doe ', 'Other names': 'jane   ann ' }, ...FAKE_EMPLOYEES.slice(1)]
    const csg = makeReturnFile(readyMadeTemplate('csg'), { values: {} }, ABC, '2026-08', employees)
    const line = new TextDecoder('windows-1252').decode(csg.bytes).split('\r\n')[4].split(',')
    expect(line.slice(1, 3)).toEqual(['DOE', 'JANE ANN'])
    expect([line[6], line[7], line[8], line[11]]).toEqual(['S', 'M', '1', 'Y'])
    expect(['Y', 'N']).toContain(line[13])
    expect(csg.built.missing).toEqual([])
    const prgf = makeReturnFile(readyMadeTemplate('prgf'), { values: {} }, ABC, '2026-08', employees)
    expect(new TextDecoder('windows-1252').decode(prgf.bytes).split('\r\n')[4].split(',')[3]).toBe('N')
  })

  it('list a missing ERN, declarant and surname before export', () => {
    const company = { ...ABC, mra: { ...ABC.mra, ern: '', declarant: '' } }
    const file = makeReturnFile(readyMadeTemplate('csg'), { values: {} }, company, '2026-08', [{ ...FAKE_EMPLOYEES[0], Surname: '' }])
    expect(file.built.missing.map((one) => one.cell)).toEqual(['A3', 'G3', 'B5'])
  })

  it('are added only when the company does not have one by that name, whatever the capitals', () => {
    expect(missingReadyMade([]).map((one) => one.name)).toEqual(['MRA CSG (PACO)', 'MRA PRGF'])
    expect(missingReadyMade([' mra prgf ']).map((one) => one.name)).toEqual(['MRA CSG (PACO)'])
    expect(missingReadyMade(['MRA CSG (PACO)', 'MRA PRGF'])).toEqual([])
  })
})
