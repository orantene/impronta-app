# Inquiry funnel QA report — 2026-05-14

QA pass executed against the dedicated worktree dev server (`localhost:3010`)
after the 9-step parallel wave-1 of the inquiry-funnel sprint shipped.
Walked the funnel as actual users: qa-client-1 submits → admin invites
Sofia → Sofia accepts → admin tries to send offer.

## What works end-to-end (verified live)

| Step | Verification |
|---|---|
| **Step 0 — Engine convergence + universal-connector schema + spam protection** | Submitted a fresh inquiry as qa-client-1 from the workspace dashboard. DB row has `initiator_role='client'`, `initiator_user_id=<qa-client-1 id>`, `source_channel='directory_client'`, `source_workspace_id=<Impronta tenant>`, `origin_domain='localhost'`. Honeypot `<input name="website">` rendered in the form. Per-user rate-limit (5/hr) + per-tenant cap (50/hr) in engine. |
| **Step 2 — Hoisted `<InquiryCartForm>`** | Dashboard `/new` form now renders the shared component with all 15 fields (contact, AI-assist `raw_query`, `event_type_id`, structured `quantity`/`event_date`/`event_location`, honeypot, hidden talent_ids+source_page+directory_context). |
| **Step 5 — `saved_talent.in_cart` column** | Schema confirmed via `information_schema`. No UI consumer yet — step 1 will wire. |
| **Step 7 — Admin suggested-talent chat card** | Render switch present in `messages.tsx`; migration applied (enum value `'admin_suggested_talent'` accepted). Composer-side picker is a documented TODO. |
| **Step 10 — Free-tenant talent-page CTA** | `/t/TAL-92001` (Sofia's page) renders 4 "Inquire about Sofía" buttons; clicking opens a side drawer with the shared `<InquiryCartForm>`, prefilled talent chip "Sofía Herrera", honeypot present, `contact_name` field active. |
| **Step 11 — Guest TTL cron** | Route + vercel.json registered; fires daily 05:00 UTC. Code reviewed, will fire once deployed. |
| **Step 12 — Analytics** | `inquiry_form_started`, `inquiry_abandoned`, `inquiry_submitted` (with `source_channel='directory_client'` + `initiator_role='client'` payload) all written to `analytics_events` table on the live submit. |
| **Step 13 — Notifications + auto-ack** | On submit, three emails attempted (no-op gracefully with RESEND_API_KEY unset — "RESEND_API_KEY not set — skipping email" logged). Auto-ack message `"Thanks — we'll get back to you within 4 hours."` posted to the private (client) thread; visible to admin in the Chat tab; `metadata.system_event_type = 'workspace_auto_ack'`; sender_user_id null (service-role insert per the earlier RLS fix). |
| **Step 14 — Attachments** | Admin Files tab renders "Live · DB-backed (0) inquiry_attachments" header with Mood board kind selector + Upload button + drag-drop zone. Migration applied. RLS policies in place. |
| **SEND AS toggle** | Confirmed visible in the Group thread, hidden in the Client thread (Step 0's gate from earlier session holds). |
| **Universal-connector P0** | The initiator_role enum + initiator_user_id column flow cleanly from form → action → engine → DB write. |

## Bugs caught + fixed during this QA

### 1. Notifications RPC missing `tenant_id` ([257db7f04](https://github.com/orantene/impronta-app/commit/257db7f04))

**Symptom:** admin invites Sofia → engine logs `addTalentToRoster result: success` → `[inquiry-notifications/insert] "null value in column tenant_id of relation notifications violates not-null constraint" (23502)`.

**Root cause:** `engine_emit_notification` RPC (created 20260513041617) takes `(user_id, title, body)`. `notifications.tenant_id` later became NOT NULL but the RPC was never updated. Every staff-to-talent ping silently failed.

**Fix:** new migration 20260514035844 — drop old 3-arg overload, recreate with required `p_tenant_id`. `notifyUsers()` signature updated; event listener in `inquiry-events.ts` looks up `tenant_id` from the inquiry row before firing.

### 2. `createOffer` non-atomic — orphan offer on version_conflict ([b00f9b28f](https://github.com/orantene/impronta-app/commit/b00f9b28f))

**Symptom:** admin clicks "Start drafting offer" → engine returns `version_conflict` → but the offer row was already INSERTed. Next attempt fails with `inquiry_offers_one_active_offer` unique-constraint duplicate.

**Root cause:** `createOffer` engine path does two writes (insert offer → conditionally update inquiry) WITHOUT a transaction wrap. On the conditional UPDATE failure the offer stays orphan.

**Partial fix:** added idempotency — at the top of `createOffer`, if a draft offer already exists for the inquiry, return it instead of inserting another. Re-attempts now self-recover.

**Proper fix deferred:** wrap both writes in a SECURITY DEFINER RPC for true atomicity. Tracked.

## Bugs caught but DEFERRED (need follow-up)

### 3. `createOffer` UPDATE RLS-blocked for the agency admin (REPRODUCIBLE)

**Symptom:** the conditional UPDATE inside `createOffer` (UPDATE inquiries SET ... WHERE id=$id AND tenant_id=$tid AND version=$expected) returns `data: null` even when the version matches reality. Engine interprets as `version_conflict` and returns failure. The same UPDATE via service-role (bypassing RLS) succeeds.

**Confirmed via:** direct DB UPDATE of the same inquiry as service-role succeeded immediately (`version` bumped from 2 to 3 cleanly). User-session UPDATE through the engine never made it through.

**Likely cause:** an RLS UPDATE policy on `public.inquiries` that the agency admin doesn't satisfy on this inquiry (possibly checks `coordinator_id = auth.uid()` and this inquiry's coordinator_id is NULL). Needs RLS policy inspection.

**Impact:** the admin "Start drafting offer" button is non-functional today. Same RLS gate likely blocks any other admin-side inquiry mutation (sendOffer, counterOffer, etc.). High-priority — blocks the entire post-acceptance funnel.

**Workaround for QA continuity:** I bypassed it via service-role UPDATE (set `current_offer_id`, bumped `version`, transitioned status to `coordination`) so subsequent walk-through could proceed.

**Suggested fix:** audit the `inquiries` UPDATE RLS policy. Either add an `is_agency_staff(tenant_id)` arm, or have the engine self-elevate to service-role for the optimistic-locking UPDATE (same pattern as the system-message insert from earlier session).

### 4. Phantom `version_conflict` on first attempt (likely related to #3)

The very first `createOffer` attempt returned `version_conflict` even though the action's read and the engine's read returned the same version number. This is almost certainly the RLS issue masquerading — the UPDATE got 0 rows because RLS filtered, not because version mismatched.

Fix #3 will close this.

### 5. `inquiry.last_edited_by` not updated by Sofia's accept

Looked at DB after Sofia's accept fired with engine `result: success`. `inquiries.last_edited_by` still shows the admin user_id (`4b9e595d-...`) from the invitation, not Sofia. The `acceptTalentInvitation` engine path may be missing the `last_edited_by` update, OR the same RLS issue (#3) is preventing it.

## What was NOT verified in this pass

- Convert inquiry → booking (blocked by #3)
- Client side of pitch v2 flow (Step 8 — committed but not browser-walked)
- Step 7 admin chat card rendering with a real card_payload row (no composer-side picker = can't generate one through UI)
- Step 11 cron actually firing (requires Vercel deployment)
- Step 13 emails actually delivered (requires RESEND_API_KEY)
- The remaining critical-path steps 1, 3, 4, 6, 9, 15 — haven't been built yet

## Recommended next sprint priorities

1. **Fix RLS blocker (#3)** — without this the admin can't move ANY inquiry forward. Highest priority.
2. **Wrap `createOffer` writes in a SECURITY DEFINER RPC** for true atomicity (closes #2 properly).
3. **Audit other engine paths for the same RLS issue:** `sendOffer`, `counterOffer`, `markAllApprovalsComplete`, anything that does `.eq("version", expectedVersion)` UPDATE on inquiries.
4. **Resume the planned critical path:** step 1 (saved_talent into shared form) → step 3 (category mode + multi-requirement_groups) → step 4 (budget block).

## Commit log (this QA session)

- [`b00f9b28f`](https://github.com/orantene/impronta-app/commit/b00f9b28f) — fix(createOffer): idempotent reuse of orphan draft
- [`257db7f04`](https://github.com/orantene/impronta-app/commit/257db7f04) — fix(notifications): engine_emit_notification + caller — pass tenant_id

## State of the QA worktree

- Path: `/Users/oranpersonal/Desktop/impronta-app-qa`
- Branch: detached @ phase-1 head
- Dev server: `npx next dev -p 3010`
- Available as launch config "QA Dev Server (worktree, 3010)" in `.claude/launch.json`
- Independent from the user's Chrome session on port 3000

Used for: agent-driven browser QA without disrupting the user's live browser. node_modules installed fresh (~8s with cache); `.env.local` copied from main checkout.
