# Agent build report — template

Every build wave ends with a report in this format. The integrator audits each
claim against `origin/main` and the live database, so precision costs you
nothing and vagueness costs a round trip.

Title it: `<PROGRAM> <WAVE> — BUILD REPORT`.

---

## 1. Per-PR table

| PR | Link | Merged | Gates (real exit codes) | Scope |
|---|---|---|---|---|
| … | #… | Y/N | `tsc 0, lint 0, test:x 0 (N pass)`, CI structural pass | one line |

Report the exit code of the command itself, never of a pipe or a trailing
`echo`. If a gate did not complete (hang, SIGTERM, unknown exit), say exactly
that — do not round it up to a pass.

## 2. Migrations + db:check
File names, whether `db:push` ran BEFORE the merge, and the `db:check` N/N with
its exit code. "None this wave" is a complete answer.

## 3. Deviations
Every place you departed from the work order, and why. Combining PRs, renaming
a file, choosing a different location — all of it. A deviation reported is a
decision; a deviation discovered later is a defect.

## 4. Bugs found
Pre-existing and introduced, each with status (fixed / filed / unfixed) and,
for anything unfixed, what a user would experience.

## 5. NOT DONE — re-verified against `origin/main`
**The most valuable section of the report.** State plainly what you did not do:
scope you were told to skip, work you could not finish, and paths you never
exercised.

Every line here must be RE-VERIFIED against the code on main — with the grep or
file read that proves it — never copied from a plan's open-findings list. A
report that copied a stale list once listed five already-fixed items as open and
nearly triggered a wave of redone work. Being wrong in the cautious direction
still costs a wave.

## 6. Evidence
Per item: what you ran, and what you saw. Paste real output for anything
surprising. Write **"not clicked"** for any UI path you did not exercise —
never imply coverage you do not have. If `qa:appointments` (or another harness)
proved something over HTTP, say so and quote the output; that is not "not
clicked", that is verified without a browser.

## 7. Open questions
Only the ones that genuinely need the owner. A question you can answer by
reading code is not an open question.

---

**Honesty rules**
- Report failures with their output. No "should work".
- Merged is not done. Green CI is not a working feature.
- Never sum per-dimension progress into an inflated total.
- If you are unsure whether something works, that IS the finding — write it.
