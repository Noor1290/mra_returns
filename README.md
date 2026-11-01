# MRA Returns

One of the apps in Payroll Hub. It makes the monthly return files a company uploads to the MRA portal: the CSG file (MRA "PACO": CSG and NSF) and the PRGF file, from the payroll runs saved in the dashboard. Everything runs in the browser; the files are made in memory and never stored.

Inside the Payroll Hub dashboard it reads a month's saved run through the bridge (`mra-batch`, see `docs/INTEGRATION.md` in the payroll_hub repo): the dashboard lists only the companies the user is an admin of, asks its user once (with the password gate open) for the month and the companies, then sends one company at a time. A month must have been sent to the dashboard from Payroll System first; the app says so when it has not. Opened on its own, it can only show fake sample data.

## How it works

- **Templates** are kept in the dashboard (data type `mra-template`, admins only), so they work on any laptop, with History and Restore. Upload the CSV file from the MRA portal (or an Excel .xlsx copy) once; say what each row is (copied exactly, the employer row, the employee row, or an example row that is left out and never saved); then click a cell, or a column letter for the employee row, and say what goes in it. The preview uses the saved run that was fetched (or the fake sample).
- **What a cell can hold**: a fixed value (for all companies, or this company only, which then applies), a company detail (name, BRN, address, ERN, telephone, mobile, name of declarant, the user's own email), an identity field, a payroll column, the month, a small calculation, a mapping from text to a code (capitals and spaces ignored, with a default), or nothing.
- **A small calculation** is stored as data, never as code: up to a fixed number of parts, each "add or subtract" a payroll column, another cell or a number, optionally multiplied by a rate, optionally rounded on its own first (whole rupees or 2 decimals, half up). Or, with "Add the exact values, round the total once", the parts are added as they are, other cells before their own rounding, and only the total is rounded. It is worked out with exact decimals (`src/lib/decimal.ts`, BigInt), never with floating point or eval. Loops and cells that refer to themselves are refused.
- **How a cell is written**: text (capitals on or off, trim and collapse spaces), a number (whole rupees or 2 decimals, half up, no thousands separators, optional width with leading zeros) or a date from a pattern (YYYY, YY, MM, DD, MONTH: YYMM for the tax period, YYYYMMDD for the start date). A cell with no value is empty for text and 0 for a number.
- **File settings** per template: encoding (Windows-1252 as the MRA files, UTF-8 with or without a byte-order mark), CRLF or LF, comma or semicolon, quotes (never / when needed / always), padding every line to the full width, the file name pattern, and the column that decides "no pay that month" (those employees are left out).
- **Company details** for the returns (ERN, telephone, mobile, name of declarant) are kept per company in the dashboard and edited in its Company profile, admins only. The email is one value per signed-in user.
- **Make the files** (one company): the files for the fetched month, with the name pattern (default like `CSG AUGUST 2026 ABC CO LTD.csv`), always a real .csv file. The screen says not to open and re-save it in Excel before uploading.
- **Before a download**, one file or the zip, nothing goes out until these are answered:
  - A value the file cannot hold (a character the encoding has no byte for; a separator, quote or line break when quotes are "never") is listed by company, employee name and ID, and column. **Go back** corrects it in Payroll System; **Fix in this file only** writes a comma as a space and a character as its plain letter, shown beside each one ("Paul, Jr" becomes "Paul Jr"), and changes the file only, never the payroll. A character with no plain letter leaves only Go back.
  - A cell marked Required that comes out empty is listed: fill it in, or export anyway. "MRA details missing" also covers Required cells only: a detail that is not Required never warns.
  - A line whose rounded parts do not add up to the total is listed, here and in Report.txt.
  - A month not approved in the dashboard is said on the screen and in Report.txt, and never stops anything.
- **Double rounding**: the saved run keeps 2 decimals, so a figure such as 562.50 may itself have been rounded up from 562.495. Rounding it again to whole rupees then gives 1 rupee more than rounding the full figure would. The app cannot know the full figure, so it lists every employee value used in a cell rounded to whole rupees that ends in exactly .50, to be checked in Payroll System if it matters. Example (fake): round(278.19) + round(556.38) = 278 + 556 = 834, while rounding the total 834.57 would give 835.

## Setting up the PRGF file

The file must agree with itself, also when pay has cents: the total is the exact sum of its parts, rounded once, and the contribution is worked out from that total as it stands in the line.

| Cell | What goes in it | How it is written |
|---|---|---|
| G5, H5, I5 (basic, allowances, commission) | Payroll column or fixed value | Number, whole rupees |
| J5 (Total Remuneration) | A small calculation: G5 + H5 + I5, each "Another cell", with Rounding set to **Add the exact values, round the total once** | Number, whole rupees |
| K5 (PRGF Contribution Amount) | A small calculation: one part, "Another cell" J5, multiplied by 0.045, Rounding left at **Part by part** | Number, whole rupees |

So 18,099.90 gives a total of 18,100 and a contribution of 815, and 20,000.50 + 1,000.50 gives 21,001 (fake figures). K5 reads J5 as written, rounded, on purpose. In the second example the parts in the line show 20,001 and 1,001, which make 21,002: such a line is listed before the download and in Report.txt, so it can be checked before uploading.

- Look and feel: [docs/DESIGN_SYSTEM.md](docs/DESIGN_SYSTEM.md)
- Things found and not changed: [docs/KNOWN_ISSUES.md](docs/KNOWN_ISSUES.md)
- `src/payrollHubBridge.js` is the hub's `docs/bridge.js`, copied unchanged (a test checks it).

Fake data only: the company is ABC Co Ltd, and no name, ID or figure in this repo belongs to a real person. Real return files and payrolls stay outside every repository.

## Stages

- [x] Stage 0: the skeleton: build, checks, deploy workflow, bridge, its tab in the dashboard, reading a saved run.
- [x] Stage 1: templates in the dashboard, the grid, cell sources, formats, company details, one-company export.
- [ ] Stage 2: required-field alerts, all companies in one zip, the report.

## Run it

```
npm install
npm run dev        # http://localhost:5177/mra_returns/
```

Then press "Try with fake sample data". Inside the dashboard it only works from the deployed dashboard (the bridge trusts https://noor1290.github.io only); locally, `npm run check:bridge` puts the built app in a fake dashboard frame.

## Checks

| Command | What it checks |
|---|---|
| `npm test` | The return files of a fake company byte for byte (Windows-1252, CRLF, padding, the headings' trailing spaces, leading zeros, YYMM, YYYYMMDD, Y/N, capitals, half up, round each then add, own vs shared values, no pay left out, .50 notes), the formats, the CSV and .xlsx readers, the upload, the template requests; `tests/samples.test.ts` also compares with the owner's real samples when they are on this laptop (`..\MRA_SAMPLES`, never in the repo) and is skipped otherwise. Also the copied bridge (identical to the hub's, ready, refuses data sent to it, exact origin, no storage), and the saved-run requests against a stand-in dashboard (`scripts/lib/fake-hub.mjs`): companies, one question, one load per company, a month never sent, every refusal, answers about another company or month |
| `node scripts/prove-tests-can-fail.mjs` | Changes one value at a time and expects the tests to fail |
| `npm run check:encoding` | No mojibake, no changed non-ASCII character |
| `npm run lint` and `npm run typecheck` | Lint and TypeScript strict |
| `npm run build` then `npm run check:build` | No outside request in the build or while using it, no eval, nothing in browser storage |
| `npm run check:bridge` | Inside a (fake) dashboard frame with the real bridge file: connects, reads a saved run with one question and one load, a month never sent, a template uploaded, set up, saved without its example rows, the "can't be undone" question, the file downloaded byte for byte, declined / locked / no answer, a member is told only admins make returns, exact origin, nothing stored. Set `MRA_SHOTS` to a folder to keep screenshots |
| `npm run check:a11y` | Names on controls, focus ring, contrast in both themes, reduced motion; every screen and dialog of the files and templates (`scripts/lib/template-walk.mjs`) |
| `npm run check:fixes` | In the browser: a value the file cannot hold stops the download until the user chooses, the file holds the fix, the dialog is inside the window; a calculation's boxes show the values used after Remove and Add; "round the total once"; a new Payroll column cell; a month not approved |
| `npm run check:text` | Every text on every screen and state is on the approved list (`tests/textCheck/approved.json`); `--list` prints them all |
| `npm run check` | All of the above except the proof, in order |

## Deploy

`.github/workflows/deploy.yml` builds and publishes to GitHub Pages on a push to `main` (https://noor1290.github.io/mra_returns/). The owner pushes; nothing here pushes.
