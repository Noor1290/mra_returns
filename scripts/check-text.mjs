// Text check: every text a user can see or hear, on every screen and in every state, must be on
// the approved list (tests/textCheck/approved.json). The owner approves new wording before it is
// added there.
//   node scripts/check-text.mjs            check, and list what is not approved
//   node scripts/check-text.mjs --list     also print every text, state by state
//
// It drives the built app on its own (scripts/lib/preview-server.mjs) and inside the fake
// dashboard (scripts/lib/embedded.mjs), and records text on screen, screen-reader labels, titles
// and placeholders, and the choices in lists. Values from the (fake) data are left out: table cells
// and anything marked data-values (the months, the template's own cells and headings, file names).
// Run after `npm run build`.
import { existsSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'
import { embeddedContext, openEmbedded } from './lib/embedded.mjs'
import { startPreview } from './lib/preview-server.mjs'
import { walkTemplates } from './lib/template-walk.mjs'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const approvedFile = resolve(root, 'tests/textCheck/approved.json')
const list = process.argv.includes('--list')

/** Runs in the page: the visible texts, labels, titles and placeholders, as "kind: text". */
function collect() {
  const squash = (s) => s.replace(/\s+/g, ' ').trim()
  const out = []
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_ELEMENT)
  for (let el = walker.currentNode; el; el = walker.nextNode()) {
    if (['SCRIPT', 'STYLE'].includes(el.tagName)) continue
    if (el.closest('datalist, [data-values]')) continue
    // Table cells hold data; a list to choose from inside one is wording.
    if (el.closest('td') && !el.closest('select')) continue
    const style = getComputedStyle(el)
    if (el.tagName !== 'OPTION' && style.display === 'none' || style.visibility === 'hidden') continue
    // Text written directly inside this element (pieces joined, so "Only an admin of " + name is one string).
    const own = squash([...el.childNodes].filter((n) => n.nodeType === Node.TEXT_NODE).map((n) => n.textContent).join(''))
    if (own) out.push(`text: ${own}`)
    for (const attr of ['title', 'aria-label', 'placeholder', 'alt']) {
      const value = el.getAttribute(attr)
      if (value && squash(value)) out.push(`${attr}: ${squash(value)}`)
    }
  }
  return out
}

const states = {}
const record = async (name, frame) => {
  states[name] = await frame.evaluate(collect)
}

const browser = await chromium.launch()
const server = await startPreview()
try {
  // On its own.
  const context = await browser.newContext({ colorScheme: 'dark' })
  const page = await context.newPage()
  await page.goto(server.url)
  await page.getByRole('button', { name: 'Try with fake sample data' }).waitFor()
  await record('on its own', page)
  await page.getByRole('button', { name: 'Try with fake sample data' }).click()
  await page.getByTestId('run').waitFor()
  await record('on its own: fake sample', page)
  await page.getByRole('button', { name: 'Light theme' }).click()
  await record('on its own: light theme', page)
  await walkTemplates(page, (name) => record(`on its own: ${name}`, page))
  await context.close()

  // Inside the dashboard.
  const embedded = await embeddedContext(browser)
  const frameOf = (opened) => opened.page.frames().find((frame) => frame.url().includes('/mra_returns/'))
  const getRun = async (opened, month) => {
    await opened.app.getByLabel('Month').selectOption({ label: month })
    await opened.app.getByRole('button', { name: 'Get the saved run' }).click()
  }

  const loading = await openEmbedded(embedded.context, (hub) => {
    hub.state.answer = 'hold'
  })
  await loading.app.getByTestId('company').waitFor()
  await record('dashboard: connected', frameOf(loading))
  await getRun(loading, 'August 2026')
  await loading.app.getByText('Waiting for the dashboard.').waitFor()
  await record('dashboard: waiting for the question', frameOf(loading))
  await loading.page.close()

  const main = await openEmbedded(embedded.context)
  await getRun(main, 'August 2026')
  await main.app.getByTestId('run').waitFor()
  await record('dashboard: saved run', frameOf(main))
  await getRun(main, 'July 2026')
  await main.app.getByTestId('no-run').waitFor()
  await record('dashboard: month not sent', frameOf(main))
  for (const answer of ['deny', 'locked', 'timeout']) {
    await main.page.evaluate((value) => {
      window.hub.state.answer = value
    }, answer)
    await getRun(main, 'August 2026')
    await main.app.getByTestId('failure').waitFor()
    await record(`dashboard: refused (${answer})`, frameOf(main))
  }
  await main.page.close()

  const member = await openEmbedded(embedded.context, (hub) => {
    hub.state.selected = 'C2222222'
  })
  await member.app.getByTestId('not-admin').waitFor()
  await record('dashboard: a member', frameOf(member))
  await member.page.close()

  const down = await openEmbedded(embedded.context, (hub) => {
    hub.state.refuseAll = { code: 'unavailable', error: 'The dashboard is not connected to a database.' }
  })
  await down.app.getByTestId('failure').waitFor()
  await record('dashboard: companies not available', frameOf(down))
  await down.page.close()
  await embedded.context.close()
} finally {
  await server.close()
  await browser.close()
}

const approved = existsSync(approvedFile) ? JSON.parse(readFileSync(approvedFile, 'utf8')) : { texts: [] }
const ok = new Set(approved.texts.map((entry) => entry.text))
const seen = new Map()
for (const [state, texts] of Object.entries(states)) {
  if (list) console.log(`\n${state}:`)
  for (const text of new Set(texts)) {
    if (list) console.log(`  [${ok.has(text) ? 'approved' : 'NOT APPROVED'}] ${text}`)
    seen.set(text, [...(seen.get(text) ?? []), state])
  }
}
const missing = [...seen.keys()].filter((text) => !ok.has(text))
const unused = [...ok].filter((text) => !seen.has(text))
console.log(`\nText check: ${Object.keys(states).length} states, ${seen.size} different texts.`)
for (const text of missing) console.log(`  NOT APPROVED: ${text}   (e.g. ${seen.get(text)[0]})`)
for (const text of unused) console.log(`  approved but no longer shown: ${text}`)
if (missing.length > 0 || unused.length > 0) {
  console.error(`Text check FAILED: ${missing.length} not approved, ${unused.length} no longer shown.`)
  process.exit(1)
}
console.log('Text check passed: every text is on the approved list.')
