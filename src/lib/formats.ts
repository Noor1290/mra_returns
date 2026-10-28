// How a cell's value is written in the file: as text, as a number or as a date. A cell with no
// value is written empty as text or a date, and 0 as a number. Nothing here guesses: a text
// that is not a number (or not a date) is reported, never turned into one.

import { fromNumber, parseDecimal, roundHalfUp, toFixed, type Decimal } from './decimal'
import type { Format } from './template'

export type Value =
  | { kind: 'none' }
  | { kind: 'text'; text: string }
  | { kind: 'number'; value: Decimal }
  | { kind: 'date'; date: CalendarDate }

export interface CalendarDate {
  year: number
  /** 1 to 12. */
  month: number
  day: number
}

export const NONE: Value = { kind: 'none' }

const MONTH_NAMES = ['JANUARY', 'FEBRUARY', 'MARCH', 'APRIL', 'MAY', 'JUNE', 'JULY', 'AUGUST', 'SEPTEMBER', 'OCTOBER', 'NOVEMBER', 'DECEMBER']

/** The month's name in capitals: 8 -> "AUGUST". */
export const monthName = (month: number) => MONTH_NAMES[month - 1]

/** A value of the saved run as the dashboard sent it. */
export function valueOf(raw: unknown): Value {
  if (raw === undefined || raw === null) return NONE
  if (typeof raw === 'number') {
    const value = fromNumber(raw)
    return value ? { kind: 'number', value } : NONE
  }
  if (typeof raw === 'boolean') return { kind: 'text', text: raw ? 'Yes' : 'No' }
  const text = String(raw)
  return text === '' ? NONE : { kind: 'text', text }
}

function realDate(year: number, month: number, day: number): CalendarDate | null {
  const date = new Date(Date.UTC(year, month - 1, day))
  return year >= 1900 && year <= 2100 && date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
    ? { year, month, day }
    : null
}

/** A date written YYYY-MM-DD (as the dashboard sends dates), DD/MM/YYYY or YYYYMMDD. */
export function parseDate(text: string): CalendarDate | null {
  const value = text.trim()
  let match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value) ?? /^(\d{4})(\d{2})(\d{2})$/.exec(value)
  if (match) return realDate(Number(match[1]), Number(match[2]), Number(match[3]))
  match = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(value)
  if (match) return realDate(Number(match[3]), Number(match[2]), Number(match[1]))
  return null
}

/** The month of the return, "2026-08", as a date on its first day. */
export function monthValue(period: string): Value {
  const [year, month] = period.split('-').map(Number)
  return { kind: 'date', date: { year, month, day: 1 } }
}

/**
 * A date written with a pattern: YYYY, YY, MM, DD and MONTH (the month's name in capitals) are
 * replaced, anything else is written as it is. "YYYYMMDD" -> 20200201, "YYMM" -> 2608,
 * "DD/MM/YYYY" -> 01/02/2020, "MONTH YYYY" -> AUGUST 2026.
 */
export function writeDate(pattern: string, date: CalendarDate): string {
  const two = (n: number) => String(n).padStart(2, '0')
  let out = ''
  for (let i = 0; i < pattern.length; ) {
    const rest = pattern.slice(i)
    if (rest.startsWith('YYYY')) {
      out += String(date.year).padStart(4, '0')
      i += 4
    } else if (rest.startsWith('MONTH')) {
      out += monthName(date.month)
      i += 5
    } else if (rest.startsWith('YY')) {
      out += two(date.year % 100)
      i += 2
    } else if (rest.startsWith('MM')) {
      out += two(date.month)
      i += 2
    } else if (rest.startsWith('DD')) {
      out += two(date.day)
      i += 2
    } else {
      out += pattern[i]
      i += 1
    }
  }
  return out
}

function asText(value: Value): string {
  switch (value.kind) {
    case 'none':
      return ''
    case 'text':
      return value.text
    case 'number':
      return toFixed(value.value, value.value.scale)
    case 'date':
      return writeDate('YYYY-MM-DD', value.date)
  }
}

/** The value as a number, if it is one: a number, or a text that is exactly a number. */
export function asNumber(value: Value): Decimal | null | 'none' {
  if (value.kind === 'none') return 'none'
  if (value.kind === 'number') return value.value
  if (value.kind === 'text') return value.text.trim() === '' ? 'none' : parseDecimal(value.text)
  return null
}

export type Written = { text: string; problem: null | 'not-a-number' | 'not-a-date' }

/** Writes a value with a cell's format. */
export function writeValue(value: Value, format: Format): Written {
  switch (format.type) {
    case 'text': {
      let text = asText(value)
      if (format.tidy) text = text.trim().replace(/ {2,}/g, ' ')
      if (format.capitals) text = text.toUpperCase()
      return { text, problem: null }
    }
    case 'number': {
      const number = asNumber(value)
      if (number === null) return { text: '', problem: 'not-a-number' }
      const rounded = number === 'none' ? { units: 0n, scale: 0 } : roundHalfUp(number, format.decimals)
      let text = toFixed(rounded, format.decimals)
      if (format.width > 0) {
        const negative = text.startsWith('-')
        const digits = negative ? text.slice(1) : text
        text = `${negative ? '-' : ''}${digits.padStart(format.width, '0')}`
      }
      return { text, problem: null }
    }
    case 'date': {
      if (value.kind === 'none') return { text: '', problem: null }
      const date = value.kind === 'date' ? value.date : value.kind === 'text' ? parseDate(value.text) : null
      if (!date) return { text: '', problem: 'not-a-date' }
      return { text: writeDate(format.pattern, date), problem: null }
    }
  }
}
