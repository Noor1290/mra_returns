# MRA Returns: project memory

A frontend-only app (React + Vite + TypeScript + Tailwind, GitHub Pages at https://noor1290.github.io/mra_returns/) that makes the MRA return files (CSG / PACO and PRGF) from the payroll runs saved in Payroll Hub. It is the fifth app of the hub and gets its data only through the postMessage bridge (`mra-batch`, payroll_hub docs/INTEGRATION.md). Owner's brief: `Payroll\MRA_RETURNS_PROMPT.md` (outside the repo). Look and feel: docs/DESIGN_SYSTEM.md. Model for structure, bridge use and checks: the payslip app.

## Hard rules
- The payroll figures are the product: use them exactly as the dashboard sends them. Rounding happens only where a template cell says so (half up), never silently.
- Frontend only. The app never talks to Supabase; everything goes through the hub, whose user must be signed in and an ADMIN of the company, with the password gate open for national IDs and pay.
- postMessage: only through the copied `src/payrollHubBridge.js` (never edit it; a test checks it is the hub's file). Validate every answer with Zod and check it is about the company and month asked for.
- Payroll data and the generated files live in memory only. Never in localStorage, sessionStorage, IndexedDB, URLs, logs or analytics. The files are never stored anywhere.
- The repo is PUBLIC: fake data only (ABC Co Ltd, invented names and IDs) in tests, samples, screenshots and docs. The owner's real samples stay in `Payroll\MRA_SAMPLES`, outside every repo.
- No requests to outside servers at runtime: fonts, icons and libraries are bundled. No eval, no new Function.
- Every new on-screen text is shown to the owner before it goes into tests/textCheck/approved.json.

## Working agreements
- Build ONE stage at a time; stop after each with a short plain-language report and screenshots.
- Ask before adding a package.
- Before every commit run `npm run check` and `node scripts/prove-tests-can-fail.mjs`.
- Findings that are not part of the task go in docs/KNOWN_ISSUES.md. Do not fix them unasked.
- Never push or merge; the owner does that.

## Status
- [x] Stage 0  - [ ] Stage 1  - [ ] Stage 2
