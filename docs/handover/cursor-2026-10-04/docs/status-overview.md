# Status overview — Oran · 2026-10-02 ~23:35Z

Live tip: `main`=`bbc4b7f48` (#2474 just merged) · `production`=`ba672f613` (#2479) — **prod behind tip**.  
Scoreboard: ✅ 3 / 🟡 84 / ❌ 8 / ⏸ 5 · [DONE-CHECKLIST](./plans/DONE-CHECKLIST.md) · [PM-BOARD](./plans/PM-BOARD.md)

---

## Merge lane

| | |
|---|---|
| **DONE** | [#2474](https://github.com/orantene/impronta-app/pull/2474) gallery W2 **MERGED** (23:33Z). Earlier: `#2466` `#2468` `#2469` `#2470` `#2471` `#2478` `#2479` `#2483`. |
| **LEFT** | Tip structural → promote+smoke → Update branch + merge [#2475](https://github.com/orantene/impronta-app/pull/2475) → money `#2480`/`#2482`/`#2481` → [#2486](https://github.com/orantene/impronta-app/pull/2486). |
| **Oran** | None for merge itself — lane owns FF/`deploy:smoke` after tip CI. |

---

## Track A / money (A5.1–A5.3)

| | |
|---|---|
| **DONE** | A3 KYC PASS · **A5.1 PASS** (seller-pays vanity Checkout+DB PAID). Attribution root-cause fixed in code ([#2486](https://github.com/orantene/impronta-app/pull/2486) draft; evidence booking backfilled). Money stack rebased: [#2482](https://github.com/orantene/impronta-app/pull/2482) CLEAN · [#2481](https://github.com/orantene/impronta-app/pull/2481) struct green · [#2480](https://github.com/orantene/impronta-app/pull/2480) CLEAN. |
| **LEFT** | **A5.2 FAIL** — `fee_payer=client` still charges $100 (expect ≈$104.84); **no open fee PR yet** (worker in flight). **A5.3 blocked** until fee-correct charges. Merge money PRs after gallery; undraft/merge `#2486` + live vanity re-prove Money Collected > 0. |
| **Oran** | Money/legal: review refunds copy on `#2480` (DRAFT PENDING LEGAL REVIEW); decide A5.2 fee product expectation if pass-through path needs product sign-off. |

---

## Track C / email (C1–C5, D-081/082/083)

| | |
|---|---|
| **DONE** | C1–C3 PASS · hello@ **C4 PASS** · demo domain verified + **demo inbox C4 PASS** ([#2470](https://github.com/orantene/impronta-app/pull/2470) on prod). |
| **LEFT** | Demo **password-reset** inbound still FAIL (Supabase auth email rate limit) → **D-081/082 stay 🟡**. **C5** (`NEXT_PUBLIC_SUPPORT_EMAIL_CAN_RECEIVE=1`) not started. **D-083** Stripe Dashboard support email → hello@ — Oran-only, not started. |
| **Oran** | **D-083** — four Stripe surfaces (US/MX × live/test): [clicks](./stripe-support-email-dashboard-clicks.md). Optional: green-light C5 after reset proof. |

---

## Support Desk

| | |
|---|---|
| **DONE** | [#2479](https://github.com/orantene/impronta-app/pull/2479) + [#2483](https://github.com/orantene/impronta-app/pull/2483) on production · migrations pushed · `deploy:smoke` PASS. |
| **LEFT** | `SUPPORT_DESK_ENABLED` **OFF**. Live host/journeys unproven with flag on. `#2477` mockups draft left alone (skip path). |
| **Oran** | **Flip Desk flag** when ready (`SUPPORT_DESK_ENABLED=1` on Vercel) + smoke `/desk`. |

---

## DONE bar

| | |
|---|---|
| **DONE** | 3 platform-ops ✅. Engine/code landings today (Desk, email receiving, gallery W2, money defects on main) — still mostly 🟡 until live proof. |
| **LEFT** | 84 🟡 · 8 ❌ (AI booking suite, gallery-2026 live, **D-083**, Desk host) · 5 ⏸ (MCP, MX Stripe, USDC, lawyer MoR, CFDI). |
| **Oran** | Dashboard/legal clicks above; no invented ✅. |

---

## Cloud env smoke

| | |
|---|---|
| **DONE** | **PASS** — Cursor cloud VM boots `npm run dev`, login 200, Auth path works; take-control desktop available. Evidence: [`internal/cloud-env-smoke.md`](../internal/cloud-env-smoke.md). |
| **LEFT** | Snapshot still needs in-session `npm install` + `.env.local`; not a Mac substitute for Oran Dashboard work. |
| **Oran** | None. |

---

## Oran blockers (action list)

1. **Desk flag** — enable `SUPPORT_DESK_ENABLED=1` when ready to expose `/desk`.
2. **D-083** — Stripe support email → `hello@tulala.digital` on US/MX live+test.
3. **Money/legal** — legal review of `/legal/refunds` (#2480); A5.2 client-pays fee product/QA after fix lands.

## Open PR snapshot

| PR | Topic | State |
|---|---|---|
| [#2475](https://github.com/orantene/impronta-app/pull/2475) | Gallery W1 P0 | Open · needs Update branch onto tip |
| [#2480](https://github.com/orantene/impronta-app/pull/2480) | Legal refunds D-089 | Open · CLEAN |
| [#2481](https://github.com/orantene/impronta-app/pull/2481) | Money refund CTA D-026 | Open · struct green · Supabase running |
| [#2482](https://github.com/orantene/impronta-app/pull/2482) | Receipt PDF fees D-048 | Open · CLEAN |
| [#2486](https://github.com/orantene/impronta-app/pull/2486) | Vanity Money attribution | **Draft** · CI running |
| — | A5.2 client-pays fee | **No PR yet** |
