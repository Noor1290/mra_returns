// The report of a batch, as a text file in the zip (Report.txt), with the same sentences the
// screen shows: per company and template, what was made and what was skipped and why; the
// required values that are empty; the MRA details missing; the values that end in exactly .50
// before rounding; the lines whose rounded parts do not add up to their total; what was fixed in
// the file only. And the zip itself: one folder per template, one file per company.

import { madeFiles, REPORT_NAME, type BatchResult } from './batch'
import { formatPeriod } from './dates'
import { monthName } from './formats'
import { fileBytes, type ReturnFile } from './returnFile'
import { isDraft } from './runStore'
import { makeZip } from './zip'
import {
  batchCountText,
  detailsMissingText,
  employeeName,
  employeeWithId,
  halfNoteText,
  madeText,
  missingText,
  missingWho,
  notApprovedText,
  problemText,
  skipText,
  sumNoteText,
  unwritableText,
} from './wording'

export const EXCEL_REMINDER = 'Upload each file to the MRA portal exactly as it is downloaded. Do not open it in Excel and save it again first: Excel changes dates and drops leading zeros.'
export const PROFILE_HINT = 'Fill them in on its Company profile in the dashboard.'

/** "29 October 2026 at 14:05". */
export function madeAt(at: Date): string {
  const two = (n: number) => String(n).padStart(2, '0')
  const month = monthName(at.getMonth() + 1)
  return `${at.getDate()} ${month[0]}${month.slice(1).toLowerCase()} ${at.getFullYear()} at ${two(at.getHours())}:${two(at.getMinutes())}`
}

export function countsOf(result: BatchResult): { made: number; skipped: number } {
  const outcomes = result.companies.flatMap((company) => company.files)
  const made = outcomes.filter((outcome) => outcome.made).length
  return { made, skipped: outcomes.length - made }
}

/** The required values that are empty in one file, one line each: who, then which cell. */
export function requiredLines(file: ReturnFile, employees: readonly Record<string, unknown>[]): string[] {
  return file.built.missing.map((missing) => `${missingWho(missing, employees)}: ${missingText(missing)}`)
}

/** The values one file cannot hold, one line each: who, which column, and what would be written. */
export function unwritableLines(file: ReturnFile, employees: readonly Record<string, unknown>[]): string[] {
  return file.unwritable.map((one) => unwritableText(one, employees))
}

/** The lines of one file whose rounded parts do not add up to their total. */
export function sumLines(file: ReturnFile, employees: readonly Record<string, unknown>[]): string[] {
  return file.built.sumNotes.map((note) => `${employeeWithId(employees[note.employee], note.employee)}: ${sumNoteText(note)}`)
}

/** One file, as the lists before a download title it. */
export interface FileToCheck {
  title: string
  file: ReturnFile
  employees: readonly Record<string, unknown>[]
}

export interface CheckGroup {
  title: string
  lines: string[]
}

/** What the user must see before a download, file by file. */
export interface DownloadChecks {
  unwritable: CheckGroup[]
  /** Every value that cannot be written can be fixed in the file. */
  canFix: boolean
  required: CheckGroup[]
  sums: CheckGroup[]
}

export function downloadChecks(files: readonly FileToCheck[]): DownloadChecks {
  const groups = (lines: (one: FileToCheck) => string[]) => files.map((one) => ({ title: one.title, lines: lines(one) })).filter((group) => group.lines.length > 0)
  return {
    unwritable: groups(({ file, employees }) => unwritableLines(file, employees)),
    canFix: files.every(({ file }) => file.unwritable.every((one) => one.to !== null)),
    required: groups(({ file, employees }) => requiredLines(file, employees)),
    sums: groups(({ file, employees }) => sumLines(file, employees)),
  }
}

export const hasChecks = (checks: DownloadChecks) => checks.unwritable.length + checks.required.length + checks.sums.length > 0

/** The report, line by line. */
export function reportLines(result: BatchResult): string[] {
  const month = formatPeriod(result.period)
  const { made, skipped } = countsOf(result)
  const lines = [`MRA return files, ${month}`, `Made on ${madeAt(result.at)}.`, batchCountText(made, skipped), '', EXCEL_REMINDER]
  for (const company of result.companies) {
    lines.push('', `${company.name}, BRN ${company.brn}`)
    if (company.failure) lines.push(`  ${company.failure.title}. ${company.failure.detail}`)
    const employees = company.run?.employees ?? []
    if (company.run && isDraft(company.run)) lines.push(`  ${notApprovedText(month, company.name)}`)
    for (const outcome of company.files) {
      if (!outcome.made) {
        lines.push(`  ${outcome.template.name}: ${skipText(outcome.reason, month)}`)
        continue
      }
      const { built, problems } = outcome.file
      lines.push(`  ${outcome.template.name}: ${madeText(outcome.path, built.written.length)}`)
      if (built.leftOut.length > 0) lines.push(`    Left out with no pay: ${built.leftOut.map((index) => employeeName(employees[index], index)).join(', ')}.`)
      if (problems.length > 0) {
        lines.push('    Check these before uploading the file:')
        for (const problem of problems) lines.push(`      ${problem.employee !== null ? `${employeeName(employees[problem.employee], problem.employee)}: ` : ''}${problemText(problem)}`)
      }
      if (outcome.file.unwritable.length > 0) {
        lines.push('    Fixed in this file only (the payroll is not changed):')
        for (const line of unwritableLines(outcome.file, employees)) lines.push(`      ${line}`)
      }
      if (built.missing.length > 0) {
        lines.push('    Required values that are empty:')
        for (const line of requiredLines(outcome.file, employees)) lines.push(`      ${line}`)
      }
      if (built.halfNotes.length > 0) {
        lines.push('    Values that end in exactly .50 before rounding (check them in Payroll System):')
        for (const note of built.halfNotes) lines.push(`      ${employeeName(employees[note.employee], note.employee)}: ${halfNoteText(note)}`)
      }
      if (built.sumNotes.length > 0) {
        lines.push("    Lines where the rounded parts don't add up to the total (check them before uploading):")
        for (const line of sumLines(outcome.file, employees)) lines.push(`      ${line}`)
      }
    }
    if (company.missingDetails.length > 0) lines.push(`  ${detailsMissingText(company.missingDetails)} ${PROFILE_HINT}`)
  }
  return lines
}

/** The report as a text file: UTF-8 with a byte-order mark (Notepad shows accents right), CRLF. */
export function reportBytes(result: BatchResult): Uint8Array {
  const text = `${reportLines(result).join('\r\n')}\r\n`
  return Uint8Array.from([0xef, 0xbb, 0xbf, ...new TextEncoder().encode(text)])
}

/** "MRA AUGUST 2026.zip". */
export function zipNameFor(period: string): string {
  const [year, month] = period.split('-')
  return `MRA ${monthName(Number(month))} ${year}.zip`
}

/** The zip: a folder per template, a file per company in it, and the report. */
export function batchZip(result: BatchResult): { fileName: string; bytes: Uint8Array } {
  const entries = madeFiles(result).map(({ path, file }) => ({ path, bytes: fileBytes(file) }))
  entries.push({ path: REPORT_NAME, bytes: reportBytes(result) })
  return { fileName: zipNameFor(result.period), bytes: makeZip(entries, result.at) }
}
