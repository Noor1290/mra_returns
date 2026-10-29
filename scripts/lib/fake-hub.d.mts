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
  opened: string[]
  mra: Record<string, { ern: string; telephone: string; mobile: string; declarant: string }>
  email: string
  templates: FakeTemplate[]
  saves: Record<string, unknown>[]
  templateRequests: Record<string, unknown>[]
}
export interface FakeTemplate {
  template_id: string
  name: string
  revision: number
  body: unknown
  history: { revision: number; name: string; body: unknown; saved_at: string }[]
  companies: { brn: string; own_values: unknown; values_revision: number }[]
}
export interface FakeHub {
  state: FakeHubState
  handle(type: string, payload: { dataType: string; params?: Record<string, unknown>; rows?: Record<string, unknown>[] }): unknown
}
export function createFakeHub(): FakeHub
