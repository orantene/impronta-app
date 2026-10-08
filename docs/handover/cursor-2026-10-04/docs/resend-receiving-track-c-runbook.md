# Track C — Resend receiving runbook · Mac local agent

**Audience:** Oran’s **Mac local Cursor agent** (cloud has no `web/.env.local`).  
**Zero questions:** run §1→§5 in order. Do **not** do Stripe Dashboard support-email clicks (Oran-only — [stripe-support-email-dashboard-clicks.md](./stripe-support-email-dashboard-clicks.md)).  
**Kickoff:** [mac-local-agent-kickoff.md](./mac-local-agent-kickoff.md)  
**Code PR:** [#2470](https://github.com/orantene/impronta-app/pull/2470) — **MERGED** to `main` as `56442204d` (2026-10-02).

**C2 gate (hard):** Do **not** add Vercel MX until `origin/production` contains `56442204d` **and** `cd web && npm run deploy:smoke` exits 0 on that tip. Cloud agents have no Mac desktop — C2 DNS/webhook/proofs run headless/CLI or wait for merge-lane smoke, never GUI desktop control.

**Never** print `RESEND_*`, `VERCEL_TOKEN`, or webhook secrets into chat.

---

## 0. Absolute paths + env

| Role | Path |
|---|---|
| Preferred worktree `web/` | `/Users/oranpersonal/Desktop/impronta-app/.claude/worktrees/pm-apply/web` |
| Fallback main checkout `web/` | `/Users/oranpersonal/Desktop/impronta-app/web` |
| Env source | `<web>/.env.local` — requires `RESEND_ADMIN_API_KEY` (or `RESEND_API_KEY`) |
| Evidence / this runbook | `/cursor/stores/bc-6b0148bc-bf20-458d-9c1c-50b299e558f5/docs/resend-receiving-track-c-runbook.md` |
| Screenshots (proofs) | `/cursor/stores/bc-6b0148bc-bf20-458d-9c1c-50b299e558f5/docs/finish-line-2026-10-02/screenshots/track-c/` |
| Demo inbox source | `/Users/oranpersonal/Desktop/impronta-app/web/design-references/*/demos.json` |

```bash
mkdir -p /cursor/stores/bc-6b0148bc-bf20-458d-9c1c-50b299e558f5/docs/finish-line-2026-10-02/screenshots/track-c
WEB=/Users/oranpersonal/Desktop/impronta-app/.claude/worktrees/pm-apply/web
# If npm scripts missing (PR not in worktree), use main checkout or fetch PR #2470 branch.
cd "$WEB"
test -f .env.local || { echo "STOP: missing .env.local"; exit 1; }
```

Confirm key **presence** without printing:

```bash
set -a; . ./.env.local; set +a
if [ -n "${RESEND_ADMIN_API_KEY:-}${RESEND_API_KEY:-}" ]; then echo "Resend key: present"; else echo "STOP: missing RESEND_ADMIN_API_KEY"; exit 1; fi
```

| Check | PASS | FAIL |
|---|---|---|
| Env key present | printed `present` | stop · reply PM |

---

## 1. Enable receiving + capture exact MX rows

Prefer npm scripts from PR #2470; else call the script directly.

```bash
cd "$WEB"
# Status first
npm run resend:receiving:status
# or: node scripts/resend-receiving-setup.mjs

# Create missing domains (esp. demo.tulala.digital) + enable receiving
npm run resend:receiving:ensure
# or: node scripts/resend-receiving-setup.mjs --ensure-domains --enable
# (status-only / enable-only still available via resend:receiving:status|enable)

# Re-run status to print MX rows after enable
npm run resend:receiving:status
```

Targets: `tulala.digital` (hello@, help@, support@ catch-all) and `demo.tulala.digital` (demo inboxes).

**Copy the exact MX lines from script output** into this table (do not invent values):

| Domain | Type | Name / host | Priority | Value | Resend status | Vercel DNS status |
|---|---|---|---|---|---|---|
| tulala.digital | MX | `@` (root) | `10` | `inbound-smtp.us-east-1.amazonaws.com` | receiving MX **verified** | **PASS** — `rec_8ddf38a1148a98848aebd13a` (Mac C2) |
| demo.tulala.digital | MX | `demo` on parent zone `tulala.digital` | `10` | `inbound-smtp.us-east-1.amazonaws.com` | receiving MX **verified** | **PASS** — `rec_9e518462b4874b9da77cf401` (Mac C2) |

**C2 PASS 2026-10-02:** Mac headless `bc-c8ba6945` — [internal/track-c-c2-result.md](../internal/track-c-c2-result.md). Cloud dig confirms both MX. **No further MX work unless dig regresses.**

**C3/C4 2026-10-02:** Mac `bc-aafee212` — C3 PASS · hello@ C4 PASS · **demo C4 FAIL**. Cloud root cause: [internal/track-c-c3-demo-c4-root-cause-2026-10-02.md](../internal/track-c-c3-demo-c4-root-cause-2026-10-02.md) — `demo.tulala.digital` domain still **pending** (receiving MX verified alone is not enough); Mac must Restart/Verify domain then re-prove demo inbound before C5.

If API enable fails: Resend Dashboard → Domains → each domain → **Receiving** ON → copy MX from Dashboard into the table.

| Check | PASS | FAIL |
|---|---|---|
| C1 enable + MX rows captured | both domains have MX rows filled above | stop · reply PM with script error (no secrets) |

---

## 2. Exact DNS steps (Vercel) — **C2**

### 2.0 Production gate (required before any DNS write)

```bash
git fetch origin main production
# Must print YES:
git merge-base --is-ancestor 56442204d origin/production && echo YES || echo NO_STOP
# Then from a fresh main worktree after pointer advance:
cd web && npm run deploy:smoke   # exit 0 required
```

| Check | PASS | FAIL |
|---|---|---|
| C2 gate | `56442204d` ⊆ `origin/production` + smoke exit 0 | **do not add MX** · recheck after promote |

**Status 2026-10-02 ~22:31Z:** `production` had `#2470` · **C2 PASS** (Mac) · no further MX unless dig regresses.

Project: **tulala** (team oran-tenes-projects). Domains: `tulala.digital`, `demo.tulala.digital`.

### 2.1 UI path (authoritative)

For **each** domain (only after §2.0 PASS):

1. Open [Vercel Dashboard](https://vercel.com) → team → project **tulala**.
2. **Settings** → **Domains** → click `tulala.digital` (then repeat for `demo.tulala.digital`).
3. Open **DNS** / DNS Records for that domain.
4. **Add** an **MX** record using the **exact** Name, Priority, and Value from §1 table.
5. Do **not** delete existing non-MX records unless they conflict with Resend’s instructions.
6. `tulala.digital` previously had **no MX** — Resend may be the sole MX for support addresses; that is intended.
7. Save. Wait for Vercel to show the record present.

### 2.2 Optional CLI (preferred when Mac desktop is banned)

```bash
# List existing DNS (read-only sanity) — do not print tokens
cd "$WEB"
npx vercel dns ls tulala.digital
npx vercel dns ls demo.tulala.digital
# Add only if CLI supports MX add for this project; otherwise use UI §2.1.
# Example shape (fill from §1 — never guess):
# npx vercel dns add tulala.digital '@' MX '<priority>' '<mx-host>'
```

If CLI add is unclear or errors: **use UI §2.1** (human) and continue — agents: no desktop takeover.

### 2.3 Resend verify

Resend Dashboard → Domains → each domain → **I've added the record** until receiving MX shows **verified**.

| Check | PASS | FAIL |
|---|---|---|
| C2 DNS added | both MX rows visible in Vercel DNS | screenshot empty DNS · reply PM |
| C2 Resend verified | receiving MX verified on both domains | wait/recheck; do not flip §5 flag yet |

Screenshot: `…/screenshots/track-c/c2-vercel-mx-tulala.png`, `c2-vercel-mx-demo.png`, `c2-resend-verified.png` (no secrets).

---

## 3. Webhook (production)

Resend → **Webhooks** → Add (or edit existing):

| Field | Value |
|---|---|
| URL | `https://tulala.digital/api/webhooks/resend` |
| Events | include `email.received` (keep existing delivery events on same endpoint if already configured) |
| Signing secret | must match `RESEND_WEBHOOK_SECRET` already in **Vercel production** (or `RESEND_INBOUND_WEBHOOK_SECRET` if split later) |

Code **stores** every inbound message in `public.resend_inbound_emails` (migration `20261231320001_resend_inbound_emails.sql` — already applied on Mac as `20001`; Desk host owns `20000`). Confirm with `npm run db:check` before proofs. Gmail forward to **`orantene@gmail.com`** is best-effort (`RESEND_INBOUND_FORWARD_TO` optional).

| Check | PASS | FAIL |
|---|---|---|
| C3 webhook | endpoint + `email.received` configured | stop before proofs |

---

## 4. Prove delivery

Use an **external** mailbox you control (not `@tulala.digital`).

1. **hello@** — send to `hello@tulala.digital` → confirm forward in Gmail (`orantene@gmail.com`).  
   Screenshot: `c4-hello-forward.png` (subject/time only; blur bodies if needed).
2. **Demo inbox** — pick one `@demo.tulala.digital` from `design-references/*/demos.json`, e.g. `demo-commercial-model-us-009@demo.tulala.digital` → confirm Gmail forward.  
   Screenshot: `c4-demo-forward.png`.
3. **Demo password reset** — trigger reset for a demo talent using `@demo.tulala.digital`; confirm auth email arrives **or** inbound copy hits Gmail if routed that way.  
   Screenshot: `c4-demo-reset.png`.

Record timestamps:

| Proof | To address | Sent (local time) | Forward seen | PASS/FAIL |
|---|---|---|---|---|
| hello@ | hello@tulala.digital | | | |
| demo inbox | | | | |
| demo reset | | | | |

| Check | PASS | FAIL |
|---|---|---|
| C4 proofs | all three PASS | do **not** flip §5 |

---

## 5. Vercel flag (after proofs)

Only when §2 verified + §4 all PASS:

1. Vercel → project **tulala** → **Settings** → **Environment Variables** → **Production**.
2. Set `NEXT_PUBLIC_SUPPORT_EMAIL_CAN_RECEIVE` = `1` (create or update).
3. Redeploy production (trigger redeploy of current production deployment, or wait for next promote).  
   Do **not** push `production` by hand.
4. Spot-check live: `/support`, `/help`, `/about` — mailto links live to `hello@tulala.digital`.

Screenshots: `c5-vercel-flag.png` (name+value visible OK; no other secrets), `c5-support-mailto.png`.

| Check | PASS | FAIL |
|---|---|---|
| C5 flag + mailto | env=1 + mailto live after deploy | note deploy SHA / blocker |

---

## 6. Out of scope for this agent (Oran)

- [Stripe support email dashboard clicks](./stripe-support-email-dashboard-clicks.md)
- [Stripe price verify table](./stripe-price-env-verify-oran.md)
- [MX tax decision](./mx-tax-withholding-decision.md) (already recorded)

---

## 7. Report template → Project PM

```text
## Track C receiving — Mac report

Worktree web: <path>
PR code dependency: #2470 merged? YES / NO

### Checklist
| Step | Result | Notes |
|---|---|---|
| C1 enable + MX rows | PASS / FAIL | |
| C2 Vercel DNS MX both domains | PASS / FAIL | |
| C2 Resend MX verified | PASS / FAIL | |
| C3 webhook email.received | PASS / FAIL | |
| C4 hello@ proof | PASS / FAIL | time: |
| C4 demo inbox proof | PASS / FAIL | address: |
| C4 demo reset proof | PASS / FAIL | time: |
| C5 NEXT_PUBLIC_SUPPORT_EMAIL_CAN_RECEIVE=1 | PASS / FAIL | redeploy: |

### MX rows added (exact)
| Domain | Name | Priority | Value |
|---|---|---|---|
| tulala.digital | | | |
| demo.tulala.digital | | | |

### Screenshots
/cursor/stores/bc-6b0148bc-bf20-458d-9c1c-50b299e558f5/docs/finish-line-2026-10-02/screenshots/track-c/
-

### Blockers
-
```

Update this file’s MX table when done. Mark **C-receiving** on [PM-BOARD](./plans/PM-BOARD.md) when all PASS.
