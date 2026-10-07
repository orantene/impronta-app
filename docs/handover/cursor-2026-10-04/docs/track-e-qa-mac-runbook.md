# Track E — Authenticated QA · Mac local agent (`:3001`)

**Audience:** Oran’s **Mac local Cursor agent** only.  
**Zero questions:** run the checklist below on `http://localhost:3001`. Do not ask mid-run except hard stops in §0.  
**Talents:** `TAL-93900` (Jor clone) and Valeria `TAL-93901` only. **Never** live Jor payments.  
**Viewports:** **390** (mobile) **and desktop** (≈1440) for every UI item unless marked skip.  
**Locales:** **ES first**, then **EN** for the same path when copy/layout can diverge.  
**Kickoff:** [mac-local-agent-kickoff.md](./mac-local-agent-kickoff.md)  
**Source:** [cursor-next-2026-10-02.md](./cursor-next-2026-10-02.md) TRACK E (P3.1 remainder).

---

## 0. Hard stops

| Stop | Action |
|---|---|
| No `:3001` / wrong worktree | Start via pm-apply only; never second app server |
| `:3001` owned by someone else | Do not kill · reply PM |
| Live Jor (`TAL-JORGBEAUTY`) for exploratory writes | Forbidden for QA writes beyond Track F’s approved deletes |
| Free-plan builder locks | If Track B [#2471](https://github.com/orantene/impronta-app/pull/2471) not on the build serving `:3001`, mark **E7 DEFER** (do not invent locks) |
| Password / keys | Load from `.env.local` only — never paste into chat |

---

## 1. Absolute paths

| Role | Path |
|---|---|
| Worktree | `/Users/oranpersonal/Desktop/impronta-app/.claude/worktrees/pm-apply` |
| Env | `/Users/oranpersonal/Desktop/impronta-app/.claude/worktrees/pm-apply/web/.env.local` |
| App | `http://localhost:3001` |
| Evidence report (create/update) | `/cursor/stores/bc-6b0148bc-bf20-458d-9c1c-50b299e558f5/docs/finish-line-2026-10-02/track-e-qa-report.md` |
| Screenshots root | `/cursor/stores/bc-6b0148bc-bf20-458d-9c1c-50b299e558f5/docs/finish-line-2026-10-02/screenshots/track-e/` |
| This runbook | `/cursor/stores/bc-6b0148bc-bf20-458d-9c1c-50b299e558f5/docs/track-e-qa-mac-runbook.md` |

```bash
mkdir -p /cursor/stores/bc-6b0148bc-bf20-458d-9c1c-50b299e558f5/docs/finish-line-2026-10-02/screenshots/track-e/{dinero,domain,messages,website-settings,booking-cycle,builder}
cd /Users/oranpersonal/Desktop/impronta-app/.claude/worktrees/pm-apply/web
set -a; . ./.env.local; set +a
# Ensure server up (do not start a second one):
# QA_PORT=3001 bash scripts/qa-prod-local.sh start
```

Sign-in: QA users from `.env.local` (`QA_JOR_CLONE_*` → TAL-93900, `QA_FREE_*` / Valeria vars → TAL-93901). Prefer switching talent in-app over sharing live accounts.

**Screenshot naming:** `e-<area>-<step>-<es|en>-<390|desktop>.png`  
Example: `e-dinero-cash-full-es-390.png`

---

## 2. Full TRACK E checklist

For each row: exercise on **TAL-93900** unless Valeria is specified; capture **390 + desktop**; **ES then EN** when UI strings show.

### E1 — Dinero (Money) · TAL-93900

| # | Action | Expected | PASS/FAIL | Screenshots |
|---|---|---|---|---|
| E1.1 | **Registrar pago** · cash · **full** amount owed | Ledger updates; booking shows paid/partial correctly | | `e-dinero-cash-full-*` |
| E1.2 | **Registrar pago** · cash · **partial** | Partial accepted; remaining balance truthful | | `e-dinero-cash-partial-*` |
| E1.3 | Attempt **over-payment** | **Refused**; shows amount still owed; **nothing written** | | `e-dinero-overpay-refused-*` |
| E1.4 | After cash: **Cobrado este mes** + **Efectivo** | Both update; **survive reload** | | `e-dinero-cobrado-reload-*` |

### E2 — Custom-domain drawer · TAL-93900 (and Free Valeria if drawer differs)

| # | Action | Expected | PASS/FAIL | Screenshots |
|---|---|---|---|---|
| E2.1 | Open custom-domain drawer | Opens; **no purchase** completed in this pass | | `e-domain-drawer-*` |
| E2.2 | Trigger validation / entitlement errors in **ES** | Clear ES error copy (tú); no blank/crash | | `e-domain-errors-es-*` |
| E2.3 | Same errors spot-check **EN** | EN parity | | `e-domain-errors-en-*` |

### E3 — Messages gear · TAL-93900

| # | Action | Expected | PASS/FAIL | Screenshots |
|---|---|---|---|---|
| E3.1 | Open Messages v5 **gear** drawer | Opens; controls reachable 390 + desktop | | `e-messages-gear-*` |

### E4 — Website Settings (ON for everyone) · TAL-93900 · A1–A6

Website Settings must be reachable (`TALENT_WEBSITE_SETTINGS_ENABLED=1` already intended). Walk the screen groups (home list → each group) and specifically:

| # | Focus | Expected | PASS/FAIL | Screenshots |
|---|---|---|---|---|
| E4.A1 | Settings **home** list loads | Groups visible; Save idle | | `e-ws-a1-home-*` |
| E4.A2 | Booking / timing / payments groups | Edit draft; Save works; no crash | | `e-ws-a2-groups-*` |
| E4.A3 | Languages / site / policies as present | Opens; ES+EN labels sane | | `e-ws-a3-lang-site-*` |
| E4.A4 | **390 title** | Title/header does not clip or collide at **390** width | | `e-ws-a4-390-title-*` |
| E4.C | **Pause banner** (WSF-C) | Toggle accept bookings / inquiries paused → public or summary shows pause; Save required for live | | `e-ws-c-pause-*` |
| E4.D | **Chat / inquiry combos** (WSF-D) | Chat on/off × accept inquiries on/off; stranded-service warning when applicable; public Ask/Consultar matches | | `e-ws-d-chat-inquiry-*` |

Restore switches to a sensible “taking work” state after tests unless a defect requires leaving evidence.

### E5 — Booking cycle · TAL-93900 (test client / guest)

Full path (ES first):

`chat → accept → offer → guest accepts → pay link → cancel → link closed`

| # | Step | Expected | PASS/FAIL | Screenshots |
|---|---|---|---|---|
| E5.1 | Guest/chat start | Thread created | | `e-book-01-chat-*` |
| E5.2 | Talent accept | Accepted state | | `e-book-02-accept-*` |
| E5.3 | Offer | Offer sent with time/price | | `e-book-03-offer-*` |
| E5.4 | Guest accepts | Booking/pending pay | | `e-book-04-guest-accept-*` |
| E5.5 | Pay link | Link opens; fee lines if US pay | | `e-book-05-pay-link-*` |
| E5.6 | Cancel | Cancel succeeds | | `e-book-06-cancel-*` |
| E5.7 | Link closed | Pay link no longer payable | | `e-book-07-link-closed-*` |

Refund/cancel leftovers in A6-style cleanup if this creates paid test rows.

### E6 — Page builder talent top bar · TAL-93900

| # | Action | Expected | PASS/FAIL | Screenshots |
|---|---|---|---|---|
| E6.1 | **Back arrow** | Returns to **dashboard** (not a dead route) | | `e-builder-back-*` |
| E6.2 | **Identity menu** quick links | Each quick link lands on a real destination | | `e-builder-identity-*` |

### E7 — Free plan locks · Valeria `TAL-93901` (after Track B)

| # | Action | Expected | PASS/FAIL | Screenshots |
|---|---|---|---|---|
| E7.1 | Free builder: Add / Move / reorder / duplicate / paste | Hidden or disabled + ⓘ Web Office + Ver planes | | `e-free-locks-ui-*` |
| E7.2 | Text/images + hide/show | Still allowed | | `e-free-edit-ok-*` |

If Track B not on `:3001` build → **DEFER** with note (do not FAIL the whole Track E).

---

## 3. Defect logging

For every FAIL, append to the evidence report:

```text
- id: E…
  talent: TAL-93900 | TAL-93901
  route/url:
  viewport: 390 | desktop
  locale: es | en
  expected:
  actual:
  screenshot: /cursor/stores/bc-6b0148bc-bf20-458d-9c1c-50b299e558f5/docs/finish-line-2026-10-02/screenshots/track-e/…
  route-fix-to: Track B | Track D | new | none
```

Do **not** drive-by redesign. Route product fixes into Tracks B/D via PM.

---

## 4. Evidence report file

Create/update:

`/cursor/stores/bc-6b0148bc-bf20-458d-9c1c-50b299e558f5/docs/finish-line-2026-10-02/track-e-qa-report.md`

Include: date, `:3001` git SHA / launch config, PASS/FAIL table mirroring §2, defect list, screenshot index.

---

## 5. Report template → Project PM

```text
## Track E QA — Mac report

App: http://localhost:3001 · worktree pm-apply
Talents: TAL-93900 + Valeria TAL-93901
Viewports: 390 + desktop · locales ES→EN
Evidence: /cursor/stores/bc-6b0148bc-bf20-458d-9c1c-50b299e558f5/docs/finish-line-2026-10-02/track-e-qa-report.md
Screenshots: …/screenshots/track-e/

### Checklist
| Area | Result | Notes |
|---|---|---|
| E1 Dinero cash/partial/overpay/reload | PASS / FAIL | |
| E2 custom-domain drawer (no purchase; ES errors) | PASS / FAIL | |
| E3 Messages gear | PASS / FAIL | |
| E4 Website Settings A1–A6 (390 title, C pause, D chat/inquiry) | PASS / FAIL | |
| E5 booking cycle → pay link → cancel → closed | PASS / FAIL | |
| E6 builder top bar back + identity menu | PASS / FAIL | |
| E7 Free locks (Valeria) | PASS / FAIL / DEFER | |

### Defects
- (id · route · screenshot · route-fix-to)

### Blockers
-
```
