// Types for fake-hub.mjs, so the tests can use the same stand-in dashboard as the bridge check.
export interface FakeCompany {
  brn: string
  name: string
  address: string | null
  role: 'admin' | 'member'
  /** Saved runs by month ("YYYY-MM"): the rows "Get from dashboard" gives. */
  runs: Record<string, Record<string, unknown>[]>
}
export interface FakeHubState {
  selected: string
  companies: FakeCompany[]
  answer: 'allow' | 'deny' | 'locked' | 'timeout' | 'hold'
  refuseAll: { code: string; error: string } | null
  unlocked: boolean
  allowed: { period: string; brns: string[] } | null
  asked: { period: string; names: string[] }[]
  requests: Record<string, unknown>[]
}
export interface FakeHub {
  state: FakeHubState
  handle(type: string, payload: { dataType: string; params?: Record<string, unknown> }): unknown
}
export function createFakeHub(): FakeHub
