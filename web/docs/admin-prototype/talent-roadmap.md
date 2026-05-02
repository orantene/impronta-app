# Talent surface — design + implementation roadmap

> **Status as of 2026-04-26 · phase-1 branch**
>
> Full inventory of every audit item, design ask, and strategic bet across the
> Talent surface, organized into phases. Sequenced by leverage and dependency.
> Sized so the team can pick what's affordable per sprint.
>
> **Sizing legend:** 🟢 quick win (≤ ½ day) · 🟡 medium (1-2 days) · 🔴 big (3+ days) · ⭐ strategic (changes product capability)
>
> **Status legend:** ✅ shipped · 🚧 in-flight · ⏳ queued · 📋 needs decision

---

## ✅ What's shipped (running ledger)

Twenty-five+ commits on `phase-1` across the full Phase A→G design pass.
Updated 2026-04-26 after the "execute everything without stopping" sprint.

### Phase A — Close-the-loops (9/12 shipped)

| # | Item | Commit |
|---|---|---|
| A1 | Team-mates field on Log work | `38f899b` |
| A2 | Payment method picker on Log work | `38f899b` |
| A3 | Hub-detail mini-drawer for Reach `+ Add` | `1d6e359` |
| A4 | Settings → Reach demote + cross-link banner | `4bc406f` |
| A5 | Existing blocks shown in Availability drawer | `067279c` |
| A6 | Time-of-day on Calendar grid pills | `40e4849` |
| A7 | Pending + inquiry events on month grid (ghosted) | `da33bda` |
| A9 | Notification settings deep-link from Settings | `067279c` |
| A12 | Microcopy passes (academic sublines rewritten) | `067279c` |

**Deferred (3)**: A8 pause-mode, A10 trust-score impact preview, A11 undo-on-toasts. All flagged for engineering follow-up.

### Phase B — Big surface redesigns (2.5/4 shipped)

| # | Item | Commit |
|---|---|---|
| B1 | **Talent Inbox redesign** — unified rows + filter chips | `0a316f1` |
| B3 | Activity audit + redesign — source filter chips, EarningRow | `4475743` |
| B4 | Settings audit (partial: A4 Privacy demote, D6 Help card) | `4bc406f`, `6935a90` |

**Deferred**: B2 Edit profile audit. Sprawling 12-drawer page; needs its own focused session.

### Phase C — Onboarding + emotional polish (3/7 shipped)

| # | Item | Commit |
|---|---|---|
| C1 | Day-1 / new-talent hero variant | `1ba633d` |
| C6 | Travel preferences richer in Availability | `b965bc1` |
| C7 | currentLocation quick-pick chips | `b965bc1` |

**Deferred (4)**: C2 empty states with personality, C3 celebration moments, C4 onboarding first-session flow, C5 0-pending hero verified-in-preview.

### Phase D — Missing features (3/8 shipped as scaffolds)

| # | Item | Commit |
|---|---|---|
| D4 | Booking contract section in closed-booking drawer | `6935a90` |
| D6 | Help & support entry on Settings | `6935a90` |
| D8 | Agency exclusivity model + manage on Reach | `0498c4f` |

**Deferred (5)**: D1 trust verification flow, D2 Stripe Connect payouts, D3 tax docs, D5 reviews aggregation surface, D7 friend referrals tracking. All are real product builds — design specs in handoff doc §8.

### Phase E + F + G — Documentation

- E1-E7 strategic bets: full design specs in [`talent-backend-handoff.md`](./talent-backend-handoff.md) §8
- F1-F9 cross-cutting infra: requirements documented in handoff doc §3, §5, §6, §7
- G: backend handoff doc shipped (`f0f093a`) — schema for 5 new tables, per-surface query+mutation map, 4-sprint migration plan

### Plus binding product specs saved to memory

- `project_agency_exclusivity_model.md` — auto-exclusivity, plan-tier × commission rules
- `project_workspace_talent_hybrid.md` — talent-as-workspace-owner UX (Phase X future)

---

## ✅ Original (kept for reference) — what shipped pre-sprint

The first design pass laid the foundation:

| Commit | Surface | What |
|---|---|---|
| `3d0701b` | Today | Polish — split Reply button, trend captions, profile-completeness banner, restored Confirmed caption |
| `0c45e34` | Notifications | Recent / Archive tabs, Mark all read, oldest-age hint per category |
| `0df1bd3` | Calendar | Conflict resolution actions per pair (decline / talk / reschedule) + severity escalation (red banner ≥3 conflicts) |
| `faeee35` | Closed booking | Prev/next nav between past bookings, repeat-client lifetime stat, reviews section |
| `ff29834` | Reach | Earnings-per-channel + 7d delta + Maximum-confirm dialog + per-channel descriptions + fee rate display |
| `36dddb6` | Manual booking | New `talent-add-event` drawer — Log work / Block time modes; off-platform earnings + reason taxonomy |
| `37ed7a8` | Today + Calendar | Shared `DateBlock` + `KindChip` primitives extracted; Calendar event row uses them |
| `0988e01` | Today | Client avatars on Needs-reply + Recent earnings (revert from over-eager DateBlock); BookingRow date parser fixed |
| `b6e0639` | Today | Unified row anatomy — every list row across Today now follows the same skeleton (left anchor → client·brief → chip+microcopy → meta → chevron) |
| (in-flight) | Today | Hero context-aware copy on availability + location + pending |
| (in-flight) | Reach | New top-level Talent surface: 5 distribution lanes + Exposure preset slider + browse-to-add |

Plus all the foundational design system work: 9-role semantic color
language, frequency budgets, royal/sage tokens added, COLORS schema
documented inline.

---

## 🚧 Phase A — Close the loops (this week, ~10 commits)

The "small things I promised" backlog. Each has a low-risk, high-yield
profile. Should be one tight session of work.

| # | Item | Size | Notes |
|---|---|---|---|
| A1 | Team-mates field on Log work | 🟢 | Search-and-add other talent on the booking. Supports Marta-brought-Carla pattern + future referrals. Was promised twice. |
| A2 | Payment method on Log work | 🟢 | Pill picker: Transfer / Cash / Other. Was promised. |
| A3 | Hub-detail mini-drawer on Reach | 🟡 | Click `+ Add` on external/studio cards → opens drawer with terms, fees, expected response time, before commit. |
| A4 | Settings → Reach demote | 🟢 | Privacy distribution toggles become read-only with "Manage in Reach →" pointer. Promised when Reach shipped. |
| A5 | Existing blocks shown in Availability drawer | 🟢 | Below "Add to your calendar" actions — list current blocks with edit/delete affordances. |
| A6 | Time-of-day on Calendar grid pills | 🟢 | "Mango lookbook · 08:30 →" instead of just "Mango lookbook". Call-time visible from the grid. |
| A7 | Pending + inquiry events on Calendar grid | 🟡 | Currently only confirmed + blocks render. Pending should show ghosted; inquiry should show indigo-tinted. |
| A8 | Pause-mode for Reach channels | 🟢 | Between on/off — "stay listed but not accepting new inquiries". |
| A9 | Notification settings deep-link from Settings | 🟢 | One row in Settings → Notifications opens the Notifications drawer with the settings pane expanded. |
| A10 | Trust-score impact shown when toggling Reach channels | 🟡 | "Joining BookEm.app may lower your verified visibility — preview impact." |
| A11 | Undo on save toasts | 🟢 | One-line addition. Standard expectation. |
| A12 | Microcopy passes (the academic-feeling sublines) | 🟢 | "How many other talent are also being considered, and where each conversation has reached" → "Who else you're up against." |

---

## ⏳ Phase B — Big surface redesigns (1-2 weeks)

The remaining surfaces that haven't been audited. These are real lifts
because each surface has its own data model + UX.

| # | Item | Size | Notes |
|---|---|---|---|
| B1 | **Talent Inbox redesign** | 🔴 | The single highest-leverage missing piece. Today says "Mango is waiting" → Inbox is where Marta replies. If Inbox isn't equally crisp, every win on Today gets squandered. Apply same row anatomy + filter chips (All / Unread / Action / Archived) + per-row reply affordance. |
| B2 | **Edit profile audit + redesign** | 🔴 | 84% completion drives a hero stat — where does the user actually finish it? Likely sprawling page. Apply compactness pass + missing-fields prominence. |
| B3 | **Activity audit + redesign** | 🟡 | Earnings + history. Briefly seen, never audited. Should get Reach-level treatment for trends + filters. |
| B4 | Settings audit | 🟡 | Bloated; needs the same compactness pass we did for Today/Reach. Promised demote of Privacy → Reach (item A4) is part of this. |

---

## ⏳ Phase C — Onboarding + emotional polish (3-5 days)

The first-week experience. Currently Today reads identically for a
new talent (no bookings, no earnings) vs a working pro. That's wrong.

| # | Item | Size | Notes |
|---|---|---|---|
| C1 | Day-1 / new-talent hero variant | 🟡 | When `confirmedBookings === 0 && earnings90d === 0`, hero says "Welcome, Marta. Your storefront is live. Here's what to expect." with different stat strip + nudges. |
| C2 | Empty states with personality | 🟡 | "No confirmed bookings yet" → "Quiet day. Polish your portfolio while it's quiet" with link. Each empty state gets a forward-leaning suggestion, not a sad message. |
| C3 | Celebration moments | 🟡 | First booking confirmed, first €1k month, 100th profile view — ephemeral toast/banner with subtle motion. Earned reward, not gamification noise. |
| C4 | Onboarding first-session flow | 🟡 | What does Marta see in her first 5 minutes? Currently the "4 steps to get booked" lives in notif drawer (good), but the actual first-touch moment isn't designed. |
| C5 | 0-pending state verified on Today | 🟢 | Take a screenshot in 0-pending state. Verify the available/not-available headline variants read well in real layout (not just type tested). |
| C6 | Travel preferences richer in Availability | 🟡 | "Willing to fly to" city chips · "Costs must be covered" sub-toggle · "Min booking value when traveling". Production-feel, not placeholder. |
| C7 | currentLocation autocomplete | 🟡 | Replace freeform text with Google Places or pre-loaded fashion-cities list. |

---

## ⏳ Phase D — Missing features (3-6 weeks, depends on launch order)

Real product blockers. None of these have any UI today. Each needs
both design and engineering.

| # | Feature | Size | Notes |
|---|---|---|---|
| D1 | Trust / verification flow | 🔴 | ID upload → review → Verified badge on Talent. Schema + admin review queue exists in the trust-ladder spec but no flow. |
| D2 | Payouts setup (Stripe Connect) | 🔴 | Bank info, Stripe Connect onboarding, payout schedule. Real product blocker — talents can't get paid without this. |
| D3 | Tax docs / 1099s | 🟡 | Year-end exports. Required for US talents. Stripe Connect provides most of this if D2 is done. |
| D4 | Booking contracts | 🟡 | Talents need access to signed agreements. Closed booking shows chat, not contract — add a "Contract" section + signed PDF download. |
| D5 | Reviews surface | 🟡 | We added a reviews section in closed-booking drawer. Need a dedicated /reviews page on Talent that aggregates all reviews + filters. |
| D6 | Help / support entry | 🟡 | No support surface exists. At minimum: FAQ + contact form drawer. |
| D7 | Friend referrals tracking | 🟡⭐ | Marta brought Carla on Loewe. Was Carla a Tulala talent? If not — referral attribution + signup incentive. If yes — track collaboration history for future "want to invite Carla?" suggestions. |

---

## ⏳ Phase E — Strategic bets (each is a project)

Things that meaningfully change product capability. These are not
backlog cleanup; they're growth levers.

| # | Bet | Size | Why |
|---|---|---|---|
| E1 | **AI reply assistant on Inbox** | ⭐🔴 | Single highest-leverage feature for talent. Replying fast = bookings won. "Suggested reply for Mango: 'Confirmed for May 6, bringing standard kit.'" One-tap send. Worth a 1-2 day spike to validate UX before full build. |
| E2 | Smart conflict resolution | ⭐🟡 | When Marta has a calendar conflict, suggest "Ask Bvlgari for a hold extension to May 16 · 1-tap message ready." Proactive intelligence, not just informational alerts. |
| E3 | Earnings forecasting | ⭐🟡 | "At your current pace, ~€8,400 in May." Predictive based on confirmed + likely. Helps with rent, taxes, life decisions. |
| E4 | Talent-to-talent network | ⭐🔴 | Marta-brought-Carla creates a real collab graph. Surface "Carla is also available May 18-20" when a hold needs a second talent. Network effect. |
| E5 | Voice replies | ⭐🔴 | Mobile-first inbox where talent records 10s voice → transcribed → sent. Beats typing while on set. |
| E6 | Pro tier value visualization | ⭐🟡 | Make Reach loud about what's locked: "Pro would unlock custom domain · €1,200 of inquiries you can't currently route directly." Self-serve upgrade lever. |
| E7 | Compare hubs view | 🟡 | Side-by-side: views · inquiries · bookings · avg fee per platform. Helps talent choose where to invest attention. |

---

## ♻ Phase F — Cross-cutting infrastructure (continuous, alongside everything)

Foundational quality work. Doesn't block any single phase but should
run continuously. Two engineers can do this in parallel with phases B-D.

| # | Item | Size | Notes |
|---|---|---|---|
| F1 | Mobile responsive audit | 🔴 | Every surface at 375px width. None of this is mobile-tested. Fix the breaks per surface. |
| F2 | Real photos integration | 🟡 | Avatars + brand logos. Closed booking team should look like real people. Image upload + storage + presigned URLs. |
| F3 | Loading / skeleton states | 🟡 | Every async surface needs a shimmer skeleton. Prevent the "broken" feeling on slow networks. |
| F4 | Keyboard navigation audit | 🟡 | Focus rings consistent (always brand), tab order tested, Escape closes drawers, arrow keys navigate event rows. |
| F5 | Real-time push updates | 🔴 | Notifications, conflict alerts, earnings counters. Supabase realtime channels per user. |
| F6 | Telemetry for color frequency budgets | 🔴 | The audit set color budgets (coral 0–2/screen, red 0–1/week). Without telemetry these are aspirational. Track per-session render counts per hue. |
| F7 | Calendar week / day view | 🔴 | Currently month-only. Models often want a week scan. Major UI work. |
| F8 | Chat archive download (closed booking) | 🟡 | Export-to-PDF for legal/accounting purposes. |
| F9 | Real date pickers everywhere | 🟡 | Replace placeholder TextInputs in Availability + Add Event with a real date-range picker. Needs library decision (react-day-picker, date-fns + custom, etc.). |

---

## 🚀 Phase G — Production handoff (when design is signed off)

The migration story. **None of this is design work — it's engineering
execution.** Treat it as a separate workstream that begins when each
surface is signed off, not when ALL surfaces are done.

### Migration approach (recommended)

**Don't "swipe" the prototype. Port surface by surface, behind a feature
flag, A/B against the existing dashboard. Kill the old surface when
parity + signal is confirmed.**

This is how Linear, Vercel, and Notion all do major UI rebuilds. The
prototype stays alive at `/prototypes/admin-shell` as the design
playground for the next features.

### G1 — Extract shared primitives (½ day)

Move these out of `_primitives.tsx` and `_talent.tsx` into
`web/src/components/talent/` (or `web/src/lib/design-system/`):

- `Avatar`, `KindChip`, `DateBlock`, `ClientTrustChip`, `Toggle`,
  `TextInput`, `TextArea`, `DrawerShell`, `SectionHeader`,
  `EmptyState`, `Icon`, `Bullet`, `IconChip`, `Affordance`
- The `COLORS`, `FONTS`, `RADIUS`, `SPACE`, `Z` design tokens

Production app imports from there. Prototype keeps working off the
same shared lib.

### G2 — Schema additions (1 day per table)

New tables that don't exist yet. Names suggested; let backend pick
final naming.

| Table | Why | Owned by |
|---|---|---|
| `talent_distribution_channels` | Per-talent channel state for Reach (which hubs they're on, when joined, performance counters) | Reach surface |
| `talent_manual_earnings` | Off-platform booking entries from the manual-add flow. Linked optionally to a `manual_calendar_event`. | Manual booking |
| `talent_calendar_blocks` | Reason taxonomy + range for time blocks (extends existing `availability_blocks`?) | Availability + manual booking |
| `talent_channel_events` | Append-only log of channel toggle events (for telemetry / undo) | Reach |
| `talent_celebration_events` | First-booking, first-€1k-month, etc. milestones to fire celebration toasts | Phase C3 |

### G3 — Per-surface query + mutation wiring (½ day per surface read, 1 day per drawer mutation)

Surface-by-surface in business-value order:

| Order | Surface | Effort | Reads (main queries) | Writes (main mutations) |
|---|---|---|---|---|
| 1 | Today | 1 day | profile, bookings (confirmed), requests (needs-answer), inquiries (mine), earnings (recent) | (read-only, all click targets open drawers) |
| 2 | Inbox | 1.5 days | inquiries (mine + filters), threads (per inquiry) | reply, accept, decline, mark-read |
| 3 | Reach | 1.5 days | distribution_channels, hub_directory (available channels) | toggle channel, apply preset, join channel |
| 4 | Calendar | 1 day | bookings (all states), requests, inquiries, blocks — with date overlap for conflicts | block dates, decline conflict, request reschedule |
| 5 | Activity | 1 day | earnings (with filters), bookings (history) | (read-only) |
| 6 | Edit profile | 1.5 days | profile + all sections | save profile sections (12+ drawers) |
| 7 | Settings | 1 day | preferences, notification settings, payout config | update each |

**Total realistic engineering**: ~3 weeks for one engineer, 1.5 weeks
with two in parallel on different surfaces.

### G4 — Real-time + push (parallel with G3)

| Hook | Drives | Channel |
|---|---|---|
| Supabase realtime on `inquiries` | Today's pending count, Inbox unread badge | `talent:{id}:inquiries` |
| Supabase realtime on `payouts` | Recent earnings, hero stat strip | `talent:{id}:payouts` |
| Server-computed conflict detection | Calendar conflict banner | Compute on inquiry/booking write; emit to talent |
| Notification fan-out (email + push) | Notification drawer + actual email/push delivery | Existing notification system; add talent-side templates |

### G5 — Mobile responsive (parallel with everything)

Per F1. Should run alongside G3 surface ports — mobile audit per
surface as it ports.

### G6 — Image uploads (1-2 days)

Per F2. Talent profile photo, brand logos for closed-booking team.
Uses existing Supabase storage; new bucket `talent-photos/{id}/...`.

---

## 📋 Decision points needing user input

These block work. Listed here so they don't get lost in the audit noise.

| Q | Context | Owner |
|---|---|---|
| Do off-platform earnings count toward 1099 / tax exports? | Manual booking introduces a parallel earnings stream. Production needs a clear answer for taxes. | Product + accounting |
| Pause-mode semantics on Reach (Phase A8) | Distinct from "off"? Half-listed? Visible but not pitched? Needs product call before design. | Product |
| Trust-score impact preview (Phase A10) | Do we actually want to expose how Tulala scores client trust? Internal scoring may be sensitive. | Product + trust team |
| Friend referrals attribution (Phase D7) | Reward model — credits, payout share, badge? Big monetization decision. | Product + finance |
| AI reply data privacy (Phase E1) | Sending inquiry threads to an LLM has privacy implications for clients. Opt-in default? Per-message? | Product + legal |
| Calendar week / day view priority (Phase F7) | Big lift. Worth doing before launch, or wait for user demand? | Product |

---

## 📊 Recommended sprint plan

If we have 2 engineers + 1 designer (me) for the next 4 weeks:

### Sprint 1 (this week)
- **Designer**: Phase A1–A12 (close the loops)
- **Eng 1**: G1 (extract shared primitives) + G2 (schema for new tables)
- **Eng 2**: F1 mobile audit pass on Today + Calendar (the two most-used surfaces)

### Sprint 2 (next week)
- **Designer**: Phase B1 (Inbox redesign — biggest single piece)
- **Eng 1**: G3.1 (Today wiring, behind feature flag)
- **Eng 2**: G3.4 (Calendar wiring)

### Sprint 3
- **Designer**: Phase B2 + B3 (Edit profile + Activity redesigns)
- **Eng 1**: G3.2 (Inbox wiring — depends on Sprint 2 design landing)
- **Eng 2**: G3.3 (Reach wiring) + G4 (real-time hooks)

### Sprint 4
- **Designer**: Phase C (onboarding + emotional polish)
- **Eng 1**: G3.6 (Edit profile wiring)
- **Eng 2**: G3.7 (Settings) + Phase A4 demote landing in real Settings page

### After Sprint 4 — kill the old talent dashboard

By end of Sprint 4, all 7 production surfaces are wired and shipped behind
flags. A/B for 1-2 weeks to validate signal. Promote to default. Archive
the old `/talent/*` routes.

### Sprint 5+ — Phases D and E in priority order

Pick from D and E based on launch needs vs growth experiments.

---

## How to use this doc

- **Designers**: pick from A, B, C in order. Each item is committable
  on its own; small enough to ship same-day.
- **Backend / engineering**: G is your section. Don't wait for design
  on G1, G2 — those unblock everything else.
- **Product**: the 📋 decision-points section is yours. Each decision
  blocks something specific.
- **Anyone reading later**: ✅ section at top is the floor. Everything
  below is queued, sized, and sequenced. No mystery items.

This doc replaces the audit log + the "what's missing" inventory I've
been running in chat. Update it inline as items ship — move them to
the ✅ section with a commit hash so it stays canonical.

---

*Last updated 2026-04-26. Branch: `phase-1`. Maintained by the design pass.*
