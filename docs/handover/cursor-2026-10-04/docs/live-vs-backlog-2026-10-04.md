---
cursor:
  subagentId: "bc-a71e4437-a2bc-56d3-b3ab-4bbbdd626829"
---

# Live vs backlog — 2026-10-04

Checked ~16:55Z. Read-only (git fetch + Vercel + GitHub + live HTML). No merge/promote.

## Verdict

**Production is caught up.** `origin/main` = `origin/production` = Live HTML tip `15e65e2d5091` on READY deploy `dpl_3QPTZnu8gzmQHDCD3ENVPq3ZNgV5`. All six Maison/front-chat merges (#2526–#2531) are on that tip. Remaining work is QA/prove, Oran secrets, and parked product gaps — not a deploy lag.

## LIVE now (SHA + deploy + what shipped)

| Signal | Value |
|---|---|
| `origin/main` | `15e65e2d50912df50b44912a652ba9812a115b07` |
| `origin/production` | **same SHA** (0 commits ahead/behind) |
| Vercel prod deploy | `dpl_3QPTZnu8gzmQHDCD3ENVPq3ZNgV5` · **READY** · target `production` · ref `production` · commit `15e65e2d5091` (#2530 message) |
| `tulala.digital` | alias → that deploy; HTML `data-dpl-id` + SHA match |
| `app.tulala.digital` | alias → that deploy; HTML match |
| `*.tulala.digital` wildcard | alias → that deploy (e.g. `book-jorgelina.tulala.digital` on tip) |
| Also on tip deploy | `www.tulala.digital`, `impronta.tulala.digital`, `improntamodels.com`, `elpaisa.tulala.digital`, `qa-stripe-r2.tulala.digital` |

**Maison / front-chat / demo merges — all LIVE on tip** (ancestors of `15e65e2d5091`):

| PR | Title | Merge commit | LIVE? |
|---|---|---|---|
| [#2526](https://github.com/orantene/impronta-app/pull/2526) | demo talent hosts use `-demo` suffix | `b54d2b803` | **yes** |
| [#2527](https://github.com/orantene/impronta-app/pull/2527) | language bar yields to service/chat dock | `7da888feb` | **yes** |
| [#2528](https://github.com/orantene/impronta-app/pull/2528) | Maison width / nail surface / Save look modal | `3e075bea2` | **yes** |
| [#2529](https://github.com/orantene/impronta-app/pull/2529) | standard dock Select → booking sheet | `e40200327` | **yes** |
| [#2530](https://github.com/orantene/impronta-app/pull/2530) | sticky chrome + Gridline/Folio width leftovers | `15e65e2d5` (tip) | **yes** |
| [#2531](https://github.com/orantene/impronta-app/pull/2531) | Save look image → front-door chat | `f70305561` | **yes** |

Also on tip since `2982c647` / last day: only those six commits. Prior tip `2982c647` = [#2525](https://github.com/orantene/impronta-app/pull/2525) (seller capture identity) — still an ancestor of LIVE.

**Note (not tip lag):** some QA-pool leases still point at older preview deploys (`qa-1`/`qa-2`/`jorg-beauty-qa`). Wildcard + apex/`app` are on tip. `maison-v2-demo.tulala.digital` returns 404 Host not registered while still serving tip HTML — host/seed gap for `-demo` suffix, not a missing deploy.

Board mirrors: STATUS #94 ✅ · scoreboard ✅ 7 / 🟡 62 · PM-BOARD tip READY.

## On main but not LIVE

**None.** `git rev-list --left-right --count origin/production...origin/main` → `0 0`.

No promote needed. Do not force-push or hand-advance `production`.

## Open PRs / in progress

| PR | State | CI | Blocked reason |
|---|---|---|---|
| [#2477](https://github.com/orantene/impronta-app/pull/2477) Support Desk Phase 0.5 mockups | **open draft** | Structural + Admin boot + Fidelity + Builder perf **green** (last run ~2026-10-03 20:25Z) | **Do not merge** per STATUS/PM-BOARD — design mockups only; `SUPPORT_DESK_ENABLED` stays as-is; not prod Desk UI |
| Classic lane [#2482](https://github.com/orantene/impronta-app/pull/2482) → [#2481](https://github.com/orantene/impronta-app/pull/2481) → [#2480](https://github.com/orantene/impronta-app/pull/2480) → [#2486](https://github.com/orantene/impronta-app/pull/2486) → [#2487](https://github.com/orantene/impronta-app/pull/2487) | **all MERGED** (2026-10-03) | n/a (already on tip) | Lane empty — code live; live fee/refund *prove* still open (see below) |

GitHub open-PR search: **only #2477**. No other draft/ready ship-critical PRs.

Portfolio (IDLE, no resume): wall #2490 / visual #2491 already MERGED on tip. Desk reuse owned by `bc-11e25be7` — do not steal.

## Blocked waiting on Oran

1. **`QA_JOR_CLONE_PASSWORD`** — S5/S7 (and related TAL-93900 live proves) cannot resume without clone login.
2. **Refunds E2E** — blocked on **Lavender Tunnel Stripe keys** matching Soft Gel/Linh PIs + **Linh login**; cloud VM secret is a different test acct (`docs/finish-line-2026-10-02/p2-payments-e2e.md`).
3. **Builder Lab Publish demos + `deploy:smoke`** — Oran-owed per coordinator `notes.md`; STATUS says do not re-nag. Full smoke exit 0 also needs Mac/env service-role (prior cloud run exit 1 on migration/taxonomy without decrypted key).
4. **`QA_FREE_PASSWORD`** (parked) — Free-persona drains that need that secret.
5. **`QA_PLATFORM_ADMIN_PASSWORD`** — Builder Lab Factory author/release (#64/#65) blocked.
6. **#45 fee-line $101.50** parked ❌ — Soft Gel PAID / Guardar smoke do **not** clear it (D15).
7. **Stripe support email** (#83) — Oran Dashboard clicks US+MX.
8. **Custom-domain registrar buy** (#60) — owner-parked; Coming-soon UX already LIVE.
9. **MCP / agent-to-agent booking** (#42) — paused until Oran releases.

## Still todo (agents can do without Oran)

When secrets/fixtures allow — or pure code/QA that does not need Oran:

- **Optional front-chat LIVE prove** on a QA Stripe TEST talent (not Jorgelina): Select→sheet · book→pay→PAID · Save-look→chat chip→moodboard (`docs/plans/front-chat/03-pay-book-progress.md`). Code already LIVE.
- **Live-proof owed → ✅** re-attach under STATUS rule for many 🟡 rows (Free #55/#57/#59, SEO/footer, etc.) using TAL-93900 shots on `app.tulala.digital` when password available — or Free QA where allowed.
- **`-demo` host seeding / agency_domains** follow-through for #2526 (e.g. bare vs `-demo` hosts; `maison-v2-demo` currently 404 Host not registered).
- **Builder Lab ↔ demos mapping / rebuild click-path** (active non-board; do not invent ✅).
- **Desk reuse** (owned `bc-11e25be7`) — keep off merge of #2477.
- Broader STATUS 🟡/❌ product gaps agents can walk when unblocked: S1 onboarding publish URL, S3 quote→inquire proof polish, S4/S6/S7 paid paths (captcha historically blocked guests), S8 AI booker (product gap ❌), theme gallery ~32 / 224 demos (❌), etc.

## Sources

- `git fetch` `origin/main` + `origin/production` @ 16:54Z
- Vercel project `tulala` / team `oran-tenes-projects` · deploy + `list_deployment_aliases`
- Live HTML: `tulala.digital`, `app.tulala.digital`, `book-jorgelina.tulala.digital`
- GitHub open PRs + #2477 checks; classic lane via `gh pr list`
- Store: `docs/plans/done-status/STATUS.md` (16:45Z), `docs/plans/PM-BOARD.md`, `notes.md`, front-chat + payments E2E docs
