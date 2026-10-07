# Track A — Mac E2E runbook (US only) · local Cursor agent

**Audience:** Oran’s **Mac local Cursor agent** (cloud prefers qa hosts — see [p2-payments-e2e.md](./finish-line-2026-10-02/p2-payments-e2e.md) cloud section).  
**Zero questions:** execute top to bottom. Do not ask Oran or the Project PM mid-run except hard stops listed in §0.  
**Talent:** Prefer **US Express `TAL-93103` Linh** (Connect verified). Soft Gel QA `TAL-93900` is MX/MXN — do not use for US A5. Never live Jor (`TAL-JORGBEAUTY`).  
**Stripe:** TEST mode only · Lavender Tunnel `acct_1ThlEN7Oqi82ykAI`. **US booking path only** — MX checklist skipped (Oran 2026-10-02).  
**Kickoff index:** [mac-local-agent-kickoff.md](./mac-local-agent-kickoff.md)

### Cloud note (2026-10-04)

Cloud already proved Soft Gel PAID + talent Messages refund **staff `not_allowed`**. Remaining A5.3 seller/client fee-aware refunds need Lavender keys + Linh (or fixed Connect destination). Screenshots: `media/refund-e2e/`.

---

## 0. Hard stops (only reasons to pause)

| Stop | Action |
|---|---|
| `web/.env.local` missing | FAIL · reply PM with path expected |
| `STRIPE_SECRET_KEY` not `sk_test_*` | FAIL · do not continue |
| Port `:3001` owned by a process you did not start | Do **not** kill it · reply PM · wait |
| Live / `sk_live_` keys anywhere in the flow | FAIL · abort |
| Need Stripe **Dashboard** support-email clicks | Out of scope — link [stripe-support-email-dashboard-clicks.md](./stripe-support-email-dashboard-clicks.md); Oran-only |

**Never** paste `sk_`, `pk_`, `whsec_`, QA passwords, or service-role keys into chat, PRs, screenshots captions, or Project docs.

---

## 1. Absolute paths

| Role | Path |
|---|---|
| Main repo (reference only — do not `git switch` here) | `/Users/oranpersonal/Desktop/impronta-app` |
| **pm-apply worktree** (all app commands) | `/Users/oranpersonal/Desktop/impronta-app/.claude/worktrees/pm-apply` |
| App + env | `/Users/oranpersonal/Desktop/impronta-app/.claude/worktrees/pm-apply/web` |
| Env source (load only; never print) | `/Users/oranpersonal/Desktop/impronta-app/.claude/worktrees/pm-apply/web/.env.local` |
| Stripe CLI | `~/bin/stripe` (ensure `~/bin` on PATH) |
| Evidence doc | `/cursor/stores/bc-6b0148bc-bf20-458d-9c1c-50b299e558f5/docs/finish-line-2026-10-02/p2-payments-e2e.md` |
| Screenshots dir | `/cursor/stores/bc-6b0148bc-bf20-458d-9c1c-50b299e558f5/docs/finish-line-2026-10-02/screenshots/` |
| This runbook | `/cursor/stores/bc-6b0148bc-bf20-458d-9c1c-50b299e558f5/docs/track-a-mac-e2e-runbook.md` |
| App URL | `http://localhost:3001` |

Create screenshots dir if missing:

```bash
mkdir -p /cursor/stores/bc-6b0148bc-bf20-458d-9c1c-50b299e558f5/docs/finish-line-2026-10-02/screenshots
```

### Terminals

| Terminal | Role | Keep alive? |
|---|---|---|
| **T1** | App server `:3001` | Yes until A6 |
| **T2** | US `stripe listen` | Yes until A6 |
| **T3** | One-off commands (trigger, SQL notes, cleanup) | No |

Record PIDs you start in a private local note (not chat): `echo $!` after backgrounding.

---

## 2. A2 — Listen → whsec → restart :3001 → smoke

### 2.1 Load env (prefix check only)

```bash
cd /Users/oranpersonal/Desktop/impronta-app/.claude/worktrees/pm-apply/web
set -a
. ./.env.local
set +a
case "$STRIPE_SECRET_KEY" in
  sk_test_*) echo "US secret key: sk_test_* OK" ;;
  *) echo "STOP: unexpected STRIPE_SECRET_KEY shape" >&2; exit 1 ;;
esac
case "${COMMISSION_PROCESSING_PASS_THROUGH:-}" in
  1) echo "fee rule ON OK" ;;
  *) echo "STOP: set COMMISSION_PROCESSING_PASS_THROUGH=1 in .env.local" >&2; exit 1 ;;
esac
```

### 2.2 Confirm CLI login (US Lavender Tunnel)

```bash
export PATH="$HOME/bin:$PATH"
stripe config --list
# Expect logged-in US test sandbox Lavender Tunnel · platform acct_1ThlEN7Oqi82ykAI
```

| Check | PASS | FAIL |
|---|---|---|
| CLI responds | `stripe` works | install/login blocked — reply PM |
| Account is US test, not live | Lavender Tunnel / test | abort |

### 2.3 Start US listener (T2)

```bash
cd /Users/oranpersonal/Desktop/impronta-app/.claude/worktrees/pm-apply/web
set -a; . ./.env.local; set +a
stripe listen \
  --api-key "$STRIPE_SECRET_KEY" \
  --forward-to localhost:3001/api/webhooks/stripe \
  --forward-connect-to localhost:3001/api/webhooks/stripe
```

On start the CLI prints `whsec_…`:

1. Write it into `.env.local` as `STRIPE_WEBHOOK_SECRET=` (replace any stale value).
2. If a **Connect** signing secret is also printed, set `STRIPE_WEBHOOK_SECRET_CONNECT=`.
3. Do **not** commit `.env.local`. Do **not** paste `whsec` into chat.

MX listener: **skip** for this US-only run.

### 2.4 Restart `:3001` (T1) so Next picks up whsec

If you already own a `:3001` from this session, stop **that PID only** (IDE stop or `kill <pid>`). Never `pkill stripe` / never kill unrelated node.

```bash
cd /Users/oranpersonal/Desktop/impronta-app/.claude/worktrees/pm-apply/web
# Optional rebuild if binary is stale:
# QA_PORT=3001 bash scripts/qa-prod-local.sh build
QA_PORT=3001 bash scripts/qa-prod-local.sh start
```

Or launch config **`pm-dashboard-prod-3001`**.

Sign in with QA credentials from `.env.local` (`QA_*` / `QA_JOR_CLONE_*` for TAL-93900). Never paste passwords.

| Check | PASS | FAIL |
|---|---|---|
| `http://localhost:3001` loads | 200 app shell | host/env — fix before A3 |
| Signed in as TAL-93900 path | dashboard/money reachable | wrong QA user |

### 2.5 Smoke trigger (T3)

```bash
cd /Users/oranpersonal/Desktop/impronta-app/.claude/worktrees/pm-apply/web
set -a; . ./.env.local; set +a
stripe trigger checkout.session.completed --api-key "$STRIPE_SECRET_KEY"
```

| Check | PASS | FAIL |
|---|---|---|
| A2 smoke | T2 shows forward + 2xx | fix whsec + restart T1; re-smoke before A3 |

Stamp time in private notes + later § report.

---

## 3. A3 — Snapshot + US Express onboard (TAL-93900)

### 3.1 Snapshot (read-only → private note, not chat)

```sql
select id, profile_code, stripe_account_id, stripe_account_platform
from talent_profiles
where profile_code = 'TAL-93900';
```

### 3.2 Onboard US Express (test)

On `:3001` as TAL-93900 → Money / payout Connect:

- SSN `000-00-0000`
- Routing `110000000`
- Account `000123456789`

Confirm connected account is **US test** (Lavender Tunnel), not live.

**Screenshot:**  
`/cursor/stores/bc-6b0148bc-bf20-458d-9c1c-50b299e558f5/docs/finish-line-2026-10-02/screenshots/a3-us-express-onboard.png`

| Check | PASS | FAIL |
|---|---|---|
| A3 onboard | success UI + `stripe_account_id` present (prefix/last4 only in report) | stop; reply PM |

Re-query SQL; keep full ids in private note only.

---

## 4. A5 — US checklist (ES first)

Test cards: `4242 4242 4242 4242` · instant balance `4000 0000 0000 0077`.  
Locale: **ES first**, spot-check EN if copy looks wrong.

### 4.1 Seller pays processing fee

1. Book **$100 USD** service (seller pays fee).
2. Pay link total **≈ $101.50**.
3. Pay with **0077** → wait T2 webhook.
4. Verify PAID in Agenda + Money (Dinero) + client thread.
5. Talent payout **≈ $100 − actual processing fee**.
6. DB: `booking_payouts.processing_fee_cents` **set** on talent leg.

Screenshots → `…/screenshots/a5-1-seller-pays-pay.png`, `a5-1-seller-pays-paid.png`, `a5-1-seller-pays-money.png`

| Check | PASS | FAIL |
|---|---|---|
| A5.1 seller pays | totals + PAID + fee cents set | note route + screenshot name |

### 4.2 Client pays processing fee

1. Money settings → **client pays** fee.
2. Book **$100**.
3. Client **≈ $104.84**; talent payout **≈ $100.00**.

Screenshots → `a5-2-client-pays-*.png`

| Check | PASS | FAIL |
|---|---|---|
| A5.2 client pays | totals match | note defect |

### 4.3 Refunds (A4 live proof)

| Case | Expected |
|---|---|
| Seller-pays full | Refund **≈ $96.76** of **$101.50** |
| Client-pays full | Refund **≈ $100.00** of **$104.84** |
| Partial | Proportional on refundable ceiling |
| Unknown fee (if reproducible) | Blocked with clear message |
| Transfer reversal | Matches refund |

Screenshots → `a5-3-refunds-*.png`

| Check | PASS | FAIL |
|---|---|---|
| A5.3 refunds | cases above | cents observed + screenshot |

### 4.4 Delayed method

If US sandbox exposes delayed method: unpaid until `async_payment_succeeded`. Else mark **SKIP**.

### 4.5 Messages / ancillary

Messages v5 gear · tip bubble · USDC payout card (display only).

Screenshots → `a5-5-messages-*.png`

### 4.6 Receipt + PDF

Fee lines + **fees are non-refundable** (ES + EN as shown).

Screenshots/PDF → `a5-6-receipt-pdf-*`

### 4.7 MX booking

**SKIP** — do not run.

---

## 5. A6 — Cleanup

1. Refund or cancel A5 test bookings (keep prod DB tidy).
2. Close open pay links / checkout tabs.
3. Kill **only** listener/server PIDs **you** started (T2; T1 if you will leave the machine idle — if Track E follows immediately, **keep T1**).
4. Keep `COMMISSION_PROCESSING_PASS_THROUGH=1` ON.
5. Do **not** restore TAL-93900 Stripe fields unless Oran asks.

| Check | PASS | FAIL |
|---|---|---|
| A6 cleanup | test bookings refunded/cancelled; your PIDs stopped as planned | list leftovers |

---

## 6. Report template → Project PM

Copy-paste this block into the Project chat (no secrets). Fill every line.

```text
## Track A Mac E2E — report

Worktree: /Users/oranpersonal/Desktop/impronta-app/.claude/worktrees/pm-apply
App: http://localhost:3001 · talent TAL-93900 · Stripe TEST US only

### Checklist
| Step | Result | Notes |
|---|---|---|
| A2 smoke | PASS / FAIL | time: |
| A3 US Express onboard | PASS / FAIL | acct_… last4: |
| A5.1 seller pays | PASS / FAIL | |
| A5.2 client pays | PASS / FAIL | |
| A5.3 refunds | PASS / FAIL | |
| A5.4 delayed method | PASS / FAIL / SKIP | |
| A5.5 messages UI | PASS / FAIL | |
| A5.6 receipt/PDF | PASS / FAIL | |
| A5.7 MX | SKIP | |
| A6 cleanup | PASS / FAIL | |
| A4 live: booking_payouts.processing_fee_cents set | YES / NO | |

### Defects (if any)
- route · expected · actual · screenshot filename

### Screenshots
Absolute dir: /cursor/stores/bc-6b0148bc-bf20-458d-9c1c-50b299e558f5/docs/finish-line-2026-10-02/screenshots/
Files:
-

### Code follow-up
Needs PR beyond #2469? YES / NO · branch/title if yes

### Blockers
-
```

Also tick rows in [p2-payments-e2e.md](./finish-line-2026-10-02/p2-payments-e2e.md) live-run table when you can edit Project docs.

---

## 7. Quick order

`A2 listen → write whsec → restart :3001 → smoke → A3 → A5.1–A5.6 → A6 → §6 report`
