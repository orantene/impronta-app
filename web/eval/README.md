# AI page-builder eval — the baseline protocol

Run everything from `web/`. The live-model runs need `ANTHROPIC_API_KEY` in
`web/.env.local`; without it `eval:generate` exits 2 immediately and writes
nothing (there is no keyless fallback, deliberately — a fabricated baseline is
worse than none).

| File | What it is |
|---|---|
| `generate-brief-set.json` | The graded briefs. Schema: `generate-brief-set.schema.json`. |
| `generate-baseline-summary.json` | The frozen aggregates the regression gate compares against. |
| `generate-runs/<timestamp>/` | Per-run output: one tree per case + `summary.json`. Not committed. |

## The three commands

```bash
# 1. Measure. Writes eval/generate-runs/<ts>/{<case>.json,summary.json}.
npm run eval:generate

#    With the LLM judge (one extra Opus call per case, populates mean_judge):
npm run eval:generate-judge

# 2. Freeze the current numbers as the baseline.
npm run eval:generate-baseline

# 3. Gate a change against the frozen baseline (exit 1 on a >3 point drop).
npm run eval:generate-gate
```

`eval:generate-baseline` and `eval:generate-gate` are thin wrappers over
`scripts/eval-generate.ts` with `--judge --write-baseline=` /
`--judge --compare-baseline=` pointed at `eval/generate-baseline-summary.json`.
Every flag the script takes is documented in its file header.

## Before and after a prompt or vocabulary change

`mean_score` is only comparable across the SAME case set, so a change that adds
cases must be measured twice:

```bash
# BEFORE — the pre-change case set only, so the numbers line up with the
# committed baseline. Compare the printed mean_score to
# generate-baseline-summary.json by hand; do not overwrite it.
npm run eval:generate-judge -- --only=agency-homepage,single-hero,faq-booking,pricing-tiers,contact-form,services-grid,testimonial,es-agency,minimal-3-word,detailed-400char,hostile-injection,off-domain,colored-band,photo-gallery,about-founder,closing-cta-only,long-homepage-truncation,es-services-grid

# AFTER — the full current set, once the change is in. This becomes the new
# committed baseline.
npm run eval:generate-baseline
```

## Baseline status

The committed baseline (`cases_total: 18`, `mean_score: 89.28`,
`mean_judge: 4.51`) was frozen from a real keyed run on **2026-07-08**
(commit `5dd0156cc`). It is the last keyed measurement of this generator.

It is **stale as of the WS7 native-data-vocabulary change**: that change added
`hero_search` + `talent_type_grid` to `GENERATION_ALLOWED_KINDS`, added a
few-shot exemplar and two prompt rules, and grew the brief set from 18 to 21
cases. Re-run `npm run eval:generate-baseline` on a keyed machine to re-arm the
gate against the current vocabulary. Until then `eval:generate-gate` compares
against a case set that no longer exists and its verdict is not meaningful.

The keyless half of the harness (scorecard unit tests, expectation grader,
judge-parsing tests) runs in CI as `npm run eval:generate-smoke` and is
unaffected.
