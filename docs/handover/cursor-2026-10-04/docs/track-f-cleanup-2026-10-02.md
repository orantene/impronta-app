# Track F — Cleanup findings · 2026-10-02

Agent: `bc-1cc56c33-3bfa-556a-8dc1-98a03fe7eb95`. Repo `orantene/impronta-app`. No destructive actions.

Source: [cursor-next-2026-10-02.md](./cursor-next-2026-10-02.md) TRACK F. Board: [PM-BOARD](./plans/PM-BOARD.md).

---

## 1. PR #2466 + source PRs

| PR | Title | State | Notes |
|---|---|---|---|
| [#2466](https://github.com/orantene/impronta-app/pull/2466) | chore: merge remaining open PRs (#2437 #2430 #2202 #2127 #2431) | **OPEN** | `chore/merge-open-prs` @ `097d7accc`; mergeable but **BLOCKED** on checks |
| [#2437](https://github.com/orantene/impronta-app/pull/2437) | talent profile locales + hreflang | **OPEN** | waiting on #2466 |
| [#2430](https://github.com/orantene/impronta-app/pull/2430) | taxonomy expansion | **OPEN** | waiting on #2466 |
| [#2202](https://github.com/orantene/impronta-app/pull/2202) | retire legacy talent-location flow | **OPEN** | waiting on #2466 |
| [#2127](https://github.com/orantene/impronta-app/pull/2127) | stale-deployment reload banner | **OPEN** | waiting on #2466 |
| [#2431](https://github.com/orantene/impronta-app/pull/2431) | seed 224 demo talents | **OPEN** | waiting on #2466 |

**Verdict: waiting.** #2466 is not merged. Source PRs are still open (expected to auto-close when #2466 merges).

#2466 checks at report time: Admin boot / Fidelity / Builder perf / Vercel = pass; Structural quality gate + Local Supabase migration chain = **in progress**.

---

## 2. `git branch -r --no-merged origin/main`

Fetched `origin/main` then listed remotes.

- **Count:** **1396** remote branches not merged into `origin/main`.
- Prefix mix (approx): `feat` 552 · `fix` 510 · `docs` 86 · `cursor` 54 · `chore` 46 · plus stale `claude/` / `backup/` / worktree noise.

### Meaningful leftovers (actionable)

**Open-PR heads (only live merge candidates):**

| Branch | PR |
|---|---|
| `origin/chore/merge-open-prs` | #2466 (lead) |
| `origin/feat/talent-profile-locales` | #2437 |
| `origin/feat/taxonomy-expansion` | #2430 |
| `origin/feat/jor-beauty-site-and-booking` | #2202 |
| `origin/fix/stale-deployment-banner` | #2127 |
| `origin/feat/demo-seeder-224` | #2431 |
| `origin/feat/looks-v2` | #2000 (see §3 — superseded; do not merge) |

After #2466 merges, the five source branches above should go away with their PRs. The bulk of the other ~1389 remotes are historical agent/session leftovers (safe to ignore for merge lane; optional remote prune is an Oran/ops decision, not Track F).

**Stale session-named remotes (sample, not chats):**  
`origin/claude/charming-mclaren-94bc9e`, `computer-work-test-l3h59h`, `reverent-dirac-c2a6cb`, `talent-website-phase1-wip`, `talent-website-qa-harness`, `vigilant-sutherland-5edad9`.

---

## 3. PR #2000 Looks v2

**CLOSED** 2026-10-02 (not merged). Superseded earlier by [#2114](https://github.com/orantene/impronta-app/pull/2114). Nothing further for Track F.

---

## 4. Leftover Jor test data — cleanup attempt (2026-10-02)

Oran **approved** cleanup with constraints: refund order `345d9103` in Stripe **test** mode first, then delete only the listed rows. Ask list: [jor-test-data-cleanup-ask.md](./jor-test-data-cleanup-ask.md).

### Exact ids deleted (Mac run · 2026-10-02T18:55Z)

**Refund:** order `345d9103-5b27-40b2-bf0f-01f3b4741bc8` · PaymentIntent `pi_3ULslA7Oqi82ykAI1WCxw6Lg` · Stripe refund `re_3ULslA7Oqi82ykAI1qTC82tD` · MXN 300.00 · TEST (`livemode=false`) · **succeeded**

Note: Stripe had the checkout session `complete`/`paid`, but the DB still showed the order `pending_payment` and the transaction `payment_requested` — the paid webhook never reached the app (no `stripe listen` running at the time).

**Inquiries (5):**
- `6af9b754-8f44-43ed-84a7-5ddb3c64f589` · qa-jor-booking-h
- `836960a0-62bb-4bcf-a7ce-ca36f3b7afd1` · qa-jor-booking-i
- `61735472-bdd5-4ac6-b0e6-c8746f057b0b` · qa-jor-booking-g
- `3659993f-0f62-4bd2-af7f-f1ee3f8d49f9` · qa-jor-booking-e
- `fefe09e1-d1c8-4100-8d67-29ada60b11ff` · qa-jor-booking-c

**Guest records (`customers`, 11 of 14 rows for the 9 emails):**
- `37b2d8d0-a6b8-42fa-974c-a0ae7d69bc25` · qa-jor-booking-a@impronta.test
- `b7d99ed9-2fb4-49ce-a37b-0c699dc1d0bc` · qa-jor-booking-b@impronta.test
- `05e07e27-86ee-414d-ada9-e96661d7dd72` · qa-jor-booking-c@impronta.test
- `909ccee2-d049-4a6f-b223-1ec043ca7397` · qa-jor-booking-d@impronta.test
- `238f355e-3672-4f6c-9cf9-25634f048995` · qa-jor-booking-e@impronta.test
- `580bdb40-9fe8-4511-8ec4-5e84703470aa` · qa-jor-booking-f@impronta.test
- `ed59a1b1-7adb-4b05-b67c-0f439cf84368` · qa-jor-booking-g@impronta.test
- `0224da8c-3395-4571-99a2-b3937db79a29` · qa-jor-booking-g@impronta.test
- `05a57e8d-00da-4db0-9477-9188fd7eeb1f` · qa-jor-booking-h@impronta.test
- `7988bb09-cf84-44a2-982b-81b9d27b5b4f` · qa-jor-booking-i@impronta.test
- `631219af-766d-4c07-b380-c3a1dd2de5ee` · qa-jor-booking-i@impronta.test

**Order:**
- `345d9103-5b27-40b2-bf0f-01f3b4741bc8` (cascade removed payment link `6390ac61-7bd6-4de6-94ba-f1e09ead91c6` + reservation `88bf0b7c-3e7f-415d-ad9f-ab99d25a3cb6`)

**QA PathA Bozo bookings (2026-09-28):**
- `63a8ae22-e4b9-4fa2-bc92-051636938e8d` · talent_bookings · title "Bozo" · 2026-09-28 18:15Z · from inquiry `f19db11e…` (QA PathA UI)

Re-select after delete: all of the above return 0 rows.

**Not deleted (outside the listed ids — needs an Oran decision):**
- Guest rows blocked by unlisted orders (`orders.customer_id` is RESTRICT): `b69c50c6-5df5-48d0-a139-baad2e09acdd` (b · order `767fd4ec` cancelled), `fd1a2907-ff5a-43cd-bb18-666eced2c269` (d · order `eb9efe1c` cancelled), `1d415efc-2751-49e8-b313-7ab07d0fbcae` (f · order `3fccfecb` pending_payment)
- Other QA inquiries for the same guest emails: `63b52b8f-4e5c-40bc-b9ec-316033f5acf0` (a), `c75b5a70-db92-4266-9462-57390c338167` (b), `247de59b-e238-462c-8880-13a011f68d55` (d), `07593eb0-91f6-4112-9f69-853c3770a7a9` (f)
- Other QA orders: `767fd4ec…`, `eb9efe1c…`, `3fccfecb…`, `0810e8bc…`, `311dac92…`, `3c01000d…` (draft, was on inquiry 836960a0), `3aa35b32…` (PathA, inquiry f19db11e)
- PathA inquiry `f19db11e-21de-4a6e-aac0-60e1fb668e5c`
- `agency_bookings` `aa3fbfcf-138a-457e-93e5-638d3a307f90` (cancelled) and `booking_transactions` `d30bd9dc-c67a-4f7f-81b4-817b4ef74f29` (still `payment_requested`, now `order_id` null) from order 345d9103

### Earlier blocker (cloud VM, resolved by Mac run)

Cloud agent VM has **no** credentials to touch Stripe or the shared Supabase:

| Need | Status on this VM |
|---|---|
| `web/.env.local` | missing |
| `STRIPE_SECRET_KEY` (`sk_test_…`) | unset |
| `SUPABASE_SERVICE_ROLE_KEY` + `NEXT_PUBLIC_SUPABASE_URL` | unset |
| `VERCEL_TOKEN` (to `vercel env pull`) | unset |
| Stripe CLI | not installed |
| Self-hosted Cursor worker (Mac `.env.local`) | none connected |

Could not look up full UUID for order prefix `345d9103`, confirm `livemode=false`, or issue a test-mode refund. **Stopped before any DB delete.**

### Unblock (Mac local agent)

Authoritative steps: [track-f-jor-cleanup-mac-runbook.md](./track-f-jor-cleanup-mac-runbook.md) (also in [mac-local-agent-kickoff.md](./mac-local-agent-kickoff.md)).

1. Mac agent loads `web/.env.local` (`sk_test_`, Supabase service role) — never paste secrets.
2. Refund `345d9103` (TEST) → delete listed inquiries / guests / PathA Bozo bookings / order → **append exact full UUIDs deleted in §4 above**.

---

## 5. Old Claude chats to archive

**Not findable from this VM.** Archive list must be done on Oran's Claude desktop/app.

---

## Blocked on Oran

1. **Credentials** for Stripe test + Supabase service role (see §4) so refund + delete can run.
2. Optional: remote branch prune of the ~1.4k no-merged historical remotes.
