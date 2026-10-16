# Live-QA pack run, 2026-10-10 (pack-pm105)

Committed for TUL-636 ("report not in repo"). Copied unchanged from the Cursor
agent store that ran it (worker bc-d8d81011, store bc-0e7659c6), because it
existed nowhere else.

- Run: 2026-10-10 07:09-08:30 UTC, tip `ad8357e0c` (#3237 TUL-518), isolated
  fxlank stack (no production data).
- Result: 7 PASS / 18 FAIL / 12 SKIP, see `pack-run-results.md`.
- `media/`: 68 screenshots + Playwright `results.json` (was `media/live-qa/pack-pm105/`).

Checked before commit: no keys, tokens, passwords or email addresses (the report
names two env vars, not values); no screenshots of a real talent.
