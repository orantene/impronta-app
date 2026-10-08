# Mac local agent — kickoff (paste once)

**For:** Oran’s Cursor **local agent on the Mac** (has `web/.env.local`, `:3001`, Stripe CLI).  
**Not for:** cloud agents · Stripe Dashboard support-email clicks (Oran-only).

Paste the prompt in §2 into a new local agent chat. It runs **A → C receiving → F → E**, with safe parallelism noted.

---

## 1. Runbooks (absolute)

| Order | Track | Runbook |
|---|---|---|
| 1 | **A** payments E2E US | `/cursor/stores/bc-6b0148bc-bf20-458d-9c1c-50b299e558f5/docs/track-a-mac-e2e-runbook.md` |
| 2 | **C** Resend receiving | `/cursor/stores/bc-6b0148bc-bf20-458d-9c1c-50b299e558f5/docs/resend-receiving-track-c-runbook.md` |
| 3 | **F** Jor cleanup | `/cursor/stores/bc-6b0148bc-bf20-458d-9c1c-50b299e558f5/docs/track-f-jor-cleanup-mac-runbook.md` |
| 4 | **E** Auth QA | `/cursor/stores/bc-6b0148bc-bf20-458d-9c1c-50b299e558f5/docs/track-e-qa-mac-runbook.md` |

**Oran-only (do not auto-run):**  
`/cursor/stores/bc-6b0148bc-bf20-458d-9c1c-50b299e558f5/docs/stripe-support-email-dashboard-clicks.md`  
Also Oran: [stripe-price-env-verify-oran.md](./stripe-price-env-verify-oran.md)

**Board:** `/cursor/stores/bc-6b0148bc-bf20-458d-9c1c-50b299e558f5/docs/plans/PM-BOARD.md`

### Shared constants

| Item | Value |
|---|---|
| Worktree | `/Users/oranpersonal/Desktop/impronta-app/.claude/worktrees/pm-apply` |
| Env | `…/web/.env.local` (load; **never print secrets**) |
| App | `http://localhost:3001` — **one** server only |
| Payments talent | `TAL-93900` only |
| QA talents | `TAL-93900` + Valeria `TAL-93901` |
| Stripe | TEST / `sk_test_` only |
| Screenshots root | `/cursor/stores/bc-6b0148bc-bf20-458d-9c1c-50b299e558f5/docs/finish-line-2026-10-02/screenshots/` |

### Parallelism (safe)

| Pair | Safe together? |
|---|---|
| **C receiving** ∥ **F** cleanup | **Yes** (DNS/Resend vs Stripe refund+SQL; neither needs exclusive browser) |
| **C** ∥ **A** listen | **Yes** for DNS/Resend; avoid fighting T1 if C needs local app (C proofs are mostly prod/Gmail) |
| **F** ∥ **A** | **Yes** if F only touches listed Jor leftover ids (not TAL-93900 A5 bookings) |
| **E** ∥ **A** browser | **No** — both need `:3001` UI. Run **E after A** (keep T1; A6 may leave server up) |
| Stripe Dashboard clicks | **Never** in this auto-run |

Recommended schedule:

1. Start **A2** listener + `:3001` + A3–A5.  
2. In parallel shells: **C** §1–§5 and/or **F** §1–§4.  
3. Finish **A6** (keep `:3001` if E next).  
4. Run **E** full checklist.  
5. Post each runbook’s report template to the Project PM.

---

## 2. Paste prompt (local agent)

```text
You are Oran’s Mac local Cursor agent for Project Tulala Digital.

Mission: execute Mac runbooks end-to-end with ZERO questions. Do not ask Oran or the Project PM mid-run except the hard stops written in each runbook.

Order (parallel where the kickoff doc says safe):
1) Track A — /cursor/stores/bc-6b0148bc-bf20-458d-9c1c-50b299e558f5/docs/track-a-mac-e2e-runbook.md
   A2 listen → write whsec into web/.env.local → restart :3001 → smoke → A3–A5 US TAL-93900 → A6 → paste § report template to Project PM.
2) Track C receiving — /cursor/stores/bc-6b0148bc-bf20-458d-9c1c-50b299e558f5/docs/resend-receiving-track-c-runbook.md
   enable + exact DNS MX + proofs + Vercel NEXT_PUBLIC_SUPPORT_EMAIL_CAN_RECEIVE=1. Can run parallel with A/F per kickoff.
3) Track F — /cursor/stores/bc-6b0148bc-bf20-458d-9c1c-50b299e558f5/docs/track-f-jor-cleanup-mac-runbook.md
   refund 345d9103 in Stripe TEST → delete only listed rows → post exact full UUIDs into track-f-cleanup-2026-10-02.md. If refund fails, do not delete.
4) Track E — /cursor/stores/bc-6b0148bc-bf20-458d-9c1c-50b299e558f5/docs/track-e-qa-mac-runbook.md
   After A browser work: full TRACK E on :3001, TAL-93900 + Valeria TAL-93901, 390+desktop, ES then EN, evidence under finish-line screenshots/track-e/.

Binding paths:
- Worktree: /Users/oranpersonal/Desktop/impronta-app/.claude/worktrees/pm-apply
- Env: web/.env.local only — never print sk_/pk_/whsec_/passwords/service role/Resend keys
- One app server: localhost:3001 — never start a second; never pkill by name
- Stripe TEST only; payments talent TAL-93900 only; never live Jor for payments QA
- Kickoff parallelism: /cursor/stores/bc-6b0148bc-bf20-458d-9c1c-50b299e558f5/docs/mac-local-agent-kickoff.md

OUT OF SCOPE (do not run):
- Stripe support-email Dashboard clicks — Oran only:
  /cursor/stores/bc-6b0148bc-bf20-458d-9c1c-50b299e558f5/docs/stripe-support-email-dashboard-clicks.md
- Stripe price env verify table (Oran fills)
- Track G gallery redesign
- Cloud deploy / merge lane

Reply to Project PM with each runbook’s report template (PASS/FAIL + screenshot absolute paths + blockers). Update PM-BOARD Mac rows when a track fully PASSes.
```

---

## 3. After the local agent finishes

Project PM (cloud coordinator):

1. Merge Mac reports into [p2-payments-e2e.md](./finish-line-2026-10-02/p2-payments-e2e.md), Track F report, Track E report.  
2. Tick Mac rows on [PM-BOARD](./plans/PM-BOARD.md).  
3. Remind Oran only for remaining Dashboard clicks + price table if still open.
