# Search evaluation set

Regression harness for hybrid / AI directory search. Used to compare **before vs after** merge or ranking changes.

## Location

- Fixture: [`eval/search-eval-set.json`](../eval/search-eval-set.json)
- Runner: `npm run eval:search` (from `web/`; requires `.env.local` with Supabase + OpenAI + service role as for local dev)

### CLI flags (stability + CI)

- `--write-summary` — writes `eval/last-search-eval-summary.json` (repo root) with sorted per-case metrics and means (repeatable artifact for diffs).
- `--write-summary=path` — custom output path.
- `--compare-baseline=path` — after the run, read a prior summary JSON; exit **1** if `mean_precision_at_k` drops more than `--fail-on-precision-drop` (default `0.05`) vs the baseline file.

Use the summary file as the team’s **documented baseline** when declaring search tuning “done” (see [post-revisions-roadmap.md](post-revisions-roadmap.md) §1).

## Methodology

1. Each case has a **normalized query** (`q`) and optional **taxonomy** / **location** matching public directory params.
2. **`expected_in_top_k`** lists talent profile UUIDs that should appear in the **first K** results (K = `k` on the case, default 10).
3. The runner calls `runAiDirectorySearch` with the same flags as production settings (read from DB) or override via env `EVAL_FORCE_FLAGS=1` + documented env toggles if added later.
4. Metrics per case:
   - **hits@K**: count of expected IDs found in top K
   - **precision@K**: hits / `expected_in_top_k`.length
   - **Jaccard@K**: |intersection(top K, expected)| / |union(top K, expected)| (set overlap)
   - **RR (first hit)**: 1/rank of the first expected id in the top-K list, if any
   - End-of-run **summary** line: mean precision / Jaccard / RR over cases that define expectations

## Refreshing the set

After seed or staging data changes, update UUIDs in the JSON from known-good profiles, or mark cases `skip: true` until curated.

## Interpreting deltas

- Small precision swings are normal with embedding noise; investigate large drops across many cases.
- Log deltas in [`docs/decision-log.md`](decision-log.md) when shipping merge weight changes.
