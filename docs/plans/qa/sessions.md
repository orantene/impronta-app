# QA — Sessions & Classes

New rows go here. Rows already in [`../phase-boundary-qa.md`](../phase-boundary-qa.md) stay valid
and were deliberately not moved — see [README](README.md).

## Note on the DST row

The shared list carries a Sessions row marked **"NOT HUMAN-QA-ABLE YET, and that is the finding"** —
the DST collision refusal names what it collided with, but only into `improntaLog`, with no operator
surface at all.

That marking is correct and should stay. It is the good version of a blocked row: it says plainly
that an operator whose class silently did not appear has nowhere to look, and it names the surface
that has to exist before it becomes a QA row rather than a log check. **Do not convert it into an
executable row by pointing it at the log.** Reading a structured log is not the thing the row is
trying to prove.

## New rows

| Do this | Proves | Falsified by |
|---|---|---|
