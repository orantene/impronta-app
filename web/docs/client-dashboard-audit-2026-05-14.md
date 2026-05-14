# Client dashboard — deep audit + improvement list

**Audited**: 2026-05-14, by walking each surface live as `qa-client-1@impronta.test` on `impronta.tulala.digital` (with 4 in-flight inquiries + 0 bookings + ~5 published roster).
**Surfaces covered**: Today · Messages · Discover · Inquiries (list / detail / new) · Bookings · Pitches · Settings · Layout chrome (identity bar + nav).

Severity legend: **P0** = broken / blocks core task, **P1** = visible polish hole, **P2** = product-improvement opportunity (not broken, but big lever), **P3** = nice-to-have.

---

## SECTION 1 — Bugs caught during the walk

| # | Severity | Surface | Bug | Evidence |
|---|---|---|---|---|
| 1 | P0 | Today (regression in 0c91f66b2) | Page hung for **17 minutes** on first render. Loading `loadWorkspaceRosterEnriched` (heavy 5-level join + media + signed URLs + lang counts) on every client page just to power the drawer's talent picker. | Server log: `GET /impronta/client/today 200 in 16.7min`. **Fixed in 77a342e45** with new `loadWorkspaceRosterLite()`. |
| 2 | P0 | Discover | Empty state ("Roster coming soon") even though `agency_talent_roster` has 5+ `status='active'` rows with talents in `workflow_status='approved'`. Filter `r.state === "published" \|\| "claimed"` is rejecting them all. | Live DB: 5 rows visible · `loadWorkspaceRosterEnriched` returns 0 visible after `deriveProfileState()`. Likely the derive function maps `approved + roster_only` (not `site_visible`) to a state Discover doesn't accept. |
| 3 | P0 | `/client/pitches` | 404 — page doesn't render. Another agent's WIP not in the repo. No nav link to it now, but the route URL is reachable. | Visited `/impronta/client/pitches` → "Page not found". |
| 4 | P1 | Today + Inquiries | Every inquiry row's primary text is the same — `"QA Client Co"` (company). Useless hierarchy when one client has 4 inquiries with the same company. | Today bucket shows 4 rows, all start with "QA Client Co". |
| 5 | P1 | Inquiry detail (`/client/inquiries/[id]`) | Doesn't use the new `ClientPageHeader` chrome. No breadcrumb back to the list. Different visual system. | Snapshot: no eyebrow, no h1, jumps straight to "QA Client Co" + "Impronta Models · Sep 29 · Tulum". |
| 6 | P1 | Settings | Profile + Email + Sign-in method are READ-ONLY. Client must "contact Impronta Models" to update. Notifications says "configurable in a future update" — stub. | Snapshot: "Contact Impronta Models to update your profile details." |
| 7 | P1 | Today | Sticky bottom CTA bar ("My inquiries" + "+ New inquiry") **duplicates** the header CTA. Visual noise on desktop, useful only on mobile. | Snapshot bottom: two extra links rendered below the buckets. |
| 8 | P1 | Layout (identity bar) | Sign-out is a single `↩` arrow icon. Not obvious. Notifications bell + Help `?` are stubs that don't route anywhere. | Snapshot: `[36] button: "Sign out" → "↩"`. |
| 9 | P1 | Inquiries list | Row meta uses an emoji `📅` for date. Inconsistent with Today + Messages (no emoji there). Also weird old test data "QA Flow Co 1778612353214" leaking through. | Inquiry row: "📅 14 Aug 2026 · 3 talent". |
| 10 | P2 | Messages | When user picks a different inquiry in the list, the message pane shows "Loading messages…" then the messages. No optimistic state — list row click feels laggy. | Tested by clicking different rows during the walk. |
| 11 | P2 | Messages | No reply composer in the right pane. Text in footer says *"Open the inquiry to reply with the full composer."* Forces context switch every time. The inquiry-detail page has a working composer; the Messages thread should too. | Snapshot: thread pane footer = link, not textarea. |
| 12 | P2 | Drawer (every page) | "+ New Inquiry" drawer immediately shows the full long-form. Most common path: client picks a talent first. The drawer should open on a 2-step composer (1: who? · 2: details) or surface a roster-card grid above the form. | NewInquiryForm form fields render unchanged. |
| 13 | P2 | All pages | Header CTA + empty-state CTA + sticky-bottom CTA are three independent drawer instances per page. State is lost on close. Form is destructive on close. No "save as draft" affordance. | Drawer state: opens fresh every time. |
| 14 | P3 | Identity bar | EN / ES language toggle is stubbed — clicking ES does nothing (`/es/` routing landed but the toggle isn't wired). | Existing UI element; clicking has no observable effect. |
| 15 | P3 | All pages | No keyboard shortcuts. `N` for new inquiry, `/` for search, `g+m` for go-to-messages are standard expectations. | No `keydown` listeners on the document. |

---

## SECTION 2 — Per-surface design + function findings

### 2.1 Today

| ID | Type | Finding | Recommendation |
|---|---|---|---|
| T-1 | design | 4 stat tiles (Active / Needs your reply / Confirmed / Total) hog the top of the page above the actionable buckets. On a 4-inquiry account they read as decoration. | Demote to a single inline header line: "4 active · 1 needs you · 0 confirmed". Reclaim ~120px of vertical space. |
| T-2 | function | "Confirmed (0 confirmed bookings)" tile renders even when 0. Should hide. | Conditional render or merge into the inline summary. |
| T-3 | design | "Coming up" bucket title is unused (0 confirmed). Renders as a ghost section. | Drop the bucket entirely when empty. |
| T-4 | function | "Needs your decision" rows link directly to inquiry detail. Good. But the inquiry detail page chrome is inconsistent with the rest of the dashboard. | Refactor inquiry detail to use `ClientPageHeader`. (See 5.1.) |
| T-5 | function | Today is meant to be a pulse. Nothing about *what's next* — no upcoming bookings, no "you should expect a coordinator reply by [time]", no "this offer expires in 2 days". | Add an "Up next" timeline: confirmed bookings in the next 7 days + offer-expiry deadlines + SLA expectations. |
| T-6 | product | No "recent activity" feed. Client doesn't know what happened in the last 24 h without opening each inquiry. | Add a 5-row activity feed: "Sofía accepted the invitation · 2h ago", "Coordinator drafted an offer · yesterday". (`inquiry_events` table already exists.) |

### 2.2 Messages

| ID | Type | Finding | Recommendation |
|---|---|---|---|
| M-1 | function | List-row click triggers a fetch + 200-500ms loading state. | Pre-fetch on hover. Or move messages into the page's initial server payload as a record keyed by inquiry id (5 inquiries × 20 messages = trivial). |
| M-2 | function | Cannot reply from this page. Must click "Open thread →" and lose context. | Embed a composer textarea in the thread pane footer. POSTs via the existing `sendMessage` engine path. |
| M-3 | design | Search box has no debounce, no clear-button, no result count update. | Add `useDeferredValue`, an `×` clear, and a "no results" empty state inside the list pane. |
| M-4 | design | Filter pills lose state on every page visit (no URL param). User reloads → filter resets to "All". | Persist filter in `?filter=` query param. |
| M-5 | product | No "unread first" sort option. Currently sorted by most-recent. A client with many active projects can't find the one with new activity. | Add a sort toggle: Recency / Unread / Action needed. |
| M-6 | product | No message attachments display. Coordinator sends a PDF → it doesn't render. | The `inquiry_messages.card_payload` and Files tab exist on the detail page. Surface the attachment as a "Files (3)" pill in the thread header. |
| M-7 | product | No realtime. New message from coordinator → user has to refresh to see it. | Subscribe to `inquiry_messages` Supabase realtime channel for the active inquiry; append new messages live. |
| M-8 | product | No read receipts. User can't tell if coordinator has seen their last message. | `inquiry_message_reads` table already exists. Render "✓✓ Read 2m ago" under the last own-message. |
| M-9 | accessibility | Thread bubbles don't use ARIA roles. Screen readers read them as undifferentiated text. | `role="article"` + `aria-label="<sender> said: <preview>"`. |

### 2.3 Discover

| ID | Type | Finding | Recommendation |
|---|---|---|---|
| D-1 | bug (P0) | Empty for impronta despite 5 roster rows (see Section 1 #2). | Trace `deriveProfileState()` — likely needs `(workflow_status='approved' && status='active')` regardless of `agency_visibility`. |
| D-2 | function | Card click goes to talent profile page; "Inquire about X" CTA is a separate button. | Surface "Inquire" as the primary card click (open drawer with talent pre-selected). Profile page becomes the small "View profile" link. |
| D-3 | product | No filter/search bar on Discover. With 50+ talent, the page is unusable. | `DiscoverShell` likely has filtering already — surface it. Filter chips: category, city, price range, height (for models), languages. |
| D-4 | product | No "save to shortlist" affordance. Client browses → forgets which they liked. | Heart icon on each card. Backed by `saved_talent` table (already exists). Restore the `/client/shortlists` route to actually render the saved list (currently redirects to Discover). |
| D-5 | product | No "compare 2-3 talent side-by-side" view. Common booker behavior: "I'm choosing between Sofia and Carmen". | Multi-select cards → "Compare 2 selected" CTA. |
| D-6 | product | No talent-availability indicator. Card says nothing about whether the talent is available on the client's event date. | Surface availability conflicts inline when the client has open inquiries with dates. |

### 2.4 Inquiries — list

| ID | Type | Finding | Recommendation |
|---|---|---|---|
| I-1 | design | Primary text = company name, identical across 4 rows. | Primary = event type or brief excerpt; secondary = date + location + talent count. |
| I-2 | function | No filter / sort. Just "Open" and "Closed" sections. | Filter chips: stage, date range, "with offer", "needs me". |
| I-3 | function | No quick actions (archive, mute notifications). | Right-click / hover-reveal: Archive · Pin · Mark unread. |
| I-4 | function | Status chip + "Your turn" + "1 new" pills are inconsistent — three different visual tokens for related state. | Unify: single "Your turn (1 new)" pill when both apply; otherwise just the chip. |
| I-5 | product | No grouping by *project*. A client running a launch event might have 3 inquiries (host, models, photographer). Today they appear as 3 unrelated rows. | Add `project_id` (nullable) to inquiries. Group rows under a project header in the list. |

### 2.5 Inquiries — detail (`/client/inquiries/[id]`)

| ID | Type | Finding | Recommendation |
|---|---|---|---|
| ID-1 | design | Uses a completely different visual system from the dashboard (no `ClientPageHeader`, no breadcrumb). Feels like a different app. | Wrap in `ClientPageHeader` with eyebrow="Inquiry #ABC123", title=company or event-type, breadcrumb link back to /inquiries. |
| ID-2 | function | The inquiry detail page **has** a "Send" composer. The Messages page **doesn't**. The composer should live on both. | Move the composer to a shared component used by both surfaces. |
| ID-3 | product | No offer-side-by-side comparison when client receives a counter. Just shows the latest offer. | When `inquiry_offers` has 2+ rows, render a side-by-side diff. |
| ID-4 | product | Approve / Reject CTAs (when client has an offer pending) are buried in the page. | Sticky CTA bar at the bottom of the detail page when `next_action_by === 'client'`. |
| ID-5 | product | No way to forward / share an offer with a colleague for sign-off. | "Share for approval" → email + magic link. |

### 2.6 Bookings

| ID | Type | Finding | Recommendation |
|---|---|---|---|
| B-1 | function | Bookings page list-rows link to `/client/inquiries/[id]` (the inquiry detail), not a dedicated booking detail. Confusing. | Render a booking-specific detail with call-sheet info, payment status, attendee list. |
| B-2 | product | No calendar view. List-only. | Toggle: List / Calendar. Use the same date-box visual already in the list. |
| B-3 | product | No iCal export, no Google Calendar push. | Per-booking "Add to calendar" button (.ics download or oAuth Google integration). |
| B-4 | product | No call-sheet preview. Bookings have call-sheet data on the admin side; client doesn't see it. | Surface the call-sheet (start time, location, contact, attire) once the admin generates it. |
| B-5 | product | No "leave a review" CTA after the event date passes. | Cron: 24h after `event_date`, prompt for talent review. (`talent_reviews` table likely already exists per the trust spec.) |

### 2.7 Settings

| ID | Type | Finding | Recommendation |
|---|---|---|---|
| S-1 | function (P1) | Profile fields are READ-ONLY with "Contact Impronta Models to update". Client can't change their own name, company, phone. | Make Name + Company + Phone directly editable. Save via existing server action. |
| S-2 | function | Email + password — also read-only. | "Change email" → Supabase email-change flow. "Change password" → reset-link flow. |
| S-3 | function | Notifications: "configurable in a future update". Stub. | Three toggles: Email · SMS · In-app. Three channels: Status changes · New messages · Offer events. 3×3 matrix. |
| S-4 | product | No billing / invoices for the client. Once Stripe is wired (deferred per the user memo), this is where they go. | Add "Billing" section with payment methods + invoice history. |
| S-5 | product | No "Team" section to invite colleagues. A brand-side booker might be one of 4 people who should see this workspace. | Add team invites with role: viewer (read-only on inquiries) · editor (can reply + approve). |
| S-6 | product | No "Delete account" or "Export my data" affordance — GDPR/CCPA hygiene. | Add at the bottom, after a confirmation flow. |

### 2.8 Layout chrome (identity bar + topbar)

| ID | Type | Finding | Recommendation |
|---|---|---|---|
| C-1 | design | Identity bar is busy: agency name + slash + user avatar + name + slash + Client chip + "Client" pill + notifications bell + help `?` + EN/ES + sign-out. Eight elements, no hierarchy. | Reduce to 4: agency name · user avatar (with name on hover) · notifications · user-menu (with sign-out + settings inside). |
| C-2 | function (P1) | Sign-out is a `↩` icon. Unlabeled, unfamiliar. | Move into a user-menu dropdown opened from the avatar. Items: Profile · Settings · Sign out. |
| C-3 | function (P1) | Notifications bell + help `?` are stubs. | Bell → opens a notifications panel using the existing `notifications` table. Help → routes to a `/help` page or opens an Intercom-style chat. |
| C-4 | function | EN/ES toggle visible but clicking ES doesn't change locale. | Wire to existing `/es/<tenantSlug>/client/...` route. |
| C-5 | design | Topbar nav uses underline-on-active. Bold/light contrast on the labels is subtle — Today/Discover both look "active-ish". | Increase the contrast — active = font-weight 700, color = ink; idle = font-weight 500, color = inkMuted. |
| C-6 | function | No mobile bottom nav for the new layout. The legacy `ClientBottomNav` only renders inside the old `ClientSurface` (mock shell), not the real layout. | Add a fixed bottom nav for ≤720px: Today · Messages · Discover · Inquiries · Bookings (5 max). |
| C-7 | product | "Switch tenant" — a client may have relationships with multiple agencies. Today they have to log out/in. | Multi-tenant switcher (drop-down on the agency name). |

---

## SECTION 3 — Product / business improvements

Ranked by impact-to-effort.

### 3.1 Top 5 levers (do these next)

1. **Fix Discover empty state (P0).** Five published talents not surfacing. Direct revenue blocker — Discover is the top-of-funnel for clients picking talent. **~1h.**
2. **In-page reply composer in Messages.** Today, replying = leaving the dashboard. Composer in the thread pane keeps the user in the high-density inbox view. **~2h.**
3. **Inquiry detail with `ClientPageHeader` + breadcrumb + sticky approve/reject bar.** When the offer lands, the client should be able to act in ≤2 clicks. Today the CTAs are buried. **~3h.**
4. **Realtime on inquiry_messages.** Removes the "did I get a reply?" anxiety + cuts coordinator round-trips. **~2h with Supabase realtime channel.**
5. **Save talent to shortlist + restore `/client/shortlists`.** Discover → save → revisit → inquire-with-3-selected. Increases inquiry volume per session. **~4h.**

### 3.2 Mid-impact (Phase 2)

6. Today: drop the 4-stat tile row, add an "Up next" timeline + recent activity feed.
7. Multi-talent compare on Discover.
8. Filter + sort on Inquiries + Messages, persisted in URL params.
9. Calendar view on Bookings + iCal export.
10. Talent-availability conflict warning when creating an inquiry.
11. Inline-edit Profile fields in Settings; wire Notifications toggles.
12. Project grouping for inquiries (`project_id`).

### 3.3 Long-tail (Phase 3)

13. Team invites + role-based access on the client side.
14. Billing / invoices section.
15. Multi-tenant switcher in the identity bar.
16. Keyboard shortcuts (`N`, `/`, `g+m`).
17. Mobile bottom nav (≤720px).
18. Post-event review prompt + talent rating.
19. Forward offer for colleague sign-off.
20. Stripe payment-on-platform integration (deferred per user memo).

---

## SECTION 4 — Cross-cutting design system

| Issue | Recommendation |
|---|---|
| Inconsistent date formats (`Jun 14, 2026` vs `14 Aug 2026` vs `Sep 29, 2026`). | Single helper `formatClientDate(d)` → "Jun 14, 2026" everywhere. Already exists at `date-format.ts` — audit callers. |
| Emoji icons leak into prod UI (📅 on Inquiries, 📋 / 🎭 on empty states). | Replace with lucide-react SVG icons. Already imported elsewhere. |
| Three different status chip palettes across pages (Today / Inquiries / Bookings) — partially deduped in `0c91f66b2`, more rows still inline. | Audit + replace remaining inline status chips. |
| "Your turn" + "Action needed" + "1 need you" are three different phrasings for the same state. | Standardize on one: "Action needed". |
| Spacing density varies — Today is roomier (24px gap), Inquiries denser (16px), Bookings looser (28px). | Pick one (recommend 20px gap, 14px row padding). |
| Empty-state icons differ visually but use same component shell. | Replace with a small set of lucide-react glyphs (e.g. `Inbox`, `Calendar`, `Search`). |

---

## SECTION 5 — Engineering / perf

| Issue | Fix |
|---|---|
| **`loadWorkspaceRosterEnriched` was called on every page** (Today/Inquiries/Bookings/Messages) just to power the drawer. Caused the 17-min hang. | ✅ Fixed by `loadWorkspaceRosterLite` (commit 77a342e45). |
| `loadClientInquiries` does N+1 messaging queries to compute unread counts. ~200ms per call. | Push into a single SECURITY DEFINER RPC `client_inquiries_with_unread(tenant, user)`. |
| `loadInquiryMessages` doesn't cache. Every thread-switch in Messages is a fresh roundtrip. | React Query / SWR on the client + 10s stale-while-revalidate. |
| Server pages all use `dynamic = "force-dynamic"`. Disables Next caching entirely. | Use `revalidate: 0` only on the pages that truly need it. Bookings list could be cached for 30s. |
| Identity bar is server-rendered on every navigation; doesn't HMR cleanly across pages. | Lift to a Client component once + persist. |

---

## SECTION 6 — Recommended next sprint (1-week scope)

Pick 5 items from the P0 + Top-5 lever lists:

1. ✅ Lite roster loader (already shipped 77a342e45)
2. Discover empty state bug — trace `deriveProfileState`
3. In-page reply composer in Messages
4. Inquiry detail header refactor + sticky approve/reject bar
5. Realtime on `inquiry_messages` + read receipts

After this sprint, the client dashboard goes from "looks consistent" to "lets the client actually run the booking flow without leaving Messages."

---

## Status

- **Audit walk done**: 2026-05-14 against `phase-1` @ `77a342e45`.
- **Perf P0 fixed**: lite roster loader (`77a342e45`).
- **Doc lives at**: `web/docs/client-dashboard-audit-2026-05-14.md`.
- **Next action (suggested)**: triage with product owner, pick 3–5 items, ship.
