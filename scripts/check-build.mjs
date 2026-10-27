// Checks the production build:
//   1. no file in dist/ loads anything from an outside server (static scan), and no script uses
//      eval or new Function;
//   2. using the real app on its own (the fake sample) makes 0 requests to any other origin and
//      writes nothing to browser storage.
// Run after `npm run build`: node scripts/check-build.mjs
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'
import { startPreview } from './lib/preview-server.mjs'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const dist = join(root, 'dist')
const problems = []
const note = (text) => console.log(`  ${text}`)

if (!existsSync(join(dist, 'index.html'))) {
  console.error('dist/ is missing. Run "npm run build" first.')
  process.exit(1)
}

// 1. Static scan: tags and CSS that would fetch from another host, and code made from text.
const files = []
const walk = (dir) => {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) walk(path)
    else files.push(path)
  }
}
walk(dist)
const loaders = [
  /<(?:script|img|iframe|source|video|audio)[^>]+src=["']?(?:https?:)?\/\//i,
  /<link[^>]+href=["']?(?:https?:)?\/\//i,
  /url\(\s*["']?(?:https?:)?\/\//i,
  /@import\s+["'](?:https?:)?\/\//i,
]
for (const file of files.filter((f) => /\.(html|css)$/.test(f))) {
  const text = readFileSync(file, 'utf8')
  for (const pattern of loaders) {
    if (pattern.test(text)) problems.push(`${file.replace(root, '.')} loads something from another host (${pattern})`)
  }
}
for (const file of files.filter((f) => f.endsWith('.js'))) {
  const text = readFileSync(file, 'utf8')
  if (/\beval\s*\(|\bnew\s+Function\s*\(/.test(text)) problems.push(`${file.replace(root, '.')} makes code from text (eval or new Function)`)
}
console.log(`Static scan: ${files.length} files in dist/.`)

// 2. Drive the built app and watch every request.
const server = await startPreview()
const browser = await chromium.launch()
try {
  const context = await browser.newContext()
  const page = await context.newPage()
  const outside = []
  page.on('request', (request) => {
    const url = request.url()
    if (!url.startsWith(server.origin) && !url.startsWith('data:') && !url.startsWith('blob:')) outside.push(url)
  })
  const pageErrors = []
  page.on('pageerror', (error) => pageErrors.push(String(error)))

  await page.goto(server.url)
  await page.getByRole('heading', { name: 'Open this app from the dashboard' }).waitFor()
  if ((await page.getByText('Dashboard connected').count()) > 0) problems.push('On its own, the app says the dashboard is connected.')
  await page.getByRole('button', { name: 'Try with fake sample data' }).click()
  await page.getByTestId('run').waitFor()
  const count = await page.getByRole('table').locator('tbody tr').count()
  note(`fake sample: ${count} employees shown`)
  if (count !== 3) problems.push(`The fake sample shows ${count} employees, not 3.`)
  if ((await page.getByText('Fake sample data', { exact: true }).count()) !== 1) problems.push('The fake sample is not marked as fake.')
  await page.getByRole('button', { name: 'Close the sample data' }).click()
  await page.getByRole('button', { name: 'Try with fake sample data' }).waitFor()

  const storage = await page.evaluate(async () => ({
    local: localStorage.length,
    session: sessionStorage.length,
    databases: indexedDB.databases ? (await indexedDB.databases()).length : 0,
    cookies: document.cookie.length,
  }))
  note(`browser storage after use: ${JSON.stringify(storage)}`)
  if (storage.local + storage.session + storage.databases + storage.cookies > 0) {
    problems.push(`Something was written to browser storage: ${JSON.stringify(storage)}`)
  }
  if (outside.length > 0) problems.push(`Requests to outside servers: ${outside.join(', ')}`)
  if (pageErrors.length > 0) problems.push(`Errors on the page: ${pageErrors.join(' | ')}`)
  await context.close()
} finally {
  await browser.close()
  await server.close()
}

if (problems.length > 0) {
  console.error(`Build check FAILED:\n- ${problems.join('\n- ')}`)
  process.exit(1)
}
console.log('Build check passed: 0 requests to outside servers, nothing in browser storage, no code made from text.')
