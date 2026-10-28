// Checks the built app INSIDE a dashboard frame, with the real bridge file (scripts/lib/embedded.mjs):
// it connects, reads a saved run through mra-batch (one question, then the load), says clearly
// when a month was never sent to the dashboard, explains each refusal, shows a member that only
// admins may make returns, sends only to the exact dashboard origin, makes no request to any
// other address and writes nothing to browser storage.
// Run after `npm run build`: node scripts/check-bridge.mjs
// Set MRA_SHOTS to a folder to keep screenshots of the embedded pages (fake data only).
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { chromium } from 'playwright'
import { lowContrast, unnamedControls } from './lib/a11y-page.mjs'
import { embeddedContext, HUB, openEmbedded } from './lib/embedded.mjs'
import { FAKE_CSG_UPLOAD } from './lib/fake-upload.mjs'

const problems = []
const check = (condition, text) => {
  if (!condition) problems.push(text)
}
const shots = process.env.MRA_SHOTS
const e = String.fromCharCode(0xe9)


const browser = await chromium.launch()
try {
  const { context, outside } = await embeddedContext(browser)
  const shot = async (page, name) => {
    if (shots) await page.locator('#app').screenshot({ path: join(shots, `${name}.png`) })
  }
  const requests = (page) => page.evaluate(() => window.hub.state.requests.map((params) => params.action))
  const getRun = async (app, month) => {
    await app.getByLabel('Month').selectOption({ label: month })
    await app.getByRole('button', { name: 'Get the saved run' }).click()
  }

  // 1. Connected: ready and pong, the dashboard's company, a month to choose.
  const { page, app, pageErrors } = await openEmbedded(context)
  await app.getByText('Dashboard connected').waitFor()
  await app.getByTestId('company').waitFor()
  check((await app.getByTestId('company').textContent()) === 'ABC Co Ltd, BRN C1234567', 'The selected company is not shown with its BRN.')
  check((await app.getByRole('button', { name: 'Try with fake sample data' }).count()) === 0, 'Embedded: the fake sample is offered.')
  check(JSON.stringify(await requests(page)) === '["companies"]', 'Before anything is chosen, the app asked for more than the companies.')
  await shot(page, '1-connected')
  console.log('  connected: ready and pong seen, the company and the month shown')

  // 2. The saved run of August 2026: ONE question for that month and company, then one load.
  await getRun(app, 'August 2026')
  await app.getByTestId('run').waitFor()
  check((await app.getByTestId('run-count').textContent()) === '3 employees in the saved run.', 'The saved run does not say how many employees it has.')
  check((await app.getByRole('table').locator('tbody tr').count()) === 3, 'The saved run does not show its 3 employees.')
  const firstRow = await app.getByRole('table').locator('tbody tr').first().locator('td').allTextContents()
  check(JSON.stringify(firstRow) === '["X0000000000001","DOE","JANE","18750"]', `The first employee is not shown exactly as stored: ${JSON.stringify(firstRow)}`)
  const asked = await page.evaluate(() => window.hub.state.asked)
  check(JSON.stringify(asked) === '[{"period":"2026-08","names":["ABC Co Ltd"]}]', `The question was not one for August 2026 and the company: ${JSON.stringify(asked)}`)
  check(JSON.stringify(await requests(page)) === '["companies","ask","load"]', 'The run was not read with one question and one load.')
  for (const html of await app.locator('body').evaluate(unnamedControls)) problems.push(`Run: control without a name: ${html}`)
  for (const item of await app.locator('body').evaluate(lowContrast)) problems.push(`Run: low contrast ${item}`)
  await shot(page, '2-saved-run')
  console.log('  saved run: one question, one load, 3 employees shown exactly as stored')

  // 3. A month that was never sent to the dashboard: said clearly, with what to do.
  await getRun(app, 'July 2026')
  await app.getByTestId('no-run').waitFor()
  const noRun = await app.getByTestId('no-run').textContent()
  check(noRun.includes('July 2026 has not been sent to the dashboard for ABC Co Ltd.'), 'A month with no saved run is not said clearly.')
  check(noRun.includes('use Send to dashboard'), 'A month with no saved run does not say what to do.')
  check((await app.getByTestId('run').count()) === 0, 'The previous month is still shown.')
  await shot(page, '3-not-sent')
  console.log('  a month never sent: said clearly, with what to do')

  // 4. Refusals: declined, locked, nobody answered. Each says what happened and what to do.
  for (const [answer, title] of [
    ['deny', 'The request was declined in the dashboard'],
    ['locked', 'The dashboard is locked'],
    ['timeout', 'Nobody answered the question in the dashboard'],
  ]) {
    await page.evaluate((value) => {
      window.hub.state.answer = value
    }, answer)
    await getRun(app, 'August 2026')
    await app.getByTestId('failure').waitFor()
    const text = await app.getByTestId('failure').textContent()
    check(text.includes(title), `"${answer}": the failure is not explained (${text}).`)
    check(text.includes('The dashboard said:'), `"${answer}": the dashboard's own sentence is not shown.`)
    check((await app.getByTestId('run').count()) === 0, `"${answer}": a run is still shown.`)
  }
  await shot(page, '4-declined')
  console.log('  refusals: declined, locked and no answer each explained')

  // 5. Templates: a fake MRA CSG file uploaded as a template, two cells set up, saved in the
  // dashboard (without the example rows of the upload), then the file made and downloaded.
  await page.evaluate(() => {
    window.hub.state.answer = 'allow'
  })
  await getRun(app, 'August 2026')
  await app.getByTestId('export-no-templates').waitFor()
  await app.getByRole('tab', { name: 'Templates' }).click()
  await app.getByTestId('no-templates').waitFor()
  await app.locator('#template-file').setInputFiles({ name: 'CSG AUGUST 2026 (2).csv', mimeType: 'text/csv', buffer: FAKE_CSG_UPLOAD })
  await app.getByTestId('upload-rows').waitFor()
  await shot(page, '6-upload-rows')
  await app.getByRole('button', { name: 'Set up the cells' }).click()
  await app.getByTestId('template-editor').waitFor()
  await app.getByRole('button', { name: /^Cell A5/ }).click()
  await app.getByRole('combobox', { name: /^What goes in it/ }).selectOption('identity')
  await app.getByRole('button', { name: /^Cell A3/ }).click()
  check((await app.getByTestId('cell-editor').textContent()).includes('In the uploaded file: 009999'), 'The uploaded text of a cell is not shown as a hint.')
  await app.getByRole('combobox', { name: /^What goes in it/ }).selectOption('company')
  await app.getByRole('combobox', { name: /^Detail/ }).selectOption('ern')
  await shot(page, '7-template-editor')
  await app.getByRole('button', { name: 'Save', exact: true }).click()
  await app.getByText('Saved in the dashboard.').waitFor()
  const saves = await page.evaluate(() => window.hub.state.saves)
  check(saves.length === 1 && saves[0].action === 'save' && saves[0].expected_revision === 0 && saves[0].brn === 'C1234567', `The template was not saved once, as new, for the selected company: ${JSON.stringify(saves.map((one) => one.action))}`)
  const stored = JSON.stringify(saves[0] ?? {})
  for (const text of ['UPLOADED', 'EXAMPLE', '009999', 'Y9999999']) check(!stored.includes(text), `The saved template holds "${text}" from the uploaded file's employer or employee rows.`)
  check(stored.includes(`G${e}n${e}ralis${e}e`) && stored.includes('Frequency '), 'The headings were not kept exactly.')
  // Removing it from its only company asks first and says it cannot be undone.
  await app.getByRole('button', { name: 'Remove from this company' }).click()
  const removeText = await app.getByTestId('remove-text').textContent()
  check(removeText.includes("This can't be undone."), 'Removing a template from its last company does not say it cannot be undone.')
  await shot(page, '8-remove-last')
  await app.getByRole('button', { name: 'Cancel' }).click()
  check((await page.evaluate(() => window.hub.state.templates.length)) === 1, 'Cancel removed the template.')

  await app.getByRole('tab', { name: 'Make the files' }).click()
  await app.getByTestId('export-file').waitFor()
  check((await app.getByTestId('excel-reminder').textContent()).includes('Do not open it in Excel'), 'The reminder about Excel is missing.')
  const [download] = await Promise.all([page.waitForEvent('download'), app.getByRole('button', { name: 'Download the file' }).click()])
  check(download.suggestedFilename() === 'CSG AUGUST 2026 ABC CO LTD.csv', `The file name is ${download.suggestedFilename()}.`)
  const lines = readFileSync(await download.path()).toString('latin1').split('\r\n')
  const empty = (count) => ','.repeat(count)
  check(lines[0] === `MRA,PACO,V1.0${empty(16)}`, `The first line is ${lines[0]}`)
  check(lines[2] === `001234${empty(18)}`, `The employer line is ${lines[2]}`)
  check(lines[4] === `X0000000000001${empty(18)}` && lines[6] === `X0000000000003${empty(18)}` && lines[7] === '' && lines.length === 8, `The employee lines are ${JSON.stringify(lines.slice(4))}`)
  await shot(page, '9-export')
  console.log('  templates: uploaded, set up, saved without the example rows, removal asks first, file made and downloaded')

  // 6. Every message went to the exact dashboard origin, from this app.
  const sent = await page.evaluate(() => window.log.map((m) => ({ type: m.type, from: m.from, to: m.to, origin: m.origin, dataType: m.payload?.dataType })))
  check(sent.every((m) => m.origin === HUB && m.from === 'mra-returns' && m.to === 'dashboard'), 'A message did not come from the app at the exact origin.')
  check(sent.every((m) => m.type !== 'send-data' || m.dataType === 'mra-template'), 'The app sent the dashboard something other than a template.')
  const storage = await page.frames()[1].evaluate(async () => ({
    local: localStorage.length,
    session: sessionStorage.length,
    databases: indexedDB.databases ? (await indexedDB.databases()).length : 0,
  }))
  check(storage.local + storage.session + storage.databases === 0, `Something was written to browser storage: ${JSON.stringify(storage)}`)
  check(pageErrors.length === 0, `Errors on the page: ${pageErrors.join(' | ')}`)
  await page.close()

  // 6. A member (not an admin) of the selected company: told at once, never asked anything.
  const member = await openEmbedded(context, (hub) => {
    hub.state.selected = 'C2222222'
  })
  await member.app.getByTestId('not-admin').waitFor()
  check(
    (await member.app.getByTestId('not-admin').textContent()).includes('Only an admin of XYZ Trading Ltd can make its MRA returns.'),
    'A member is not told that only admins make returns.',
  )
  check((await member.app.getByRole('button', { name: 'Get the saved run' }).count()) === 0, 'A member is offered "Get the saved run".')
  check(JSON.stringify(await requests(member.page)) === '["companies"]', 'A member was asked something.')
  await shot(member.page, '5-member')
  await member.page.close()
  console.log('  a member: told only admins make returns, nothing asked')

  check(outside.length === 0, `Requests to other addresses: ${outside.join(', ')}`)
  await context.close()
} finally {
  await browser.close()
}

if (problems.length > 0) {
  console.error(`Bridge check FAILED (${problems.length}):\n- ${problems.join('\n- ')}`)
  process.exit(1)
}
console.log('Bridge check passed: inside the dashboard, saved runs are read with one question, and nothing else leaves.')
