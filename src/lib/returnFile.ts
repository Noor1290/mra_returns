// One company's return file for one month: the template, the company's own values and its saved
// run (as mra-batch gives it) made into the file's name and bytes, with everything the user
// should see before downloading it. The bytes are made in memory and never stored.

import { writeCsv, type WriteProblem } from './csvFile'
import { buildFile, templateProblems, type BuiltFile, type CompanyInfo, type Problem } from './evaluate'
import { fileNameFor } from './fileName'
import type { OwnValues, TemplateBody } from './template'
import { findUnwritable, fixedLines, type Unwritable } from './unwritable'

/** What the dashboard sends about a company besides its run (mra-batch `load`). */
export interface CompanyForFile {
  name: string
  brn: string
  address: string | null
  mra: { ern: string; telephone: string; mobile: string; declarant: string }
  /** The signed-in user's email for the returns. */
  email: string
}

export interface ReturnFile {
  fileName: string
  bytes: Uint8Array
  built: BuiltFile
  /** Problems with the template itself (a loop, an unknown cell...) and with the values. */
  problems: Problem[]
  /** What the file's encoding or quotes cannot hold, by line and field. */
  writeProblems: WriteProblem[]
  /** The same, one case per value, with what "Fix in this file only" would write. */
  unwritable: Unwritable[]
  /** The file with every case fixed. Null when there is none, or one has no plain letter. */
  fixedBytes: Uint8Array | null
}

/** What goes out once the user has chosen: a file with cases is only ever written fixed. */
export const fileBytes = (file: ReturnFile) => file.fixedBytes ?? file.bytes

export function companyInfo(company: CompanyForFile): CompanyInfo {
  return {
    name: company.name,
    brn: company.brn,
    address: company.address ?? '',
    ern: company.mra.ern,
    telephone: company.mra.telephone,
    mobile: company.mra.mobile,
    declarant: company.mra.declarant,
    email: company.email,
  }
}

export function makeReturnFile(
  body: TemplateBody,
  own: OwnValues,
  company: CompanyForFile,
  period: string,
  employees: readonly Record<string, unknown>[],
): ReturnFile {
  const built = buildFile(body, { company: companyInfo(company), period, own }, employees)
  const { bytes, problems: writeProblems } = writeCsv(built.lines, body.width, body.settings)
  const unwritable = findUnwritable(built, body, writeProblems)
  const canFix = unwritable.length > 0 && unwritable.every((one) => one.to !== null)
  // A problem of the template itself is listed once, however many employees it reaches.
  const general = templateProblems(body)
  const known = new Set(general.map((problem) => `${problem.cell}:${problem.kind}`))
  return {
    fileName: fileNameFor(body.fileName, period, company),
    bytes,
    built,
    problems: [...general, ...built.problems.filter((problem) => !known.has(`${problem.cell}:${problem.kind}`))],
    writeProblems,
    unwritable,
    fixedBytes: canFix ? writeCsv(fixedLines(built.lines, unwritable), body.width, body.settings).bytes : null,
  }
}
