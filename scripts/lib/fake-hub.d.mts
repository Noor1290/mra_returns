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
  /** The saved months not approved yet, as "BRN YYYY-MM". */
  drafts: string[]
  mra: Record<string, { ern: string; telephone: string; mobile: string; declarant: string }>
  email: string
  /** Each company's fields as the dashboard lists them (mra-batch overview), by BRN. */
  fields: Record<string, { identity: string[]; columns: string[] }>
  templates: FakeTemplate[]
  saves: Record<string, unknown>[]
  templateRequests: Record<string, unknown>[]
  /** company-list: the CSG and PRGF lists each company is on, by BRN, and each company's id. */
  lists: Record<string, ('csg' | 'prgf')[]>
  ids: Record<string, string>
  /** The first answer marks the selected company `open` (the app goes straight to it). */
  openOnStart: boolean
  /** A dashboard from before the lists. */
  legacy: boolean
  pendingOpen: { brn: string; period: string | null } | null
  /** Set when the dashboard would reload the app's frame. */
  reload: boolean
  pickerOpened: number
  listRequests: Record<string, unknown>[]
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
