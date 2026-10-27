// The built app INSIDE a dashboard frame, with the real bridge file, for check-bridge.mjs and
// check-text.mjs. The bridge only trusts https://noor1290.github.io, so every request for that
// address is answered here: a small fake dashboard page, and the app from dist/. Nothing reaches
// the real site; a request to any other address is blocked and recorded in `outside`.
import { existsSync, readFileSync } from 'node:fs'
import { dirname, extname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createFakeHub } from './fake-hub.mjs'

export const HUB = 'https://noor1290.github.io'
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
export const dist = join(root, 'dist')
const TYPES = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.woff2': 'font/woff2',
}

// A stand-in for the dashboard: it embeds the app, answers "ready" with a ping like the real one,
// records every message the app sends, and answers mra-batch with the in-memory fake from
// fake-hub.mjs. `window.hub.state` lets a check play a refusal, a member, or another month.
const DASHBOARD = `<!doctype html><meta charset="utf-8"><title>Fake dashboard (test)</title>
<iframe id="app" title="MRA Returns" src="${HUB}/mra_returns/" style="width:1280px;height:860px;border:0"></iframe>
<script>
  const frame = document.getElementById('app')
  const post = (type, payload, id) =>
    frame.contentWindow.postMessage({ type, from: 'dashboard', to: 'mra-returns', version: 1, id, payload }, '${HUB}')
  window.log = []
  ${createFakeHub.toString()}
  window.hub = createFakeHub()
  if (window.prepareHub) window.prepareHub(window.hub)
  window.send = (id, payload) => post('send-data', payload, id)
  window.addEventListener('message', (event) => {
    if (event.source !== frame.contentWindow) return
    window.log.push({ ...event.data, origin: event.origin })
    if (event.data.type === 'ready') post('ping', {}, 'ping-' + String(Date.now()).padStart(13, '0'))
    const { type, id, payload } = event.data
    if (type !== 'request-data') return
    const answer = window.hub.handle(type, payload)
    if (answer !== undefined) post('response-data', answer, id)
  })
</script>`

/** A browser context in which https://noor1290.github.io is the fake dashboard and this build. */
export async function embeddedContext(browser, options = {}) {
  if (!existsSync(join(dist, 'index.html'))) throw new Error('dist/ is missing. Run "npm run build" first.')
  const context = await browser.newContext({ viewport: { width: 1320, height: 900 }, ...options })
  const outside = []
  await context.route('**/*', (route) => {
    const url = new URL(route.request().url())
    if (url.origin !== HUB) {
      outside.push(url.href)
      return route.abort()
    }
    if (url.pathname === '/payroll_hub/') return route.fulfill({ contentType: 'text/html', body: DASHBOARD })
    if (url.pathname.startsWith('/mra_returns/')) {
      const file = join(dist, url.pathname.slice('/mra_returns/'.length) || 'index.html')
      if (existsSync(file)) return route.fulfill({ contentType: TYPES[extname(file)] ?? 'application/octet-stream', body: readFileSync(file) })
    }
    return route.fulfill({ status: 404, body: 'Not found' })
  })
  return { context, outside }
}

/** Opens the fake dashboard and waits until the app said it is ready and answered the ping. */
export async function openEmbedded(context, prepare) {
  const page = await context.newPage()
  const pageErrors = []
  page.on('pageerror', (error) => pageErrors.push(String(error)))
  // `prepare` changes the fake dashboard before the app is even loaded.
  if (prepare) await page.addInitScript(`window.prepareHub = ${prepare.toString()}`)
  await page.goto(`${HUB}/payroll_hub/`)
  await page.waitForFunction(() => window.log.some((m) => m.type === 'ready') && window.log.some((m) => m.type === 'pong'))
  return { page, app: page.frameLocator('#app'), pageErrors }
}
