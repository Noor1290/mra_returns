# Known issues

Things found while building and deliberately not changed, each with evidence (fake data only).

## Double rounding of figures that end in .50

The saved run keeps 2 decimals. A figure stored as 562.50 may itself have been rounded up from 562.495 in Payroll System; rounding it again to whole rupees gives 563, while the full figure would give 562. The app cannot see the full figure, so it does not guess: it keeps the 2 decimals it is sent (the owner's choice, 27 Oct 2026) and lists, under each file on "Make the files", every value used in a cell rounded to whole rupees that ends in exactly .50, to be checked in Payroll System. Test: `tests/returnFile.test.ts`, "lists the values used in a rounded cell that end in exactly .50".

Not the same thing as "round each, then add", which the MRA files need on purpose: round(278.19) + round(556.38) = 278 + 556 = 834, while rounding the total 834.57 would give 835.

## check:a11y sometimes fails on the light theme

`[light switched] fake sample: low contrast 2.58:1 "Light theme"` and `2.43:1 "Close the sample data"` appear in about one run in three, with no change in between (1 Nov 2026; also seen once on 29 Oct). The same two buttons pass on the next run, so it looks like the colours being measured during the 150 ms transition after the switch, not a real contrast problem. Not proved, and the check was left as it is.
