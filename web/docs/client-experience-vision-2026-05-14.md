# The Client Experience — Product & UX Vision

> *"The client isn't shopping for talent. They're trying to pull off an event without it falling apart. We earn their trust by making the next move obvious, the state visible, and the agency feel like a person — not a queue."*

**Author**: Senior PM + UX, 2026-05-14
**Status**: Strategic vision — pre-roadmap
**Replaces**: ad-hoc audit findings in `client-dashboard-audit-2026-05-14.md` (kept for tactical reference)

---

## 0 · Executive summary

The client is the **paying side** of every booking on Tulala. They open the dashboard because something is on their plate — a brief to send, a coordinator to chase, an offer to approve, an event to confirm. **Anxiety, not curiosity, is the dominant emotion.** Every screen should reduce that anxiety; every interaction should answer two questions: *"What's the state?"* and *"What's the next move?"*

Today the dashboard is a collection of CRUD pages stitched together. We have inquiries, bookings, settings — but no **product**. The user has to assemble the answer themselves: open Messages, click an inquiry, click "Open details", scroll for status, navigate to Bookings, etc. Every click is a tax on a stressed booker who is also handling their boss, their venue, their budget, and their colleagues.

The vision is to flip the model. **The client dashboard becomes one product with one purpose: get the booking done, with confidence.** Messages is the home. The list is the dashboard. Every project shows next-action surfaces inline. Drawers replace navigation. Realtime replaces refresh. The roster is browsed but the *project* is followed. The agency feels like a concierge, not a ticket queue. This document defines what we ship, in what order, and why.

---

## 1 · North Star

> **"From inquiry sent to event executed, the client never wonders what to do next, never doubts that the agency is on it, and never opens their email to find out what's going on."**

Measurable proxies:
- **Time-to-first-meaningful-action (TTFMA)** from dashboard load: ≤ 3 seconds. The user sees what's waiting on them above the fold.
- **Self-service rate**: ≥ 80% of inquiries → bookings without the client emailing/calling the agency.
- **Confidence index**: NPS-style "How clearly do you know what's happening?" — target ≥ 60.
- **Repeat-booking rate**: ≥ 40% of clients submit a 2nd inquiry within 90 days.

Anti-pattern: do not optimize for time-in-app. We optimize for *time-to-decision*. The client should be in and out in under 90 seconds for status checks, under 5 minutes for an approval, under 15 minutes for a fresh brief.

---

## 2 · The four product principles

These guide every PR. If a change doesn't ladder up to one of these, it's noise.

### 2.1 · State is visible. Always.
Every project's stage, who's blocking, and what's next-actionable shows on the surface — never one click in. Status chips, "your turn" pills, deadlines, talent acceptance counts: surface them as data, not as steps to dig for.

**Concretely**: an inquiry row shows status + "your turn (1 new)" + the next deadline ("offer expires in 2d") inline. No "open details to find out."

### 2.2 · One canvas, many lenses.
Messages is the home. Today, Inquiries, Bookings are lenses on the same underlying project data. The user moves between lenses without losing context — sort/filter/search state persists across them.

**Concretely**: clicking a project in Today opens the same Messages thread, not a separate page. The lens just decides how the list is sorted (Today = next-actionable first; Bookings = chronological; Inquiries = stage-grouped).

### 2.3 · Drawers, not navigation.
For every action that doesn't require a dedicated URL, prefer an over-the-content drawer. The client never loses their place. Form drafts persist. Multi-step flows are inline.

**Concretely**: `+ New Inquiry`, `View offer details`, `Approve` confirmation, `Add to calendar`, `Share for sign-off` — all drawers. The URL only changes for genuine navigation (Today → Messages → Bookings).

### 2.4 · Feel concierge, not CRM.
Tone, density, copy, and animation should feel like the client has a person handling things. Calm, premium, human. Not a Jira board, not a sales CRM, not a Notion clone.

**Concretely**: typography that breathes (16/24/32 scale, not 12/14/16), warm neutral palette (cream surface, near-black ink, accent indigo), motion that confirms but doesn't dance, copy that says "Your coordinator drafted an offer — review by Friday" not "Status: offer_pending."

---

## 3 · Who we serve

We design the dashboard for the dominant persona, but we don't break the secondary ones.

### 3.1 · Maya · Brand booker (primary, ~70% of clients)
- Marketing manager at a hospitality brand. Books talent for activations, openings, ad shoots.
- 3–8 bookings/year. Each costs $2k–$20k.
- **Goals**: deliver a successful event, stay on budget, document everything for her boss.
- **Pains**: chasing the agency for status, explaining offers to procurement, losing track of which talent confirmed.
- **Tech**: laptop at desk, phone in meetings. Comfortable with Slack, Google Workspace, Notion. Not a power user.
- **Quote**: *"I don't care about the platform. I care about the event going well. Just tell me what I need to do."*

### 3.2 · Carlos · Operations / venue owner (secondary, ~25%)
- Owns/runs a beach club, restaurant, hotel. Books recurring talent for nights, events, residencies.
- 20–80 bookings/year. Each $300–$3k.
- **Goals**: fill the calendar, repeat what worked, minimize admin.
- **Pains**: same talent over and over but no "book like last time" button. Manual call sheets. Late cancellations.
- **Tech**: phone-first. WhatsApp is his main work tool.
- **Quote**: *"Just send me Sofia again for next Saturday."*

### 3.3 · Lila · Personal booker (tertiary, ~5%)
- Books talent for a private event — birthday, wedding, dinner party.
- 1–2 bookings, ever.
- **Goals**: get this one event right, feel taken care of, not overpay.
- **Pains**: doesn't speak agency jargon, intimidated by "rate cards" and "call sheets".
- **Tech**: phone.
- **Quote**: *"I just want a host for my husband's 40th. Help."*

**Design implication**: Maya defines the desktop layout. Carlos drives mobile + "rebook" features. Lila drives copy + empty-state hand-holding.

---

## 4 · The ideal journey

Annotated end-to-end. This is the experience we are building toward.

### 4.1 · Arrive

Maya opens `tulala.digital` on her laptop, signs in (or is auto-signed in via SSO). She lands on `/client/messages` — the new home.

**What she sees**:
- Identity bar (top, 56px): agency logo, her avatar, notifications bell with badge.
- One subtle nav (top, 44px): **Messages · Discover · Bookings · Settings** (4 tabs, not 6).
- Page header: *"Welcome back, Maya. 1 project needs you."*
- Two-pane shell: project list left (340px), thread right (1fr).
- The project that needs her is auto-selected and the offer card is rendered in the thread pane.

**Why**: she came here because something was waiting. The dashboard front-loads the next action.

### 4.2 · Reply, decide, move

Maya clicks **Approve** on the offer. A confirmation drawer slides in.

**Drawer contents**:
- Summary: "Approve offer for 'Beach activation · Sep 29 · 3 talent' · $4,200"
- A toggle: "Notify my colleague Diego for sign-off" (team feature, see §5)
- Sticky CTA bottom: **Approve & lock** (primary, ink) · **Cancel** (ghost)

She approves. The drawer plays a 240ms confirmation animation. The status chip in the list flips from "Offer pending" to "Booked". The thread pane immediately renders a system card: *"You approved. Coordinator notified. Booking confirmed for Sep 29."*

**Why**: irreversible actions get explicit confirmation, but the rest of the system reacts immediately. No "are you sure?" modals for low-stakes moves.

### 4.3 · Plan the next event

Maya remembers — she also needs talent for an October launch. She clicks **Discover**.

**What she sees**:
- Lens-switch: list view default with filter chips (Category · City · Date available · Languages · Price range).
- Talent cards: photo, name, primary type, city, "Available Oct 15: ✓".
- Each card has a **♡ Save** affordance and an **Inquire** CTA.

She saves 3 models to a new shortlist *"October launch"*. Then she clicks **Inquire** on the shortlist.

**Drawer contents**:
- 3 talent chips at the top (with × to remove)
- 1-screen form: event type · date · location · budget · brief.
- AI-assist: "Want help writing the brief?" → expands a paragraph from a template based on event type + talent picked.
- Sticky CTA: **Send to coordinator** · **Save as draft**.

**Why**: shortlist-first is the natural booker behavior. AI-assist removes the "what do I write?" anxiety for first-time bookers.

### 4.4 · Live status

A new message arrives from the coordinator: *"Sofia confirmed, Carmen on standby, Reina declined — sourcing replacement."*

**What happens**:
- The browser tab badges (Tulala title becomes "(1) Tulala").
- The project in Messages list bumps to the top with a blue dot.
- If Maya has the project open: the message appears in real time at the bottom of the thread pane, with a fade-in animation.
- Push notification fires on her phone if Maya enabled it.

**Why**: realtime is the difference between "platform" and "tool". This is the single highest-ROI feature we ship.

### 4.5 · Event day

The day of the event, Maya gets a one-tap call-sheet on her phone.

**Mobile bottom nav**: Messages · Today · Bookings · Discover · Menu.
**Tap Today** → a single card: *"Beach activation · Today, 6pm · Tulum Beach Club."* Tap → call sheet drawer with:
- Talent list with phones (one-tap call).
- Venue address (one-tap maps).
- Coordinator on-call: "Reach Diego — +52 …"
- Timeline: 5pm arrival · 6pm welcome · 8pm performance · 11pm wrap.

**Why**: the day-of needs zero ambiguity. We win loyalty in the moments where stress is highest.

### 4.6 · Wrap + review

24h after the event, Maya receives an in-app + email prompt: *"How did Sofia, Carmen, and Mira do?"*

**Drawer contents**:
- 3 talent cards, each with a 5-star rating + 1 optional comment.
- A single agency rating (5 stars) + "What could the coordinator do better?"
- A **"Book again"** CTA on each talent — pre-fills a new inquiry for "same talent, when?"

She rates everyone 5 stars and saves Sofia to a shortlist *"Favorites"*. Receipt + invoice download appear in the same drawer.

**Why**: reviews build the trust graph (talent badge tier) and the rebook flow turns one event into a relationship.

---

## 5 · Information architecture rethink

Today's nav: Messages · Today · Discover · Inquiries · Bookings · Settings (6 tabs).
Proposed nav: **Messages · Discover · Bookings · Settings** (4 tabs).

**What goes where**:

| Function | Today | Proposed |
|---|---|---|
| Next-actionable projects | Today page | Messages list (sorted by "needs me" first) |
| Active inquiries (no action needed) | Inquiries page | Messages list (sorted under "needs me" tier) |
| Confirmed bookings | Bookings page | Bookings page (kept — calendar lens) |
| Past projects / archive | mixed | Messages "Past" filter |
| New inquiry CTA | Today header + sticky bottom | Messages header drawer + Discover empty state |
| Roster browse | Discover | Discover (kept) |
| Shortlists | broken (redirects) | Discover (sidebar tab) |
| Account / settings | Settings | Settings (kept) |
| Profile photo, name, etc. | Settings (read-only) | Settings (editable) + identity-bar menu |

**Why fewer tabs**:
- Today is a derived view of Messages. Folding it removes a duplicate concept.
- Inquiries is also a derived view of Messages. Same.
- 4 tabs is the magic number for mobile bottom nav.

**Mobile nav**: same 4, fixed bottom (≤720px). Identity-bar collapses to a single avatar button.

---

## 6 · Visual + interaction language

### 6.1 · Type scale (rem-based)

| Token | Use | px @16 base |
|---|---|---|
| `xs` 0.75 | metadata, timestamps | 12 |
| `sm` 0.875 | secondary body, captions | 14 |
| `base` 1.0 | primary body | 16 |
| `lg` 1.125 | emphasized body | 18 |
| `xl` 1.5 | section titles | 24 |
| `2xl` 2.0 | page titles | 32 |
| `3xl` 2.5 | hero numbers (KPI tiles) | 40 |

Today we use 11/12/13/14/24/26/28 — chaotic and dense. Move to the scale above and *let things breathe*.

### 6.2 · Color palette

Surfaces:
- **Cream** `#FAFAF7` — page background
- **White** `#FFFFFF` — card surfaces
- **Ink** `#0B0B0D` — primary text, primary CTAs
- **Ink/55** `rgba(11,11,13,0.55)` — secondary text
- **Border** `rgba(24,24,27,0.08)` — soft dividers

Accents (sparingly):
- **Indigo** `#1D4ED8` — accent / link / "needs you"
- **Forest** `#0F5132` — confirmed / booked
- **Amber** `#92400E` — offer pending / deadline approaching
- **Crimson** `#991B1B` — rejected / declined / cancelled

Rule: **never more than 2 accent colors on screen at once**. The current dashboard has 6 chip colors competing.

### 6.3 · Motion

| Action | Animation | Duration | Easing |
|---|---|---|---|
| Drawer slide-in | translateX 100% → 0 | 240ms | cubic-bezier(0.16, 1, 0.3, 1) |
| Status chip change | crossfade + scale 0.95 → 1.0 | 180ms | ease-out |
| List row enter (realtime) | fade-in + slide-up 8px | 200ms | ease-out |
| Toast | fade-in 120ms, hold 3s, fade-out 200ms | — | — |
| Pane switch (mobile) | translateX | 220ms | cubic-bezier(0.16, 1, 0.3, 1) |

No bouncing. No spring physics. Calm.

### 6.4 · Density

20px gap between major sections. 14px row padding. 12px card padding. One scroll container per pane.

### 6.5 · Iconography

Single source: **lucide-react**. Remove ALL emoji from prod UI (📅 📋 🎭 etc.) — they read as placeholder.

### 6.6 · Voice & tone

- "Action needed" — not "Your turn", not "1 need you"
- "Offer expires Friday" — not "deadline 2d"
- "Coordinator drafted an offer" — not "status: offer_pending"
- "Approve & lock" — not "Submit"
- "Send to coordinator" — not "Send inquiry"

Verb-first. Specific. Avoid jargon (`coordination`, `offer_pending`, `next_action_by`). Speak to Maya, not to the engine.

---

## 7 · The phased roadmap

12 weeks, 4 phases. Each phase has a single theme, ships behind a feature flag, and has an explicit "we are done when" gate.

### Phase A · Foundation (Weeks 1–3) · *"Messages is home."*

The IA shift. Folds Today + Inquiries into Messages. Restructures nav.

**Ships**:
- New 4-tab nav (Messages · Discover · Bookings · Settings)
- Messages list with stage groups + filter chips + saved filter URL params
- Sort toggle: Needs me / Recency / Project name
- In-page reply composer in thread pane (closes the biggest friction loop)
- Real-time subscription on `inquiry_messages` for the active inquiry
- Tab badge / favicon update on new message
- Realtime status chip updates on the list (no refresh)
- Mobile bottom nav (≤720px)
- Delete `/client/today` route (redirect to `/client/messages`)
- Delete `/client/inquiries` route (redirect to `/client/messages?filter=open`)

**Done when**:
- A client can reply to a message without leaving the dashboard.
- A client can see a status flip in real time when the coordinator acts.
- The dashboard works on a 375px phone with the same data.

### Phase B · Trust (Weeks 4–6) · *"State is visible."*

Surface state at every level. Make the agency's work legible.

**Ships**:
- Inquiry detail refactor with `ClientPageHeader` + breadcrumb + sticky action bar
- Approve / reject offer drawer (irreversible action confirmation)
- Read receipts on messages (`inquiry_message_reads` already exists)
- Timeline view on the project: "Submitted · Coordinator assigned · 3 talent invited · Sofia accepted · Offer sent · ..."
- Recent activity feed in the project header (last 5 events)
- Offer-expiry countdown when offer is pending
- "Action needed" pill — unified everywhere
- Status copy rewrite (no more "coordination" — "Coordinator working on it")
- Talent acceptance counts inline ("2 of 3 confirmed")

**Done when**:
- A client can answer "What's the status of project X?" from the list view alone.
- A client never has to ask "Did you see my message?"
- All status copy passes the "Maya understands it" test (no jargon).

### Phase C · Talent-first (Weeks 7–9) · *"Browse, save, inquire."*

The Discover + shortlist + reusable-brief flow.

**Ships**:
- Discover fix (bug from audit Section 1 #2)
- Discover filter chips (Category · City · Languages · Date available · Price range)
- Discover card click = inquire-with-this-talent drawer (not profile-page navigation)
- Shortlists feature (`saved_talent` table already exists; route is stubbed)
- Multi-select on Discover → "Inquire with N selected"
- Shortlist sidebar on Discover (My shortlists · saved-this-session)
- Inline talent-availability indicator (conflicts with open inquiries)
- "Inquire about X" CTA on every talent's public profile page
- AI-assisted brief writing in the inquiry drawer
- Save-as-draft on inquiry drawer (drafts in `inquiry_drafts` table)
- Form-field defaults from previous inquiries

**Done when**:
- A client can save 3 talents to a shortlist and submit one combined inquiry in under 90 seconds.
- A client never types the same brief twice.
- 40% of inquiries originate from Discover (today: unknown, likely <10%).

### Phase D · Day-of + memory (Weeks 10–12) · *"Concierge for the event."*

Booking detail, call-sheet, calendar, review loop. Repeat-booking infrastructure.

**Ships**:
- Bookings calendar view (toggle: List / Calendar)
- iCal export per booking + Google Calendar oAuth
- Booking detail page (dedicated, not `inquiries/[id]`) with call sheet
- "Add to calendar" CTA
- One-tap call talent / venue / coordinator (mobile)
- Post-event review drawer (24h cron + email + in-app prompt)
- 5-star rating per talent → feeds talent trust badge
- "Book again" CTA on review → pre-fills a fresh inquiry
- Invoice + receipt download per booking (Stripe integration when live)
- Inline-edit Settings (name, company, phone, password, email)
- Notification preferences matrix (3 channels × 3 events)
- Multi-tenant switcher in identity bar
- Keyboard shortcuts: `N` (new inquiry), `/` (search), `g+m` `g+d` `g+b` `g+s` (navigate)

**Done when**:
- A client has the call sheet on their phone with one tap on event day.
- A client who books once is prompted to book again with friction ≤30 seconds.
- 40% of clients submit a 2nd inquiry within 90 days.

---

## 8 · What we explicitly are NOT building (in this scope)

Saying no is design too. Drop these from scope:

- **A chat-only mobile app** — the web PWA covers it. Native apps come after we hit 1k MAU.
- **Custom branding per client** — the agency brands the workspace, not the client.
- **Multi-language brief composer** — translate the UI (EN/ES already in flight); briefs stay in the language the client types.
- **Public talent reviews from clients** — reviews go to trust badges, not to public talent pages. Different surface.
- **A bidding marketplace** — clients pick agencies, not the other way around. We are not Fiverr.
- **In-app video calls with talent** — direct talent contact comes after the booking is locked, via the call sheet. Pre-booking, the coordinator is the only contact.

---

## 9 · Metrics & success criteria

Per phase + at North Star.

### 9.1 · Phase-level

| Phase | Metric | Baseline | Target |
|---|---|---|---|
| A · Foundation | Replies per session | Unknown — likely 0 because they have to leave | ≥1 in 60% of sessions |
| A · Foundation | Page LCP @ p75 | 17 min was max recorded! Mean unknown | ≤2.5s |
| B · Trust | "What's the status?" support tickets | Unknown | -50% |
| B · Trust | Time-to-approve-offer (offer sent → client decision) | Unknown | Median ≤24h |
| C · Talent-first | Inquiries originating from Discover | Unknown | ≥40% |
| C · Talent-first | Inquiries with shortlisted talent | 0% (feature missing) | ≥30% |
| D · Day-of | Reviews submitted post-event | 0% (feature missing) | ≥60% |
| D · Day-of | Repeat booking within 90d | Unknown | ≥40% |

### 9.2 · North Star

| Metric | Definition | Target |
|---|---|---|
| TTFMA | Dashboard load → first meaningful action (click, drawer open, scroll past header) | ≤3s p75 |
| Self-service rate | Inquiries → bookings without out-of-app comms | ≥80% |
| Confidence index | "How clearly do you know what's happening?" 1–10 monthly survey | ≥8.0 mean |
| Repeat-booking rate | Clients who submit 2+ inquiries in 90d / total active clients | ≥40% |

### 9.3 · Anti-metrics (do not optimize for)

- Time in app per day
- Total session length
- Page views per session

We are not Instagram. The client should be in and out fast and confident.

---

## 10 · Open decisions

Owner needs to call these.

| # | Question | Lean |
|---|---|---|
| 1 | Drop the Today route, or keep it as a redirect alias? | Redirect (preserve old bookmarks). |
| 2 | Mobile = PWA or native? | PWA for Phase A–D. Re-evaluate at 1k MAU per the 2026 execution plan. |
| 3 | Real-time on free tier? | Yes — but cap to 1 active subscription per tab. Cost is negligible at our scale. |
| 4 | AI brief assist via Anthropic or OpenAI? | Anthropic — already in stack, lower egress cost on enriched payloads. |
| 5 | Shortlists private to user, or shared workspace-wide? | Private by default, shareable via team-invites in Phase D. |
| 6 | Notification email provider — Resend or Postmark? | Resend (already coded), gated by `RESEND_API_KEY`. |
| 7 | Drop the `+5$ verification` step in onboarding for new clients? | Defer — let it ship in Phase B trust pass, A/B test conversion impact. |
| 8 | Brief autosave on every keystroke or every 5s? | 5s + on blur + on visibility change. |

---

## 11 · Risk + mitigation

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Fold-Today-into-Messages confuses long-tenured clients | Medium | Medium | Keep Today as a redirect. In-app banner "We moved Today into Messages — sort by 'Needs me' to see the same view." |
| Realtime channel storm at scale | Low (today) | High (later) | One channel per active inquiry, not per user. Unsubscribe on tab blur. |
| AI brief writes nonsense for niche events | Medium | Low | Template-grounded, not free-form. Show "draft assist" not "auto-fill". |
| Approve & lock fires before client reads the offer | Low | High | 4-second undo toast on every irreversible action ("Undo — Approved offer · 4s"). |
| Mobile bottom nav covers content on iOS keyboard open | Medium | Medium | `env(safe-area-inset-bottom)` + hide nav when virtual keyboard active. |
| Shortlist count explodes a "favorites" power user | Low | Low | Cap at 200 items per shortlist; surface "Trim shortlist" tooltip at 150. |

---

## 12 · Engineering enablers (parallel to product work)

These don't ship features but unblock them:

- **`loadProjectsForClient(userId, tenantId)`** — single SECURITY DEFINER RPC that returns inquiries + bookings + last message + unread + next action in one query. Replaces N+1 today.
- **`inquiry_drafts` table** — drafts persist across sessions, devices, abandons.
- **Realtime channel scaffold** — server-side helper that subscribes the page to (inquiry_id, thread_type) and forwards to the page's state slice.
- **Optimistic mutation pattern** — `useOptimistic` wrapper for engine actions (approve / reject / send message) so the UI reacts before the server confirms.
- **PWA shell** — service worker + offline routing for `/client/messages` cached views, manifest for "Add to Home Screen", push notifications.
- **Type-safe i18n** — replace ad-hoc string literals with a typed catalog so EN/ES coverage is enforceable.

---

## 13 · What changes for the agency side

The client doesn't live in a vacuum. These changes unlock client value but require coordinated admin-side work:

- **Coordinator response SLA visibility** — agency dashboard surfaces "client expecting reply within 4h" — drives the *client's* concierge feel.
- **Coordinator typing indicator** — when coordinator is composing, client thread shows it.
- **Coordinator activity → client visibility** — when coord invites a talent, client sees "Coordinator invited Sofia" in the activity feed.
- **Admin Offer tab wiring** — currently mocked. Cannot ship Phase B until live.

---

## 14 · Closing

The current dashboard is a *site*. The vision is a *product*. The difference is that a product has an opinion about what the user is trying to do, and bends every pixel toward making that one job effortless.

Maya doesn't want a dashboard. Maya wants her event to go well. We are not in the dashboard business. We are in the **"your event will go well"** business. Build accordingly.

---

## Appendix · Reading list / inspirations

- **Linear** — keyboard, density, "command + k", calm motion. The bar for SaaS UX.
- **Superhuman** — inbox-as-product. Triage, snooze, undo, "instant" perception.
- **Notion's "doodle me" empty states** — copy that makes a feature gap feel friendly.
- **Resy / OpenTable** — booker mental model, calendar density, "favorite restaurants" pattern (= shortlists).
- **Airbnb host dashboard** — concierge tone for a paying-on-both-sides marketplace. Particularly the "what's next" prompt model.
- **Stripe Dashboard** — clean data density at scale; how to make money flows feel calm.

---

**End of vision document.** Pair with `client-dashboard-audit-2026-05-14.md` for the tactical task list. Triage owner picks the Phase A scope and we ship.
