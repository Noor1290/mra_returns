// Proves the safety net is real: changes ONE value in the source, runs the tests, expects them
// to FAIL, and puts the file back exactly as it was. Every change below must be caught.
// Run: node scripts/prove-tests-can-fail.mjs
import { spawnSync } from 'node:child_process'
import { readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')

const changes = [
  ['An answer about another company is used', 'src/lib/hubWire.ts', 'if (expectedBrn !== null && normaliseBrn(brn) !== normaliseBrn(expectedBrn)) {', 'if (false) {'],
  ['An answer with no meta.brn is used', 'src/lib/hubWire.ts', "if (!brn) return { ok: false, failure: failure('no-company-brn') }", ''],
  ['A refusal code is mistaken for another', 'src/lib/hubWire.ts', "failure(isRefusalCode(refusal.data.code) ? refusal.data.code : 'no-answer', hubError)", "failure(isRefusalCode(refusal.data.code) ? 'invalid' : 'no-answer', hubError)"],
  ['A request waits forever for the dashboard', 'src/lib/hubWire.ts', 'const timer = setTimeout(() => resolve(NO_ANSWER), ms)', 'const timer = setTimeout(() => {}, ms)'],
  ['A request no longer names the selected company', 'src/lib/hubWire.ts', 'params: expectedBrn === null ? params : { ...params, brn: expectedBrn }', 'params'],
  ['The companies answer may mark another company as selected', 'src/lib/runStore.ts', 'if (selected.length > 1 || (selected.length === 1 && normaliseBrn(selected[0].brn) !== normaliseBrn(answer.company.brn))) {', 'if (false) {'],
  ['An ask may name no company, or more than 200', 'src/lib/runStore.ts', 'if (chosen.length === 0 || chosen.length > ASK_MAX_COMPANIES)', 'if (false)'],
  ['An answer to the question for another month is used', 'src/lib/runStore.ts', 'if (answer.period !== period)', 'if (false)'],
  ['A saved run of another company is used', 'src/lib/runStore.ts', 'normaliseBrn(run.brn) !== normaliseBrn(companyBrn) || ', ''],
  ['A saved run of another month is used', 'src/lib/runStore.ts', ' || run.period !== period', ''],
  ['"No run" with employees in it is used', 'src/lib/runStore.ts', '.refine((row) => row.run || row.employees.length === 0)', '.refine(() => true)'],
  ['The default month is this month, not the last', 'src/lib/dates.ts', 'return recentMonths(now, 2)[1]', 'return recentMonths(now, 2)[0]'],
  ['The copied bridge trusts another origin', 'src/payrollHubBridge.js', 'var HUB_ORIGIN = "https://noor1290.github.io";', 'var HUB_ORIGIN = "http://localhost:5176";'],
  ['The fake sample gets an ID that looks real', 'src/data/demoRun.ts', "employee('X0000000000001'", "employee('A1234567890123'"],
]

function runTests() {
  const reportFile = join(tmpdir(), `mra-returns-proof-${process.pid}.json`)
  const result = spawnSync(process.execPath, ['node_modules/vitest/vitest.mjs', 'run', '--reporter=json', `--outputFile=${reportFile}`], {
    cwd: root,
    encoding: 'utf8',
  })
  let failed = 0
  let files = []
  try {
    const report = JSON.parse(readFileSync(reportFile, 'utf8'))
    failed = report.numFailedTests
    files = report.testResults
      .filter((file) => file.status === 'failed')
      .map((file) => file.name.split(/[\\/]tests[\\/]/)[1])
    rmSync(reportFile, { force: true })
  } catch {
    failed = -1
  }
  return { ok: result.status === 0, failed, files }
}

const baseline = runTests()
if (!baseline.ok) {
  console.error('The tests do not pass before any change. Fix that first.')
  process.exit(1)
}

// An optional word narrows the run to the changes whose name or file contains it:
//   node scripts/prove-tests-can-fail.mjs "saved run"
const only = process.argv[2]?.toLowerCase()
const chosen = only ? changes.filter(([name, file]) => name.toLowerCase().includes(only) || file.toLowerCase().includes(only)) : changes

let missed = 0
for (const [name, file, before, after] of chosen) {
  const path = resolve(root, file)
  const original = readFileSync(path, 'utf8')
  if (original.split(before).length !== 2) {
    console.error(`SKIPPED  ${name}: "${before}" was not found exactly once in ${file}`)
    missed++
    continue
  }
  writeFileSync(path, original.replace(before, after))
  let result
  try {
    result = runTests()
  } finally {
    writeFileSync(path, original)
  }
  if (result.ok) {
    missed++
    console.error(`NOT CAUGHT  ${name}`)
  } else {
    console.log(`caught  ${name}  (${result.failed} failing in ${result.files.join(', ')})`)
  }
}

const after = runTests()
if (!after.ok) {
  console.error('The tests fail after restoring the files. Check the working tree.')
  process.exit(1)
}
if (missed > 0) {
  console.error(`\n${missed} of ${chosen.length} changes were not caught.`)
  process.exit(1)
}
console.log(`\nAll ${chosen.length} one-value changes made the tests fail, and every file was restored.`)
