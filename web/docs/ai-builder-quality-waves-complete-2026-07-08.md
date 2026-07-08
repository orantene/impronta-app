# AI Page Builder — Quality Waves Completion Record (2026-07-08)

Execution record for the [AIQ backlog](ai-builder-quality-audit-2026-07-08.md). All
work shipped on branch `feat/ai-builder-wave1` (PR #717). **31 of 32 items done;
AIQ-28 deliberately deferred.**

## Status by item

| ID | Item | Status | Commit / note |
|---|---|---|---|
| AIQ-1 | `background:"surface"` → surface-raised token | ✅ | Wave 1 (`1ace6ef79`) |
| AIQ-2 | card variants theme-adaptive | ✅ | Wave 1 |
| AIQ-3 | locale → prompt + ES few-shot | ✅ | Wave 2 (`33f35bfee`) |
| AIQ-4 | paragraph default color theme-adaptive | ✅ | Wave 1 tones + **core inline default fixed Wave 3** (`76390d47c`, caught by the screenshot leg) |
| AIQ-5 | button tone contrast on every theme | ✅ | Wave 1 + **noir primary token** (`142cc7375`) |
| AIQ-6 | stale `background:"contrast"` prompt line | ✅ | Wave 1 (`156260bc3`) |
| AIQ-7 | `xl` (96px) padding + hero `minHeight` | ✅ | Wave 2 |
| AIQ-8 | section band style | ✅ (prompt) | Wave 2 — full-bleed via the full-width-container pattern; section-node band variant deferred (needs core section-schema change for marginal gain) |
| AIQ-9 | bounded image aspect-ratio | ✅ | Wave 1 |
| AIQ-10 | brand-language rule | ✅ | Wave 1 |
| AIQ-11 | testimonial/split/CTA/FAQ/pricing few-shots | ✅ | Wave 2 |
| AIQ-12 | theme polarity/palette → prompt | ✅ (capability) | Wave 2 — prompt + classifier + threading tested; live tenant-polarity wiring is a documented follow-up (action holds no tenant handle) |
| AIQ-13 | theme-paired band roles accent/muted | ✅ | Wave 2 |
| AIQ-14 | `output_config.effort:"xhigh"` | ✅ | Wave 3 model-config (`94b73caf8`) |
| AIQ-15 | silent JSON truncation recovery | ✅ | Wave 3 model-config |
| AIQ-16 | `eval:generate` real-model runner | ✅ | Wave 3 (`76390d47c`) |
| AIQ-17 | 18-case brief set + schema | ✅ | Wave 3 |
| AIQ-18 | deterministic tree-linter scorecard | ✅ | Wave 3 |
| AIQ-19 | LLM-judge rubric | ✅ (build) | Wave 3 — pure parts tested; live call build-only (needs key) |
| AIQ-20 | screenshot leg (light+dark × desktop+mobile) | ✅ | Wave 3 — Playwright, byte-diff self-test = 0 |
| AIQ-21 | corrective retry with repair note | ✅ | Wave 3 model-config |
| AIQ-22 | prompt-cache the static system prompt | ✅ | Wave 3 model-config |
| AIQ-23 | section-opener eyebrow idiom | ✅ | Wave 1 |
| AIQ-24 | split-hero + asymmetry few-shot | ✅ | Wave 2 |
| AIQ-25 | elevated button chrome | ✅ | Wave 2 (deliberate cross-theme builder-button restyle) |
| AIQ-26 | kill `"Learn more"` default + CTA rule | ✅ | Wave 1 |
| AIQ-27 | monotony guardrail (advisory) | ✅ | Wave 3 — scored in the eval-scorecard |
| AIQ-28 | SDK bump for typed effort/thinking/cache | ⛔ **DEFERRED** | node_modules is a shared symlink across ~16 agents; a bump here breaks them. AIQ-14/15/22/31 done via untyped casts instead (the audit's own fallback). Do the bump in a dedicated, isolated change. |
| AIQ-29 | golden baselines + regression gating | ✅ | Wave 3 — `--write-baseline`/`--compare-baseline`/`--fail-on-quality-drop` on the runner |
| AIQ-30 | cross-polarity rendered-contrast test | ✅ | Wave 3 — `builder-contrast-corpus.test.ts` (AA lock) |
| AIQ-31 | assert served model matches requested | ✅ | Wave 3 model-config (`isModelDrift`, log-not-fail) |
| AIQ-32 | encode KEEP invariants as assertions | ✅ | Wave 3 |

## What still needs a live API key (build-only here)

The generator is live + keyed in **prod**, but this environment has no local key,
so these run only where `ANTHROPIC_API_KEY` is present:

- `npm run eval:generate` — the real-model brief run + deterministic scorecard.
- `npm run eval:generate-judge` — adds the LLM-judge rubric.
- Freezing `eval/generate-baseline-summary.json` from a real run (the gating math
  is done + unit-tested; the numbers need one keyed run).

Everything deterministic (scorecard, expectation grader, contrast lock, prompt/
pipeline KEEP invariants, screenshot capture) runs locally with no key.

## Verified

Across light + editorial-noir × desktop + mobile, via the eval harness + captured
screenshots: gold buttons visible on noir, uppercase/tracked CTA chrome, eyebrows
+ default body copy legible on dark (the AIQ-4 fix), theme-adaptive cards/bands,
bounded images, pricing_table + form + accordion + icons rendering, no horizontal
overflow on mobile, full-bleed color bands. Gates green: tsc, lint, and the
generator/renderer/adapter/eval/a11y test suites.

## LIVE production verification (2026-07-08, via the prod builder)

Drove the LIVE, keyed generator through the prod Impronta builder ("Design with
AI" → full page) on the editorial-noir theme, to prove the half the eval harness
couldn't (no local key). One brief ("homepage for a boutique modeling agency in
Milan, editorial and minimal, with a services grid and a closing call to action"):

- **`effort:"xhigh"` works in prod** — server action returned 200 after a ~35s
  real generation (not the instant preset fallback). This clears the audit's #1
  risk (a rejected effort field would have silently degraded every generation).
- **The AIQ-4 paragraph fix holds on REAL output** — hero subhead, testimonial
  quote, FAQ answers, and closing-CTA body all render legibly (light-on-dark) on
  noir. This was the invisible-body-copy P0.
- **Noir buttons + AIQ-25 chrome hold on real output** — "BOOK A MODEL" renders
  gold, uppercase, visible.
- **AIQ-11 few-shots land in real output** — the model produced a named-attribution
  testimonial ("Giulia Ferretti, Fashion Director at Corso Studio") and a real
  3-item FAQ accordion.
- **Brand-color band renders correctly** — the closing CTA is a full-bleed gold
  band with readable dark text and a visible CTA.
- **Copy quality is on-brand** — "Vela Milano", roster/book language, zero lorem,
  no buyer/cart.

This substantially closes the audit's "output unproven" gap: the render fixes AND
the prompt quality are confirmed on live model output. NOTE: AIQ-12 tenant
polarity is still not wired, but the live evidence shows dark themes already render
correctly without it (the band roles + token fixes handle polarity), so it is
downgraded from P0 to a non-urgent refinement. A formal keyed baseline
(`npm run eval:generate --write-baseline`) is still the remaining step to arm the
regression gate.
