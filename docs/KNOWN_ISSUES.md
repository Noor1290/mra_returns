# Known issues

Things found while building and deliberately not changed, each with evidence (fake data only).

## Double rounding of figures that end in .50

The saved run keeps 2 decimals. A figure stored as 562.50 may itself have been rounded up from 562.495 in Payroll System; rounding it again to whole rupees gives 563, while the full figure would give 562. The app cannot see the full figure, so it does not guess: it keeps the 2 decimals it is sent (the owner's choice, 27 Oct 2026) and lists, under each file on "Make the files", every value used in a cell rounded to whole rupees that ends in exactly .50, to be checked in Payroll System. Test: `tests/returnFile.test.ts`, "lists the values used in a rounded cell that end in exactly .50".

Not the same thing as "round each, then add", which the MRA files need on purpose: round(278.19) + round(556.38) = 278 + 556 = 834, while rounding the total 834.57 would give 835.

## The start date of employment came out empty for everyone (fixed 3 Nov 2026)

Found by the owner on the live site. The dashboard keeps the date per employee, whatever the payroll app called it, and sends it in every run's rows as "Date of Employment" (capital E), YYYY-MM-DD: from an identity field of type Date, from an older text column "Date of employment" (Payroll System sends it as YYYY-MM-DD), from the Data explorer, in a run sent before or after the date column. The template named it "Date of employment", as the company's column setup does and as the list offered it. A cell's field was looked up by its exact name, so nothing was found, and nothing said so. Now a field is found whatever the capitals and spaces, as the payroll app's payslips find it; a date is read as YYYY-MM-DD, YYYYMMDD or day first with "/", "-" or "."; a value that is there but cannot be read as a date or a number is listed before the download; and the dashboard lists the field as "Date of Employment". Tests: `tests/dateOfEmployment.test.ts`, `npm run check:fixes`, and in the hub `mraBatch.test.tsx`.

## The lists of a cell offered only "ID", or "Basic Salary" and "New Basic Salary" (fixed 3 Nov 2026)

Found by the owner on the live site. The lists were text boxes with suggestions (`<input list>` and a `<datalist>`), and a browser shows only the suggestions that contain what is already in the box: a cell holding "ID" offered only "ID", one holding "Basic Salary" only "Basic Salary" and "New Basic Salary". The suggestions themselves were a fixed sample list, with the keys of a fetched run added. They are now drop-down lists of the company's own fields, from the dashboard before any month is asked for (`mra-batch` `overview`; `src/lib/fields.ts`). Tests: `tests/fields.test.ts`, and in the browser `npm run check:fixes`.

## check:a11y failed about one run in three (fixed 1 Nov 2026)

`[light switched] fake sample: low contrast 2.58:1 "Light theme"` and `2.43:1 "Close the sample data"`. Not a real contrast problem: the check measured the colours during the 150 ms fade after the theme switch, seeing the old theme's grey on the new theme's background. Those two ghost buttons are what showed it. A browser starts a transition's clock only on its next frame, and a busy headless browser can be slow to draw one: at 100 ms a fade had `currentTime` 0, and at 300 ms one run had reached only 117 ms of it, so the fixed wait of 400 ms was no guarantee. The check now waits for every transition and animation that ends to finish (`settled`, `scripts/lib/a11y-page.mjs`).
