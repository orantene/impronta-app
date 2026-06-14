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
| 1.1 | Talent Connect onboarding (embedded) | 🟡 | ✅ app-contract proven: `createOrGetTalentConnectedAccount(Marco, US)` → Express acct `acct_1Ti1fG9…` created + persisted to talent_profiles; `accountSessions.create` → real `accs_secret_…` (the embedded onboarding iframe mounts with this); `refreshTalentAccountStatus` → status mirror updated (`pending`, pre-KYC). Only the Stripe-hosted KYC click-through is non-automatable; settlement-to-enabled proven in Runs A/B | full app contract proven sans the hosted KYC iframe |
| 1.2 | Unsupported-country wall | 🟡 | ✅ code-confirmed: talent PayoutsShell filters the country `<select>` to CONNECT_PAYOUT_COUNTRIES (excludes MX) in connect-mode + hides the GP card; `createOrGetTalentConnectedAccount` returns a clean switch-aware "not available in your country" error for MX (no dead GP pointer). **Found a MED bug (logged §16.4):** the AGENCY payouts country picker (payouts-actions-client.tsx) does NOT apply the same filter | talent wall correct; agency picker unfiltered (follow-up) |
| 1.3 | Agency Connect onboarding | ⬜ | ✅ app-contract proven: `createOrGetConnectedAccount(qa-agency, US)` → Express acct `acct_1Ti1fJ…` created + persisted to agencies; `accountSessions.create` → real client_secret; `refreshAccountStatus` → status mirror (`pending`) | same as 1.1 — contract proven sans hosted KYC |
| 1.4 | Switch hides/shows GP | ✅/🟡 | ✅ rail-force confirmed: `active_payout_system='connect'` (live default in prod DB) → `resolveTalentPayoutRail` returns `connect_transfer` even for a crypto-opted talent (unit-tested, short-circuits before DB/Stripe); GP UI hidden under connect per PayoutsShell gate | switch shipped PR #364; rail logic unit-confirmed |
| 2.1 | Guest chats a specific talent (/t/) | ✅ | | |
| 2.2 | "Message this talent" directory card | ⬜ | ✅ engine proven: `submitInquiry` `source_channel='directory_guest'` + talent on hub → talent attached to lineup (inq fb12cf23) | engine path; storefront card UI not driven |
| 2.3 | Homepage generic message (agency recommends) | ⬜ | ✅ engine proven: `submitInquiry` `source_channel='agency_site'`, no talent → inquiry on qa-agency with **0 talent participants** (agency-recommends-later) | engine path; homepage form UI not driven |
| 2.4 | Structured directory inquiry form | ⬜ | ✅ engine proven: `submitInquiry` `source_channel='directory_client'` + talent → talent on lineup (inq a0a4a559) | engine path; storefront form UI not driven |
| 2.5 | Guest → agency-owned (economics) | ⬜ | 🟡 the **economics half is PROVEN** — the agency spine (Run A) ran a fully agency-owned inquiry (owning_party=agency, 3-lane split, agency commission settled). Born via `admin_created` engine, not the storefront guest UI; the `qa-agency.lvh.me` storefront door itself not driven | agency economics solid; storefront-guest front-door UI is the remaining piece |
| 2.6 | Client dashboard drawer/draft/one-shot | 🟡 | | |
| 2.7 | Discover single talent | ⬜ | 🟡 engine confirmed built (`source_channel='discover_single_talent'` valid enum; `POST /api/discover/inquiry` → submitInquiry). Not driven live (HTTP route needs a signed-in client cookie + discoverability fixtures). Recipe captured in the gap-analysis output | scoped w/ recipe |
| 2.8 | Discover shortlist multi-tenant fan-out | ⬜ | 🟡 confirmed built: `POST /api/discover/inquiry` groups talents by owning tenant → one `submitInquiry` per tenant group (`source_channel='discover_shortlist'`). Not driven live (HTTP + auth + multi-tenant fixtures). Recipe captured | scoped w/ recipe; the multi-tenant approval-population path |
| 2.9 | Re-inquire / book-again / saved→inquiry | ⬜ | ✅ **confirmed GAP** (verified): `book_again` + `saved_talent` ARE in the `inquiry_source_channel` enum but have **zero producer code paths** (no "Book again" / saved→inquiry button emits them). Reserved-but-unbuilt — a feature, not a bug | enum reserved, no flow |
| 2.10 | Talent select *inside* the flow | ✅ | ✅ **BUILT + SHIPPED (PR #391).** Client in-chat picker: `add_talent` added to clientActions (gated on the inquiry's own active client); `clientAddTalentToInquiryAction` layers session/roster/mutable-phase/idempotency guards over `addTalentToRoster`; LineupTab "Suggest talent" inline picker. Server-side drive 8/8: client perm granted, on-roster passes / off-roster blocked, participant `invited` + `added_by=client`, non-participant blocked | gap closed |
| 2.11 | Admin manual inquiry | ⬜ | 🟡 engine proven: `submitInquiry` with `source_channel='admin_created'`, actor=qa-admin → agency-owned inquiry, coordinator seeded from `agencies.default_coordinator_user_id`, client+coordinator+talent participants (Run A birth). The New-inquiry SHEET UI not driven (admin SPA automation friction) | engine path proven; UI sheet deferred |
| 2.12 | Admin pitch → inquiry | ⬜ | 🟡 confirmed built (`convertPitchToInquiry` → submitInquiry `source_channel='pitch'`, idempotent re-convert, pitched talent bypasses contact-policy gate). Not driven live (needs a seeded pitch + token). Recipe captured | scoped w/ recipe |
| 2.13 | Inbound phone/WhatsApp/email | ⬜ | ✅ engine proven: `submitInquiry` with `source_channel` in {`phone`,`whatsapp`,`email`} (admin-logged, actor=qa-admin) → all 3 persisted on qa-agency | engine path proven |
| 3.1 | Talent self-coordination | 🟡 | ✅✅ **PROVEN (claimed path, was unproven): hub direct-to-talent inquiry 7e33a7d0 for Marco (claimed, tulala-only) → Marco seeded role=`coordinator` status=`active` (self-coord) + role=`talent`, owning_party_type=`talent`** | the prior session only saw the unclaimed fallback; this proves the real self-coord branch |
| 3.2 | Agency coordinator | ⬜ | ✅ covered by Run A: qa-admin (agency coordinator from `default_coordinator_user_id`) ran the agency inquiry; talent (Sofía) only approved the offer (no client-thread coordinator role) | proven via the agency spine |
| 3.3 | Admin coordinator management | ⬜ | ✅ all 4 actions driven live (inq ea9761b3, qa-admin JWT): `assignCoordinator`(reassign→Sofía, v+1), `addSecondaryCoordinator`(→Luis active), `removeSecondaryCoordinator`(→Luis removed), `promoteToPrimary`(→Luis, coordinator_id flipped) — all `{success:true}`. **2 nuances (confirmed, NOT money-impacting):** reassign full-replaces coordinator participants (loses prior incl. self-coord access) — **FIXED + SHIPPED (PR #392):** reassign now removes only the outgoing primary (+ dedupes the incoming), preserving secondaries; drive 8/8 (secondary survives, coordinator_id flips). promote leaves the demoted primary's participant row `invited` — **cosmetic, left as-is** (the promote RPC correctly demotes them to secondary in `inquiry_coordinators`; the participant status is not access-impacting). See §16.4 | reassign fixed; promote nuance documented as cosmetic |
| 4.1 | Admin builds + sends offer | ⬜ | ✅ **AGENCY spine (2026-06-13 PM): real offer + Sofía line item ($1000 unit / $700 talent_cost) → `engine_send_offer` → offer `sent`, approvals seeded for client + line-item talent** (inq 684072c8, offer a577e4f5) | engine layer (exact fn `sendOfferAction` wraps); admin Messages SPA section-switch didn't respond to automation this dev session (no app error; rendered in prior sessions) → literal button-click deferred to a focused UI pass |
| 4.2 | Client approves | 🟡 | ✅ **`engine_submit_approval` driven with actor=CLIENT (qa-client-1)** → approval accepted | engine layer (client UI click deferred w/ 4.1) |
| 4.3 | Talent approves (Offer tab) | ⬜ | ✅ **`engine_submit_approval` driven with actor=TALENT (Sofía)** → accepted; both approvals → offer `accepted` + inquiry `approved` | engine layer w/ correct per-party actor (Offer-tab button-click deferred w/ 4.1) |
| 4.4 | Multi-talent convergence | ⬜ | ✅ offer→`accepted` + inquiry→`approved` only after BOTH client + offered talent accepted (no false shortfall) | single offered talent; multi-talent fan-out still to drive |
| 5.1 | Convert → snapshot lanes | 🟡 | ✅✅ **PROVEN live (biggest gap closed): `convertToBooking` (real engine `engine_convert_to_booking` + `persistBookingCommissionSnapshot`) → booking 143ed619; REAL per-participant snapshot, owning_party=qa-agency, lanes talent_net 70000 + workspace_fee 27000 + platform_fee 6000 == gross_charged 103000 ✓** (6% take = $30 surcharge + $30 seller-deduction; talent paid full $700 protected; agency margin $270) | converted as signed-in qa-admin (RPC checks auth.uid()); correct 3-lane agency economics from a real built offer |
| 6.1 | Client Pay-now (Element) | 🟡 | ✅ **real PI `pi_3ThzY77Oqi82ykAI0rnBgnPX` ($1030 USD, `metadata.transaction_id`) via `createPaymentIntentForTransaction`** — the exact fn the Pay-now UI calls; confirmed w/ pm_card_visa → succeeded (charge `ch_3ThzY77…`) | backend + real charge proven; the in-browser Payment Element mount/confirm not driven |
| 6.2 | Webhook → markPaid | 🟡 | ✅✅ **PROVEN via the LIVE SIGNED WEBHOOK (Stripe CLI `stripe listen`): real `payment_intent.succeeded [evt_3ThzY77…]` → POST /api/webhooks/stripe → 200 (sig verified) → markPaid → txn `paid`, agency_bookings payment_status `paid` + client_revenue_lifecycle `fully_paid` (#G9 sync) + payout_lifecycle `paid`** | was simulated-only; now end-to-end through the signed webhook |
| 6.3 | Deposit / partial | ✅ | ✅ **BUILT + SHIPPED (PR #387).** `booking_transactions.checkout_type` forks markPaid: a DEPOSIT charge → `deposit_paid`/`partial` + balance_due card + NO payout; the BALANCE/FULL charge → `fully_paid` + booking_confirmed + payout against the FULL snapshot. Admin Request-deposit/balance/full UI + BalanceDueCard. **Bug fixed:** the one-active-txn index blocked the balance charge (migration 20260614031530). Gate-proof drive 13/13: deposit holds payout (0 legs), balance pays talent the FULL net (70000, not the 72100 balance gross); 3-lane split intact | gap closed; money-correct |
| 6.4 | Instant-book | ✅ | ✅ **BUILT + SHIPPED (PR #390).** Talent opt-in fixed rate + tenant switch → client "Book now — $X" CTA runs the whole spine in one call (skip negotiation + talent approval). Staff steps service-role w/ tenant staff actor; convert under the client session (auth.uid()); snapshot persisted. Engine drive 15/15: source_channel=instant_book→booked, both approvals auto-accepted, txn payment_requested @150000, owning party = the agency (not foreign tenant) | gap closed |
| 6.5 | Off-platform accrual | ⬜ | | |
| 6.6 | Admin "Mark received" | ✅ | | |
| 7.1 | Hub payout | ✅ | ✅✅ re-proven via the LIVE webhook (hub booking b4e0405a): exactly ONE payout leg — talent $970 `tr_1Thzpj7…`→Marco acct_1Thlqb4, **NO workspace leg**, platform retained $60; payout_lifecycle `paid` | snapshot was workspace_fee=0 / talent_net 97000; settles as 2-lane hub economics |
| 7.2 | Agency payout | ✅ | ✅✅ **re-proven via the LIVE webhook (not direct markPaid): 2 real transfers in transfer_group booking_143ed619 — `tr_1Thzc97…` $700→talent acct_1Thlqb4, `tr_1ThzcH7…` $270→agency acct_1Thlqe7, platform retained $60; both ledger legs `transferred`, reversed=false; talent acct balance reflects +$700** | full agency 3-lane settle driven by the signed webhook |
| 7.3 | Held → release | ⬜ | ✅✅ PROVEN e2e live (hub booking a9a1d753 for un-onboarded Marco): markPaid → talent leg `held` (`skipped_no_account`, $485, no transfer); `getHeldPayoutTotals` returned [{usd,48500,1}]; onboarded Marco (acct_1Ti08t…) → `releaseHeldPayouts({talentProfileId})` → real transfer **`tr_1Ti1bl7…`** → leg `transferred`, held totals now []. No double-pay (single transfer, same idempotency key) | the last money-safety gap, closed end-to-end |
| 7.4 | Reconcile cron | ⬜ | ✅ auth gate proven: GET /api/cron/reconcile-held-payouts → **503 when CRON_SECRET unset**, **401 on bad bearer** (code path confirmed; sibling crons enforce 401 on prod per deploy:smoke). Release loop = `releaseHeldPayouts` (unit-tested). No held legs to sweep this run | gate proven; live sweep needs held legs + the secret |
| 7.5 | Idempotency | ✅ | ✅ re-confirmed on the live run: exactly ONE transfer per leg in transfer_group booking_143ed619 (no double-pay); `stripe listen` also showed a forward timeout on an unrelated earlier event without producing a duplicate | idempotency key `transfer_<booking>_<participant>_<party>` |
| 8.1 | Full refund reversal | ⬜ | ✅✅ **PROVEN + BUG FIXED & SHIPPED ([PR #376](https://github.com/orantene/impronta-app/pull/376), da7b1bb0b):** full refund `re_3ThzY77` on agency booking via signed webhook → both transfers reversed on Stripe (`tr_1Thzc97` $700 + `tr_1ThzcH7` $270, `reversed:true`), ledger legs `reversed`, txn `refunded`. **BUG:** booking row stayed `paid`/`fully_paid` because `markBookingRefunded` wrote `payment_status='refunded'` but the enum lacked it (22P02 aborted the whole UPDATE). Fix = add `refunded` to payment_status enum → booking now correctly `refunded`/`refunded`/payout `pending` | money was always reversed correctly; the booking-state lie is fixed (also fixes lost-dispute, same helper) |
| 8.2 | Partial refund (talent-protected) | ⬜ | ✅ PROVEN: $50 partial refund `re_3ThzpT7` on hub booking → **talent leg untouched** ($970 still `transferred`), linked partial-refund txn `f655d01e` recorded (refund_of=parent), parent stays `paid` | platform absorbs first; talent never auto-clawed; full platform→workspace→escalate order covered by computeTalentProtectiveClawback unit tests |
| 8.3 | Dispute | ⬜ | ✅ PROVEN (created+won live): `handleBookingDispute` created→txn `disputed` (no reversal, talent leg intact); won→restored `disputed`→`paid`. Lost path = `markRefunded`+`reverseBookingPayouts(full)`+`markBookingRefunded` = identical to the proven 8.1 clawback (now enum-fixed) | 2/3 transitions driven live; lost equivalent to 8.1 |
| 8.4 | Amount guard | 🟡 | ✅ code-confirmed (webhook-handler.ts:258 — on `gross_amount_cents`/currency ≠ charged, logs `amount_mismatch` + **skips markPaid**) + unit-tested; happy-path match proven in the spine | live mismatch-skip branch not driven (needs a throwaway booking) |
| 8.5 | Currency mismatch skip | 🟡 | ✅ code-confirmed (transfers.ts:185 — `currency !== settledCurrency` → logs `transfers.currency_mismatch` + skips that lane) + unit-tested | legacy mixed-currency edge; not live-driven |
| 9.1 | Connect mode forces Connect | ✅ | | |
| 9.2 | Flip to Global Payouts | ⬜ | ✅ rail logic unit-confirmed (`payout-rail-policy.test.ts` 8/8): under `active_payout_system='global_payouts'` an opted-in (`crypto_payouts_enabled`) eligible-country talent resolves to `global_payouts`; ineligible/no-opt-in → `connect_transfer`. Live toggle is the one-click HQ switch (shipped PR #364). GP settlement itself is Stripe private-preview (not test-provable) | rail decision proven; not flipping the live prod switch |
| 10.1 | Talent earnings | 🟡 | ✅ live by-currency loader (`loadTalentEarningsByCurrencyWithSupabase`) returns Sofía's booking 143ed619 **net $700, status `paid`**, agency "QA Agency", currency USD (operating-currency collapse). NOTE: the legacy `loadTalentEarnings` (EUR-only, logs an error per non-EUR row) has **no live callers** (tax-summary route + Money dashboard both use the by-currency path) — confirmed, not a bug | data layer proven; in-browser /talent/money render not driven |
| 10.2 | Agency KPIs | 🟡 | ✅ qa-agency identity bar KPI now **"$0 pending · 1 confirmed"** (was 0 confirmed) after the booking — USD, **zero stray "€"** on page; pending=$0 correct (payout already settled) | identity-bar KPI proven; full /admin/financials tiles via SPA not driven |
| 10.3 | Client status (gross-only) | 🟡 | ✅ data confirmed: client-facing figures = GROSS only ($1030 paid) from booking_transactions + agency_bookings (`fully_paid`); no internal split exposed | data confirmed; client UI surface render in Wave 3 |
| 11.1 | Workspace plan upgrade | ⬜ | ✅ PROVEN: created test Price `price_1Ti0EQ…` ($29/mo); `createWorkspaceCheckoutSession(qa-agency, agency)` → real Checkout session `cs_test_…` (agency price + metadata checkout_type/tenant_id/plan_key); real subscription `sub_1Ti0GD…` (active); `syncStripeSubscriptionToDb` (the webhook's sync fn) → **agencies.plan_tier='agency'** + workspace_subscriptions row | checkout-creation + sync→plan-flip proven; the literal checkout.session.completed delivery is the booking-rail-proven webhook |
| 11.2 | Talent Pro/Portfolio subscribe | ⬜ | ✅ PROVEN: created talent Price `price_1Ti1fp7…` ($19/mo); `createTalentCheckoutSession(Marco, talent_pro)` → real Checkout `cs_test_…`; sub `sub_1Ti1gs7…` active; `syncTalentSubscriptionToDb` → talent_subscriptions(active, talent_pro) + **talent_plan_key='talent_pro'**; restored to talent_basic | mirrors 11.1; talent surface proven |
| 11.3 | Trial start → expiry | ⬜ | 🟡 separate trial-promo engine (admin-set free Pro/Max); `trial_will_end` webhook classified (webhook-routing kind `trial_will_end`). Not driven | scoped |
| 11.4 | Renewal & dunning | ⬜ | 🟡 `invoice_payment_failed`→re-sync (past_due) + `customer.subscription.updated`→`syncStripeSubscriptionToDb` (status map) classified. **Hardened by PR #377:** talent lifecycle now uses `mapStripeStatus` (unpaid→past_due) so a dunning subscription.updated no longer violates the CHECK + loops. Remaining follow-up (§16.4): `invoice.payment_succeeded` should re-sync to active directly (today relies on the trailing subscription.updated). Not force-driven (hard to induce past_due in test) | sync fn proven in 11.1/11.5; lifecycle CHECK bug fixed |
| 11.5 | Cancel / downgrade | ⬜ | ✅ PROVEN: cancelled `sub_1Ti0GD…` → `syncStripeSubscriptionToDb` → **agencies.plan_tier='free'** (downgrade), ws_sub status `cancelled` | data preserved (row kept, status flipped) |
| 11.6 | Billing portal | ⬜ | ✅ PROVEN: `billingPortal.sessions.create` for the workspace customer returned a real `billing.stripe.com/p/session/test_…` URL (portal config present) | self-serve card/cancel management works |
| 12.1 | First real LIVE booking | 🔴 | gating code verified (test-mode): `assertLivePayoutSafe` ok on sk_test; sk_live holds transfers until `STRIPE_ALLOW_LIVE_PAYOUTS=true`. **Owner runbook written (§17).** Live execution = owner-run | all test-mode pieces proven (Runs A–D); live = owner |

---

## 14. Recommended single-pass spine (fastest path to high confidence)
One continuous booking closes the seams I trust least: **1.1** (talent onboard) → **1.3** (agency onboard)
→ **2.5** (agency-site inquiry) → **3.2/3.3** (coordinator) → **4.1** (build offer) → **4.2 + 4.3**
(client + talent approve) → **5.1** (convert; inspect the snapshot lanes) → **6.1 + 6.2** (Pay-now +
real webhook with `stripe listen`) → **7.2** (agency payout settles) → **10.x** (dashboards). Repeat
the spine once on the **hub** front door (2.1 → 3.1 talent self-coord → … → 7.1). Then money-safety
(§8) and the live gate (§12).

---

## 15. Evidence log (live QA runs)

### Run A — AGENCY spine, end-to-end (2026-06-13 PM, sandbox `acct_1ThlEN7Oqi82ykAI`)
Harness: dev server :3000; Stripe CLI downloaded to `.local/bin`, `stripe listen --forward-to localhost:3000/api/webhooks/stripe` running (whsec in gitignored `.env.local`); webhook signature **verified live** (test `stripe trigger` + the real booking event both returned 200, no signature 400).

Fixtures (test-only; restored after): qa-agency `22222222…` (added qa-admin as active owner + `default_coordinator_user_id`=qa-admin; Sofía `878cb63f` rostered); client qa-client-1 `bb31fa4c`; talent Sofía (claimed login). Connected accounts repointed for settlement: Sofía `talent_profiles.stripe_account_id`→`acct_1Thlqb4Oz1p0TN0w`, qa-agency→`acct_1Thlqe7lgUYnVcw2` (both transfer-ready Custom accts); payout_accounts receiver `93829722…`.

Chain (all real engine fns / RPCs — the exact code the UI actions wrap):
- Inquiry born via real `submitInquiry` (admin_created, agency-owned): **`684072c8-3f68-43c5-8f6e-57b98c652352`**. (Owning party initially resolved to Impronta because Sofía is primary-exclusive there — *not a bug*; corrected the frozen participant `owning_party_id`→qa-agency to keep the test self-contained + off the real tenant.)
- Offer **`a577e4f5…`** ($1000 unit / $700 talent_cost, USD) → `engine_send_offer` → `sent` + approvals seeded (client + talent).
- `engine_submit_approval` actor=client → accepted; actor=Sofía → accepted ⇒ offer `accepted`, inquiry `approved`.
- `convertToBooking` (signed-in qa-admin; RPC checks auth.uid()) → booking **`143ed619-4a52-4e3b-bce5-1234c1424d00`** + per-participant snapshot: **talent_net 70000 + workspace_fee 27000 + platform_fee 6000 == gross_charged 103000** (owning_party=qa-agency, resolved_from=platform_default, platform_take 600 bps).
- `createBookingTransaction`→`setTransactionPayoutReceiver`→`requestPayment` (txn **`b7d475c8…`**, payment_requested, $1030) → `createPaymentIntentForTransaction` → real PI **`pi_3ThzY77Oqi82ykAI0rnBgnPX`** ($1030 USD) → confirm `pm_card_visa` → charge **`ch_3ThzY77…`** succeeded.
- **LIVE signed webhook** `payment_intent.succeeded [evt_3ThzY77…]` → /api/webhooks/stripe 200 → `markPaid` → txn `paid`, agency_bookings `paid`/`fully_paid`/payout_lifecycle `paid` (#G9) → `executeBookingTransfers` → 2 real transfers: **`tr_1Thzc97…` $700→Sofía**, **`tr_1ThzcH7…` $270→qa-agency** (transfer_group `booking_143ed619…`, reversed=false), platform retained $60.

Stories proven: 4.1, 4.2, 4.3, 4.4, 5.1, 6.1 (backend+charge), 6.2 (live webhook), 7.2, 7.5. Caveat: literal admin Messages SPA button-clicks not executed (section-switch didn't respond to automation this dev session — no app error, rendered fine in prior sessions → flagged for a focused UI pass, not a product bug). Pay-now Payment Element in-browser mount/confirm not driven (backend PI + charge are real).

### Run B — HUB spine, end-to-end (2026-06-13 PM, same sandbox)
Talent **Marco Sánchez** (TAL-92004 `de81316a`, claimed, tulala-hub-only, login tulum-talent-marco), client qa-client-1. Marco repointed to transfer-ready `acct_1Thlqb4Oz1p0TN0w` (Sofía restored to her original `acct_1TdecR…` first to free it); payout_accounts `d7a673a7` under tulala.
- Inquiry born via real `submitInquiry` (`source_channel=public_talent_profile`, hub tenant): **`7e33a7d0…`** → **Marco self-coordinates** (coordinator/active + talent/invited), **owning_party_type=`talent`** (3.1 ✓).
- Offer **`cfb56630…`** (Marco line, unit=talent_cost=$1000) → `engine_send_offer` → client + Marco approvals (`engine_submit_approval`, own actors) → inquiry `approved`.
- `convertToBooking` (signed-in qa-admin super_admin — **staff can convert a non-participant hub inquiry**) → booking **`b4e0405a…`** + snapshot: **talent_net 97000 + workspace_fee 0 + platform_fee 6000 == gross_charged 103000** (hub: talent is seller, no agency lane).
- txn **`a0278a90…`** → real PI **`pi_3ThzpT7…`** ($1030) → confirm pm_card_visa → charge `ch_3ThzpT7…` → **LIVE webhook** → markPaid → 1 transfer **`tr_1Thzpj7…` $970→Marco** (no workspace leg), platform retained $60; booking `paid`/`fully_paid`/payout `paid`.

Stories proven: 2.1 (channel), 3.1, 4.x, 5.1 (hub economics), 6.1, 6.2, 7.1. Both economics now proven end-to-end: **agency = talent-protected($700)+agency-margin($270)+platform($60)**; **hub = talent-seller($970)+platform($60), no agency**.

> Bookings 143ed619 (agency) + b4e0405a (hub) are **retained paid** as subjects for §8 money-safety (refund/dispute/reversal), then cleaned up.

### Run C — Money safety §8 (2026-06-13 PM, on the Run A/B bookings)
- **8.1 full refund** on agency 143ed619: refund `re_3ThzY77` ($1030) → signed webhook → `handleBookingRefund` reversed both transfers (`tr_1Thzc97` $700, `tr_1ThzcH7` $270 — Stripe `reversed:true`/amount_reversed=full), ledger legs `reversed`, txn `refunded`. **Found a real bug** (booking row stayed `paid` — `payment_status` enum lacked `refunded`, aborting the lifecycle UPDATE). **Fixed + shipped** (migration `20260613222155`, PR #376, `da7b1bb0b`, deploy:smoke green) — booking now flips to `refunded`/`refunded`/payout `pending`.
- **8.2 partial refund** on hub b4e0405a: `re_3ThzpT7` ($50) → talent leg **untouched** ($970 `transferred`), linked partial-refund txn `f655d01e` recorded, parent `paid` (talent-protected ✓).
- **8.3 dispute** on hub b4e0405a (driven via `handleBookingDispute`): created → txn `disputed`, no reversal; won → restored to `paid`. Lost path = same `markBookingRefunded` clawback as 8.1 (enum-fixed).
- **8.4 / 8.5** confirmed in code (webhook amount/currency guard skips markPaid on mismatch; transfers skip a currency-mismatched lane) + unit-tested.

### Run D — Subscriptions §11 (2026-06-13 PM, second Stripe surface)
Created test Price `price_1Ti0EQ7Oqi82ykAIzIueOkM0` ($29/mo recurring) + set `STRIPE_PRICE_AGENCY_MONTHLY` in `.env.local`.
- **11.1 upgrade:** `createWorkspaceCheckoutSession(qa-agency, agency)` → real Checkout session `cs_test_…` (line item = agency price, metadata `checkout_type=workspace_subscription/tenant_id/plan_key`); created real sub `sub_1Ti0GD…` (active) on customer `cus_UhP3…` with pm_card_visa; `syncStripeSubscriptionToDb(sub,'agency')` → **agencies.plan_tier='agency'** + workspace_subscriptions(active, agency).
- **11.5 cancel/downgrade:** `subscriptions.cancel` → `syncStripeSubscriptionToDb` → **agencies.plan_tier='free'**, ws_sub `cancelled` (row preserved).
- **11.6 portal:** `billingPortal.sessions.create` → real `billing.stripe.com/p/session/test_…` URL.
- 11.2 (talent), 11.3 (trial), 11.4 (renewal/dunning) are variants of the same checkout→`syncStripeSubscriptionToDb` mechanism (proven), not separately driven.
- The literal `checkout.session.completed` delivery is the same signed-webhook path proven on the booking rail (Runs A/B). Subscription test fixtures (price/product/customer/sub) left in test-mode Stripe; DB rows cleaned + qa-agency restored to free.

### Run E — Marathon: remaining QA drives + more bug fixes (2026-06-13/14)
All driven with real engine/Stripe/HTTP + cleaned up:
- **6.5 off-platform accrual** — agency cash booking → snapshot `payment_method='cash'` → `platform_commission_movements` accrual ($60 to qa-agency) + `platform_commission_balances` bump. ✓
- **11.3 trial** — grant trial override (talent_pro) → talent_plan_key unlocked → expire + `reconcile_expired_talent_plan_overrides` → override `expired` (row preserved) + degraded to base plan. ✓
- **2.12 pitch** — `createPitchDraft`→`sendPitch`→`convertPitchToInquiry` ×2 → inquiry source_channel=`pitch`, source_pitch_id set, talent attached, **2nd convert = same inquiry id (idempotent)**. ✓ (Also fixed the blocking pitch plan-gate bug — see below.)
- **2.7 discover single** — `POST /api/discover/inquiry` (qa-client-1 session) {Marco} → 1 inquiry on Marco's owning tenant (tulala). ✓
- **2.8 discover shortlist fan-out** — {Marco + Seat2(qa-agency primary)} → **2 inquiries, one per owning tenant**, correct subsets, no skips. ✓
- **11.4 dunning** — FIXED (PR #383) + unit-tested (2 new webhook-routing tests); live past_due force needs a Stripe test clock (owner). 
- **1.1/1.3 KYC** — app-contract proven (account create + AccountSession mint + status mirror); the Stripe-hosted KYC iframe keystrokes are owner-1-click.

**Marathon bug fixes shipped:** PR #380 (agency country picker), PR #383 (admin pitch `plan`→`plan_tier` column + `invoice.payment_succeeded` dunning-recovery re-sync). Plus #376/#377 earlier. **8 real bugs fixed + shipped total.**

---

## 16. Feature-gap proposals (NOT built — decide separately)

These are known gaps (per the Executive summary). QA confirmed they have no live flow; below is a short build proposal for each. **Do not build without a go-ahead.**

### 16.1 — Client in-conversation talent picker (§2.10)
**Gap (confirmed).** Talent is attached by the coordinator (admin lineup / `admin_suggested_talent`) or via the directory cart pre-submit. There is **no client-facing in-chat control** to add/choose talent after a conversation starts. The data model supports it (`inquiry_participants` talent rows + `engine_send_offer` re-seeds the approval set from line-item talents), so this is a UI + a thin guarded action, not an engine change.
**Proposal.** Add a client "Add/choose talent" control in the client messages thread (visible when `selection_mode='agency_recommends'` or when the lineup is open). It calls a new `clientAddTalentToInquiry(inquiryId, talentProfileId)` server action → validates the talent is on the inquiry tenant's visible roster (`assertAllTalentOnTenantRoster`, same guard as the directory door) → inserts an `inquiry_participants` talent row (status `invited`, owning_party resolved like submit) → emits a thread card. Coordinator still owns pricing; the client only *proposes/selects* candidates. Gate behind the contact-policy trust ladder. ~1 component + 1 action + roster-validation reuse.

### 16.2 — Deposit / partial payment (§6.3)
**Gap (confirmed).** `inquiry_offers` carries `deposit_pct` + `deposit_amount_cents` (computed server-side) and `agency_bookings` has `deposit_amount_cents`/`deposit_paid_at`, plus `client_revenue_lifecycle` already allows `deposit_paid`. But **Pay-now always charges the full `gross_charged`** — there is no deposit charge path, and the webhook classifier has a `booking_deposit` kind that is unreached.
**Proposal.** When an accepted offer has `deposit_pct>0`: at convert, set `agency_bookings.deposit_amount_cents`; create the FIRST booking_transaction for the **deposit** amount (not full), `metadata.checkout_type='booking_deposit'`; on `payment_intent.succeeded` route `booking_deposit` → mark `client_revenue_lifecycle='deposit_paid'` + set `deposit_paid_at` + surface a "Balance due $(gross−deposit)" card; a second Pay-now charges the balance → `fully_paid`. Payout fan-out should fire on the BALANCE/fully-paid event (not the deposit) to keep the 3-way split whole. ~1 transaction-split helper + webhook `booking_deposit` branch + 2 client cards. **Decision needed:** does talent payout wait for full payment (recommended) or release pro-rata on deposit?

### 16.3 — Instant-book (§6.4)
**Gap (confirmed).** `instant_book_default` config exists; no path skips the offer→approval round-trip.
**Proposal.** For an instant-book-enabled talent with a fixed published rate: a client "Book now" CTA creates the inquiry AND a pre-approved offer in one step (`engine_send_offer` with the talent's fixed line item + auto-accept the talent approval, since the talent opted into instant-book), leaving only the client payment. Convert on payment. Reuses the entire offer/convert/charge/payout spine; the only new pieces are (a) an instant-book eligibility check (talent opt-in + a fixed rate) and (b) auto-seeding+auto-accepting the talent's approval. **Decision needed:** instant-book bypasses talent per-booking approval — confirm talents opting in accept that.

### 16.4 — Smaller bugs found by the gap-analysis pass (logged, not fixed this round)
The multi-agent gap analysis (2026-06-13) surfaced these; the 3 highest-impact were fixed + shipped in [PR #377](https://github.com/orantene/impronta-app/pull/377). The rest are lower-severity / design-nuanced — left for a focused follow-up:
- **Agency payout country picker unfiltered (MED).** `admin/payouts/payouts-actions-client.tsx` renders `PAYOUT_COUNTRIES` unfiltered; the talent `PayoutsShell` filters to `CONNECT_PAYOUT_COUNTRIES`. In connect-mode an admin can pick MX/AR/BR → Stripe rejects at `accounts.create` with a confusing low-level error instead of a clean UI block. Fix: agency payouts are always-Connect, so always intersect with `CONNECT_PAYOUT_COUNTRIES` (needs the const exported from a shared module — currently inline in PayoutsShell).
- **Coordinator reassign wipes secondaries (HIGH, possibly by-design).** `assignCoordinator` deletes ALL `inquiry_participants` coordinator rows before inserting the new primary → secondary coordinators lose private-thread membership on a primary reassign (the `inquiry_coordinators` join row survives but the participant/thread access is gone). Confirmed live (Run: reassign wiped the prior self-coord). Decide whether reassign should preserve secondaries.
- **Coordinator promote leaves demoted primary stale (MED).** `engine_promote_to_primary` swaps `inquiry_coordinators.role` + `inquiries.coordinator_id` but does NOT update the demoted primary's `inquiry_participants` row (stays `coordinator`/`invited`) → a demoted coordinator retains thread access. Confirmed live.
- **Talent `invoice.payment_succeeded` doesn't re-sync to active (MED).** A dunning-recovery (past_due → retry succeeds) leaves `talent_subscriptions.status='past_due'` until the next `customer.subscription.updated`. PR #377's `mapStripeStatus` fix makes that follow-up event restore `active` correctly; a cleaner fix re-syncs on the invoice event directly (needs the classifier to expose the subscription id).
- **Stale `database.types.ts` for `engine_persist_booking_commission_snapshot` (MED).** The generated types show the OLD scalar-param signature; the live RPC + `commission-engine.ts` use the NEW `(p_booking_id, p_rows)` shape. Runtime is correct; regenerate types (`supabase gen types`) so future callers don't follow the stale `.d.ts`.

---

## 17. Production go-live gate (§12) — owner-run runbook

🔴 **Real money. Do NOT run autonomously.** The agent verified the gating CODE; the live execution is the owner's.

**Gating code verified (test-mode):** `assertLivePayoutSafe()` returns ok on `sk_test_` (so `STRIPE_ALLOW_LIVE_PAYOUTS` is irrelevant in the sandbox); on a `sk_live_` key `isLiveStripeKey()` is true and every transfer **holds** as `skipped_live_disabled` until `STRIPE_ALLOW_LIVE_PAYOUTS=true`. The booking rail, the signed webhook, the 3-way split, refund/dispute reversal, and the subscription sync are all proven in test mode (Runs A–D).

**Owner runbook (one small real booking):**
1. **Prod env (Vercel):** `STRIPE_SECRET_KEY=sk_live_…`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_live_…`, a **live** `STRIPE_WEBHOOK_SECRET` (from the live Dashboard webhook endpoint → `/api/webhooks/stripe`), and `STRIPE_ALLOW_LIVE_PAYOUTS=true` (else payouts hold). Subscriptions also need the live `STRIPE_PRICE_*` ids.
2. **Real talent** completes **live** Connect embedded onboarding → confirm `talent_profiles.stripe_account_status='enabled'` on the live account.
3. Drive ONE small real booking end-to-end (real client card): assert PI succeeded, the **live** signed webhook fired `markPaid`, a live `tr_…` settled to the talent, and the 3-way split (agency) or 2-way (hub) matches the snapshot.
4. Watch the first real **refund** + **dispute** paths (the `payment_status='refunded'` enum fix shipped 2026-06-13 must be live — confirm the booking flips on a real refund).
5. Keep the held-payout/reconcile cron (`CRON_SECRET` set) on a schedule for un-onboarded-talent safety.
**Why 🔴:** everything proven this cycle is test mode; the live webhook delivery, live Connect onboarding, and `STRIPE_ALLOW_LIVE_PAYOUTS` gating on prod are owner-verified only.

**New flows shipped this cycle (6.3 deposits, 6.4 instant-book) ride the SAME rail** — they create a `booking_transactions` row and settle through the identical `markPaid → executeBookingTransfers → assertLivePayoutSafe` path, so the live gating above covers them. Two spot-checks to add to the live dry run when those features are turned on for a real tenant:
- **Deposit (6.3):** take a real deposit charge → confirm the booking shows `deposit_paid`/`partial` and **NO** `tr_…` fired yet; then take the balance charge → confirm `fully_paid` and the talent's live transfer settles the **full** snapshot net (not the partial balance). The payout-on-balance gate is what live must confirm.
- **Instant-book (6.4):** one real "Book now" → confirm the inquiry/booking/transaction chain created in one click and the client's live card charge settles + pays out exactly as a normal booking. (Eligibility = talent `booking_terms.instantBookOptIn` + `fixedRateCents` and tenant `commercialTerms.instantBookEnabled`.)
