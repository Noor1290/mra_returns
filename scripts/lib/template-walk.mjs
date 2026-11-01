// Walks the app opened on its own, with the fake sample, through every screen and dialog of the
// files and templates (FAKE data only), and calls visit(name) in each state. Used by the text
// check (to record the texts) and the accessibility check (names and contrast). Gives back the
// zip of the fake companies it downloaded.
import { FAKE_CSG_UPLOAD } from './fake-upload.mjs'

export async function walkTemplates(page, visit) {
  let zip = null
  const what = () => page.getByRole('combobox', { name: /^What goes in it/ })
  const openTemplate = async (name) => {
    await page.getByRole('button', { name: new RegExp(`^${name}`) }).click()
    await page.getByTestId('template-editor').waitFor()
    // Another template may still be open: wait until this one is loaded.
    const box = page.getByRole('textbox', { name: 'Template name' })
    while (!(await box.inputValue()).startsWith(name)) await page.waitForTimeout(50)
  }
  const status = async (text) => page.getByRole('status').filter({ hasText: text }).waitFor()
  // Undo reloads the saved template; wait until it is back.
  const undo = async () => {
    await page.getByRole('button', { name: 'Undo the changes' }).click()
    await page.getByText('Unsaved changes').waitFor({ state: 'detached' })
  }

  // Make the files: both files, the .50 notes open, then downloaded.
  await page.getByTestId('export-file').first().waitFor()
  const notes = page.getByTestId('half-notes')
  if ((await notes.count()) > 0) await notes.first().locator('summary').click()
  await visit('files')
  await page.getByRole('checkbox').first().uncheck()
  await visit('files: one ticked')
  await page.getByRole('checkbox').first().check()
  await Promise.all([page.waitForEvent('download'), page.waitForEvent('download'), page.getByRole('button', { name: /^Download 2 files/ }).click()])
  await page.getByTestId('downloaded').waitFor()
  await visit('files: downloaded')

  // Several companies at once (fake companies): the choices, the progress, the report with its
  // required values, MRA details missing and .50 list, the question before the zip, the zip.
  const batch = page.getByTestId('batch')
  await batch.getByRole('button', { name: 'Make the zip' }).waitFor()
  await visit('batch: the choices')
  await batch.getByLabel('Search companies').fill('no such company')
  await visit('batch: no company matches')
  await batch.getByLabel('Search companies').fill('')
  await batch.getByRole('button', { name: 'Clear' }).click()
  await visit('batch: none chosen')
  await batch.getByRole('button', { name: 'Select all' }).click()
  await batch.getByRole('button', { name: 'Make the zip' }).click()
  await batch.getByTestId('batch-progress').waitFor()
  await visit('batch: progress')
  await batch.getByTestId('batch-report').waitFor()
  for (const summary of await batch.getByTestId('batch-half-notes').locator('summary').all()) await summary.click()
  for (const summary of await batch.getByTestId('batch-sum-notes').locator('summary').all()) await summary.click()
  await visit('batch: report')
  await batch.getByRole('button', { name: 'Download the zip' }).click()
  await page.getByTestId('unwritable-dialog').waitFor()
  await visit('dialog: values that cannot be written')
  await page.getByRole('button', { name: 'Go back' }).click()
  await batch.getByRole('button', { name: 'Download the zip' }).click()
  await page.getByRole('button', { name: 'Fix in this file only' }).click()
  await page.getByTestId('required-dialog').waitFor()
  await page.getByTestId('sums-dialog').waitFor()
  await visit('dialog: required values')
  await page.getByRole('button', { name: 'Go back' }).click()
  await batch.getByRole('button', { name: 'Download the zip' }).click()
  await page.getByRole('button', { name: 'Fix in this file only' }).click()
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Export anyway' }).click()])
  zip = download
  await batch.getByTestId('batch-downloaded').waitFor()
  await visit('batch: downloaded')

  // Templates: the list, then a template with no cell chosen.
  await page.getByRole('tab', { name: 'Templates' }).click()
  await page.getByRole('list', { name: 'Templates of this company' }).waitFor()
  await visit('templates')
  await openTemplate('MRA CSG')
  await page.getByTestId('no-cell').waitFor()
  await visit('template: no cell chosen')

  // An employee cell, with every kind of content, and every way of writing it.
  await page.getByRole('button', { name: /^Cell J5/ }).click()
  await visit('cell: a calculation')
  const part = page.getByTestId('calc-part').first()
  await part.getByRole('combobox', { name: 'What' }).selectOption('cell')
  await visit('cell: a calculation of another cell')
  await part.getByRole('combobox', { name: 'What' }).selectOption('number')
  await visit('cell: a calculation with a number')
  await page.getByRole('combobox', { name: 'Rounding' }).selectOption('once')
  await visit('cell: a calculation, rounded once')
  await page.getByRole('combobox', { name: 'Rounding' }).selectOption('parts')
  for (const choice of ['empty', 'fixed', 'company', 'identity', 'column', 'month', 'map']) {
    await what().selectOption(choice)
    await visit(`cell: ${choice}`)
  }
  await what().selectOption('fixed')
  await page.getByRole('checkbox', { name: /has its own value$/ }).check()
  await visit('cell: fixed, own value')
  await what().selectOption('company')
  await page.getByRole('combobox', { name: /^Detail/ }).selectOption('email')
  await visit('cell: company email')
  await what().selectOption('column')
  for (const type of ['text', 'date', 'number']) {
    await page.getByRole('combobox', { name: 'Written as' }).selectOption(type)
    await visit(`cell: written as ${type}`)
  }
  await page.getByRole('checkbox', { name: 'Required' }).check()
  await page.getByRole('checkbox', { name: '0 counts as missing' }).check()
  await visit('cell: required, a number')
  await undo()
  // An employer cell: its own words for Required.
  await page.getByRole('button', { name: /^Cell A3/ }).click()
  await visit('cell: required, the employer row')

  // Saved, then the history and a version restored.
  await page.getByRole('textbox', { name: 'Template name' }).fill('MRA CSG (PACO) copy')
  await visit('template: unsaved')
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  await status('Saved')
  await visit('template: saved')
  await page.getByRole('button', { name: 'History' }).click()
  await page.getByTestId('history').waitFor()
  await visit('dialog: history')
  await page.getByRole('button', { name: 'Restore this version' }).click()
  await status('Version 1')
  await visit('template: version restored')
  await undo()

  // Used in a second company, then removing it from this one (the others keep it).
  await page.getByRole('button', { name: 'Also use it in' }).click()
  await page.getByRole('checkbox', { name: 'DEF Ltd' }).waitFor()
  await visit('dialog: also use it in')
  await page.getByRole('checkbox', { name: 'DEF Ltd' }).check()
  await page.getByRole('button', { name: 'Use it in the ticked companies' }).click()
  await status('Now also used by')
  await visit('template: used by 2 companies')
  await page.getByRole('button', { name: 'Remove from this company' }).click()
  await page.getByTestId('remove-text').waitFor()
  await visit('dialog: remove, others keep it')
  await page.getByRole('button', { name: 'Cancel' }).click()
  await page.getByRole('button', { name: 'Also use it in' }).click()
  await page.getByText('Every company where you are an admin already uses it.').waitFor()
  await visit('dialog: also use it in, none left')
  await page.getByRole('button', { name: 'Cancel' }).click()

  // The last company: deleting it, which cannot be undone.
  await openTemplate('MRA PRGF')
  await page.getByRole('button', { name: 'Remove from this company' }).click()
  await page.getByTestId('remove-text').waitFor()
  await visit('dialog: delete, the last company')
  await page.getByRole('button', { name: 'Delete the template' }).click()
  await status('was deleted')
  await visit('template: deleted')

  // An Excel file that is not one, then a real (fake) upload set up.
  await page.locator('#template-file').setInputFiles({ name: 'broken.xlsx', mimeType: 'application/octet-stream', buffer: Buffer.from('not an Excel file') })
  await page.getByTestId('failure').waitFor()
  await visit('upload: not readable')
  await page.locator('#template-file').setInputFiles({ name: 'CSG AUGUST 2026 (2).csv', mimeType: 'text/csv', buffer: FAKE_CSG_UPLOAD })
  await page.getByTestId('upload-rows').waitFor()
  await visit('upload: the rows')
  await page.getByRole('button', { name: 'Set up the cells' }).click()
  await page.getByTestId('template-editor').waitFor()
  await page.getByRole('button', { name: /^Cell A3/ }).click()
  await visit('upload: setting up the cells')
  // The zip of the fake companies, for a look inside it.
  return { zip }
}
