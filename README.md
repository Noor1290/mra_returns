# MRA Returns

One of the apps in Payroll Hub. It makes the monthly return files a company uploads to the MRA portal: the CSG file (MRA "PACO": CSG and NSF) and the PRGF file, from the payroll runs saved in the dashboard. Everything runs in the browser; the files are made in memory and never stored.

Inside the Payroll Hub dashboard it reads a month's saved run through the bridge (`mra-batch`, see `docs/INTEGRATION.md` in the payroll_hub repo): the dashboard lists only the companies the user is an admin of, asks its user once (with the password gate open) for the month and the companies, then sends one company at a time. A month must have been sent to the dashboard from Payroll System first; the app says so when it has not. Opened on its own, it can only show fake sample data.

- Look and feel: [docs/DESIGN_SYSTEM.md](docs/DESIGN_SYSTEM.md)
- Things found and not changed: [docs/KNOWN_ISSUES.md](docs/KNOWN_ISSUES.md)
- `src/payrollHubBridge.js` is the hub's `docs/bridge.js`, copied unchanged (a test checks it).

Fake data only: the company is ABC Co Ltd, and no name, ID or figure in this repo belongs to a real person. Real return files and payrolls stay outside every repository.

## Stages

- [x] Stage 0: the skeleton: build, checks, deploy workflow, bridge, its tab in the dashboard, reading a saved run.
- [ ] Stage 1: templates in the dashboard, the grid, cell sources, formats, company details, one-company export.
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
| `npm test` | The copied bridge (identical to the hub's, ready, refuses data sent to it, exact origin, no storage), and the saved-run requests against a stand-in dashboard (`scripts/lib/fake-hub.mjs`): companies, one question, one load per company, a month never sent, every refusal, answers about another company or month |
| `node scripts/prove-tests-can-fail.mjs` | Changes one value at a time and expects the tests to fail |
| `npm run check:encoding` | No mojibake, no changed non-ASCII character |
| `npm run lint` and `npm run typecheck` | Lint and TypeScript strict |
| `npm run build` then `npm run check:build` | No outside request in the build or while using it, no eval, nothing in browser storage |
| `npm run check:bridge` | Inside a (fake) dashboard frame with the real bridge file: connects, reads a saved run with one question and one load, a month never sent, declined / locked / no answer, a member is told only admins make returns, exact origin, nothing stored. Set `MRA_SHOTS` to a folder to keep screenshots |
| `npm run check:a11y` | Names on controls, focus ring, contrast in both themes, reduced motion |
| `npm run check:text` | Every text on every screen and state is on the approved list (`tests/textCheck/approved.json`); `--list` prints them all |
| `npm run check` | All of the above except the proof, in order |

## Deploy

`.github/workflows/deploy.yml` builds and publishes to GitHub Pages on a push to `main` (https://noor1290.github.io/mra_returns/). The owner pushes; nothing here pushes.
