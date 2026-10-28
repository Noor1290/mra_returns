// Exact decimals, half-up rounding, the formats of a cell and the file name. Fake values only.
import { describe, expect, it } from 'vitest'
import { add, endsInHalf, fromNumber, multiply, parseDecimal, roundHalfUp, subtract, toFixed, toText, type Decimal } from '../src/lib/decimal'
import { fileNameFor } from '../src/lib/fileName'
import { parseDate, valueOf, writeDate, writeValue, type Value } from '../src/lib/formats'

const d = (text: string) => parseDecimal(text)!
const round = (text: string, places = 0) => toText(roundHalfUp(d(text), places))
const num = (text: string): Value => ({ kind: 'number', value: d(text) })

describe('exact decimals', () => {
  it('adds without floating-point error', () => {
    expect(toText(add(d('0.1'), d('0.2')))).toBe('0.3')
    expect(toText(subtract(d('18750'), d('0.01')))).toBe('18749.99')
  })

  it('multiplies exactly: 4.5 % of 18546 is 834.57, of 17745 is 798.525', () => {
    expect(toText(multiply(d('18546'), d('0.045'))!)).toBe('834.57')
    expect(toText(multiply(d('17745'), d('0.045'))!)).toBe('798.525')
  })

  it('reads a JSON number as the decimal it was written as, not the binary one', () => {
    // 266.175 is held by the computer as 266.17499999...: rounding that would give 266.17.
    expect(toText(fromNumber(266.175)!)).toBe('266.175')
    expect(round('266.175', 2)).toBe('266.18')
    expect(toText(fromNumber(180.45000000000002)!)).toBe('180.45000000000002')
    expect(fromNumber(Number.NaN)).toBeNull()
  })

  it('refuses what is not a plain number: separators, currency, percent, words', () => {
    for (const text of ['18,750', 'Rs 100', '4.5%', 'abc', '', '.', '1.2.3']) expect(parseDecimal(text), text).toBeNull()
    expect(toText(d(' 1e-3 '))).toBe('0.001')
  })

  it('rounds half up, and away from zero for negatives', () => {
    expect(round('281.25')).toBe('281')
    expect(round('562.5')).toBe('563')
    expect(round('556.38')).toBe('556')
    expect(round('907.69')).toBe('908')
    expect(round('834.57')).toBe('835')
    expect(round('798.525')).toBe('799')
    expect(round('2.49')).toBe('2')
    expect(round('-2.5')).toBe('-3')
    expect(round('-2.49')).toBe('-2')
    expect(round('0.005', 2)).toBe('0.01')
  })

  it('round each then add is not the same as round the total: 278.19 + 556.38', () => {
    const each = add(roundHalfUp(d('278.19'), 0), roundHalfUp(d('556.38'), 0))
    const total = roundHalfUp(add(d('278.19'), d('556.38')), 0)
    expect(toText(each)).toBe('834')
    expect(toText(total)).toBe('835')
    // The owner's example: 187.50 -> 188 and 468.75 -> 469 give 657.
    expect(toText(add(roundHalfUp(d('187.50'), 0), roundHalfUp(d('468.75'), 0)))).toBe('657')
  })

  it('finds the values that end in exactly .50', () => {
    const half = (text: string) => endsInHalf(d(text))
    expect(half('187.50')).toBe(true)
    expect(half('0.5')).toBe(true)
    expect(half('-3.5')).toBe(true)
    expect(half('187.05')).toBe(false)
    expect(half('187.55')).toBe(false)
    expect(half('187')).toBe(false)
  })

  it('writes with a fixed number of decimals and never a thousands separator', () => {
    const value: Decimal = d('1234567.8')
    expect(toFixed(value, 2)).toBe('1234567.80')
    expect(() => toFixed(d('1.234'), 2)).toThrow()
  })
})

describe('the formats of a cell', () => {
  const text = (capitals: boolean, tidy: boolean) => ({ type: 'text' as const, capitals, tidy })
  const number = (decimals: 0 | 2, width = 0) => ({ type: 'number' as const, decimals, width })

  it('numbers: whole rupees or 2 decimals, half up, 0 when there is no value', () => {
    expect(writeValue(num('907.69'), number(0)).text).toBe('908')
    expect(writeValue(num('907.695'), number(2)).text).toBe('907.70')
    expect(writeValue(num('18750'), number(2)).text).toBe('18750.00')
    expect(writeValue({ kind: 'none' }, number(0)).text).toBe('0')
    expect(writeValue({ kind: 'none' }, number(2)).text).toBe('0.00')
  })

  it('numbers: a fixed width with leading zeros', () => {
    expect(writeValue(num('42'), number(0, 6)).text).toBe('000042')
    expect(writeValue(num('-42'), number(0, 6)).text).toBe('-000042')
    expect(writeValue({ kind: 'text', text: '13341' }, number(0, 6)).text).toBe('013341')
  })

  it('numbers: a text that is not a number is reported, not guessed', () => {
    expect(writeValue({ kind: 'text', text: '18,750' }, number(0))).toEqual({ text: '', problem: 'not-a-number' })
  })

  it('text: capitals on or off, tidy on or off, leading zeros always kept', () => {
    const value: Value = { kind: 'text', text: ' Muhammad  Aftaab ' }
    expect(writeValue(value, text(false, false)).text).toBe(' Muhammad  Aftaab ')
    expect(writeValue(value, text(true, false)).text).toBe(' MUHAMMAD  AFTAAB ')
    expect(writeValue(value, text(false, true)).text).toBe('Muhammad Aftaab')
    expect(writeValue(value, text(true, true)).text).toBe('MUHAMMAD AFTAAB')
    expect(writeValue({ kind: 'text', text: '013341' }, text(false, false)).text).toBe('013341')
    expect(writeValue({ kind: 'none' }, text(true, true)).text).toBe('')
  })

  it('dates: built from pieces, with any separator or none', () => {
    const date = { year: 2020, month: 2, day: 1 }
    expect(writeDate('YYYYMMDD', date)).toBe('20200201')
    expect(writeDate('DD/MM/YYYY', date)).toBe('01/02/2020')
    expect(writeDate('YY-MM-DD', date)).toBe('20-02-01')
    const august = { year: 2026, month: 8, day: 1 }
    expect(writeDate('YYMM', august)).toBe('2608')
    expect(writeDate('YYYYMM', august)).toBe('202608')
    expect(writeDate('MM/YYYY', august)).toBe('08/2026')
    expect(writeDate('MONTH YYYY', august)).toBe('AUGUST 2026')
  })

  it('dates: reads YYYY-MM-DD as the dashboard sends it, DD/MM/YYYY and YYYYMMDD; refuses impossible dates', () => {
    expect(parseDate('2020-02-01')).toEqual({ year: 2020, month: 2, day: 1 })
    expect(parseDate('01/02/2020')).toEqual({ year: 2020, month: 2, day: 1 })
    expect(parseDate('20200201')).toEqual({ year: 2020, month: 2, day: 1 })
    expect(parseDate('31/02/2026')).toBeNull()
    expect(parseDate('2026-13-01')).toBeNull()
    expect(writeValue({ kind: 'text', text: 'soon' }, { type: 'date', pattern: 'YYYYMMDD' })).toEqual({ text: '', problem: 'not-a-date' })
    expect(writeValue({ kind: 'none' }, { type: 'date', pattern: 'YYYYMMDD' })).toEqual({ text: '', problem: null })
  })

  it('takes the saved run values as they are: numbers, texts, nothing', () => {
    expect(valueOf(undefined)).toEqual({ kind: 'none' })
    expect(valueOf('')).toEqual({ kind: 'none' })
    expect(valueOf(' X1 ')).toEqual({ kind: 'text', text: ' X1 ' })
    expect(valueOf(281.25)).toEqual({ kind: 'number', value: d('281.25') })
  })
})

describe('the file name', () => {
  const abc = { name: 'ABC Co Ltd', brn: 'C1234567' }
  it('follows the pattern, in capitals, with no underscores', () => {
    expect(fileNameFor({ pattern: 'CSG {MONTH} {YYYY} {COMPANY}', capitals: true }, '2026-08', abc)).toBe('CSG AUGUST 2026 ABC CO LTD.csv')
    expect(fileNameFor({ pattern: 'PRGF {YY}{MM} {BRN}', capitals: false }, '2026-08', abc)).toBe('PRGF 2608 C1234567.csv')
  })

  it('removes the characters Windows does not allow, and is always a .csv file', () => {
    const odd = { name: 'A/B: "Fake" <Co>* Ltd?|', brn: 'C1' }
    expect(fileNameFor({ pattern: 'CSG {COMPANY}', capitals: false }, '2026-08', odd)).toBe('CSG AB Fake Co Ltd.csv')
    expect(fileNameFor({ pattern: '{COMPANY}.csv', capitals: false }, '2026-08', { name: 'Fake. ', brn: '' })).toBe('Fake.csv')
    expect(fileNameFor({ pattern: '{BRN}', capitals: false }, '2026-08', { name: 'X', brn: '' })).toBe('MRA 2026-08.csv')
    expect(fileNameFor({ pattern: 'con', capitals: false }, '2026-08', abc)).toBe('MRA 2026-08.csv')
  })
})
