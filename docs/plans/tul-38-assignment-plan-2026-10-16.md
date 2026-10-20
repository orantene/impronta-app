# TUL-38: demo-to-theme assignment plan (pause lifted 2026-10-16)

Read from code on origin/main. Nothing here was run. Scripts that write are run by the Project Manager (dry run by default). Never TAL-93938 (Jorgelina) or TAL-93900 (test site).

## Where it stands (code)
- `theme-catalog/theme-demos.ts` (`THEME_DEMOS`, the gallery + `demos:rebuild` list) carries 24 demos across the 3 finished themes: maison-v2 7, folio 10 (6 model kinds plus bartender, portrait photographer, graphic designer, so the "Folio trade spread" gap is already closed in code), gridline 7. `ThemeDemoDesign` only allows those three designs.
- `scripts/demo-talents/unique-theme-map.ts` holds the curated one-showcase-per-theme set: slice 1 = five demos (maison-v2 Alba TAL-93020, folio Mateo TAL-93011, gridline Alex TAL-93030, solace Valeria TAL-93001, frame Tomás TAL-93009); slice 2 = mono, Pablo Serrano TAL-93010 (personal trainer, Puerto Vallarta, pack `pack-mono-pablo`).
- `scripts/demo-talents/assign-demo-themes.mts` (TUL-403) assigns every themeless seeded demo to its workbook theme, but only for FINISHED themes (`FINISHED_DESIGN_SLUGS` = the gallery's finished set minus Maison v1). A demo whose workbook theme is not finished is "queued until theme finished" and untouched. Per the plan of record (2026-10-08) that is the 196 themeless demos: they wait on their theme being finished, not on an assignment run.

## What the lifted pause unlocks, in order
1. **Slice 2 (mono, Pablo TAL-93010): ready now as a dry run.** The seed script already accepts `--slice 2` (`assertAllowedCode(code, 2)` allows slice-2 codes on the curated map; slice 1 keeps its own allow-list). PM runs, from `web/`:
   `NODE_PATH=scripts/demo-talents/stubs DEMO_SEED_TARGET_REF=<ref> npx tsx --env-file=.env.local scripts/demo-talents/unique-theme-seed.mts --slice 2` (dry run, zero writes), reads the plan and the stock-slot picks, then `--apply` (draft only, no publish, no `db:push`). Hard refusals stay: forbidden codes, non-`TAL-93xxx`, `is_demo` false, demo email/batch mismatch, a required stock slot that does not resolve.
   Gap to know before apply: mono is an unfinished theme (v1, no release rows, one open factory draft base 15 discarded 2026-10-14), so Pablo's draft wears an unreleased design.
2. **Finish themes, then assign.** New demo themes means finishing them in the Factory in wave order (wave 1 Maison, Index, Orbit; wave 2 Folio, Frame, Table, Tempo, Common, Stage; TUL-37). For each newly finished theme: add its slug to `FINISHED_DESIGN_SLUGS` (and the gallery's finished set, which a test keeps equal), rerun `assign-demo-themes.mts` dry run, then `--apply --yes` (draft only, JSON backup, `--restore` available), then one curated showcase demo for it in `unique-theme-map.ts` (next slice).
3. **Per-theme checklist** (from the plan of record): Spanish primary + English secondary with tú, no em dashes, platform stock images only, distinct composition (briefs say what must differ), language sweep, stock coverage per trade, finished-count aligned in code/tests/docs.

## Not done here
- No script was run and no theme was added or released. Releasing a theme is Factory work through Builder Lab, with the release steps in `docs/plans/theme-release-runbook-2026-10-15.md`.
- #3246 (TUL-532/550) changes the shared kit under maison-v2; its authored overlay hash must be regenerated in the release window before more demos are rebuilt on that design.
