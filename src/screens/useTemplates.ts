import { useEffect, useState } from 'react'
import type { Failure } from '../lib/hubWire'
import type { LoadedTemplate, TemplateStore } from '../lib/templateStore'

export type LoadedTemplates = { status: 'loading' } | { status: 'failed'; failure: Failure } | { status: 'loaded'; templates: LoadedTemplate[] }

/** The selected company's templates, each with its body and own values, read again on `version`. */
export function useTemplates(store: TemplateStore, version: number): { loaded: LoadedTemplates; retry: () => void } {
  const [loaded, setLoaded] = useState<LoadedTemplates>({ status: 'loading' })
  const [reload, setReload] = useState(0)

  useEffect(() => {
    let current = true
    setLoaded({ status: 'loading' })
    void (async () => {
      const list = await store.list()
      if (!list.ok) return current && setLoaded({ status: 'failed', failure: list.failure })
      const templates: LoadedTemplate[] = []
      for (const summary of list.value) {
        const one = await store.load(summary.template_id)
        if (!one.ok) return current && setLoaded({ status: 'failed', failure: one.failure })
        templates.push(one.value)
      }
      if (current) setLoaded({ status: 'loaded', templates })
    })()
    return () => {
      current = false
    }
  }, [store, version, reload])

  return { loaded, retry: () => setReload((n) => n + 1) }
}
