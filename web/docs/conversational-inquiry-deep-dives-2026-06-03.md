# Conversational Inquiry — Deep Dives (MVP plan · Trust · Anti-spam & Presence)

**Date:** 2026-06-03
**Companion to:** `conversational-inquiry-strategy-2026-06-03.md`
**Status:** Design / not yet scoped to a build branch

> Grounded in a second codebase probe. Headline: even **more is already built** than the
> strategy doc assumed. The trust ladder is **live in production** (incl. a real $5 verify
> fee + stored client balances); realtime messaging + auto-ack are **live**. The genuine
> net-new work narrows to: guest-in-thread, the guest-realtime fork, a KV anti-abuse floor,
> block/report, and the mini-chat UI. This doc details all three asks.

---

# PART A — The MVP build plan (talent-profile conversational starter)

**Goal of the slice:** prove the whole loop on the single highest-intent surface — a guest on
a talent profile starts a real, persistent conversation that lands in the talent/coordinator
Messages shell, gets a reply back in the popup, and can be claimed on signup — with an honest
presence model and a real anti-abuse floor. Reuse everything that exists; build only the gaps.

## A.1 What we reuse (verified to exist)
| Piece | Path | Role in MVP |
|---|---|---|
| Inquiry button injection point | `web/src/app/t/[profileCode]/page.tsx` (~L1735) + `talent-profile-inquire-button.tsx` | Mount the chat launcher as a sibling; it already has `talentId, tenantId, tenantSlug, agencyName`, branding, guest/auth state |
| Guest inquiry creation | `submitInquiry()` / `createInquiryFromIntent()` (`inquiry-engine-submit.ts`, `inquiry-intent-engine.ts`) | `actorUserId=null` + `guest_session_id` path already supported |
| Guest client provisioning | `ensureGuestClientByEmail()` (`inquiry/guest-client.ts`) | Auto-creates/matches a client by email at submit |
| Guest session identity | middleware `x-impronta-guest` + `getGuestSessionKey()` | Stable 400-day cookie = the guest's capability |
| Message engine | `sendMessage()` (`inquiry-engine-messages.ts`) — service-role + `validateActorPermission` gate | Extend for a guest sender (below) |
| Realtime delivery | `postgres_changes` on `inquiry_messages` (`_ParticipantThreadShell.tsx`, `ClientMessagesShell.tsx`) | Talent/coordinator side already gets live messages |
| Auto-acknowledgement | `auto_ack_enabled` agency setting → system message into private thread | Reuse; make the "~4h" honest (Part C) |
| Notifications | `dispatchEventNotifications()` + `user_notifications` + Resend email | Talent/coordinator get pinged on the new message |
| Guest→account merge | `mergeGuestActivity()` → `merge_guest_session_to_client()` RPC | Claim path (needs the inquiry-merge extension, below) |
| Trust display | `TrustBadge` (`components/trust-badge.tsx`), `TrustSummary` (shell `types.ts`) | Talent-facing trust chip v1 |
| Per-talent contact policy | `contact_policy` checked in the guest submit path | Basis for "verified-only to reach me" |

## A.2 What we build (the real gaps)

### Gap 1 — Guest-in-thread messaging (the one meaningful backend change)
The message write path is **service-role + an app-layer permission gate**, *not* RLS — so this
is smaller than feared. Recommended approach (matches the existing `sendClientMessageAction`
shape):

1. **Migration** (one file, `db:push` per CLAUDE.md before merge):
   - `ALTER TABLE inquiry_messages ADD COLUMN guest_session_id UUID REFERENCES guest_sessions(id) ON DELETE SET NULL;` + index.
   - (Optional) same nullable column on `inquiry_message_reads`, or skip guest read-tracking for MVP.
   - Extend `merge_guest_session_to_client(session_key, client_profile_id)` to **also** relink
     inquiries: `UPDATE inquiries SET client_user_id = … WHERE guest_session_id = … AND client_user_id IS NULL`
     (the RPC comment already flags this as "future"). Keep it email-gated (A.2 Gap 3).
2. **Engine**: extend `sendMessage()` to accept a guest sender — `sender_user_id = NULL`,
   `guest_session_id = <gid>` — and a guest branch in `validateActorPermission` (or bypass it
   with an explicit ownership check done in the action).
3. **Server actions** (service-role, ownership-checked):
   - `sendGuestMessageAction(inquiryId, body)` — reads the guest key from `x-impronta-guest`,
     validates `inquiries.guest_session_id == lookup(session_key)`, calls the engine, emits the
     same message event (so notifications + talent realtime fire unchanged).
   - `getGuestThreadMessages(inquiryId)` — service-role read scoped to that session's ownership;
     powers the popup's initial load and poll.

### Gap 2 — Guest realtime (honest call: poll for MVP, broadcast as fast-follow)
The talent side already gets live messages via `postgres_changes`, but that path is **RLS-gated
to `auth.uid()`** — a guest (anon, no JWT) cannot subscribe to row changes under current RLS.
Three options, in order of MVP fit:
- **(A) Poll** `getGuestThreadMessages` every ~3–5s while the popup is focused. Simplest, no RLS
  fight, good enough to feel live for a just-started conversation. **← MVP.**
- **(B) Realtime Broadcast** — the send action publishes to a channel keyed on the inquiry; the
  guest subscribes to the broadcast (not RLS-gated rows). True liveness. **← fast-follow.**
- **(C) Custom JWT claim** carrying `guest_session_id` + a guest RLS policy. Most "correct",
  most complex (token mint/rotate). Defer.

Be honest in the UX: a just-started thread polling every few seconds reads as live; we don't
need (B)/(C) to ship the hypothesis.

### Gap 3 — Secure guest→account claim
- On signup/sign-in with the **same email** used in chat, require **email verification**
  (magic link) — today Supabase auto-confirms, which is *not* good enough for a claim. Add a
  real verify step before merge.
- On verified claim, call the extended `merge_guest_session_to_client` scoped to inquiries where
  `guest_session_id == this session` **AND** `contact_email == verified email`. Never merge on
  cookie alone (shared-device risk).
- Show "We found N conversations from before you signed up — they're saved to your account now."

### Gap 4 — The mini-chat UI (the only substantial new frontend)
- `TalentProfileChatLauncher` (client) — floating, brand-skinned ("Message {Name}" /
  "Ask availability"), sibling to the existing inquire button; color from `agency_branding.theme_json`.
- `MiniChatPanel` (client) — opener line → free first message → inline one-line name+email gate →
  on send: `startGuestChatInquiry()` (thin wrapper building the minimal `InquiryIntent` and
  calling `createInquiryFromIntent`) → render the thread (initial `getGuestThreadMessages` + poll)
  → composer wired to `sendGuestMessageAction`. Instant auto-ack bubble + "we emailed you a link."
- "Open full conversation ↗" present but inert for MVP (links to the claim/login path).

### Gap 5 — Anti-abuse floor (MVP-blocking — see Part C for the full model)
- Honeypot field in the panel (reuse the `directory/actions.ts` pattern).
- Disposable-email block at the email gate (net-new small check).
- **KV-backed** rate limits on guest inquiry-create + message-send keyed on
  `(guest_session, IP, email, tenant)` — the in-memory limiter is per-instance and leaks on Vercel.
- Velocity gate → Turnstile challenge (infra already exists for CMS forms) when a guest starts
  > N inquiries in M minutes.

### Gap 6 — Talent trust chip v1
Reuse `TrustBadge` + `TrustSummary` at the top of the talent thread (`TalentJobShell` /
`_ParticipantThreadShell`): Guest / Email-verified / Account + the one-line risk read. Block/report
come in Part C.

## A.3 Build sequence (each step gated `tsc --noEmit` + `lint`; migration `db:push` before merge)
1. Migration (guest_session_id on `inquiry_messages`) + extend merge RPC → `db:push`.
2. Engine guest-sender branch + `sendGuestMessageAction` / `getGuestThreadMessages`.
3. `startGuestChatInquiry` action (reuses `createInquiryFromIntent` + `ensureGuestClientByEmail`).
4. `TalentProfileChatLauncher` + `MiniChatPanel` on `/t/[profileCode]`, wired with poll.
5. Anti-abuse floor (KV + disposable-email + honeypot + velocity→Turnstile).
6. Secure claim (email-verified merge) wired into signup.
7. Trust chip v1 in the talent thread.
8. QA: local-first (drive a real guest inquiry+message on localhost, prove it lands in the
   talent shell, reply flows back to the popup, claim-on-signup merges), then a **seeded host**
   (raw `*.vercel.app` won't render — alias/promote per CLAUDE.md QA caveat).

## A.4 Definition of done for the MVP
A guest on a talent profile sends a message → a real inquiry + thread exists → talent/coordinator
see it (with a trust chip) in the existing shell and reply → the reply appears in the guest's
popup → the guest gets an emailed magic link → on signup the conversation is claimed into their
account → spam/velocity is throttled by a shared limiter → all gated and QА'd on a seeded host.

---

# PART B — Trust & verification (it's LIVE — evolve it, don't rebuild it)

## B.1 What is already shipped (production)
- **`client_trust_state`** (`20260901150000_client_trust_ladder.sql`): per `(user_id, tenant_id)`,
  `trust_level ∈ {basic, verified, silver, gold}`, signals `verified_at`, `funded_balance_cents`,
  `manual_override`.
- **`deriveClientTrustLevel()`** (`client-trust/evaluator.ts`): pure function;
  `verified_at` ⇒ ≥ verified; `funded_balance_cents ≥ $100` ⇒ silver; `≥ $500` ⇒ gold;
  `manual_override` beats all.
- **A real $5 verification fee** (`stripe/client-billing.ts`, `VERIFICATION_FEE_CENTS`): Stripe
  Checkout → webhook sets `verified_at`. **This is exactly the "pay to verify" mechanic — already live.**
- **Stored client balances**: top-ups ($100/$250/$500) → `client_balance_ledger` (append-only) →
  `reconcileClientBalanceFromLedger()` → silver/gold. Refunds handled.
- **UI**: `TrustBadge` chip renders on talent inbox, inquiry workspace sidebar, client profile
  drawer, admin Clients table. `TrustSummary` type already carries badge types for
  `instagram_verified`, `payment_verified`, `emailVerified`, `phoneVerified`, claim status, and
  pending verification requests/methods — a richer system is **scaffolded**.
- **`SetupIntent` (card-on-file)** exists for workspace staff (`payment-methods.ts`) — reusable
  for client card verification. Stripe customers are created per client.
- **Per-talent `contact_policy`** is enforced in the guest submit path (tiered contact gating
  already exists at the talent level).

## B.2 What's stored-but-unverified, and what's missing
| Signal | State | Note |
|---|---|---|
| Email | **Stored, auto-confirmed** | Not a real verify; not read by the evaluator |
| Phone | **Stored, unverified** | No OTP flow |
| Social (IG/LinkedIn/FB) | **OAuth identities exist, unwired** | `instagram_verified` badge type scaffolded but no flow |
| Previous bookings | **Counted, unwired** | `previous_bookings_count` exists; **not** in the trust calc — strongest organic signal, easiest win |
| Stripe Identity (gov ID) | **Missing** | Would need Stripe Identity or a KYC vendor |
| Refundable auth hold | **Missing** | But `PaymentIntent` w/ `capture_method:"manual"` + `SetupIntent` exist to build it |
| Block / report / verified-only toggle | **Missing** | Net-new (Part C) |
| Workspace-side client policy | **Deferred** | Talent-side `contact_policy` exists; agency-side does not |

## B.3 The evolved ladder → concrete wiring
Keep the live enum; light up the dormant signals (mostly small, high-value):
1. **Booking-history → trust (do this first).** Feed `previous_bookings_count`/completed bookings
   into `deriveClientTrustLevel` (≥1 completed ⇒ at least silver-equivalent "Booked on Tulala").
   Strongest organic trust, data already exists, no new collection.
2. **Real email verification.** Replace auto-confirm with a magic-link verify; set an
   `email_verified_at` signal (needed anyway for the secure claim, Part A Gap 3).
3. **Phone OTP** (Twilio/Vonage) → `phone_verified_at`. Optional rung.
4. **Social verification** — reuse the existing OAuth identities + the scaffolded
   `instagram_verified`/social badge types; "linked" = a soft badge, "handle matches a real
   public profile" = stronger. Alternative proof path for buyers who won't put a card.
5. **Payment verification — reframe (see B.4).**
6. **Trusted/Premium** via `manual_override` (exists) or a Client Pro subscription.

Each rung is an **independent** path to `verified_at`/higher tiers — exactly the multi-proof
model the strategy calls for. Minimal new schema (a couple of `*_verified_at` columns + feeding
booking count into the evaluator).

## B.4 The $5-fee question, answered honestly
You already ship a $5 verify fee. It is a **great spam filter** (a real card + $5 is a strong
bot/fraud deterrent) but **weak trust *framing*** ("why am I paying to talk to someone I want to
pay?"). Recommendation — keep the friction, fix the framing, one of:
- **(Preferred) Refundable authorization hold / card-on-file.** Use the existing `SetupIntent`
  (save card) or a `PaymentIntent` with `capture_method:"manual"` (hold, then void). The buyer
  proves a real payment method; costs them nothing; talent get the strongest "real buyer" signal.
- **(Or) Keep the $5 but make it account credit toward the first booking** — not a sunk fee. Same
  spam-filtering friction, no "pay-to-talk" resentment.
Reserve genuine non-refundable fees for **premium access** (priority, concierge, extra reach),
never for basic trust.

## B.5 What talent/admin see
Extend `TrustBadge`/`TrustSummary` to the fuller ladder and surface a **trust chip** atop every
conversation: `[tier badge] · ✓email ✓phone ○social ✓card · ★N bookings` + a one-line read
("New guest — unverified" vs "Verified buyer · booked 3× on Tulala"). This is the talent-facing
payoff that makes the inflow trustworthy. Pair with talent controls (Part C): block, report,
and "verified-only to reach me directly" (extends the existing per-talent `contact_policy`).

## B.6 KYC / legal callout (important, not optional)
The **stored client balance** (`funded_balance_cents` / `client_balance_ledger`) is *stored value*
— the highest-scrutiny zone for money-transmission/KYC, and it ties directly to your open
`project_payments_platform_decision`. The $5 fee (a sale via Stripe) is lower-risk; **holding a
prepaid balance is the part to get a fintech-lawyer review on.** Refundable holds and
card-on-file (B.4) avoid stored value entirely and sidestep most of this — a strong reason to
prefer them over balance top-ups as the trust mechanic. Stripe Identity (not yet integrated) is
the path if you ever need real government-ID KYC.

---

# PART C — Anti-spam & async-first presence (the two existential risks)

## C.1 Anti-spam — layered, mapped to what exists vs. missing
Principle: **friction scales with volume, velocity, and value** — the honest first message is
nearly frictionless.

| Layer | Mechanism | Status today | MVP action |
|---|---|---|---|
| **L0** | Honeypot + submit timing | **Exists** (`directory/actions.ts` silent pass-through) | Add the field to the mini-chat |
| **L1** | Email required + disposable-domain block | Email gate exists; **disposable block missing** | Build a small disposable-domain denylist check at the gate |
| **L2** | Shared (cross-instance) rate limits | **In-memory only** (`rate-limit.ts`) — leaks on Vercel | **Add Vercel KV / Upstash**, key `(guest_session, IP, email, tenant)`; this is the key infra gap |
| **L3** | Progressive friction + captcha on anomalies | Turnstile/hCaptcha **exists** (CMS forms, env-gated) | Wire it to velocity triggers in the mini-chat |
| **L4** | Content moderation on first message | **Missing** (an AI inquiry-draft endpoint exists to borrow from) | Optional: lightweight AI/keyword pass before it reaches talent |
| **L5** | Recipient controls + reputation | **Missing** (no block/report tables) | Build `user_blocks` + `inquiry_reports`; reports lower the buyer's trust |
| **L6** | Abuse flag + review queue | `account_status='suspended'` **exists**; per-client abuse flag + queue **missing** | Add a client abuse flag + a platform review surface |

A real buyer typing a real question hits **none** of L3–L6. Two genuinely net-new pieces:
**KV-backed limits (L2)** and **block/report (L5)** — both small, both safety-critical, both MVP-adjacent.

### Block / report schema (net-new)
- `user_blocks (blocker_user_id, blocked_subject_type, blocked_subject_id, scope, created_at)` —
  talent/agency blocks a guest/client; enforced at message-send + inquiry-create.
- `inquiry_reports (inquiry_id, reporter_user_id, reason, status, created_at)` — feeds the buyer's
  trust score down and a platform review queue. Repeated reports → `account_status='suspended'`.

## C.2 Async-first presence (the make-or-break UX)
A chat widget *implies a human is present*; talent are not a support desk. The model: **async
underneath, honest on the surface.**

| Element | Status today | Plan |
|---|---|---|
| Live message delivery | **Exists** (`postgres_changes`) for auth users; RLS-gated → guest needs poll/broadcast | Part A Gap 2: poll (MVP) → broadcast (fast-follow) |
| Instant auto-acknowledgement | **Exists** (`auto_ack_enabled` system message) | Reuse; make the time **honest** (below) |
| "Typically replies in ~X" | **Missing** | Compute median first-response latency from `inquiry_messages` timestamps per talent/tenant — the data already exists |
| Online / away presence | **Missing** (no presence channel) | Supabase **presence** channel + heartbeat; show "online" **only** when genuinely active |
| Typing indicator | **Missing** | Presence/broadcast event; nice-to-have, post-MVP |
| Always-email-a-copy | Email infra **exists** (Resend) | Every guest thread emails a magic-link copy so async is graceful and recoverable |
| AI holds the conversation when away | **Missing** | Phase 3: AI gathers structured detail (date/location/headcount/budget) while humans are away |

**Honesty rules (non-negotiable):**
- Never render "online" unless the recipient is truly active right now.
- Default the framing to **async** ("Leave a message — {Name}/their team typically replies in
  ~{X}") rather than implying a live agent.
- Set the expectation *before* the first send, confirm receipt *instantly*, and always email a
  recoverable copy. A broken "someone's here now" promise converts worse than an honest form.

## C.3 Why this ordering
Ship the **KV limiter + honeypot + disposable-email + honest auto-ack/poll** *with* the MVP
(Part A Gap 5) — they're the floor. Layer **block/report + presence + captcha-on-velocity** as the
immediate fast-follow. Do **not** widen to more surfaces (agency/directory/embeds) until this floor
is solid: a wider net over a leaky trust/SLA model multiplies the damage rather than the value.

---

# Cross-cutting: the inbox decision (locked)

Per the product decision: **unified, opt-in.** Guests see only their session's threads;
brand-skinned with zero Tulala chrome on agency/custom domains. After a buyer creates a Tulala
account they get one lightly co-branded cross-agency inbox, and **agencies get a setting
controlling whether their threads appear in that cross-tenant view** — so we never disintermediate
our own SaaS customers. Mechanically trivial (one `profiles` row; inquiries carry `tenant_id`);
the work is the agency-visibility control + the post-opt-in inbox surface.
