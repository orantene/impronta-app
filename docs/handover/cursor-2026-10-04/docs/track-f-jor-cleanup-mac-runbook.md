# Track F — Jor leftover cleanup · Mac local agent

**Audience:** Oran’s **Mac local Cursor agent** only (needs `web/.env.local`).  
**Oran approved** (2026-10-02): refund test order `345d9103` first → then delete **only** listed rows → post **exact full UUIDs** into the Track F report.  
**If refund fails → do not delete.**  
**Kickoff:** [mac-local-agent-kickoff.md](./mac-local-agent-kickoff.md)  
**Source list:** [jor-test-data-cleanup-ask.md](./jor-test-data-cleanup-ask.md) · **Report:** [track-f-cleanup-2026-10-02.md](./track-f-cleanup-2026-10-02.md)

**Never** paste `sk_`, service-role keys, or passwords into chat. Stripe **TEST** only (`sk_test_`).

---

## 0. Absolute paths + env

| Role | Path |
|---|---|
| Worktree `web/` | `/Users/oranpersonal/Desktop/impronta-app/.claude/worktrees/pm-apply/web` |
| Env | `…/web/.env.local` — `STRIPE_SECRET_KEY` (`sk_test_`), `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` |
| Stripe CLI | `~/bin/stripe` |
| Ask list | `/cursor/stores/bc-6b0148bc-bf20-458d-9c1c-50b299e558f5/docs/jor-test-data-cleanup-ask.md` |
| Track F report (append UUIDs here) | `/cursor/stores/bc-6b0148bc-bf20-458d-9c1c-50b299e558f5/docs/track-f-cleanup-2026-10-02.md` |
| This runbook | `/cursor/stores/bc-6b0148bc-bf20-458d-9c1c-50b299e558f5/docs/track-f-jor-cleanup-mac-runbook.md` |
| Private working notes (local only) | `/tmp/track-f-jor-cleanup-ids.txt` (delete after; never commit) |

```bash
export PATH="$HOME/bin:$PATH"
cd /Users/oranpersonal/Desktop/impronta-app/.claude/worktrees/pm-apply/web
set -a; . ./.env.local; set +a
case "$STRIPE_SECRET_KEY" in sk_test_*) echo "Stripe TEST key OK" ;; *) echo "STOP: not sk_test_"; exit 1 ;; esac
: "${NEXT_PUBLIC_SUPABASE_URL:?missing}" "${SUPABASE_SERVICE_ROLE_KEY:?missing}"
echo "Supabase URL + service role: present"
```

| Check | PASS | FAIL |
|---|---|---|
| F0 credentials | sk_test_ + Supabase present | stop · reply PM (no secrets) |

---

## 1. Resolve short ids → full UUIDs (read-only)

Short prefixes from the ask doc. Expand **before** any delete. Write full ids to `/tmp/track-f-jor-cleanup-ids.txt` only.

### 1.1 Order `345d9103`

Prefer DB first (shared prod Supabase). Use service role via `psql`/Supabase SQL editor **or** a one-shot node script — do not log keys.

```sql
-- Expand order prefix (adjust table if your row lives on booking_payments / payment_intents link)
select id, status, stripe_payment_intent_id, livemode, created_at, total_cents, currency
from orders
where id::text like '345d9103%'
   or id::text like '%345d9103%';
-- If zero rows, also search payment / booking payment tables for the prefix and note the real table.
```

Stripe side (TEST):

```bash
# Search PaymentIntents / Checkout sessions that reference this order metadata if DB has stripe id
# Example once you have pi_… from DB (do not print full key):
# stripe payment_intents retrieve "$PI" --api-key "$STRIPE_SECRET_KEY"
```

**Hard gate:** confirm `livemode=false` / test mode before refund. If live → **STOP** · reply PM · no delete.

### 1.2 Inquiries (5)

```sql
select id, created_at, status, talent_profile_id
from inquiries
where id::text like '6af9b754%'
   or id::text like '836960a0%'
   or id::text like '61735472%'
   or id::text like '3659993f%'
   or id::text like 'fefe09e1%';
```

Expect exactly these five prefixes → record **full UUIDs**.

### 1.3 Guest records (9 emails)

```sql
-- Try guest_sessions / clients / profiles email columns as present in schema
select id, email, created_at
from guest_sessions
where email in (
  'qa-jor-booking-a@impronta.test',
  'qa-jor-booking-b@impronta.test',
  'qa-jor-booking-c@impronta.test',
  'qa-jor-booking-d@impronta.test',
  'qa-jor-booking-e@impronta.test',
  'qa-jor-booking-f@impronta.test',
  'qa-jor-booking-g@impronta.test',
  'qa-jor-booking-h@impronta.test',
  'qa-jor-booking-i@impronta.test'
);
-- If table name differs, locate by email with information_schema / known guests table; still only these emails.
```

### 1.4 QA PathA Bozo bookings (28 Sep 2026)

Live Jor profile `TAL-JORGBEAUTY` — resolve by label + date (no UUIDs in source):

```sql
select b.id, b.starts_at, b.status, b.title, b.notes, tp.profile_code
from talent_bookings b
join talent_profiles tp on tp.id = b.talent_profile_id
where tp.profile_code = 'TAL-JORGBEAUTY'
  and (
    coalesce(b.title,'') ilike '%QA PathA Bozo%'
    or coalesce(b.notes,'') ilike '%QA PathA Bozo%'
    or coalesce(b.internal_note,'') ilike '%QA PathA Bozo%'
  )
  and b.starts_at::date = date '2026-09-28';
-- Adapt column names if your bookings table uses scheduled_start / label fields.
```

List every matching **full booking UUID** in the private file.

| Check | PASS | FAIL |
|---|---|---|
| F1 resolve | order + 5 inquiries + guests + Bozo bookings listed with full UUIDs | stop · reply PM with what was missing |

---

## 2. Refund order `345d9103` (Stripe TEST)

1. From §1.1 take `stripe_payment_intent_id` or charge id.
2. Confirm test mode again.
3. Full refund:

```bash
# Prefer PaymentIntent refund
stripe refunds create \
  --api-key "$STRIPE_SECRET_KEY" \
  -d "payment_intent=$PI" \
  -d "reason=requested_by_customer"
# Or: stripe payment_intents cancel / refund via Dashboard TEST mode if CLI shape differs —
# still TEST only; never live.
```

4. Confirm refund succeeded (`re_…` status `succeeded` or PI canceled/refunded as appropriate).
5. Optionally mark/delete the **order row** only **after** refund success (same transaction window as §3).

| Check | PASS | FAIL |
|---|---|---|
| F2 refund | succeeded in TEST | **STOP — do not delete anything** · reply PM |

---

## 3. Delete listed rows (only after F2 PASS)

Delete **only** resolved full UUIDs from §1. Prefer FK-safe order: booking children → bookings → inquiry messages → inquiries → order → guests.

Example pattern (replace with exact UUIDs from `/tmp/track-f-jor-cleanup-ids.txt`):

```sql
begin;

-- PathA Bozo bookings (+ dependent rows if required by FK)
-- delete from <booking_child> where booking_id in (...);
-- delete from talent_bookings where id in (...);

-- Inquiry dependents then inquiries
-- delete from inquiry_messages where inquiry_id in (...);
-- delete from inquiries where id in (...);

-- Order after refund
-- delete from orders where id in (...);

-- Guests last
-- delete from guest_sessions where id in (...);

-- Do not COMMIT until counts match expectations; rollback on surprise.
commit;
```

If a FK blocks: delete the specific dependent rows for **those** ids only — do not broaden scope.

| Check | PASS | FAIL |
|---|---|---|
| F3 deletes | only listed ids gone; re-select returns 0 | rollback · reply PM |

---

## 4. Post exact UUIDs to Track F report

Edit `/cursor/stores/bc-6b0148bc-bf20-458d-9c1c-50b299e558f5/docs/track-f-cleanup-2026-10-02.md` §4:

Replace “Exact ids deleted: **None**” with:

```markdown
### Exact ids deleted (Mac run · <ISO timestamp>)

**Refund:** order `<full-uuid>` · Stripe refund `<re_… or pi_…>` · TEST · succeeded

**Inquiries:**
- `<full-uuid>`
- …

**Guest records:**
- `<full-uuid>` · `qa-jor-booking-a@impronta.test`
- …

**Order:**
- `<full-uuid>` (345d9103…)

**QA PathA Bozo bookings (2026-09-28):**
- `<full-uuid>`
- …

**Not deleted:** _(none / list)_
```

Also update [jor-test-data-cleanup-ask.md](./jor-test-data-cleanup-ask.md) status table to done.

Wipe `/tmp/track-f-jor-cleanup-ids.txt` when finished.

---

## 5. Report template → Project PM

```text
## Track F Jor cleanup — Mac report

### Checklist
| Step | Result | Notes |
|---|---|---|
| F0 credentials sk_test_ + Supabase | PASS / FAIL | |
| F1 resolve full UUIDs | PASS / FAIL | counts: inquiries=/guests=/bozo=/order= |
| F2 refund 345d9103 TEST | PASS / FAIL | refund id prefix: |
| F3 deletes | PASS / FAIL / SKIPPED | |
| F4 UUIDs posted to track-f-cleanup report | PASS / FAIL | |

### Exact UUIDs deleted
(paste same list as report §4)

### Blockers
-
```

---

## 6. Parallelism note

Safe alongside Track C receiving. Avoid deleting while another agent is mid-query on the same rows. Does **not** use `:3001`. Do **not** touch TAL-93900 payment fixtures from Track A.
