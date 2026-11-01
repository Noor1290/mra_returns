// What only shows in the browser, from the fixes after the MRA rehearsal. In the built app, FAKE
// data only:
//   P1  a value the file cannot hold stops the download until the user chooses, and the file
//       downloaded after "Fix in this file only" holds the fix; with no plain letter, only Go back;
//   P2  the boxes of a calculation show the values used after Remove and Add a part;
//   P4  "round the total once" can be chosen and is kept on the cell; a line whose rounded parts
//       miss the total is shown in a step before the download, which only needs a click;
//   P8  a cell changed to Payroll column starts as a number in whole rupees;
//   P11 a month not approved is said clearly and does not stop the download.
// Run after `npm run build`: node scripts/check-fixes.mjs
import { readFileSync } from 'node:fs'
import { chromium } from 'playwright'
import { embeddedContext, openEmbedded } from './lib/embedded.mjs'
import { startPreview } from './lib/preview-server.mjs'

const problems = []
const check = (condition, text) => {
  if (!condition) problems.push(text)
}

/** A small template, in the fake dashboard, used by the selected company. */
const prepare = (surname, cents = false) =>
  `(hub) => {
    const text = { type: 'text', capitals: true, tidy: false }
    hub.state.templates.push({
      template_id: '00000000-0000-4000-8000-00000000c560',
      name: 'MRA CSG (PACO)',
      revision: 1,
      history: [],
      body: {
        format: 'mra-returns-template',
        version: 1,
        width: 3,
        rows: [
          { kind: 'copy', cells: ['Employee ID', 'Surname of Employee', 'Total'] },
          { kind: 'employee', cells: [
            { id: 'e0', source: { type: 'employee', key: 'ID', group: 'identity' }, format: text },
            { id: 'e1', source: { type: 'employee', key: 'Surname', group: 'identity' }, format: text },
            { id: 'e2', source: { type: 'calc', once: true, terms: [
              { sign: 1, of: { type: 'column', key: 'New Basic Salary' }, times: null, round: 'none' },
              { sign: 1, of: { type: 'column', key: 'Allowances' }, times: null, round: 'none' },
            ] }, format: { type: 'number', decimals: 0, width: 0 } },
          ] },
        ],
        settings: { encoding: 'windows-1252', lineEnding: 'crlf', separator: ',', quotes: 'never', pad: true },
        fileName: { pattern: 'CSG {MONTH} {YYYY} {COMPANY}', capitals: true },
        noPay: null,
      },
      companies: [{ brn: 'C1234567', own_values: {}, values_revision: 1 }],
    })
    hub.state.companies[0].runs['2026-08'][1].Surname = ${JSON.stringify(surname)}
    if (${cents}) Object.assign(hub.state.companies[0].runs['2026-08'][1], { 'New Basic Salary': 20000.5, Allowances: 1000.5 })
    hub.state.drafts.push('C1234567 2026-08')
  }`

const browser = await chromium.launch()
const server = await startPreview()
try {
  const { context } = await embeddedContext(browser)
  const open = async (surname, cents) => {
    const opened = await openEmbedded(context, prepare(surname, cents))
    await opened.app.getByLabel('Month').first().selectOption({ label: 'August 2026' })
    await opened.app.getByRole('button', { name: 'Get the saved run' }).click()
    await opened.app.getByTestId('export-file').waitFor()
    return opened
  }
  const downloads = (page) => {
    const seen = []
    page.on('download', (one) => seen.push(one))
    return seen
  }

  // P1: a comma and a character: nothing goes out until the user chooses.
  const fixing = await open('Roe, Mihai\u0219or')
  const seen = downloads(fixing.page)
  const button = fixing.app.getByRole('button', { name: 'Download the file' })
  check((await fixing.app.getByTestId('export-not-approved').textContent()).trim() === "August 2026 isn't approved in the dashboard for ABC Co Ltd.", 'P11: the month not approved is not said.')
  await button.click()
  const dialog = await fixing.app.getByTestId('unwritable-dialog').textContent()
  check(dialog.includes('ABC Co Ltd, MRA CSG (PACO)'), 'P1: the list does not name the company and the file.')
  check(dialog.includes('ID X0000000000002') && dialog.includes('Surname of Employee'), `P1: the list does not name the employee and the column: ${dialog}`)
  check(dialog.includes('Roe, Mihai\u0219or \u2192 ROE MIHAISOR'), `P1: the list does not show the change: ${dialog}`)
  check(!/Line \d|field \d/.test(dialog), 'P1: the list still speaks of lines and fields.')
  check(seen.length === 0, 'P1: something was downloaded before the choice.')
  // Shown in the window, title included, however far down the page the button is.
  const box = await fixing.app.getByRole('dialog').boundingBox()
  const frame = await fixing.page.locator('#app').boundingBox()
  check(box.y >= frame.y && box.y + box.height <= frame.y + frame.height, `P1: the dialog is not inside the window: ${JSON.stringify(box)}`)
  await fixing.app.getByRole('button', { name: 'Go back' }).click()
  await fixing.page.waitForTimeout(300)
  check(seen.length === 0, 'P1: Go back downloaded the file.')
  await button.click()
  const [fixed] = await Promise.all([fixing.page.waitForEvent('download'), fixing.app.getByRole('button', { name: 'Fix in this file only' }).click()])
  const bytes = readFileSync(await fixed.path()).toString('latin1')
  check(bytes.includes('X0000000000002,ROE MIHAISOR,18546\r\n'), `P1: the file does not hold the fix: ${bytes}`)
  await fixing.page.close()

  // P1: no plain letter: only Go back, and nothing goes out.
  const stuck = await open('Roe \u738b')
  const none = downloads(stuck.page)
  await stuck.app.getByRole('button', { name: 'Download the file' }).click()
  await stuck.app.getByTestId('unwritable-dialog').waitFor()
  check((await stuck.app.getByRole('button', { name: 'Fix in this file only' }).count()) === 0, 'P1: a value with no plain letter can be "fixed".')
  await stuck.app.getByRole('button', { name: 'Go back' }).click()
  await stuck.page.waitForTimeout(300)
  check(none.length === 0, 'P1: a file with no plain letter was downloaded.')
  await stuck.page.close()

  // P11: a month not approved, nothing else: the download goes straight through.
  const draft = await open('ROE')
  const [plain] = await Promise.all([draft.page.waitForEvent('download'), draft.app.getByRole('button', { name: 'Download the file' }).click()])
  check(plain.suggestedFilename().endsWith('.csv'), 'P11: a month not approved stopped the download.')
  await draft.page.close()

  // P4: a line that does not add up, nothing else: shown first, one click, then the download.
  const sums = await open('ROE', true)
  const waiting = downloads(sums.page)
  await sums.app.getByRole('button', { name: 'Download the file' }).click()
  const listed = await sums.app.getByTestId('sums-dialog').textContent()
  check(listed.includes('the rounded parts 20001 + 1001 make 21002, but the total is 21001.'), `P4: the line is not listed: ${listed}`)
  check((await sums.app.getByTestId('sum-notes').count()) === 1, 'P4: the line is not listed under the file.')
  check(waiting.length === 0, 'P4: the file was downloaded before the line was shown.')
  const [checked] = await Promise.all([sums.page.waitForEvent('download'), sums.app.getByRole('button', { name: 'Download', exact: true }).click()])
  check(readFileSync(await checked.path()).toString('latin1').includes('X0000000000002,ROE,21001\r\n'), 'P4: the file does not hold the total rounded once.')
  await sums.page.close()

  // On its own, with the fake sample: the cell editor.
  const page = await (await browser.newContext({ viewport: { width: 1320, height: 900 } })).newPage()
  await page.goto(server.url)
  await page.getByRole('button', { name: 'Try with fake sample data' }).click()

  // The dialog of the zip, far down a long report, is in the window too.
  const batch = page.getByTestId('batch')
  await batch.getByRole('button', { name: 'Make the zip' }).click()
  await batch.getByTestId('batch-report').waitFor()
  await batch.getByRole('button', { name: 'Download the zip' }).click()
  await page.getByTestId('unwritable-dialog').waitFor()
  const zipBox = await page.getByRole('dialog').boundingBox()
  check(zipBox.y >= 0 && zipBox.y + zipBox.height <= 900, `P1: the dialog of the zip is not inside the window: ${JSON.stringify(zipBox)}`)
  await page.getByRole('button', { name: 'Go back' }).click()

  await page.getByRole('tab', { name: 'Templates' }).click()
  await page.getByRole('button', { name: /^MRA CSG/ }).click()
  await page.getByTestId('template-editor').waitFor()
  await page.getByRole('button', { name: /^Cell J5/ }).click()
  const rates = () => page.getByRole('textbox', { name: /^Multiplied by/ })
  const values = async () => Promise.all((await rates().all()).map((box) => box.inputValue()))

  // P2: a rate on each part, then Remove on the first.
  await rates().nth(0).fill('0.5')
  await rates().nth(1).fill('0.25')
  check(JSON.stringify(await values()) === '["0.5","0.25"]', 'P2: the rates were not typed.')
  await page.getByRole('button', { name: 'Remove part 1' }).click()
  check(JSON.stringify(await values()) === '["0.25"]', `P2: after Remove the box shows ${JSON.stringify(await values())}, not the 0.25 used.`)
  await page.getByRole('button', { name: 'Add a part' }).click()
  check(JSON.stringify(await values()) === '["0.25",""]', `P2: after Add the boxes show ${JSON.stringify(await values())}.`)
  await rates().nth(1).fill('4.5%')
  check((await rates().nth(1).inputValue()) === '4.5%', 'P2: a box does not keep what is being typed.')
  await page.getByRole('button', { name: 'Remove part 1' }).click()
  check(JSON.stringify(await values()) === '["0.045"]', `P2: after Remove the box shows ${JSON.stringify(await values())}, not the 0.045 used.`)
  // A box with a mistake in it, then Remove: the mistake does not move to the next part.
  await page.getByRole('button', { name: 'Add a part' }).click()
  await rates().nth(0).fill('oops')
  await page.getByRole('button', { name: 'Remove part 1' }).click()
  check(JSON.stringify(await values()) === '[""]', `P2: a mistake stayed in the box after Remove: ${JSON.stringify(await values())}.`)
  await page.getByRole('button', { name: 'Undo the changes' }).click()
  await page.getByText('Unsaved changes').waitFor({ state: 'detached' })

  // P4: "round the total once" is a choice like any other, and stays when a part changes.
  await page.getByRole('button', { name: /^Cell F5/ }).click()
  const rounding = page.getByRole('combobox', { name: 'Rounding' })
  check((await rounding.inputValue()) === 'parts', 'P4: a calculation does not start part by part.')
  check((await page.getByRole('combobox', { name: 'Round this part first' }).count()) > 0, 'P4: "Round this part first" is not offered.')
  await rounding.selectOption('once')
  check((await page.getByRole('combobox', { name: 'Round this part first' }).count()) === 0, 'P4: a part can be rounded while the total is rounded once.')
  await rates().nth(0).fill('2')
  check((await rounding.inputValue()) === 'once', 'P4: changing a part lost "round the total once".')
  await page.getByRole('button', { name: 'Undo the changes' }).click()
  await page.getByText('Unsaved changes').waitFor({ state: 'detached' })

  // P8: a cell changed to Payroll column.
  await page.getByRole('button', { name: /^Cell G5/ }).click()
  await page.getByRole('combobox', { name: /^What goes in it/ }).selectOption('column')
  check((await page.getByRole('combobox', { name: 'Written as' }).inputValue()) === 'number', 'P8: a Payroll column does not start as a number.')
  check((await page.getByRole('combobox', { name: 'Rounded to' }).inputValue()) === '0', 'P8: a Payroll column does not start in whole rupees.')
  await page.getByRole('combobox', { name: /^What goes in it/ }).selectOption('identity')
  check((await page.getByRole('combobox', { name: 'Written as' }).inputValue()) === 'text', 'P8: an identity field does not start as text.')
} catch (error) {
  // Whatever was found before this stopped the check is still reported below.
  problems.push(`Stopped: ${String(error).split('\n')[0]}`)
} finally {
  await browser.close()
  await server.close()
}

if (problems.length > 0) {
  console.error(`check:fixes FAILED:\n  ${problems.join('\n  ')}`)
  process.exit(1)
}
console.log('check:fixes OK')
