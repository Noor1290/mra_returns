import { Building2, LayoutTemplate, Sparkles } from 'lucide-react'
import { useState } from 'react'
import { missingReadyMade, READY_MADE, readyMadeTemplate } from '../data/readyMade'
import type { Failure } from '../lib/hubWire'
import type { TemplateStore, TemplateSummary } from '../lib/templateStore'
import { Dialog } from './Dialog'
import { FailurePanel } from './FailurePanel'

const both = (names: readonly string[]) => (names.length > 1 ? `${names.slice(0, -1).join(', ')} and ${names.at(-1)!}` : names.join(''))

/** "Add the ready-made MRA templates": makes for this company the ready-made ones it does not have yet. */
export function AddReadyMade({
  store,
  templates,
  companyName,
  onAdded,
  disabled = false,
}: {
  store: TemplateStore
  /** The templates this company uses now. */
  templates: readonly Pick<TemplateSummary, 'name'>[]
  companyName: string
  /** Some were made: the list is read again. `names` are the ones made. */
  onAdded: (names: string[]) => void
  disabled?: boolean
}) {
  const [busy, setBusy] = useState(false)
  const [failure, setFailure] = useState<Failure | null>(null)
  const missing = missingReadyMade(templates.map((one) => one.name))
  if (missing.length === 0) return null
  return (
    <div className="flex flex-col gap-2" data-testid="add-ready-made">
      <p className="m-0 text-sm">
        Adds {both(missing.map((one) => one.name))} to {companyName}, set up as the MRA requires.
      </p>
      <div>
        <button
          type="button"
          className="btn btn-primary"
          disabled={busy || disabled}
          onClick={async () => {
            setBusy(true)
            setFailure(null)
            const made: string[] = []
            for (const one of missing) {
              const saved = await store.save({ id: crypto.randomUUID(), name: one.name, body: readyMadeTemplate(one.layout), expectedRevision: 0 })
              if (!saved.ok) {
                setFailure(saved.failure)
                break
              }
              made.push(saved.value.name)
            }
            setBusy(false)
            if (made.length > 0) onAdded(made)
          }}
        >
          <Sparkles aria-hidden="true" />
          {busy ? 'Adding' : 'Add the ready-made MRA templates'}
        </button>
      </div>
      {failure && <FailurePanel failure={failure} />}
    </div>
  )
}

interface Plan {
  /** The companies to use them in, by BRN, with their names. */
  companies: { brn: string; name: string }[]
  /** For each ready-made template, the BRNs of the companies that do not use it yet. */
  attach: { template: TemplateSummary; brns: string[] }[]
}

/**
 * "Use them for all my companies": the ready-made templates of this company, also used in every
 * other company where the user is an admin, after one confirmation. A company that cannot take
 * one (it has another template with that name, say) is named with the dashboard's reason.
 */
export function UseEverywhere({
  store,
  templates,
  onDone,
  disabled = false,
}: {
  store: TemplateStore
  templates: readonly TemplateSummary[]
  onDone: (status: string, problems: string[]) => void
  disabled?: boolean
}) {
  const [busy, setBusy] = useState(false)
  const [failure, setFailure] = useState<Failure | null>(null)
  const [plan, setPlan] = useState<Plan | null>(null)
  const ready = READY_MADE.map((one) => templates.find((template) => template.name.trim().toLowerCase() === one.name.toLowerCase()))
  if (ready.some((one) => one === undefined)) return null
  const mine = ready as TemplateSummary[]
  const canChange = mine.every((one) => one.can_change)

  const prepare = async () => {
    setBusy(true)
    setFailure(null)
    const attach: Plan['attach'] = []
    const names = new Map<string, string>()
    for (const template of mine) {
      const answer = await store.companies(template.template_id)
      if (!answer.ok) {
        setBusy(false)
        return setFailure(answer.failure)
      }
      const others = answer.value.filter((company) => !company.uses && !company.selected)
      for (const company of others) names.set(company.brn, company.name)
      attach.push({ template, brns: others.map((company) => company.brn) })
    }
    setBusy(false)
    if (names.size === 0) return onDone('Every company where you are an admin already uses them.', [])
    setPlan({ companies: [...names].map(([brn, name]) => ({ brn, name })), attach })
  }

  const run = async (chosen: Plan) => {
    setBusy(true)
    const done = new Set<string>()
    const problems: string[] = []
    for (const { template, brns } of chosen.attach) {
      for (const brn of brns) {
        const answer = await store.attach(template.template_id, brn)
        const name = chosen.companies.find((company) => company.brn === brn)?.name ?? brn
        if (answer.ok) done.add(name)
        else problems.push(`${template.name} is not used in ${name}: ${answer.failure.hubError ?? answer.failure.title}`)
      }
    }
    setBusy(false)
    setPlan(null)
    onDone(done.size > 0 ? `Now also used by ${[...done].join(', ')}.` : '', problems)
  }

  const count = plan?.companies.length ?? 0
  return (
    <div className="flex flex-col gap-2" data-testid="use-everywhere">
      <p className="m-0 text-sm">Uses {both(mine.map((one) => one.name))} in every company where you are an admin, after one question.</p>
      <div>
        <button type="button" className="btn" disabled={busy || disabled || !canChange} onClick={() => void prepare()}>
          <Building2 aria-hidden="true" />
          Use them for all my companies
        </button>
      </div>
      {!canChange && <p className="m-0 text-sm text-muted">Only an admin of every company using them can use them in more companies.</p>}
      {failure && <FailurePanel failure={failure} />}
      {plan && (
        <Dialog
          title="Use the ready-made templates in all your companies?"
          description="They are then shared: a change reaches every company using them, and each company keeps its own values."
          icon={<LayoutTemplate />}
          onClose={() => !busy && setPlan(null)}
          width={560}
          actions={
            <>
              <button type="button" className="btn" disabled={busy} onClick={() => setPlan(null)}>
                Cancel
              </button>
              <button type="button" className="btn btn-primary" disabled={busy} onClick={() => void run(plan)}>
                <Building2 aria-hidden="true" />
                {count === 1 ? 'Use them in 1 company' : `Use them in ${count} companies`}
              </button>
            </>
          }
        >
          <p className="m-0 text-sm" data-testid="use-everywhere-text">
            {both(mine.map((one) => one.name))} will also be used in {count === 1 ? '1 company' : `${count} companies`}: <span data-values>{both(plan.companies.map((company) => company.name))}</span>.
          </p>
        </Dialog>
      )}
    </div>
  )
}
