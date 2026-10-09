# Hold the offer send until every talent has approved (design memo, 2026-10-09)

Owner: Payments Developer. Status: DESIGN, no code yet. Decision from the PM: a staff-drafted offer must not reach the client (no price visible) until every talent on it has approved; the last approval sends it automatically; a talent rejection returns it to staff as a draft with her note; the client's Accept is hidden whenever approvals are pending.

## What happens today (verified in code)
- `sendOffer` (web/src/lib/inquiry/inquiry-engine-offers.ts) calls the RPC `engine_send_offer` (latest definition: supabase/migrations/20261231236000_inquiry_client_seat_without_account.sql). It sets the offer to `sent`, the inquiry to `offer_pending`, seeds one `inquiry_approvals` row per participant (client + each talent; the sender's own row is implicit), and emits OFFER_SENT (events, notifications, the "Offer sent to client" private card).
- The client sees the offer as soon as it is `sent`: the guest thread offer card (`offer_review`/`offer_event` cards, messaging-client.ts `offerFor` reads status `sent`), the client-safe view `inquiry_offers_client_view`, the /t chat cards, the client emails/notifications from OFFER_SENT.
- Accept is refused later (acceptDirect `blocking approvals`), now with `awaiting_approval` (#3170). The price is already visible by then.

## Why not "derive" visibility without a new state
Hiding a `sent` offer at read time would have to be repeated on every client surface (thread view, /t chat, client portal view, emails, notifications, pay-link preview, cron expiry), and OFFER_SENT would still fire at staff-send time. One missed surface leaks the price. A real state keeps every existing `status = 'sent'` reader correct by construction.

## Proposed state
New enum value `inquiry_offer_status = 'awaiting_talent'`: "staff sent it, talents have not all approved". Visible to staff and talents only (all client readers filter on `sent` and stay blind to it).

1. Migration A (own file, committed alone because `ALTER TYPE ... ADD VALUE` cannot be used in the same transaction): add `awaiting_talent`.
2. Migration B: update `enforce_inquiry_status_offer_pair` so `awaiting_talent` pairs with inquiry status `offer_pending` (same as sent) so staff/talent boards keep working; redefine `engine_send_offer`: if the offer has any approval row that is not the client's and not the sender's, set `awaiting_talent` and do NOT emit OFFER_SENT/client notifications (emit `OFFER_AWAITING_TALENT` to staff + talent instead); otherwise behave exactly as today.
3. `engine_submit_approval`: when the last non-client approval is accepted on an `awaiting_talent` offer, flip it to `sent`, stamp `valid_until` now (the client's clock starts when she can see it) and emit OFFER_SENT (the client gets the offer then). A talent rejection on `awaiting_talent` returns the offer to `draft` (inquiry back to `coordination`) and stores her note on the approval row; staff see it on the offer.
4. Idempotency and races: the flip is a conditional UPDATE `WHERE status = 'awaiting_talent'` inside the RPC (version checked as today); a double approval or a staff edit during the wait is refused with `version_conflict`.
5. Solo owner-talent (she is both sender and talent): no pending non-sender approval, so the send is immediate, unchanged.

## App changes (PR 2)
- Staff offer panel: "Waiting for <talent> to approve" (en/es/fr), the Send button becomes "Waiting"; draft edits are blocked while waiting (reopen by withdrawing to draft).
- Talent inbox already shows "Aprobar oferta / Rechazar"; reject takes a note.
- Client side: nothing renders for `awaiting_talent`; the Accept button is also hidden whenever an offer has pending non-client approvals (view-model flag), as the belt for old `sent` offers.
- `expire-offers` cron ignores `awaiting_talent` (no client clock yet) and a staff-side stale warning after N days.

## Tests required by the PM
1. Staff send with a pending talent approval: offer is `awaiting_talent`; the client thread / client view / guest cards return nothing; no client notification is emitted.
2. Last talent approves: offer becomes `sent`, valid_until stamped, OFFER_SENT emitted once, client now sees the offer.
3. Talent rejects: offer back to `draft`, inquiry back to `coordination`, her note stored and shown to staff.
Plus: solo owner-talent sends immediately; two talents, only one approved, still waiting; double approval idempotent; Accept hidden with pending approvals.

## Risk and rollout
- Touches the production database (enum value, trigger, two RPCs). Per the repo protocol the migrations must be applied (`npm run db:push`) BEFORE the PR that reads the new state merges; the enum value is additive and old code ignores it. The two RPC redefinitions change behavior for ALL sends the moment they are applied, so they must ship together with the code that reads `awaiting_talent` (or be applied only at merge time by the Release Manager).
- Existing `sent` offers with pending talent approvals keep working (they stay visible to the client; only Accept stays blocked and hidden).
- I cannot run these RPCs locally; they need a run on the isolated stack (fxlank) with a staff-drafted offer, a talent approve and a talent reject before any production apply.

## Proposed split
- PR 1: Migration A + B, RPC changes, engine TS (sendOffer/approval handling), engine tests. Reviewed by the PM; applied to fxlank first and exercised on the stack.
- PR 2: UI (staff waiting state, hide Accept flag, en/es/fr), view-model changes, cron.
- PR 3: notifications to staff/talent for waiting/approved/rejected.

## Open questions for the PM
1. Approvers: every talent participant except the sender (matches `splitDirectAcceptApprovals`). Agency staff approvals out of scope?
2. Should a talent who never answers auto-expire the wait after N days and return the offer to staff?
3. OK to apply Migration A to production ahead of the code (additive), with B applied at merge time?
