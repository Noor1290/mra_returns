import { createHash, randomUUID } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import vm from 'node:vm'
import { describe, expect, it } from 'vitest'
import { HUB_APP_ID, MRA_BATCH } from '../src/lib/runStore'

const HUB_ORIGIN = 'https://noor1290.github.io'
const root = resolve(import.meta.dirname, '..')
const bridgeFile = resolve(root, 'src/payrollHubBridge.js')
/** The hub's own copy, when the payroll_hub repo sits next to this one. */
const hubBridgeFile = resolve(root, '../payroll_hub/docs/bridge.js')

interface Posted {
  message: { type: string; from: string; to: string; version: number; id: string; payload: Record<string, unknown> }
  targetOrigin: string
}

/**
 * Runs the REAL, unchanged bridge file against a fake window, as if the app were inside the
 * dashboard's iframe. `deliver` plays the dashboard sending a message.
 */
function embeddedBridge() {
  const posted: Posted[] = []
  const storageWrites: string[] = []
  const listeners: ((event: unknown) => void)[] = []
  const parent = { postMessage: (message: Posted['message'], targetOrigin: string) => posted.push({ message, targetOrigin }) }
  const storage = (name: string) => ({
    setItem: (key: string) => storageWrites.push(`${name}.${key}`),
    getItem: () => null,
    length: 0,
  })
  const window: Record<string, unknown> = {
    parent,
    addEventListener: (type: string, listener: (event: unknown) => void) => {
      if (type === 'message') listeners.push(listener)
    },
    crypto: { randomUUID },
    localStorage: storage('localStorage'),
    sessionStorage: storage('sessionStorage'),
  }
  vm.runInNewContext(readFileSync(bridgeFile, 'utf8'), { window, setTimeout, clearTimeout })
  const bridge = window.PayrollHubBridge as Window['PayrollHubBridge']
  const deliver = (message: Record<string, unknown>, from: { origin?: string; source?: unknown } = {}) => {
    const event = { data: message, origin: from.origin ?? HUB_ORIGIN, source: from.source ?? parent }
    for (const listener of listeners) listener(event)
  }
  const replies = (id: string) => posted.filter((p) => p.message.id === id && p.message.type === 'received')
  return { bridge, posted, storageWrites, deliver, replies }
}

describe('the copied bridge file', () => {
  it('is byte for byte the hub version it was copied from', () => {
    const hash = createHash('sha256').update(readFileSync(bridgeFile)).digest('hex')
    // The hub's docs/bridge.js of 17 October 2026, which added setUnsaved (rehearsal fix F1).
    expect(hash).toBe('2caa2e73c7aca406d4dab88f344ef6087acb7255d0e535ede7647346f9bcda20')
  })

  it.runIf(existsSync(hubBridgeFile))('is still identical to the hub repo next to this one', () => {
    expect(readFileSync(bridgeFile).equals(readFileSync(hubBridgeFile))).toBe(true)
  })

  it('does nothing when the app is opened on its own', () => {
    const posted: unknown[] = []
    const window: Record<string, unknown> = { addEventListener: () => posted.push('listener') }
    window.parent = window
    vm.runInNewContext(readFileSync(bridgeFile, 'utf8'), { window, setTimeout, clearTimeout })
    const bridge = window.PayrollHubBridge as Window['PayrollHubBridge']
    expect(bridge.isEmbedded()).toBe(false)
    expect(bridge.init({ appId: HUB_APP_ID })).toBe(false)
    expect(posted).toEqual([])
  })
})

describe('inside the dashboard', () => {
  it('says it is ready as "mra-returns", to the exact dashboard origin', () => {
    const { bridge, posted } = embeddedBridge()
    expect(bridge.init({ appId: HUB_APP_ID })).toBe(true)
    expect(posted.map((p) => [p.message.type, p.message.from, p.message.to, p.targetOrigin])).toEqual([
      ['ready', 'mra-returns', 'dashboard', HUB_ORIGIN],
    ])
  })

  it('refuses data the dashboard tries to send it: this app only asks', () => {
    const { bridge, deliver, replies } = embeddedBridge()
    bridge.init({ appId: HUB_APP_ID })
    deliver({
      type: 'send-data',
      from: 'dashboard',
      to: 'mra-returns',
      version: 1,
      id: 'message-0001',
      payload: { dataType: 'payroll-result', rows: [{ ID: 'X0000000000001' }] },
    })
    expect(replies('message-0001').map((r) => r.message.payload)).toEqual([{ ok: false, error: 'This app cannot receive data.' }])
  })

  it('asks for mra-batch, only ever posts to the exact origin, and writes nothing to browser storage', async () => {
    const { bridge, posted, storageWrites, deliver } = embeddedBridge()
    bridge.init({ appId: HUB_APP_ID })
    const request = bridge.sendToDashboard('request-data', { dataType: MRA_BATCH, params: { action: 'companies' } })
    const asked = posted.find((p) => p.message.type === 'request-data')!
    expect(asked.message.payload).toEqual({ dataType: 'mra-batch', params: { action: 'companies' } })
    const answer = { ok: true, dataType: 'mra-batch', rows: [], meta: { brn: 'C1234567' } }
    deliver({ type: 'response-data', from: 'dashboard', to: 'mra-returns', version: 1, id: asked.message.id, payload: answer })
    expect(await request).toEqual(answer)
    expect(new Set(posted.map((p) => p.targetOrigin))).toEqual(new Set([HUB_ORIGIN]))
    expect(new Set(posted.map((p) => p.message.from))).toEqual(new Set(['mra-returns']))
    expect(storageWrites).toEqual([])
  })

  it('ignores an answer from another origin or another window', async () => {
    const { bridge, posted, deliver } = embeddedBridge()
    bridge.init({ appId: HUB_APP_ID })
    const request = bridge.sendToDashboard('request-data', { dataType: MRA_BATCH, params: { action: 'companies' } })
    const { id } = posted.find((p) => p.message.type === 'request-data')!.message
    const forged = { type: 'response-data', from: 'dashboard', to: 'mra-returns', version: 1, id, payload: { ok: true, dataType: 'mra-batch', rows: [{ forged: true }] } }
    deliver(forged, { origin: 'https://example.com' })
    deliver(forged, { source: { postMessage: () => undefined } })
    const real = { ok: true, dataType: 'mra-batch', rows: [], meta: { brn: 'C1234567' } }
    deliver({ ...forged, payload: real })
    expect(await request).toEqual(real)
  })
})
