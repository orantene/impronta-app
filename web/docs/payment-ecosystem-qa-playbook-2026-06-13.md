# Tulala Payment Ecosystem — Stripe QA Playbook

> A deep, run-top-to-bottom QA script for the **entire money system**: onboarding → inquiry →
> coordinate → offer → approve → convert → charge → payout → reconcile, across **admin / talent /
> client** and both front-door economics (Tulala hub vs agency). Each test is a **user story** (what
> the user does, what they receive, when the goal is met) followed by the **QA process** (exactly how
> to prove it) and a **confidence** label reflecting what's already proven.
>
> Dated 2026-06-13. Companion docs: `stripe-connect-restore-and-payout-switch-plan-2026-06-13.md`,
> `conversational-inquiry-*.md`. Source-of-truth memory: `project_payments_platform_decision.md`.

---

## Executive summary — the broad picture (read this first)

**Two Stripe surfaces.** (A) **Booking money rail** — client charge → split payout to talent + agency +
platform (Connect, "separate charges and transfers"). (B) **Subscription billing** — recurring plan
fees (workspace plans + talent Pro/Portfolio), trials, dunning, renewals. This playbook covers BOTH
(§1–§10 + §11).

**The lifecycle, end to end:**
`onboard payout (§1) → inquiry born (§2, ~12 front doors) → coordinate (§3) → offer (§4) → approve
[client+talent] (§4) → convert → freeze commission snapshot (§5) → client charges (§6) → webhook marks
paid → 3-way payout (§7) → reconcile/refund/dispute (§8)`, with the platform **rail switch (§9)**,
**dashboards (§10)**, **subscriptions (§11)**, and the **production go-live gate (§12)**.

**State at a glance (2026-06-13):**
- ✅ **Proven (real Stripe artifacts):** commission lane math (396 unit tests); `markPaid → 3-way
  Connect transfer` (hub + agency); real PaymentIntent create + confirm; **the engine spine live**
  (`send_offer → submit_approval → convert_to_booking`); convert→snapshot **correct-by-code**;
  idempotency; the rail switch (shipped to prod, Connect-default).
- 🟡 **Partial (engine proven, UI/webhook not):** client Pay-now Payment Element; the **live signed
  webhook** (`payment_intent.succeeded → markPaid`) — simulated only (no Stripe CLI yet); talent
  Offer-tab approve button; dashboards.
- ⬜ **Untested:** embedded Connect onboarding UX (talent + agency); most front doors (§2.2–§2.13);
  coordinator management (§3.3); held-payout release + reconcile cron (§7.3/7.4); refunds/disputes (§8);
  flip-to-Global-Payouts (§9.2); **all of subscription billing (§11)**.
- 🔴 **Live-key untested (biggest real risk):** the first real production booking on LIVE Connect
  (real talent onboarding, live webhook, `STRIPE_ALLOW_LIVE_PAYOUTS`) — §12.

**Known gaps / feature-asks (not bugs, decide separately):**
- **Client in-conversation talent picker (§2.10)** — likely missing; today talent is added by the
  coordinator or via the directory cart. *Deferred — handle as needed.*
- **`book_again` / `saved_talent` → inquiry (§2.9)** — enum values, no code path. *Deferred — as needed.*
- **Deposits / partial payment (§6.3)** and **instant-book (§6.4)** — config columns exist, no flow.
  Expect gaps.

**To actually execute this QA, two prerequisites unlock most of it:**
1. **Install the Stripe CLI** → `stripe listen` proves the live signed webhook (§6.2) and lets us
   `stripe trigger` disputes/refunds (§8).
2. A careful **owner-run live-keys dry run** (§12) before real clients pay.

**Fastest path to high confidence:** the single-pass **spine in §14**, run once on the agency front
door and once on the hub front door, then money-safety (§8) and the live gate (§12).

---

## 0. How to use this playbook

### 0.1 What the money model is (one paragraph)
The full client charge (`gross_charged = subtotal + client_surcharge + base_reservation_fee`) is
collected on the **platform** Stripe account, then fanned out by "separate charges and transfers":
the **talent** gets `talent_net` (their full quote, protected on agency deals), the **agency** gets
`workspace_fee` (only on agency-owned bookings), and the **platform retains** `platform_fee`. The
platform take is a **split fee** (client surcharge added on top + seller-side deduction). Hub
inquiries = talent is the seller (no agency lane); agency inquiries = three lanes. The active payout
rail is the **platform switch** (`platform_settings.active_payout_system`, default `connect`).

### 0.2 Test harness & setup (do once, before Section 1)
| Need | How |
|---|---|
| Dev server | `preview_start "Next.js Dev Server"` (port 3000; `localhost:3000` is in `agency_domains`). Agency storefront hosts: `impronta.lvh.me`, `qa-agency.lvh.me`, `hub.lvh.me` (need the local-host-proxy launch configs). |
| Sign in (passwordless QA fixtures) | `GET /api/dev/signin?email=<x>@impronta.test&next=<path>`. Admin `qa-admin@impronta.test` (super_admin); talents `tulum-talent-sofia@impronta.test`, `…-luis@…`; clients `qa-client-1@impronta.test`, `qa-client-2@…`. |
| Stripe sandbox | Test keys already in `web/.env.local` (`sk_test`/`pk_test` for platform `acct_1ThlEN7…`, US/USD, Connect+Express on). |
| **Webhook leg (critical, not yet wired)** | Install Stripe CLI → `stripe listen --forward-to localhost:3000/api/webhooks/stripe`; put the printed `whsec_…` in `STRIPE_WEBHOOK_SECRET`. Without this the `payment_intent.succeeded → markPaid` leg can only be simulated. |
| Connected accounts | Reuse / recreate transfer-ready US **Custom** test accounts (test-magic `id_number 000000000` + `address_full_match`) for rail proofs; use **embedded onboarding** to prove the real talent/agency UX. |
| Fund platform balance | charge `tok_bypassPending` so transfers settle from available (not pending) balance. |
| DB assertions | Supabase MCP `execute_sql` on project `pluhdapdnuiulvxmyspd`. Stripe assertions: `stripe.transfers.list({transfer_group:'booking_<id>'})`, `balance.retrieve({},{stripeAccount})`. |
| Driving app fns | `NODE_OPTIONS='--require ./scripts/register-server-only-test.cjs' npx tsx --env-file=.env.local <script>` (resolves `@/` + stubs `server-only`). |

### 0.3 Discipline
- **Test fixtures only** in prod Supabase (`is_test_account` talents, `qa-*` agencies, `a5a5a5a5…`/`b6b6b6b6…` bookings). **Never** mutate a real tenant (Impronta `00000000-…-0001`) or real talent. **Delete seed rows + restore fixtures** after every scenario.
- Card numbers: `4242 4242 4242 4242` (success), `4000 0000 0000 9995` (decline), `4000 0025 0000 3155` (3DS). Test PM id: `pm_card_visa`.
- Status-trigger gotchas: `booking_transactions` must INSERT as `draft` then UPDATE → `payment_requested`; `payment_requested` needs a `payout_receiver_id` → `payout_accounts` row whose `tenant_id` matches the txn `source_tenant_id`.

### 0.4 Confidence legend (current state, this session)
- ✅ **PROVEN** — exercised with real artifacts this session.
- 🟡 **PARTIAL** — pieces proven in isolation; not end-to-end through the UI/webhook.
- ⬜ **UNTESTED** — mapped in code, never run.
- 🔴 **LIVE-KEY UNTESTED** — never run against production live Stripe keys / real connected accounts.

### 0.5 Execution order
Run **1 → 12** top to bottom. Sections 1–2 set up actors; 3–7 are the spine (one continuous booking);
8 is money-safety; 9 the switch; 10 dashboards; 11 subscription billing (separate surface); 12 the
production go-live gate. Record each result in the table in §13; the fast path is the spine in §14.

---

## 1. Payout onboarding (get paid set-up)

### 1.1 — Talent connects their bank (embedded Connect onboarding) · 🟡 PARTIAL
**Story.** As a **talent**, I open Payouts, click "Set up payouts", complete Stripe's embedded
KYC + bank form inside the app (I never leave for stripe.com), and return to a green "You're set up to
get paid" card. **Goal met** when `talent_profiles.stripe_account_status='enabled'` and payouts are
enabled.
**QA process.**
1. Dev-signin as a talent with a **claimed account** in a **US** residence (Connect can't open MX/LATAM).
2. Go to `/[tenant]/talent/settings/payouts` (or the `talent-payouts` drawer). Confirm the Connect card shows (switch=connect ⇒ GP card hidden).
3. Click "Set up payouts" → `ensureTalentPayoutAccount` → `createTalentAccountSession` mints an AccountSession → `<ConnectEmbeddedOnboarding data-testid="connect-embedded-onboarding">` mounts (needs `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`).
4. Complete the embedded test flow; on exit `refreshTalentPayoutStatus` runs.
5. **Assert:** DB `talent_profiles.stripe_account_id` set, `stripe_account_status='enabled'`, `stripe_payouts_enabled=true`; UI card flips to `data-testid="talent-payout-status"` green.
**Why only PARTIAL:** the embedded mount + KYC click-through was never run this session (only API-created Custom accounts).

### 1.2 — Talent in an unsupported country hits a clean wall · 🟡 PARTIAL
**Story.** As a **MX/LATAM talent** in connect-mode, I should NOT see a dead "use Global Payouts below" pointer (GP is hidden). I see "Payouts aren't available in your country yet — contact support", and the country picker only offers Connect-supported countries.
**QA process.** Dev-signin as a talent whose residence is MX. Confirm: GP card hidden; country `<select>` excludes MX; clicking set-up surfaces the switch-aware copy from `stripe-connect-talent.ts` (not the GP pointer). **Assert** no GP card anywhere in the DOM.

### 1.3 — Agency connects its payout account · ⬜ UNTESTED
**Story.** As a **workspace owner/admin**, I open Admin → Payouts, click Connect, pick country **US**, complete embedded onboarding, and see status **Active**. **Goal met** when `agencies.stripe_account_status='enabled'` + payouts enabled (so the agency's `workspace_fee` leg can settle).
**QA process.** Dev-signin `qa-admin@impronta.test`, go to `/[tenant]/admin/payouts` → `loadPayoutsSurface` → `getConnectAccountSessionAction` embedded onboarding → complete. **Assert** the `agencies` row mirrors enabled; StatusPill "Active". (Use a `qa-*` agency, not real Impronta.)

### 1.4 — Switch hides/show Global Payouts onboarding · ✅ PROVEN (code) / 🟡 live
**Story.** As **platform admin**, flipping HQ Settings → Payout system to **Connect** hides all GP onboarding for every talent and forces every payout to Connect; flipping to **Global Payouts** restores the GP card + per-talent crypto routing.
**QA process.** As `qa-admin`, `/platform/admin/settings` → toggle. Reload a talent payouts page each way; assert GP card hidden under connect, present under global_payouts. Rail: unit-tested (`payout-rail-policy.test.ts`); to prove live, drive `resolveTalentPayoutRail` for a `crypto_payouts_enabled=true` talent under each mode.

---

## 2. Front doors (how an inquiry is born)

There are **~12 entry points**, not 4. Each sets a `source_channel` and either pre-attaches talent or
leaves talent to be chosen later. They all funnel through one of two engine fns:
`createInquiryFromIntent` (conversational/guest) or `submitInquiry` (structured/fan-out). Group them by
surface. Core entry files: `app/t/[profileCode]/_actions/guest-chat-actions.ts`,
`app/(public)/directory/actions.ts`, `app/(workspace)/[tenantSlug]/client/_actions/inquiry-intent-actions.ts`,
`app/api/discover/inquiry/route.ts`, `lib/server-actions/admin-inquiries.ts`, `lib/pitch/pitch-engine.ts`.

### A. Public / guest doors

**2.1 — Guest chats a specific talent (`/t/<code>`) · ✅ PROVEN**
Story: a logged-out guest opens "Message" on a talent profile, types the event, leaves name+email, gets
the honest auto-ack. Talent **pre-selected** (the profile owner). `source_channel="public_talent_profile"`.
QA (done): inquiry on **hub** tenant, guest_session + client auto-provisioned, client/coordinator/talent
participants, auto-ack present. Caveat: claim email needs `RESEND_API_KEY`.

**2.2 — "Message this talent" from a directory/storefront card · ⬜ UNTESTED**
Story: on the agency directory, the client clicks Message on a talent card and starts a conversation with
that talent attached. QA: trigger from `directory-inquiry-sheet`; assert the talent is on the lineup and
the inquiry routes to the agency tenant. (Distinct from the structured form below.)

**2.3 — Homepage / storefront *generic* message (no talent picked) · ⬜ UNTESTED ← your point**
Story: a guest messages from the agency/hub **home page** with **no talent selected**; the agency
"recommends" talent later. `startGuestChatInquiry` with `talentProfileId=null`,
`selection_mode="agency_recommends"`, `source_channel="agency_site"`/`"hub_site"`. QA: submit a homepage
message with no talent; **assert** inquiry created with no talent participant + `selection_mode=agency_recommends`;
the coordinator can then add talent (see 2.10).

**2.4 — Structured inquiry FORM from the directory · ⬜ UNTESTED**
Story: the client fills the "Request"/inquiry form on the storefront, having selected one or more talent
from the directory/cart. Registered → `submitClientInquiry` (`directory_client`); guest →
`submitGuestInquiry` (`directory_guest`); both → `submitInquiry`. QA: select talent(s) into the cart →
submit form → assert all talent on the lineup, roster-validated, directory context captured, agency tenant.

**2.5 — Guest from agency storefront → agency-owned (economics door) · ⬜ UNTESTED ← retest priority**
Story: a guest inquiry from `impronta.lvh.me` is **owned by the agency**, so on conversion the **agency
earns a commission lane**. QA: start the `impronta.lvh.me`/`qa-agency.lvh.me` proxy; submit; **assert**
`inquiries.tenant_id=agency`, owning-party resolver = `agency`, agency default coordinator attached
(not the talent). This is the live front-door half of the agency economics I only hand-seeded.

### B. Registered-client doors (the dashboard has several)

**2.6 — Client dashboard "New inquiry" (drawer + autosave draft + one-shot) · 🟡 PARTIAL**
Story: a signed-in client starts a project from `/[tenant]/client` — via the `InquiryDrawer` (autosaves a
draft every ~10s) or a one-shot submit. `saveDraftAction`/`submitDraftAction`/`submitInquiryNowAction` →
`createInquiryFromIntent`. `source_channel="direct_client_dashboard"`. QA: open the drawer, add talent +
brief, save draft (assert draft row), submit (assert inquiry). Talent may be pre-filled or chosen here.

**2.7 — Discover: single talent · ⬜ UNTESTED**
Story: a signed-in client clicks "Inquire" on one Discover card. `POST /api/discover/inquiry` →
`submitInquiry`, `source_channel="discover_single_talent"`. QA: assert one inquiry on that talent's primary
roster tenant; skipped-talent reasons (not discoverable / no roster) reported.

**2.8 — Discover: shortlist / multi-talent fan-out · ⬜ UNTESTED**
Story: the client inquires about **2+ talents** (or converts a saved shortlist); the system **fans out one
inquiry per owning tenant** (each tenant gets only its rostered talents). `source_channel="discover_shortlist"`.
QA: pick talents across 2 tenants → assert N inquiries, correct per-tenant talent subsets, `shortlist_id`
in source context. (This is the multi-tenant path — exercises #1 approval-population too.)

**2.9 — Re-inquire / "Book again" / saved-talent → inquiry · ⬜ RESERVED (verify built)**
`source_channel` enum has `book_again` and `saved_talent`, but the agent found **no active code path**.
QA: confirm whether a "Book again" on a past booking or a "saved talents → inquiry" button exists; if not,
log as a **gap/feature**, not a test.

### C. Talent selection *inside* the flow (your explicit point)

**2.10 — Client/coordinator picks talent after the conversation starts · ⬜ UNTESTED ← VERIFY (possible gap)**
Story: when an inquiry started with **no talent** (2.3) or the client wants to add others, talent can be
**selected within the message/inquiry flow** — not only pre-attached. Today this is confirmed on the
**coordinator** side (admin adds talent to the lineup / `admin_suggested_talent` card) and via the
**directory cart** before submit (2.4). **Open question to verify:** is there a **client-facing in-conversation
talent picker** (the client chooses which talent inside the chat after starting)? QA: in a started
conversation with no/partial lineup, look for a client-side "choose/add talent" control; **assert** it adds
an `inquiry_participants` talent row (and re-seeds the approval set). If absent → this is a **feature gap**
to build (matches your ask: "the client should have the option to select which talent in the message flow").

### D. Admin / pitch doors

**2.11 — Admin manually creates an inquiry on a client's behalf · ⬜ UNTESTED**
Story: an admin/coordinator logs a phone/WhatsApp/email lead via the New-inquiry sheet; talent added
post-create. `createAgencyInquiry` → `submitInquiry`, `source_channel="admin_manual"`/`"admin_created"`
(or `phone`/`whatsapp`/`email`). QA: create with client name+email (no `client_user_id`), assert creating
staff becomes coordinator, audit `CREATED_MANUAL`, talent added via roster picker after.

**2.12 — Admin PITCH → inquiry · ⬜ UNTESTED ← your point**
Story: an admin **pitches** curated talent to a prospect (`/share/pitch/[token]`); the recipient (guest or
signed-in) accepts → it converts to an inquiry with the pitched talent pre-attached. `convertPitchToInquiry`
→ `submitInquiry`, `source_channel="pitch"`, `source_pitch_id` set; **idempotent** (double-submit = same
inquiry); pitch-curated talent **bypass the contact-policy trust gate**. QA: create a pitch → open the share
link → convert → assert inquiry with `source_pitch_id`, only non-removed talents attached, re-convert yields
the same inquiry.

**2.13 — Inbound phone / WhatsApp / email · ⬜ UNTESTED**
Story: a lead that arrived off-platform is logged by admin with the right `source_channel`. QA: covered by
2.11's source picker; assert the channel value persists for attribution.

> **Front-door matrix to fill:** guest × {talent-profile, directory-card, homepage, form} ; registered ×
> {dashboard-drawer, discover-single, discover-shortlist} ; admin × {manual, pitch, inbound} ; hub vs agency
> for each. Prioritize **2.5** (agency economics), **2.3 + 2.10** (your homepage + in-flow talent select),
> and **2.12** (pitch).

---

## 3. Coordination (who runs the booking)

### 3.1 — Talent self-coordinates a hub inquiry · 🟡 PARTIAL  ← retest priority
**Story.** As a **claimed talent** contacted directly via the hub, I am **auto-made coordinator** and broker the client myself on the private thread (no agency in the middle). **Goal met** when the engine seeds my `role='coordinator', status='active'` row and I can see + post to the Client thread.
**QA process.** Use a talent **with a claimed `user_id`** (e.g. Sofía) on a hub inquiry → `inquiry-engine-submit` self-coord branch. **Assert** two participant rows for the talent (talent + active coordinator); dev-signin as that talent and confirm the **Client tab** is visible + composer works. (This session it correctly *fell back* to the platform coordinator only because the test talent was unclaimed — the claimed path is unproven.)

### 3.2 — Agency coordinator runs an agency inquiry · ⬜ UNTESTED
**Story.** As an **agency coordinator**, I manage the client; the talent only **approves** the offer. **Goal met** when the agency's coordinator is primary and the talent has no client-thread access.
**QA process.** Agency inquiry (2.2) → assert `assignCoordinatorFromSettings` picked `agencies.default_coordinator_user_id` (or owner); talent participant is talent-only.

### 3.3 — Admin manages coordinators · ⬜ UNTESTED
**Story.** As **admin**, I reassign the primary coordinator (with a handoff note), add/remove a secondary coordinator, and choose to either **book the requested talent** or **assign someone else from the roster**. **Goal met** when `inquiries.coordinator_id` / secondary participant rows update and a `COORDINATOR_ASSIGNED` event + handoff note post.
**QA process.** As admin on a real inquiry, exercise `reassignCoordinatorAction`, `addSecondaryCoordinatorAction`, `removeSecondaryCoordinatorAction`, `promoteToPrimaryCoordinatorAction` (`inquiry-engine-coordinator.ts`); assert DB + the private-thread system note.

---

## 4. Offer & approval (agree the money)

### 4.1 — Admin builds & sends an offer · ⬜ UNTESTED  ← retest priority
**Story.** As **admin/coordinator**, I add talent to the lineup, enter line items (`unit_price` the client pays, `talent_cost` the talent's quote), set booking terms (deposit %, refund policy, balance method), and **Send to client**. **Goal met** when `inquiry_offers.status='sent'`, `current_offer_id` set, and an `offer_event` card posts to both threads.
**QA process.** Admin → inquiry with a lineup talent → Offer tab → "Start drafting offer" → fill the line-item editor → `sendOfferAction` (`engine_send_offer`). **Assert** offer row + card + that invited line-item talents flip to `active` (the #1 unification).

### 4.2 — Client approves the offer · 🟡 PARTIAL  ← retest priority
**Story.** As **client**, I see "Approve offer ($X)" with the booking terms, approve, and learn I'm waiting on the other parties. **Goal met** when my approval is recorded and (if last) the inquiry flips to `approved`.
**QA process.** Dev-signin client → `/client/messages` → Offer tab → Approve → `clientApproveCurrentOffer` → `clientAcceptOffer` → `engine_submit_approval`. **Assert** approval row; "awaiting others" if talent hasn't; `offer_event` card.

### 4.3 — Talent approves via the Offer tab · ⬜ UNTESTED  ← YOU EXPLICITLY FLAGGED THIS
**Story.** As **talent**, I open the Offer tab, see my **take-home** ("$X after agency + platform fee"), and click **Approve** (or Decline / counter-rate). **Goal met** when `talentRespondToOffer` records my approval and posts the group-thread `offer_event` card; when all parties have approved, the inquiry is `approved`.
**QA process.** Dev-signin a **claimed** talent on a sent-offer inquiry → Offer tab → confirm `loadMyInquiryTakeHome` shows the figure → click Approve → `respondToInquiryOffer` → `engine_submit_approval`. **Assert** approval row + card; decline + counter-rate (`submitMyCounterRate`) paths too.

### 4.4 — Multi-talent inquiry converges · ⬜ UNTESTED
**Story.** As admin on a **2+ talent** offer, the booking only becomes approvable when the **client + every line-item talent** approve. **Goal met** when the unified approval set (client + offered talents) is all-green and no false "shortfall" blocks convert.
**QA process.** Seed/drive a 2-talent inquiry; approve client + both talents; assert `engine_inquiry_group_shortfall` = 0 and convert is enabled (the #1 fix).

---

## 5. Convert → snapshot (freeze the money) · 🟡 PARTIAL ← BIGGEST GAP

### 5.1 — Admin converts an approved inquiry to a booking
**Story.** As **admin**, once everyone approves I click **Move to Booked**. **Goal met** when an `agency_bookings` row is created AND a **per-participant `booking_commission_snapshot`** is frozen whose lanes (`talent_net + workspace_fee + platform_fee == gross_charged`) match the offer + commission config.
**QA process.** Drive `engine_convert_to_booking` via the admin UI on the real approved inquiry from §4. **CRITICAL ASSERTION (the seam I hand-waved):** read the resulting snapshot and verify the **real engine** (`persistBookingCommissionSnapshot` → `engine_load_commission_context` → `resolveBookingCommissions`) produced the correct lanes — hub inquiry ⇒ `owning_party_type='talent'`, `workspace_fee=0`; agency inquiry ⇒ three lanes with the agency's margin. Compare against the §0.1 math by hand.
**Why PARTIAL:** every money proof this session used **hand-seeded** snapshots. The path "built offer → correct frozen snapshot" is only unit-tested, never driven live.

---

## 6. Charge (client pays)

### 6.1 — Client pays in-thread (Payment Element) · 🟡 PARTIAL  ← retest priority
**Story.** As **client**, I click **Pay now**, a Stripe Payment Element opens in a drawer, I enter a card, and I see "Paid". **Goal met** when a real PaymentIntent on the platform account succeeds for `gross_charged`, carrying `metadata.transaction_id`.
**QA process.** Dev-signin client → booking with a `payment_requested` txn → "Pay now" → `PayNowSheet` → `createInquiryPaymentIntent` → `createPaymentIntentForTransaction` → Payment Element mounts (needs `pk_test`) → enter `4242…` → confirm. **Assert** PI `status=succeeded`, amount = `gross_charged`, `metadata.transaction_id` set.
**Proven in isolation:** `createPaymentIntentForTransaction` returns a real PI + confirm succeeds (script). **Unproven:** the **UI** path (`PayNowSheet` + auth-wrapped `createInquiryPaymentIntent` resolving the client's booking) and the Element mount.

### 6.2 — The webhook marks it paid · 🟡 PARTIAL  ← retest priority
**Story.** (System.) When the charge succeeds, Stripe calls our webhook and the booking flips to paid + the payout fires — without the client doing anything more.
**QA process.** With `stripe listen` forwarding, complete 6.1; the real `payment_intent.succeeded` hits `/api/webhooks/stripe` → `handleStripeWebhook` (signature verify + idempotency claim) → `classifyStripeEvent` → `booking_payment` → **#5 amount guard** → `markPaid`. **Assert** no signature 400; `booking_transactions.status='paid'`; `agency_bookings.payment_status='paid'`/`client_revenue_lifecycle='fully_paid'`. **Unproven:** the live signature-verified webhook delivery (this session called `markPaid` directly; routing is only unit-tested).

### 6.3 — Deposit / partial payment · ⬜ UNTESTED (likely not built)
**Story.** As **client**, when terms set a deposit %, Pay-now charges the deposit now and shows a balance-due card for later.
**QA process.** Set deposit terms on an offer → convert → confirm the charge = deposit, not full; balance-due surfaced. **Note:** audit found `deposit_amount_cents`/`deposit_paid_at` columns but **no deposit charge UI** — expect this to FAIL / be a feature gap.

### 6.4 — Instant-book · ⬜ UNTESTED (likely not built)
**Story.** As **client** on an instant-book talent, I skip the approval round-trip — fixed price, pay immediately.
**QA process.** `instant_book_default` config exists; confirm whether a path skips offer-approval. Expect a gap.

### 6.5 — Off-platform (cash/wire) · ⬜ UNTESTED
**Story.** As **admin**, I mark a booking paid by cash/wire; no card is charged, but the platform's commission **accrues** to bill the workspace later.
**QA process.** Convert with `payment_method='cash'` → `isOffPlatformPaymentMethod` → assert a `commission_movement` accrual + `platform_commission_balances` bump (the Stripe-Invoice settlement is a known partial).

### 6.6 — Admin "Mark received" reaches the same payout · ✅ PROVEN (path)
**Story.** As **admin**, marking a transaction received (offline) also pays the talent.
**QA process.** `markPaid` runs `executeBookingTransfers` regardless of trigger — proven this session. Re-confirm via the admin action UI.

---

## 7. Payout (everyone gets their share)

### 7.1 — Hub booking pays talent + platform · ✅ PROVEN
**Story.** On a hub booking, the **talent** receives their net and the **platform** keeps its slice — no agency. (Proven: talent $9.75, platform $0.50, real `tr_…`.)
**QA process.** After 6.x, **assert** one talent transfer = `talent_net`, no workspace leg, `booking_payouts` talent leg `transferred`, `payout_lifecycle='paid'`.

### 7.2 — Agency booking pays talent + agency + platform · ✅ PROVEN
**Story.** On an agency booking, the **talent** gets their protected full quote, the **agency** gets its commission, the **platform** keeps its slice. (Proven: talent $8.00, agency $1.75, platform $0.50, two real `tr_…`.)
**QA process.** **Assert** two transfers (talent + agency) + platform retains; both ledger legs `transferred`.

### 7.3 — Held payout releases on onboarding · ⬜ UNTESTED (this session)
**Story.** A talent who isn't onboarded yet still gets booked; their pay is **held** safely and **auto-released** the moment they connect their bank.
**QA process.** Pay a booking for a talent with no enabled account → leg `held` (`skipped_no_account`), `HeldPayoutsBanner` shows → onboard → `account.updated` webhook → `releaseHeldPayouts` re-attempts with the **same idempotency key**. **Assert** leg flips to `transferred`, no double-pay.

### 7.4 — Reconcile cron backstop · ⬜ UNTESTED (this session)
**Story.** (System.) A scheduled job sweeps any held/failed legs.
**QA process.** `GET /api/cron/reconcile-held-payouts` with `Authorization: Bearer $CRON_SECRET` → assert held legs release; re-run creates no duplicate transfer.

### 7.5 — Idempotency: no double-pay · ✅ PROVEN
**Story.** A re-delivered webhook / re-run never pays twice. (Proven: re-running `markPaid` reused the same `tr_…`.)
**QA process.** Run `markPaid`/`executeBookingTransfers` twice → assert one transfer per leg.

---

## 8. Money safety (the scary edges)

### 8.1 — Full refund reverses every leg · ⬜ UNTESTED (this session)
**Story.** As **admin**, I refund a booking fully; talent + agency transfers are reversed and the client is refunded.
**QA process.** `handleBookingRefund` (full) → `reverseBookingPayouts` → assert `transfers.createReversal` per leg (idempotent `reverse_<transferId>`), ledger legs `reversed`.

### 8.2 — Partial refund protects the talent · ⬜ UNTESTED (this session)
**Story.** On a partial refund, the **platform absorbs first, then the agency margin** — the **talent is never auto-clawed**.
**QA process.** `computeTalentProtectiveClawback` order (platform → workspace → escalate). Assert talent legs untouched; only platform/workspace clawed.

### 8.3 — Dispute / chargeback · ⬜ UNTESTED
**Story.** A client disputes; we flag on open, reverse on loss, restore on win.
**QA process.** `stripe trigger charge.dispute.created/closed` → assert flag / reversal / restore via `handleBookingDispute`.

### 8.4 — Amount guard (#5) · 🟡 PARTIAL (unit-tested)
**Story.** (System.) We never pay out on a charge whose amount/currency doesn't match the booking.
**QA process.** Force a mismatch (charge ≠ `gross_charged`) → assert the webhook **skips** `markPaid` + logs for manual reconciliation.

### 8.5 — Currency mismatch lane skip · 🟡 PARTIAL (unit-tested)
**Story.** A legacy mixed-currency booking never misfunds.
**QA process.** Snapshot lane currency ≠ settled currency → `executeBookingTransfers` skips that lane + logs (`transfers.currency_mismatch`).

---

## 9. The platform switch (reversibility)

### 9.1 — Connect mode forces Connect · ✅ PROVEN (code + shipped)
**Story.** With the switch on Connect, every payout uses Connect and all GP UI is hidden — even for a talent who previously opted into crypto.
**QA process.** `resolveTalentPayoutRail` returns `connect_transfer` for a `crypto_payouts_enabled=true` talent when switch=connect (unit-tested + short-circuits before DB/Stripe). Confirm GP UI hidden (1.4).

### 9.2 — Flip back to Global Payouts · ⬜ UNTESTED live
**Story.** As **platform admin**, I switch to Global Payouts and the GP onboarding + USDC routing return exactly as before.
**QA process.** Toggle to `global_payouts`; for an opted-in eligible-country talent, `resolveTalentPayoutRail` returns `global_payouts`; GP card reappears. (GP rail itself is private-preview — settlement not test-provable.)

---

## 10. Dashboards reflect the money (the "did I get paid?" view)

### 10.1 — Talent earnings · 🟡 PARTIAL
**Story.** As **talent**, my Money dashboard shows take-home, pending, and "Paid this month" in the platform's operating currency.
**QA process.** After a payout, dev-signin the talent → Money → assert the paid figure appears (operating-currency collapse on). Note historical EUR-only limitation is handled by the operating-currency setting.

### 10.2 — Agency financials / KPIs · 🟡 PARTIAL
**Story.** As **admin**, my Overview KPIs (revenue, pending payout, commission) reflect real bookings in the operating currency.
**QA process.** Assert `loadWorkspaceFinancialKpis` + IdentityBar pending-payout figure are currency-correct (no stray €).

### 10.3 — Client payment status · 🟡 PARTIAL
**Story.** As **client**, I see honest payment status (requested / paid) and only the **gross** I pay (never the internal split).
**QA process.** Confirm client surfaces show gross-only, real status from `agency_bookings` + `booking_transactions`.

---

## 11. Subscription & plan billing — the SECOND Stripe surface · ⬜ UNTESTED

Distinct from the booking rail: recurring plan fees collected from **workspaces** and **talent**, on the
platform's own Stripe (subscriptions, not Connect). Files: `lib/stripe/workspace-billing.ts`,
`lib/stripe/client-billing.ts`, `lib/payments/stripe-talent-subscription.ts`, `lib/stripe/talent-billing.ts`,
`lib/payments/stripe-checkout.ts`, `lib/stripe/price-ids.ts` (`STRIPE_PRICE_*`), webhook routing in
`lib/stripe/webhook-routing.ts` (`subscription_checkout`, `customer.subscription.*`, `invoice.payment_*`).
Plus the **trial & promo engine** (admin-set free Pro/Max trials).

**11.1 — Workspace upgrades its plan.** Story: an owner upgrades Studio→Agency→Network; Stripe Checkout
(mode=subscription) collects the card; the workspace's plan/entitlements flip. QA: drive checkout with
`STRIPE_PRICE_*` test prices (card `4242…`) → `checkout.session.completed` → `subscription_checkout`
webhook → assert plan tier + seats/entitlements updated.

**11.2 — Talent subscribes to Pro / Portfolio.** Story: a talent buys a Pro/Portfolio page subscription;
their tier + page features unlock. QA: drive talent subscription checkout → assert `talent_subscriptions`
row + tier flip on the talent page.

**11.3 — Trial start → expiry.** Story: admin grants a free Pro/Max trial; the talent gets full features
until expiry, then degrades gracefully (data preserved). QA: trial-engine grant → `trial_will_end` webhook
→ expiry → assert feature gate flips without data loss.

**11.4 — Renewal & dunning.** Story: a subscription renews monthly; a failed charge enters dunning, not
instant loss. QA: `invoice.payment_succeeded` (renewal → audit) and `invoice.payment_failed` (dunning →
re-sync, grace) → assert lifecycle correct.

**11.5 — Cancel / downgrade.** Story: a workspace/talent cancels; access persists to period end, then
downgrades data-preservingly. QA: `customer.subscription.deleted`/`updated` → assert downgrade + retained data.

**11.6 — Billing portal.** Story: the customer manages card / cancels via Stripe's hosted portal. QA:
`billingPortal` link opens; changes round-trip via the subscription webhooks.

> All of §11 is **untested this cycle** and is a separate surface from the booking rail — scope it as its
> own QA pass. Confidence: ⬜ across 11.1–11.6.

---

## 12. Production go-live gate (the real-money first booking) · 🔴 LIVE-KEY UNTESTED

### 12.1 — First real prod booking on LIVE Connect
**Story.** A real client pays a real booking on production; a real talent receives a real payout to their real Connect account.
**QA process (careful, real money — owner-run):**
1. A **real talent** completes **live** Connect onboarding (the test accounts don't carry to live). Confirm `stripe_account_status='enabled'` on the **live** account.
2. Confirm prod env: `STRIPE_SECRET_KEY=sk_live_…`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_live_…`, the **live** `STRIPE_WEBHOOK_SECRET`, and `STRIPE_ALLOW_LIVE_PAYOUTS=true` (else live transfers HOLD as `skipped_live_disabled`).
3. Run one small real booking end-to-end; verify the live webhook fires `markPaid` and a live `tr_…` settles.
4. Watch the held-payout/reconcile + refund paths on the first real disputes.
**Why 🔴:** everything proven this session was **test mode**. The live webhook, live Connect onboarding, and `STRIPE_ALLOW_LIVE_PAYOUTS` gating on prod are unverified.

---

## 13. Results tracker (fill as you run)

| # | Flow | Confidence (start) | Result | Notes |
|---|---|---|---|---|
| 1.1 | Talent Connect onboarding (embedded) | 🟡 | | |
| 1.2 | Unsupported-country wall | 🟡 | | |
| 1.3 | Agency Connect onboarding | ⬜ | | |
| 1.4 | Switch hides/shows GP | ✅/🟡 | | |
| 2.1 | Guest chats a specific talent (/t/) | ✅ | | |
| 2.2 | "Message this talent" directory card | ⬜ | | |
| 2.3 | Homepage generic message (agency recommends) | ⬜ | | your point |
| 2.4 | Structured directory inquiry form | ⬜ | | |
| 2.5 | Guest → agency-owned (economics) | ⬜ | | retest priority |
| 2.6 | Client dashboard drawer/draft/one-shot | 🟡 | | |
| 2.7 | Discover single talent | ⬜ | | |
| 2.8 | Discover shortlist multi-tenant fan-out | ⬜ | | |
| 2.9 | Re-inquire / book-again / saved→inquiry | ⬜ | | RESERVED — verify built |
| 2.10 | Talent select *inside* the flow | ⬜ | | VERIFY — possible gap |
| 2.11 | Admin manual inquiry | ⬜ | | |
| 2.12 | Admin pitch → inquiry | ⬜ | | your point |
| 2.13 | Inbound phone/WhatsApp/email | ⬜ | | |
| 3.1 | Talent self-coordination | 🟡 | | |
| 3.2 | Agency coordinator | ⬜ | | |
| 3.3 | Admin coordinator management | ⬜ | | |
| 4.1 | Admin builds + sends offer | ⬜ | ✅ engine `engine_send_offer` proven live (hub inquiry) | engine layer; UI build not yet |
| 4.2 | Client approves | 🟡 | ✅ `engine_submit_approval` (all participants → approved) proven live | engine layer; client UI click not yet |
| 4.3 | Talent approves (Offer tab) | ⬜ | ✅ approval engine proven live (same RPC); Offer-tab UI click not yet | |
| 4.4 | Multi-talent convergence | ⬜ | | |
| 5.1 | Convert → snapshot lanes | 🟡 | ✅ `engine_convert_to_booking` creates booking live; snapshot persist confirmed **correct-by-code** (real reader uses `participants[].offer_line_items`; the integration test was stale) | spine proven; the stale test needs a shape fix to assert lanes |
| 6.1 | Client Pay-now (Element) | 🟡 | | |
| 6.2 | Webhook → markPaid | 🟡 | | |
| 6.3 | Deposit / partial | ⬜ | | likely gap |
| 6.4 | Instant-book | ⬜ | | likely gap |
| 6.5 | Off-platform accrual | ⬜ | | |
| 6.6 | Admin "Mark received" | ✅ | | |
| 7.1 | Hub payout | ✅ | | |
| 7.2 | Agency payout | ✅ | | |
| 7.3 | Held → release | ⬜ | | |
| 7.4 | Reconcile cron | ⬜ | | |
| 7.5 | Idempotency | ✅ | | |
| 8.1 | Full refund reversal | ⬜ | | |
| 8.2 | Partial refund (talent-protected) | ⬜ | | |
| 8.3 | Dispute | ⬜ | | |
| 8.4 | Amount guard | 🟡 | | |
| 8.5 | Currency mismatch skip | 🟡 | | |
| 9.1 | Connect mode forces Connect | ✅ | | |
| 9.2 | Flip to Global Payouts | ⬜ | | |
| 10.1 | Talent earnings | 🟡 | | |
| 10.2 | Agency KPIs | 🟡 | | |
| 10.3 | Client status (gross-only) | 🟡 | | |
| 11.1 | Workspace plan upgrade | ⬜ | | subscriptions |
| 11.2 | Talent Pro/Portfolio subscribe | ⬜ | | subscriptions |
| 11.3 | Trial start → expiry | ⬜ | | subscriptions |
| 11.4 | Renewal & dunning | ⬜ | | subscriptions |
| 11.5 | Cancel / downgrade | ⬜ | | subscriptions |
| 11.6 | Billing portal | ⬜ | | subscriptions |
| 12.1 | First real LIVE booking | 🔴 | | owner-run |

---

## 14. Recommended single-pass spine (fastest path to high confidence)
One continuous booking closes the seams I trust least: **1.1** (talent onboard) → **1.3** (agency onboard)
→ **2.5** (agency-site inquiry) → **3.2/3.3** (coordinator) → **4.1** (build offer) → **4.2 + 4.3**
(client + talent approve) → **5.1** (convert; inspect the snapshot lanes) → **6.1 + 6.2** (Pay-now +
real webhook with `stripe listen`) → **7.2** (agency payout settles) → **10.x** (dashboards). Repeat
the spine once on the **hub** front door (2.1 → 3.1 talent self-coord → … → 7.1). Then money-safety
(§8) and the live gate (§12).
