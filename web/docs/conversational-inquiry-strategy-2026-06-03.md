# Conversational Inquiry — Product Strategy

**Date:** 2026-06-03
**Status:** Strategy / not yet scoped to implementation
**Author:** Product architecture pass (challenged concept + recommendation)

> One-line: turn the existing inquiry engine's front door from a 7-section form into a
> persistent, brand-skinned, guest-first **conversation** — without throwing away the
> structured spine the booking engine needs, and without shipping a spam firehose at talent.

---

## 0. The reframe (read this first)

The request reads as "build a chat widget that becomes the front door to booking." After
mapping the codebase, that's the wrong mental model and it undersells where you are.

**You already have the front door.** What you're missing is a lower-friction *skin* on it and
two specific backend capabilities. Concretely, the system already has:

- **Guest inquiries that work end-to-end.** `inquiries.guest_session_id` + `client_user_id`
  are both nullable; `submitInquiry(actorUserId=null, guest_session_id=…)` skips the
  permission check; rate limits already exist (5/hr authed, 3/hr guest, 50/hr tenant);
  there is already a `merge_guest_session_to_client()` RPC to attach guest inquiries to a
  new account. (`web/src/lib/inquiry/inquiry-engine-submit.ts`, `guest-client.ts`)
- **A client trust ladder, already modeled.** `client_trust_state` (per `user_id` × `tenant_id`):
  `basic → verified → silver → gold`, driven by `verified_at`, `funded_balance_cents`, and
  `manual_override`. The "pay to be verified" idea is *literally already expressed* as a
  funded-balance threshold. (`web/src/lib/client-trust/evaluator.ts`)
- **A Messages shell that is a POV dispatcher.** `MessagesShell({ pov })` → admin / talent /
  client. Adding a fourth `pov="guest"` is an architecturally clean extension, not a rewrite.
  (`web/src/components/admin/shell/internal/messages.tsx`)
- **A stable guest identity.** Middleware sets a 400-day `impronta_guest` cookie and forwards
  it as `x-impronta-guest`. (`web/src/lib/supabase/middleware.ts`, `guest-session.ts`)
- **Cross-tenant client identity for free.** One `profiles` row; inquiries carry `tenant_id`;
  trust is keyed per tenant. A unified cross-agency client inbox is a query, not a migration.
- **The 7-section inquiry form is already THE entry to the booking engine**, reused across
  talent profile / directory / agency site / dashboard. (`web/src/components/inquiry/InquiryDrawer.tsx`,
  spec at `web/docs/inquiry-engine-spec-2026-05-14.md`)

So this is **~70% a UX / funnel / trust-psychology problem and ~30% backend.** The backend
work narrows to **two real gaps**:

1. **Guest-in-thread continuation.** A guest can *create* an inquiry, but cannot *keep
   messaging* in the thread. RLS on `inquiry_messages` / `inquiry_participants` assumes
   `auth.uid()`. `inquiry_participants.user_id` is nullable (good), but message RLS and the
   read-cursor table need a guest-session path.
2. **Explicit claim/merge UX.** The `merge_guest_session_to_client()` plumbing exists, but
   there's no email-verified "claim your conversations" flow. This must be **email-verified**,
   not cookie-trusting (security — see §13).

Everything else the request describes (AI extraction, full trust badges, cross-tenant inbox,
builder widget, embeds, paid credits) is funnel and product on top of rails that exist.

**The one risk nobody flagged:** a chat widget *implies a human is present*. Talent and
agencies are not a support desk. If "are you free Friday?" gets 18 hours of silence, a chat
widget converts *worse* than a form, because a form promises "we'll get back to you" while a
chat promises "someone is here now" and then breaks that promise. The entire UX must be
**async-first wearing a real-time skin**: instant auto-acknowledgement, honest response-time
expectations, presence/online state, and (later) AI holding the conversation when humans are
away. Get this wrong and the feature is a net negative. This is the central design constraint.

---

## 1. The concept, challenged

### Where it's genuinely strong
- **Attacks the #1 marketplace conversion killer.** "Submitting a form into nowhere" is the
  feeling that kills lead conversion. A thread that *replies* is a categorically better surface.
- **Turns every public page into a lead-capture surface.** Strong, true sales narrative:
  "turn every talent profile and agency site into a live booking conversation."
- **The trust ladder solves a real two-sided fear.** Talent fear fake/spam/anonymous contact
  (and, for some talent, unsafe contact). Visible buyer-trust signals are a real differentiator
  and you've already modeled the data.
- **It compounds into a flywheel.** guest → claim → cross-tenant inbox → repeat bookings →
  the buyer becomes a *platform* asset, not just one agency's lead. That's the network effect.

### Where it's risky (the six things to get right)
1. **Presence expectation** (above) — the make-or-break.
2. **Spam/abuse is existential, not a feature.** Guest-first messaging with just name+email
   invites spam, talent harassment (a genuine safety issue for a talent marketplace),
   competitor scraping, and time-wasting. The current rate limiter is in-memory/per-instance
   and won't hold. **Anti-abuse is MVP, not later.**
3. **Talent notification overload.** If every guest "hi" pings talent who sit on multiple
   rosters, they start ignoring inquiries and the value prop dies. Routing/triage matters more
   than the widget. Default to **coordinator-triaged, talent pulled in when qualified** — which
   matches your existing auto-assigned-coordinator model.
4. **"Pay to verify" is legally and psychologically loaded.** A *fee* to talk to someone you
   want to pay reads as pay-to-play; holding real money may touch money-transmission/KYC (you
   already have an open `project_payments_platform_decision` thread on exactly this). Reframe as
   a **refundable card-on-file / authorization hold**, which costs an honest buyer nothing and
   is a *stronger* trust signal than a fee. Reserve real fees for premium *access*, not basic trust.
5. **Guest-claim is security-sensitive.** Cookie-only claim lets a stolen cookie or a shared
   device inherit someone's conversations. Claim must be **email-verified** and scoped to
   inquiries created by that guest session *and* matching the verified email.
6. **Brand vs. platform disintermediation.** A cross-tenant unified inbox pulls the buyer out
   to a Tulala identity — which some agencies will *not* want (you'd be showing their client
   "you also chatted with [competitor]"). This is a marketplace-vs-SaaS fork. Recommendation:
   **brand-skinned on the way in; platform-unified only after the buyer opts into a Tulala
   account; give agencies a control over cross-tenant visibility.**

**Verdict:** strong idea, real differentiator, mostly de-risked by what you've already built —
*if* you treat presence-honesty and anti-abuse as first-class MVP concerns rather than polish.

---

## 2. The unified model — one "Start Request", two faces

**Answer to Q1/Q2: yes, unify — but as one component with two faces, not one monolith.**

Define a single primitive, the **Request Surface**, with two presentations of the *same*
inquiry thread:

- **Face A — Quick Chat (the popup).** A floating "Message me" launcher → a compact, modern
  mini-chat. First message goes out in one or two taps. This is the acquisition skin.
- **Face B — Full Thread (the Messages shell).** The existing rich thread (offer cards,
  approval, booking, payment). The popup is *the same conversation*, just a smaller window onto
  it, with an "Open full conversation ↗" affordance.

Both write to the same `inquiries` + `inquiry_messages` rows. The classic `InquiryDrawer`
becomes a **third presentation** of the same primitive — the "structured/expanded" face for
buyers who prefer a form or for high-complexity requests (full lineup, multi-date). They are
not competing surfaces; they are three doors into one thread.

This is why "should chat replace the form?" is a false binary. **The chat doesn't replace the
form; the form becomes one optional view of the conversation.** (See §14.)

---

## 3. Flows

### 3.1 Guest client flow (the core loop)
1. Guest lands on a talent/agency/hub page. Sees a brand-skinned launcher: "Message {Name}",
   "Ask availability", "Start a booking request."
2. Taps it → mini-chat opens *inline* (no navigation). A warm, specific opener:
   "Hi — I'm {Name}'s booking assistant. What's the event?" (Brand voice, agency-skinned.)
3. Guest types the first message freely. **The first message is never blocked.**
4. On send (or just after), a single soft gate: name + email, inline, one line — framed as
   "Where should {Name} reach you?" not "Register." Email is required to *persist & route*;
   we capture it as cheaply as possible.
5. Behind the scenes: reuse/create `guest_sessions` row (cookie), call `submitInquiry` with
   `actorUserId=null`, `guest_session_id`, `tenant_id`, the talent pre-selected. A real inquiry
   exists immediately.
6. **Instant auto-acknowledgement** in the thread: "Got it — {Name}/their coordinator typically
   replies within ~{X}. I've sent a copy to {email} so you can pick this up anywhere." Honest
   presence expectation set here.
7. Guest keeps chatting in the popup (guest-in-thread — backend gap #1). The cookie remembers
   them; returning later reopens the active conversation. The ack email contains a **magic link**
   as the cookie-independent recovery path.
8. Coordinator/talent receives it in the real Messages shell (§3.3/3.4) and replies; replies
   appear in the popup and (optionally) email/SMS-notify the guest.
9. As the guest does more (more talents, more messages, a real booking intent), the system
   *progressively* nudges verification and account creation (§5, §7).

### 3.2 Signed-in client flow
- Launcher recognizes the session (cross-subdomain cookie). No name/email gate. Opener is
  personalized; trust badges already attached; prior threads accessible.
- New message either continues an existing thread with that talent/agency or starts a new one.
- Everything the guest gets, plus: persistent cross-tenant inbox, drafts, saved briefs,
  faster offer→approval→pay because identity/payment may already be verified.

### 3.3 Talent response flow
- Conversation arrives in `TalentJobShell` as a job-first card with a **buyer trust chip** at
  the top (badge + signals + one-line risk read — §6.4).
- Talent sees clearly: guest vs verified, email/phone/social/payment proof, past-booking count.
- Talent controls: reply, hold, request coordinator, **block**, **report**, and a
  **"require verified buyers to reach me directly"** toggle (safety/quality — important for
  high-demand or at-risk talent). Default routing keeps the coordinator in front (next point).

### 3.4 Agency / admin / coordinator flow
- By default the inquiry lands in the **coordinator queue** (`AdminOperationsShell`), exactly
  as today — auto-assigned via `assignCoordinatorFromSettings()`. The coordinator triages,
  qualifies, and decides whether/which talent to pull in. This is the spam/overload firebreak.
- Agency-configurable routing: "talent-direct" (talent answers first, coordinator observes),
  "coordinator-first" (default), or "AI-assist then coordinator." Per-tenant setting.
- The coordinator sees the same trust chip plus tenant-local context (`agency_client_relationships`
  — prior relationship, local tags, notes).

### 3.5 Offer → approval → booking → payment (unchanged spine)
The conversation flows into the **existing** engine with **zero changes to the money rail**:
`engine_send_offer` → `inquiry_approvals` (client + each line-item talent) → all-accepted →
`engine_convert_to_booking` → `agency_bookings` → payment via the existing Stripe path. The
chat's only job is to *originate and warm* the inquiry and *capture structured detail* (§12);
the offer/approval/booking/payment machinery is already built and proven (per the money-loop
work). The popup simply needs to *render* offer/approval/pay cards for guests — which is the
same components the client shell uses, shown in the smaller window.

---

## 4. Surface-by-surface (Q3, Q18)

| Surface | Launcher placement | Context richness | Notes |
|---|---|---|---|
| **Talent profile** (`/t/[code]`, hand-coded) | Floating "Message {Name}" + inline near the Inquire CTA | Highest — 1:1, talent pre-selected | **Best MVP surface.** Hand-coded page = easy injection; highest intent. |
| **Agency public page** (`/p/*`, builder) | Global site-shell bubble **and** a `chat_cta` builder block | Medium — agency-level; coordinator triages | Builder block lets agencies place it; shell bubble guarantees presence. |
| **Hub page** | Shell bubble routing to hub concierge or down to agencies | Low — hub is a directory | Hub likely routes "help me choose," not 1:1 talent chat. |
| **Category / search / directory** (`/directory`, builder) | Per-card "Chat" quick-action + global bubble | Medium — can start *multiple* threads | Strong for "message 3 singers, compare." Feeds the multi-thread/credit logic (§7). |
| **Featured talent cards** | Hover/inline "Chat" on `TalentCardActions` | Medium — talent known | Lightweight first touch before a full inquiry. |
| **Embedded widget on external sites** | `<script>` embed / iframe, agency-skinned | Medium | **Distribution + upsell channel** (§9). Higher-tier agency feature; "powered by Tulala" growth loop. |

Branding for all of these reads from `agency_branding.theme_json` (same source as logo/colors),
so the widget inherits the agency/talent brand automatically (Q20).

---

## 5. Trust & verification model (Q8, Q9, Q15, Q16, Q17)

### 5.1 Principle: friction scales with risk, and trust has multiple independent proof-paths
A buyer should be able to become "trusted" through **any** of several routes — social proof,
payment proof, booking history, or manual approval — exactly as intuited. No single mandatory
hoop. This both maximizes conversion and respects that different buyers will trust different things.

### 5.2 The ladder (maps onto existing `client_trust_state`)

| Level | How reached | Talent-facing badge | Unlocks |
|---|---|---|---|
| **Guest** | Cookie only | "Guest" (amber) | 1 active conversation (configurable), throttled reach |
| **Identified** | Name + email captured | "Identified" | Email routing; ack via email |
| **Email-verified** | Magic-link clicked | "✓ Email" | More concurrent threads; persists across devices |
| **Account** | Registered client | "Account" | Cross-tenant inbox, drafts, history |
| **Phone-verified** | OTP (Twilio/Vonage) | "✓ Phone" | Higher reach; SMS notifications |
| **Social-verified** | IG/LinkedIn/FB linked | "✓ Social" | Alternative to payment proof; stronger badge |
| **Payment-verified** | Card-on-file / refundable hold (SetupIntent) | "✓ Real buyer · card on file" | Direct-to-talent reach; priority; maps to `verified_at` |
| **Booked-before** | ≥1 completed booking on Tulala | "★ Booked 3× on Tulala" | Strongest organic trust → silver/gold |
| **Trusted / Premium** | Manual vouch or Client Pro/Enterprise | "Trusted buyer" / "Pro" | Top reach, concierge, SLAs |

Mapping to the existing enum: `verified_at` set by **email+ (phone or social or card)**;
`silver`/`gold` driven by booking history and/or `funded_balance_cents` thresholds (already
coded). `manual_override` already supports admin "Trusted." Multiple paths converge on the same
state — minimal new schema.

### 5.3 Payment-verification — evolve what's already live (corrected)
**Correction after codebase probe:** a "pay $5 to verify" flow is **already shipped**
(`stripe/client-billing.ts`, `VERIFICATION_FEE_CENTS` → sets `verified_at`), and stored client
balances drive silver/gold. So this isn't a build-from-scratch — it's an *evolution*. The honest
read: the $5 fee is a **great spam filter** (real card + $5 = strong bot/fraud deterrent) but
**weak trust *framing*** ("why pay to talk to someone I want to pay?"). Evolve it: prefer a
**refundable authorization hold / card-on-file** (the `SetupIntent` and manual-capture
`PaymentIntent` primitives already exist) so honest buyers pay nothing and talent still get the
strongest "real payment method" signal — or keep the $5 but turn it into **account credit toward
the first booking** rather than a sunk fee. Reserve genuine non-refundable fees for *premium
access*, never for basic trust. **KYC/legal flag:** the *stored balance* (`funded_balance_cents`
/ `client_balance_ledger`) is stored value — the money-transmission/KYC zone tied to
`project_payments_platform_decision`; get a fintech-lawyer review on it. Refundable holds avoid
stored value entirely. Detail in the deep-dives doc, Part B.

### 5.4 What talent/admin see (Q9, Q21)
A compact **trust chip** on every conversation row and atop each thread:
`[badge] · ✓email ✓phone ○social ✓card · ★2 bookings` plus a one-line read:
"New guest — unverified" vs "Verified buyer · booked 3× on Tulala." Talent get block/report and
a verified-only toggle. This chip is the payoff that makes talent trust the inflow.

---

## 6. Anti-spam model (Q10) — layered, MVP-critical

Principle: **the honest first message is nearly frictionless; friction escalates with volume,
velocity, and value.** Layers:

- **L0 — Honeypot + timing.** Reuse the existing honeypot pattern; reject sub-second submits.
- **L1 — Email gate + disposable-domain block.** First persisted message requires email; block
  known disposable domains; soft email-verify (magic link) to continue past message 1–2.
- **L2 — Real, shared rate limits.** Replace the in-memory limiter with Vercel KV / Upstash,
  keyed on `(guest_session, IP, email, tenant)`. Per-instance memory will not hold under abuse.
- **L3 — Progressive friction.** Unverified guests get *throttled reach* (e.g., ≤3 talents,
  N msgs/day). Velocity anomalies (10 talents in 5 min) trigger a **soft captcha**
  (Turnstile/hCaptcha) or a verify-gate — not a hard block.
- **L4 — Content moderation.** Lightweight AI/keyword pass on the first message; obvious spam,
  links, and abuse never reach talent.
- **L5 — Recipient controls + reputation.** Talent/agency block, report, verified-only. Reports
  feed the buyer's trust score *down*; repeated reports flag the account.
- **L6 — Abuse flag + review queue.** Add the missing per-client abuse/suspension flag and a
  manual review surface for the platform team.

Conversion-safe because a real buyer typing a real question hits *none* of L3–L6.

---

## 7. Inquiry credits / limits (Q7, Q11, Q12, Q13)

**Honest take: don't think of these as a paywall — think of them as trust-gates.** On a
marketplace you generally want *more* buyer demand, not less; throttling inquiries to sell
credits optimizes the wrong side of the market. So:

- Limits exist to gate **unverified volume**, and the primary currency to lift them is
  **verification (a trust action), not dollars.**
- Suggested defaults (all tenant-configurable): Guest = 1 active conversation; Email-verified =
  3; Account = 10; any stronger verification = effectively unlimited within fair-use.
- "You've started 3 conversations — create your free account to keep them safe and start more"
  is exactly right *as a trust nudge*, and the trigger is **count of distinct threads**, which
  you can already compute.
- Where dollars *do* belong: a **Client Pro/Enterprise** subscription (already scaffolded as
  `ClientPlan free/pro/enterprise`) for high-volume buyers (planners, brands) who want CRM,
  team seats, saved briefs, priority/SLA, concierge. That's a real B2B product, not a demand tax.

So: free clients get a *reasonable* number of concurrent conversations; verified clients get
more; paid client accounts exist but sell *power features*, not the right to inquire.

---

## 8. Cross-tenant inbox & the brand/platform fork (Q19, Q20)

> **DECISION (locked, 2026-06-03): Unified, opt-in.** Guests see only their session's threads;
> brand-skinned with zero Tulala chrome on agency/custom domains. After a buyer creates a Tulala
> account they get one lightly co-branded cross-agency inbox, with a **per-agency setting**
> controlling whether that agency's threads appear in the cross-tenant view — so we never
> disintermediate our own SaaS customers.

- **Q19 (one inbox across agencies): yes — for signed-in clients.** One `profiles` row, inquiries
  carry `tenant_id`; a unified client inbox is a straightforward query. Guests see only threads
  bound to their cookie/session.
- **Q20 (brand vs platform): skin in, platform after opt-in.** On an agency/custom domain the
  widget is 100% agency-branded — *no* Tulala chrome (critical on custom domains; don't leak
  Tulala). Only once the buyer creates a *Tulala account* do they get the lightly co-branded
  unified inbox. Give agencies a setting controlling whether their threads appear in a buyer's
  cross-tenant view, so you don't disintermediate your own SaaS customers.

---

## 9. Monetization (ranked by how real the money is)

1. **Agency SaaS upsell — the biggest lever.** "Conversational lead capture" is a premium
   reason to be on a higher Tulala plan (Agency/Hub). Embeds on external sites = higher tier.
   This makes the *agency* product stickier and is where the durable revenue is.
2. **Client Pro/Enterprise subscription** (already modeled). Power-buyer CRM/seats/SLA/concierge.
3. **Verified-buyer rail** — monetized *indirectly* (more bookings convert because talent trust
   the inflow) plus optional at-cost ID verification (Stripe Identity) for a premium badge.
   Not a per-inquiry fee.
4. **Priority / featured inquiry placement** and boosted talent — marketplace take, later.
5. **Embeddable widget** — both a feature gate *and* a "powered by Tulala" distribution loop.

Be honest internally: #1 and #2 are the revenue; "pay to verify" is a *trust mechanic that
should mostly be free-but-effortful*, not a revenue line.

---

## 10. UX recommendations — powerful but not overwhelming (Q23, Q24)

- **Progressive disclosure.** Open as a single text box + one warm question. Never show a
  7-field form on first paint. Detail is *earned* as intent rises.
- **Guided chips over open prompts where it counts.** Date, location, headcount, type, budget
  surface as tappable structured chips that map 1:1 to `InquiryIntent` fields — feels like a
  booking assistant, captures clean data (§12).
- **Honest presence, always.** Online/away state, "typically replies in ~X," instant ack. Never
  fake a live agent.
- **One primary action at a time.** Mirror the existing client shell's single "next action" CTA
  (Approve offer / Sign / Pay). The popup should always have exactly one obvious next step.
- **Escalate the container with the intent.** Casual Q&A stays in the small popup; the moment it
  becomes a real booking (offer requested), surface "Open full conversation ↗" into the shell —
  the same thread, bigger window.
- **Make it feel alive, not spammy.** Subtle talent presence/typing, a real portrait (never an
  initials box — house style), brand colors, a human opener line.

---

## 11. Turning chat into structured inquiry data (Q25)

Two modes, same destination (`InquiryIntent` → `submitInquiry`):

- **Guided (MVP):** quick-question chips collect date/location/headcount/type/budget directly
  into intent fields. Deterministic, clean, no AI risk.
- **AI-assisted (later):** free text ("a singer in Tulum next Friday for ~40") → NLP draft →
  `Service: Singer / Location: Tulum / Date: next Fri / Type: private dinner / Guests: 40 /
  Status: needs confirmation` → buyer **confirms via a structured card**. The confirmed card is
  what flips the thread from "casual" to "offer-ready."

**Hard rule:** unstructured text alone never drives an offer. Always reconcile to the structured
spine the engine requires (talent IDs, dates, location, budget). AI accelerates capture; it does
not bypass confirmation. This protects offer/approval/booking correctness.

---

## 12. Risks & edge cases (consolidated)

- **Presence/SLA breach** → online state + honest expectations + AI hold + always-email-a-copy.
- **Spam / harassment / talent safety** → §6 layered model; verified-only toggle; no PII to guests.
- **Notification overload** → coordinator-first triage; digests; talent pulled in when qualified.
- **Guest-claim security** → email-verified merge only; scope to that session's inquiries + email.
- **Lost cookie** (incognito/cleared/new device) → magic link in the ack email is the recovery.
- **Shared device** → never auto-attach on cookie alone; require verified email to claim.
- **Email reused as guest then registered with a different email** → match on verified email.
- **Talent on multiple agencies** → page `tenant_id` owns the thread; cross-tenant already
  handled via `inquiry_messages.target_owning_party_id`.
- **Legal: held funds / KYC** → use Stripe primitives, refundable holds; fintech-lawyer check
  before any balance model (ties to `project_payments_platform_decision`).
- **Privacy/GDPR** → consent on email capture, guest-thread retention policy, right-to-delete.
- **Competitor scraping via the widget** → rate limits + verified-gates on bulk reach.
- **Cannibalizing structured data** → §11 hard rule; the form remains the expanded face.
- **Agency disintermediation** → brand-skin in; cross-tenant only post-opt-in; agency visibility control.

---

## 13. Guest → account attach (Q5, Q6) — the secure claim flow

1. Guest has inquiries tied to `guest_session_id` (cookie).
2. Guest signs up (or signs in) using the **same email** they used in chat.
3. System sends/uses a **magic-link email verification**; on verified click, call
   `merge_guest_session_to_client(session_key, client_profile_id)` — but **only** merge
   inquiries where `guest_session_id` matches the verified cookie/session **and**
   `contact_email` matches the verified email. Never merge on cookie alone.
4. Post-merge, threads appear in the authenticated client inbox and, going forward, in the
   cross-tenant view (subject to agency visibility settings).
5. Show the buyer "We found 3 conversations from before you signed up — they're now saved to
   your account." (Confirmation, not silent.)

---

## 14. How this connects to — and eventually absorbs — the inquiry form (Q14)

- **Now:** chat is the low-friction *originator*; the `InquiryDrawer` form is the *expanded
  structured face* for complex requests. Same `submitInquiry` underneath; both write the same rows.
- **Mid-term:** the chat's guided capture covers the common cases; the form auto-opens only when
  the request is complex (full lineup, multi-date) or the buyer prefers it.
- **Long-term:** the form becomes a *view* of the conversation ("see all details as a form"),
  not a separate front door. The conversation is the system of record; the form is one rendering.

You never *delete* structured capture — you change *when and how* it's collected (conversationally,
progressively) while keeping the structured `InquiryIntent` the booking engine depends on.

---

## 15. MVP vs. later (the recommendation)

### MVP — prove the conversion + continuation hypothesis on ONE surface
Scope to **talent profile pages** (`/t/[code]`): highest intent, 1:1 context, hand-coded page =
cheapest injection. Ship the *whole loop* there:
- Floating "Message {Name}" launcher → brand-skinned mini-chat (Face A).
- First message free; soft name+email gate; create real inquiry via existing `submitInquiry`.
- **Backend gap #1:** guest-in-thread continuation (RLS path for `guest_session_id`,
  guest read-cursor).
- Instant auto-ack + honest "replies in ~X" + email-a-copy with magic link.
- Coordinator/talent receive it in the **existing** Messages shell; replies flow back to popup
  (add `pov="guest"` rendering for the popup's smaller window).
- Anti-abuse floor: email required, disposable-domain block, **KV-backed** rate limits, honeypot.
- **Backend gap #2:** email-verified guest→account claim on signup.
- Trust chip v1 for talent (guest / email-verified / account; block + report).

That's the complete front-door loop, on one surface, reusing the engine and the money rail.

### Phase 2 — expand surfaces + trust depth
Agency builder `chat_cta` block + global site-shell bubble; directory per-card chat; phone &
social verification; card-on-file "real buyer" badge; cross-tenant client inbox (post-opt-in);
Client Pro features begin.

### Phase 3 — intelligence + distribution + monetization
AI extraction (free-text → structured draft → confirm); AI "hold the conversation" when humans
are away; embeddable external-site widget ("powered by Tulala"); priority/featured inquiry
placement; concierge tier.

**Sequencing rule:** never expand surfaces (Phase 2) before the presence-honesty and anti-abuse
floor (MVP) are solid — a wider net over a leaky trust/SLA model just multiplies the damage.

---

## 16. The 25 questions, answered crisply

1. **Unify chat + form?** Yes — one "Request Surface" primitive, three faces (Quick Chat / Full
   Thread / Structured form). Not a monolith; same underlying inquiry thread.
2. **Mini-chat first, expand to shell?** Yes — popup is a small window onto the same thread;
   "Open full conversation ↗" escalates to the Messages shell as intent rises.
3. **How across surfaces?** §4 table — talent profile (MVP) → agency/hub/directory/cards → embeds.
4. **Guest?** §3.1 — first message free, soft email gate, real inquiry created, cookie+magic-link
   persistence, guest-in-thread continuation.
5. **Signs up after starting?** §13 — magic-link verify → merge guest inquiries → appear in inbox.
6. **Safely attach guest convos?** §13 — email-verified, scoped to that session + matching email;
   never cookie-only.
7. **How many guest inquiries before verification?** Default 1 active (guest) / 3 (email-verified);
   tenant-configurable; a *trust*-gate, not a paywall (§7).
8. **Verification levels?** §5.2 ladder: guest → identified → email → account → phone → social →
   payment(card) → booked-before → trusted/premium; multiple independent paths.
9. **What talent/admin see?** §5.4 — trust chip with badge + per-signal ticks + one-line risk read.
10. **Spam prevention without killing conversion?** §6 — friction scales with volume/velocity/value;
    honest first message is frictionless.
11. **Inquiry credits?** As trust-gates, not currency (§7).
12. **Free clients limited?** Yes, modestly, and *verification* (not payment) is the main unlock.
13. **Verified clients get more?** Yes — more reach, direct-to-talent, priority.
14. **Paid client accounts?** Yes — Client Pro/Enterprise sells power features (CRM/seats/SLA/
    concierge), never the right to inquire.
15. **First booking unlocks trusted?** Yes — booking history is the strongest organic trust
    (→ silver/gold).
16. **Social verification → stronger badge?** Yes — an alternative proof path to payment.
17. **Payment verification → stronger badge?** Yes — but as refundable card-on-file, not a fee.
18. **Across Tulala/agencies/hubs/talent?** §3.4 + §4 + §8 — coordinator-triaged by default,
    tenant-configurable routing, brand-skinned per host.
19. **One client inbox across agencies?** Yes for signed-in clients (§8); guests see only their
    session's threads.
20. **Inside agency brand while on Tulala engine?** Skin in, platform after opt-in; agency
    controls cross-tenant visibility (§8).
21. **How do agency/coordinator/talent receive & respond?** Existing Messages shell; coordinator
    queue first, talent pulled in when qualified (§3.3/3.4).
22. **Becomes offer/approval/booking/payment how?** Unchanged engine: `engine_send_offer` →
    `inquiry_approvals` → `engine_convert_to_booking` → `agency_bookings` → Stripe (§3.5).
23. **Encourage casual → serious?** Single next-action CTA, escalate container with intent,
    guided chips → offer-ready card (§10/§11).
24. **Powerful but not overwhelming?** Progressive disclosure, one question at a time, honest
    presence, real imagery (§10).
25. **Chat → structured data?** Guided chips (MVP) + AI extraction with confirm card (later);
    unstructured text never drives an offer (§11).

---

## 17. What I'd actually build first (one paragraph)

Ship the **talent-profile conversational starter** end-to-end: floating brand-skinned launcher →
mini-chat → free first message → soft email gate → real inquiry via existing `submitInquiry` →
guest-in-thread continuation (the one meaningful new RLS path) → instant honest auto-ack + emailed
magic link → coordinator/talent reply in the existing shell flowing back to the popup → KV-backed
anti-abuse floor → email-verified guest-claim on signup → a v1 trust chip for talent. That single
slice proves the entire thesis ("the public site feels alive; talent receive structured, trust-
signalled inquiries") on the highest-intent surface, reuses the booking/money rail wholesale, and
de-risks the two presence/abuse failure modes before you widen the net.
