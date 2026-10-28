// Asking the Payroll Hub dashboard for data. The wire contract is docs/INTEGRATION.md in the
// payroll_hub repo ("mra-batch"). The bridge file checks the sender's window and exact origin;
// this file validates every answer with Zod, checks that the answer is about the company the app
// expects, and turns each refusal into a clear message. Nothing is written to browser storage.

import { z } from 'zod'

/** How long the app waits for an answer that needs no question in the dashboard. */
export const REQUEST_TIMEOUT_MS = 15_000

export type HubSend = (type: 'send-data' | 'request-data', payload: unknown) => Promise<unknown>

/** The way to the dashboard. In the app it is the bridge; in the tests it is a fake dashboard. */
export interface HubPort {
  send: HubSend
  requestTimeoutMs?: number
}

/** The refusal codes the dashboard uses for this app's requests. */
export const REFUSAL_CODES = ['forbidden', 'wrong-company', 'invalid', 'unavailable', 'locked', 'denied', 'timeout', 'stale', 'not-found', 'too-large'] as const
export type RefusalCode = (typeof REFUSAL_CODES)[number]

export type FailureKind =
  | RefusalCode
  /** Nothing usable came back in time, or the refusal had no code this app knows. */
  | 'no-answer'
  /** The answer was not in the agreed format. */
  | 'bad-answer'
  /** The answer is about another company than the one asked for. */
  | 'other-company'
  /** The answer does not say which company it is about. */
  | 'no-company-brn'
  /** A save got no answer in time: it may or may not have been stored. */
  | 'unconfirmed'

export interface Failure {
  kind: FailureKind
  /** What happened, in a few words. */
  title: string
  /** What it means and what to do next. */
  detail: string
  /** The dashboard's own sentence, when it sent one. It names fields, never values. */
  hubError: string | null
}

/** BRNs are compared the way the dashboard compares them. */
export function normaliseBrn(brn: string): string {
  return brn.trim().toUpperCase()
}

const TEXT: Record<FailureKind, { title: string; detail: string }> = {
  forbidden: {
    title: 'Only an admin of the company can do this',
    detail: 'MRA returns hold national IDs and pay, so the dashboard gives them only to its admins.',
  },
  'wrong-company': {
    title: 'The dashboard has another company selected',
    detail: 'Select the company again in the dashboard, then try again.',
  },
  invalid: {
    title: 'The dashboard refused the request',
    detail: 'The app and the dashboard may be on different versions.',
  },
  unavailable: {
    title: 'The dashboard could not do this',
    detail: 'Check that you are signed in to the dashboard with a company selected, and that it is online.',
  },
  locked: {
    title: 'The dashboard is locked',
    detail: 'Confirm your password in the dashboard to unlock it, then try again.',
  },
  denied: {
    title: 'The request was declined in the dashboard',
    detail: 'Nothing was sent to this app. Try again when you are ready, and allow it in the dashboard.',
  },
  timeout: {
    title: 'Nobody answered the question in the dashboard',
    detail: 'The dashboard asks before it sends payroll figures. Try again, then allow it there.',
  },
  'no-answer': {
    title: 'The dashboard did not answer',
    detail: 'Check that the dashboard is open and signed in, then try again.',
  },
  'bad-answer': {
    title: 'The dashboard gave an answer this app does not understand',
    detail: 'Nothing from that answer was used. The app and the dashboard may be on different versions.',
  },
  'other-company': {
    title: 'The dashboard answered for another company',
    detail: 'The answer was not used. Try again.',
  },
  stale: {
    title: 'Someone else saved this since you opened it',
    detail: 'Nothing was overwritten. Reload to see what is saved now, then make your change again.',
  },
  'not-found': {
    title: 'The dashboard does not have that template for this company',
    detail: 'It may have been removed from this company. Reload the list.',
  },
  'too-large': {
    title: 'It is larger than the dashboard accepts',
    detail: 'Leave out rows or columns the file does not need, then save again.',
  },
  unconfirmed: {
    title: 'The dashboard could not confirm the save',
    detail: 'It may have been saved. Reload to see whether it was before saving again.',
  },
  'no-company-brn': {
    title: "The dashboard's company has no BRN",
    detail: 'The app cannot tell which company the answer is about, so it was not used. Give the company its BRN in the dashboard.',
  },
}

export function failure(kind: FailureKind, hubError: string | null = null): Failure {
  return { kind, title: TEXT[kind].title, detail: TEXT[kind].detail, hubError }
}

const refusalSchema = z.object({
  ok: z.literal(false),
  error: z.string().max(400).optional(),
  code: z.string().max(40).optional(),
})

const isRefusalCode = (code: string | undefined): code is RefusalCode =>
  code !== undefined && (REFUSAL_CODES as readonly string[]).includes(code)

const NO_ANSWER = Symbol('no answer')

function withTimeout(promise: Promise<unknown>, ms: number): Promise<unknown> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(NO_ANSWER), ms)
    promise.then(
      (value) => {
        clearTimeout(timer)
        resolve(value)
      },
      () => {
        clearTimeout(timer)
        resolve(NO_ANSWER)
      },
    )
  })
}

export interface HubCompany {
  /** The company's name, as the dashboard labels it. */
  name: string
  brn: string
}

export type Answer<T> =
  | { ok: true; rows: T[]; company: HubCompany; period: string | null }
  | { ok: false; failure: Failure }

export interface AskOptions {
  /** How long the app itself waits. Null: as long as the bridge does (the dashboard asks its user first). */
  timeoutMs?: number | null
  /** The most rows this kind of answer may have. */
  maxRows?: number
}

const answerSchema = z.object({
  ok: z.literal(true),
  dataType: z.string(),
  rows: z.array(z.unknown()).max(5_000),
  meta: z
    .object({
      label: z.string().max(120).optional(),
      brn: z.string().max(50).optional(),
      role: z.enum(['admin', 'member']).optional(),
      period: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/).optional(),
    })
    .optional(),
})

/**
 * Asks the dashboard for rows. The answer is used only when it is in the agreed format AND names
 * the company the app expects (`expectedBrn`; null when the app does not know it yet, in which
 * case the answer's own company is reported back).
 */
export async function ask<T>(
  port: HubPort,
  dataType: string,
  params: Record<string, unknown>,
  expectedBrn: string | null,
  rowSchema: z.ZodType<T>,
  options: AskOptions = {},
): Promise<Answer<T>> {
  const payload = { dataType, params: expectedBrn === null ? params : { ...params, brn: expectedBrn } }
  const asked = port.send('request-data', payload)
  const reply =
    options.timeoutMs === null
      ? await asked.catch(() => NO_ANSWER)
      : await withTimeout(asked, options.timeoutMs ?? port.requestTimeoutMs ?? REQUEST_TIMEOUT_MS)
  if (reply === NO_ANSWER) return { ok: false, failure: failure('no-answer') }

  const refusal = refusalSchema.safeParse(reply)
  if (refusal.success) {
    const hubError = refusal.data.error?.trim() || null
    // A refusal with no code (the bridge's own time-out, "not registered") counts as no answer.
    return { ok: false, failure: failure(isRefusalCode(refusal.data.code) ? refusal.data.code : 'no-answer', hubError) }
  }

  const answer = answerSchema.safeParse(reply)
  if (!answer.success || answer.data.dataType !== dataType) return { ok: false, failure: failure('bad-answer') }
  if (answer.data.rows.length > (options.maxRows ?? 1_000)) return { ok: false, failure: failure('bad-answer') }

  const brn = answer.data.meta?.brn?.trim()
  if (!brn) return { ok: false, failure: failure('no-company-brn') }
  if (expectedBrn !== null && normaliseBrn(brn) !== normaliseBrn(expectedBrn)) {
    return { ok: false, failure: failure('other-company') }
  }

  const rows = z.array(rowSchema).safeParse(answer.data.rows)
  if (!rows.success) return { ok: false, failure: failure('bad-answer') }
  return {
    ok: true,
    rows: rows.data,
    company: { name: answer.data.meta?.label?.trim() ?? '', brn },
    period: answer.data.meta?.period ?? null,
  }
}

/** How long the app waits for a save: the dashboard answers within 8 seconds, the bridge gives up after 10. */
export const SAVE_TIMEOUT_MS = 11_000

const savedSchema = z.object({ ok: z.literal(true), result: z.record(z.string(), z.unknown()).optional() })

export type Saved<T> = { ok: true; result: T } | { ok: false; failure: Failure }

/**
 * Sends ONE save to the dashboard and checks its answer. No answer, or "unavailable", means it
 * may have been stored: the app must reload and compare before saving again ('unconfirmed').
 */
export async function save<T>(port: HubPort, dataType: string, row: Record<string, unknown>, resultSchema: z.ZodType<T>): Promise<Saved<T>> {
  const reply = await withTimeout(port.send('send-data', { dataType, rows: [row] }), port.requestTimeoutMs ?? SAVE_TIMEOUT_MS)
  if (reply === NO_ANSWER) return { ok: false, failure: failure('unconfirmed') }
  const refusal = refusalSchema.safeParse(reply)
  if (refusal.success) {
    const hubError = refusal.data.error?.trim() || null
    const code = refusal.data.code
    if (!isRefusalCode(code) || code === 'unavailable') return { ok: false, failure: failure(code === 'unavailable' ? 'unconfirmed' : 'no-answer', hubError) }
    return { ok: false, failure: failure(code, hubError) }
  }
  const answer = savedSchema.safeParse(reply)
  const result = answer.success ? resultSchema.safeParse(answer.data.result ?? {}) : null
  if (!result?.success) return { ok: false, failure: failure('bad-answer') }
  return { ok: true, result: result.data }
}

/** The bridge, as a port. Only meaningful inside the dashboard's frame. */
export const bridgePort: HubPort = {
  send: (type, payload) => window.PayrollHubBridge.sendToDashboard(type, payload),
}
