# Messages Consolidation — Binding Product Plan

**Status:** Ratified plan (2026-05-13). Drives every Messages PR until shipped.
**Author voice:** product owner + designer + business manager — one head, no committees.
**Scope:** Everything on the Messages surface across admin / coordinator / talent / talent-coord / client. Adjacent surfaces (Roster, Calendar, Pitch, Stripe onboarding, hybrid identity, settings) are NOT out-of-scope; they are sequenced after the core consolidation.
**Mobile is the default canvas.** Every component is designed at 375×812 first, desktop is the stretched variant.

---

## 0 · The 5 product principles

Every decision below derives from these. Anything violating them is rejected.

1. **Conversation is the dominant surface.** It's the only reason the user opens this page. Everything else exists to support it, never crowd it.
2. **The header answers 5 questions in 4 seconds:** *who* (client + talents) · *what* (project + status) · *when* (date) · *where* (venue) · *how much* (offer total). All five visible without a tap. Each becomes a target that opens a sheet for the detail.
3. **One click from any message to any action.** Approve, draft offer, accept hold, mark paid, open call sheet — all reachable from the persistent footer ribbon. Ribbon is role-aware and ephemeral.
4. **Mobile is the default canvas.** 375×812 first.
5. **One shell, every role.** Same skeleton across admin / coord / talent / talent-coord / client. Differences live in tab visibility, action verbs, and which sheet opens — never in layout structure.

---

## 1 · The universal shell

### Mobile (≤640px, the default)

```
┌──────────────────────────────────────┐
│ ←  QA Client Co            ● Inquiry │  HEADER row 1 (44px)
│    Aug 14 · Tulum · via Impronta     │  HEADER row 2 (28px)
│    👤👤👤 +0  €2,400 · sent          │  HEADER row 3 (36px) — all tappable
├──────────────────────────────────────┤
│ Chat   Lineup   Offer   Event   Files│  PILL TABS (40px) — scrollable
├──────────────────────────────────────┤
│                                      │
│                                      │
│        (active tab content)          │  CONTENT (fills)
│                                      │
│                                      │
├──────────────────────────────────────┤
│ Type a message...               ▶    │  COMPOSER (52px) when on Chat
└──────────────────────────────────────┘
│ Reply to client · Draft offer    ✕   │  EPHEMERAL ACTION RIBBON
└──────────────────────────────────────┘   (only when a nudge is owed)
```

Header total: **108px** (vs ~200–220px today on admin). Roughly 50% of chrome reclaimed.

### Desktop (≥1024px)

```
┌─────────────────┬─────────────────────────────────────────────────────┐
│ Inbox           │ ←  QA Client Co · QA Client Co         ● Inquiry    │
│  filter pills   │    via Impronta · TulumAuditResort · Aug 14         │
│  TODAY          │    👤👤👤 +0   €2,400 · sent    Move to ▾           │
│   QA Client Co  ├─────────────────────────────────────────────────────┤
│   QA Flow Co    │ Chat | Lineup | Offer | Event | Files               │
│  OLDER          ├─────────────────────────────────────────────────────┤
│   Luxe Brands   │      Conversation                                   │
│   Vogue MX      │      (with Client / Group / DM sub-toggle on        │
│                 │       Chat tab, role-aware)                         │
│                 ├─────────────────────────────────────────────────────┤
│                 │ ▷ Type a message...                            ▶    │
│                 ├─────────────────────────────────────────────────────┤
│                 │ Reply to client / Draft offer                  ✕    │
└─────────────────┴─────────────────────────────────────────────────────┘
```

Inbox = persistent left rail on desktop. Hidden on mobile (back arrow in header replaces it).

---

## 2 · The header — line by line

### Row 1 (44px) — identity
- **Back arrow** (mobile) / chevron (desktop).
- **Title:** project name, single ellipsis.
- **Right edge:** ONE status pill — "Inquiry" / "Offer sent" / "Booked" / "Wrapped". **Tap → Status sheet** with full stage timeline + dates. Kills the 4-dot pill row (saves 36px).
- **Right edge admin-only:** "Move to ▾" stage-transition dropdown.

### Row 2 (28px) — context line
Inline string: `via Impronta · Aug 14 · Tulum`. Each segment is tap-targeted.
- Tap workspace → Workspace sheet.
- Tap date → Event tab.
- Tap venue → Maps sheet.
- Source chip (DIRECT / HUB / etc.) on the right edge of this row.

### Row 3 (36px) — the at-a-glance trio
This is what delivers "see quickly who are the talents, the offers, info of the event."

- **Left half:** overlapping avatar stack (up to 5 circles, then `+N`), then "N talents". Tap → opens **Lineup sheet** (or jumps to Lineup tab).
  - Coordinator avatars carry a small **star overlay** so the user can see who's running the show.
  - Confirmed talents show a green dot; declined dimmed at 40%.
- **Right half:** offer chip with state tone. Formats:
  - `No offer yet` (gray)
  - `€2,400 · draft` (gold)
  - `€2,400 · sent` (indigo)
  - `€2,400 · accepted` (green)
  - `€2,400 · paid` (green deep)
  - Talent role: shows their personal cut (`Your line: €1,800 · sent`).
  - Client role: shows what they pay (`You pay €2,400`).
  - Tap → Offer sheet (or jumps to Offer tab).

The current "Live lineup (3) inquiry_participants" band is folded *into row 3*. No separate panel. Same data, one third of the pixels.

---

## 3 · Tabs and the Chat sub-toggle

### The 5 tabs (same everywhere)

| Order | Label | Default? | Purpose |
|---|---|---|---|
| 1 | **Chat** | yes, landing tab | Conversation (with sub-toggle inside) |
| 2 | **Lineup** | — | Who's on this thing + add/remove (when authorized) |
| 3 | **Offer** | — | The money + line items + send/accept actions |
| 4 | **Event** | — | When / Where / Transport / Lodging / Call sheet / Last activity |
| 5 | **Files** | — | Attachments + briefs + signed contracts |

**Decisions, locked:**
- Rename "Client thread" → **Client** (it's a sub-toggle inside Chat, not a top-level tab).
- Rename "Talent group" → **Group**.
- "Lineup" is the universal tab name across every role. No "Booking team" / "Your team" variants.
- "Project" (admin) and "Details" (talent) merge into **Event** on all 3 roles.

### Chat tab sub-toggle (the hard part)

The Chat tab itself has a small segmented toggle at the top of the conversation pane. Visibility depends on whether the actor has client-facing access.

```
┌─────────────────────────────┐
│ ⌜ Client │ Group │ DM ⌝     │   sub-toggle (32px) inside Chat tab
└─────────────────────────────┘
```

Per role, default selection + lock state:

| Role | Default thread | Client tab | Group tab | DM tab |
|---|---|---|---|---|
| Admin (owner / staff) | Client | ✅ unlocked | ✅ unlocked | ✅ unlocked (1:1 w/ anyone) |
| Coordinator | Client | ✅ unlocked | ✅ unlocked | ✅ unlocked |
| Talent (not coord) | Group | 🔒 **locked + "Request to join as coordinator"** | ✅ unlocked | ✅ DM w/ coord only |
| Talent-coord (hybrid) | Client | ✅ unlocked | ✅ unlocked | ✅ unlocked |
| Client | Client (only thread they have) | (only this — no toggle shown) | hidden | DM w/ coord only |

### The coordinator model (NEW — formalized from your direction)

**Core rule:** *Anyone who chats with the client on a given inquiry IS a coordinator of that work.* Coordinator is a derived role from being in the Client thread. It is not a separate job title — it is a function on a particular inquiry.

**Coordinator powers (engine-enforced):**
- Assign / remove talent on Lineup tab.
- Draft / edit / send offers.
- Approve incoming counters.
- Manage event logistics + edit call sheet.
- Receive commission on the booking.

**Coordinator does NOT have to attend the event.** They can take commission and never set foot on set.

**The "Request to join as coordinator" flow (talent → coord upgrade):**

1. **Talent taps the locked Client sub-toggle.** UI shows a sheet:
   > "You're not a coordinator on this inquiry yet. Coordinators talk to the client, run the lineup, and earn commission on the booking. Request to join?"
   > *[Talent enters short pitch: "I know this client / I can co-run with Sara / etc."]*
   > **[Send request]**
2. **Engine:** writes a `coordinator_join_request` row (new table) referencing inquiry + talent. Notifies existing coordinators + admins + the client.
3. **Existing coord / admin / client** sees the request as a Lineup-tab badge + a notifications-bell entry. Approving requires explicit affirmation from one of:
   - Any existing coordinator on this inquiry, OR
   - Workspace admin/owner, OR
   - The client themselves (client opt-in is enough — clients should always have a say in who can DM them).
4. **On approval:** talent's `inquiry_participants.role` is upgraded to include `coordinator`. They immediately see the Client sub-toggle unlocked + appear in the avatar stack with a coord star. Engine emits `coordinator_joined` event into the activity feed.
5. **On decline:** silent decline (no message to talent — friction-free, no shaming). Talent can try again later.

**Removing a coord:** any admin/owner can revoke. A coord can self-remove via Lineup → their own row → "Step down as coordinator". Confirmation sheet warns of loss of commission for future state.

### The commission model for talent-coords

This wires directly into the Phase B PR 3 commission engine (already shipped: `booking_commission_snapshot` table + `coordinator_pct` array).

**Scenario:** Sofia is talent on the lineup AND coordinator on the same inquiry.
**She earns BOTH:**
- Talent payout = her line-item rate from the offer (paid via the talent lane).
- Workspace commission = her share of the workspace fee (paid via the workspace lane, split among coords by `coordinator_pct`).

**Offer drafter:** when an admin drafts an offer with a talent-coord:
- That person appears as a **line item** in the talent grid (talent payout) AND
- A **slider** in the workspace-fee panel (their commission cut, 0–100% of the fee, defaults to even-split among all coords).
- The header offer chip on Sofia's view shows BOTH totals: `Your line: €1,800 · +€240 coord`.

**Coord-only (does not attend event):**
- No line item in the talent grid.
- Slice of workspace fee per `coordinator_pct`.
- Header offer chip shows: `Your coord: €400 · sent`.

**Engine guarantee (DB CHECK `lanes_sum_to_gross`):** platform + workspace + talent always sum to gross, regardless of how many people each lane splits to.

---

## 4 · Role variations — full matrix

Same shell. Different conditional logic.

| Region | Admin | Coordinator | Talent | Talent-coord | Client |
|---|---|---|---|---|---|
| Title prefix | bare project | bare project | "X inquiry" | bare project + "Coord" tag | bare project |
| Status pill | full stage palette | full stage | own talent status overlay | full stage + own talent dot | full stage |
| Header avatar stack | all participants (coord star) | all + self star | lineup with self pulled out + self badge | all + own coord star | all + coord stars |
| Header offer chip | gross to client + workspace fee subhint | gross + own commission subhint | own line rate + payout state | own line + own coord cut | gross they pay |
| Chat default | Client | Client | Group | Client | Client (only one) |
| Chat sub-toggle visible | Client ✓ / Group ✓ / DM ✓ | same | Group ✓ / Client 🔒 / DM ✓ | same as admin | none |
| Lineup tab actions | add · drag · remove · reassign coord | same | read-only | add/remove others; read-only on self | read-only |
| Offer tab actions | draft · edit · send · adjust workspace fee · adjust coord splits | draft + send + adjust own commission | accept · decline · counter own rate | both (own rate + own coord %) | approve · decline · counter |
| Event tab edits | all fields + call sheet | same | none (read-only) | schedule + logistics + call sheet | none (read-only) |
| Files upload | yes | yes | yes (own work, contracts) | yes | yes (brief, references) |
| Bottom ribbon prompt | "Reply to client" / "Draft offer" / "Send to client" / "Open call sheet" | same | "Accept · Hold · Decline" / "Send your rate" | role-aware: talent prompt OR coord prompt, whichever is owed first | "Approve · Decline · Counter" / "Open payment" |
| Bottom ribbon ephemeral? | ✓ (Slice 2 shipped) | ✓ | ✓ | ✓ | ✓ |

---

## 5 · Full lifecycle — inquiry → wrapped

Every stage maps to a specific header state + ribbon verb + tab badge for each role.

| Stage | Status pill | Admin ribbon | Coord ribbon | Talent ribbon | Talent-coord ribbon | Client ribbon |
|---|---|---|---|---|---|---|
| 1 Inquiry created | Inquiry | "Add talent to lineup" | same | (not invited yet) | (not invited yet) | "Shortlist forming, no action" |
| 2 Talent invited | Inquiry | "Waiting on N talents" | same | **"Accept · Hold · Decline"** | "Accept · Hold · Decline" + secondary "Manage lineup" | "Shortlist forming" |
| 3 Talent accepts / submits rate | Inquiry | "All talent confirmed → draft offer" | same | "Waiting on coord to package offer" | both prompts merge | "Shortlist forming" |
| 4 Admin drafts offer | Inquiry | "Send offer to client" | "Send offer to client" | "Your line in draft" | both | "Coord is preparing your offer" |
| 5 Offer sent | **Offer** | "Awaiting client response" | "Awaiting client response" | "Offer with client" | "Offer with client" | **"Approve · Decline · Counter"** |
| 6 Client approves | **Booked** | "Open call sheet" | "Open call sheet" | "Booked — open event" | both | "Open call sheet" |
| 7 Payment | Booked | "Send payment request" → "Paid · payout scheduled" | same | "Payout pending" | "Payout pending (talent + coord)" | **"Pay now"** → Stripe checkout |
| 8 Shoot day | Booked + "Today" sub-line | "Open call sheet · contact talent" | same | "Today's call sheet" | "Today's call sheet" | "Today's plan" |
| 9 Wrapped | Wrapped | "Mark payout ready" | "Mark payout ready" | "Payment cleared" | "Payments cleared (both lanes)" | "Receipt · invoice" |

Every stage exists in the codebase today in some form. The plan makes them visible through ONE shell.

---

## 6 · Prior 24-hour work — where each piece plugs in

Nothing built recently gets thrown away. Every commit has a home.

| Prior work | Wired into |
|---|---|
| Stripe Connect commission engine (Phase B PR 3, commits `2f63f41d` + `eda3002b`) | Offer tab breakdown (gross / workspace / talent + coord splits); Client "Pay now" on Chat ribbon at Stage 7; webhook drives status pill to "Booked" + offer chip to "paid" auto |
| Call sheet editor (B2) | Event tab → Call sheet subsection; admin "Open editor" link; talent read-only summary; client shoot-day plan |
| Triage queue (A7) | Inbox filter chips (already shipped). "Needs Me" chip is the triage queue. |
| Ephemeral action bar (Slice 2 this chat) | Bottom ribbon on all 3 roles. Cross-POV already. |
| Compact lineup avatar strip (Slice 1 this chat) | Header row 3 avatar stack on every role. |
| Last activity feed (Slice 4 this chat) | Event tab subsection (not Project — Project becomes Event). All roles. |
| Project tab dedupe (Slice 3 this chat) | Becomes Event tab; same dedupe lands on talent and client |
| Notifications bell (A9) | Header status pill pulse + inbox row badge (no change) + coord-join-request notification (NEW wiring) |
| Realtime refresh (B10) | Already on client thread; admin + talent threads get same realtime channel |
| Inquiry-received email (B8, ops-blocked on RESEND_API_KEY) | Independent of UI; surfaces when env unblocks |
| Stripe live ops (memory: pending) | Independent; current shell works in test + live mode identically |
| Stripe Connect onboarding (talent side, Phase B PR 4 — was "parked") | **Now sequenced as Slice K below.** Lives in Settings → Payouts, but the Offer tab on talent + talent-coord views surfaces a "Connect your bank to receive payout" inline prompt when offer is accepted and account is not yet KYC'd |
| Hybrid talent×workspace (was "Phase X") | **Now sequenced as Slice L below.** The talent-coord case in this plan IS the first concrete implementation of the hybrid model. |
| Pitch feature | Pitches generate inquiries → first message in Chat tab comes pre-seeded with the pitch context. Out of the messages-shell rebuild itself but the inquiry surface must accept pitch-origin inquiries cleanly. **Sequenced as Slice M.** |
| Roster (Add talent picker) | Lineup tab "Add talent" CTA already wires to existing picker — no change needed |
| Calendar | Booked inquiries auto-create calendar entries; no change to messages surface |

---

## 7 · The 13-slice rollout (was 8; expanded with your scope-back-in direction)

Each slice ends with a commit + browser-verified screenshot as the relevant role. No slice is "shipped" until I've watched it work.

### Phase A — Core consolidation (the 5 user-visible wins)

| # | Slice | Touches | Effort | Verifiable win |
|---|---|---|---|---|
| **A** | Admin header rebuild: 3-row header (Status + via + avatars + offer chip); kill 4-dot pill row; absorb Live lineup band | `messages.tsx` | 2h | Chrome drops from ~220px to ~108px |
| **B** | Admin tab rename + Chat sub-toggle: Client / Group / DM; Lineup as tab #2; Project → Event | `messages.tsx` | 2h | New tab vocabulary live |
| **C** | Talent surface gets the universal shell: same 3-row header; rename Booking team → Lineup; Details → Event; add header offer chip; add avatar stack | `InboxShell.tsx`, talent `[id]/page.tsx`, sub-components | 4h | Talent visually identical to admin (role-aware content) |
| **D** | Client surface gets the universal shell: same 3 rows; same chip; same stack; via ReservationThread primitive with our shared Header | `ClientThreadAdapter.tsx`, `<Header>` in primitive | 3h | All 3 visually consistent |
| **E** | Action ribbon polish + verbs: Slice 2 ephemeral fix lands on talent + client; verb table from §4 enforced | shared `ShellNextActionBar`, talent thread, client adapter | 2h | Consistent role-aware verbs, all dismissible |

### Phase B — The hybrid coordinator model (the new strategic feature)

| # | Slice | Touches | Effort | Verifiable win |
|---|---|---|---|---|
| **F** | Coord-request flow — schema + engine: new `coordinator_join_requests` table, request/approve/decline RPCs, `inquiry_participants.role` upgrade path, notification emits | new migration, engine module, server actions | 4h | DB + actions ready; no UI yet |
| **G** | Coord-request flow — UI: locked Client sub-toggle on talent shell; request sheet; approver badge in Lineup tab; approval/decline sheet for coords+admin+client; coord star overlay on avatar stack | shared coord-request component + plumbed into talent + admin + client shells | 5h | Talent can request, coord/admin/client can approve, role flips live |
| **H** | Commission UI for talent-coord: Offer drafter shows talent-coord as both line item and commission slider; talent-coord header chip shows both totals; engine snapshot already supports it (Phase B PR 3) | offer drafter UI on admin shell + header chip render on talent-coord | 3h | Sofia sees `Your line: €1,800 · +€240 coord` |

### Phase C — Mobile + lifecycle wiring

| # | Slice | Touches | Effort | Verifiable win |
|---|---|---|---|---|
| **I** | Mobile shell: `<Sheet>` primitive adoption for Lineup / Offer / Event tabs on mobile; pill-tab horizontal scroll; iOS safe-area + keyboard handling; pull-to-refresh on Chat | all 3 surfaces + `<Sheet>` primitive | 6h | Mobile experience consistent + thumb-zone correct |
| **J** | Lifecycle wiring sweep: verify each stage 1→9 from §5 lights the right header chip + ribbon verb + tab badge for every role; fix mismatches; wire Stripe checkout sheet on Chat ribbon Stage 7 client-side | cross-cutting | 5h | Full inquiry-to-wrapped is one fluid surface |

### Phase D — Adjacent surfaces (previously called "out of scope" — now sequenced)

| # | Slice | Touches | Effort | Verifiable win |
|---|---|---|---|---|
| **K** | Talent-side Stripe Connect onboarding (was "Phase B PR 4 parked"): talent Settings → Payouts; inline prompt in Offer tab when accepted-and-not-KYC'd; uses existing `lib/payments/stripe-connect.ts` helpers + new talent-keyed equivalents | new lib helpers, talent settings page, offer-tab prompt component | 6h | Talent can connect bank; offer payout works end-to-end |
| **L** | Hybrid identity formalization (was "Phase X"): top-nav talent⇄workspace toggle; talent-coord is the proof-of-concept; supports talent who owns a Free studio AND coordinates on others' workspaces | top-nav, identity router, pref persistence | 8h | One human, one login, switches mental model cleanly |
| **M** | Pitch feature inquiry-origin wiring: pitch-generated inquiries open with pre-seeded context in Chat tab (the pitch was the first contact); pitch link surfaces in Event tab; pitch CTA on inquiry conversion | inquiry creation hook, Chat tab pre-seed render, Event tab pitch surface | 4h | Pitch→inquiry→booking is one fluid funnel |

**Total: ~54 hours of focused work, 13 commits.** Each verifiable in browser as one of the 5 roles.

---

## 8 · Mobile-first specifics (the hard part — non-negotiable)

Every component must be designed at 375×812 first, then stretched to desktop.

1. **Thumb zone.** Action ribbon + composer always within bottom 25% of viewport. Sticky. iOS `env(safe-area-inset-bottom)` respected.
2. **No horizontal scroll except the pill-tab strip.** Conversation pane never scrolls horizontally. Header text always ellipses, never wraps onto two lines (except row 3 which is two designed lines).
3. **Sheet pattern, not modal.** Every tap on a header chip opens a bottom-sheet on mobile, side-drawer on desktop. `<Sheet>` from `reservation-thread/Sheet.tsx` already implements this.
4. **Tap targets ≥44×44px.** No exceptions. Admin lineup drag handles, Slice 2 dismiss × (currently 22×22) all get padded to 44 hitbox.
5. **One-handed reach.** Status / Lineup / Offer sheets swipe down to close.
6. **No hover-only affordances.** Every hover state has a tap equivalent or always-visible alternative.
7. **iOS pinch-zoom disabled inside conversation pane.**
8. **Keyboard handling.** Composer rises with iOS keyboard. Conversation auto-scrolls to latest. Send button stays reachable.
9. **Pull-to-refresh** on Chat tab on every role.
10. **Empty states.** Each tab has a designed empty state. No "No data" gray boxes. Short copy + primary CTA.

---

## 9 · Locked product decisions

These are the calls I made as PO. They are NOT open for re-debate inside this plan.

| # | Decision |
|---|---|
| 1 | Final tab naming: **Chat · Lineup · Offer · Event · Files**. Chat has sub-toggle [Client \| Group \| DM] |
| 2 | Kill the 4-dot status pill row; one chip on the right edge opens a Status sheet |
| 3 | Header offer chip lives on **all** roles, with role-appropriate amount + tone |
| 4 | "Lineup" is the universal tab name. No "Booking team" / "Your team" rebrands per POV |
| 5 | Merge "Project" + "Details" into one tab: **Event** |
| 6 | Coordinator = derived role from being in the Client thread. Anyone admitted to that thread is a coord on this inquiry |
| 7 | Talent → coord upgrade is a **request flow**, requiring approval from (any existing coord) OR (admin/owner) OR (client) |
| 8 | A coord does NOT have to attend the event. They take commission regardless |
| 9 | A talent-coord who works the event is paid **talent line item + workspace commission share** (both lanes, engine-snapshotted) |
| 10 | Rollout order: A → M (Phase A first for visible consolidation, Phase B for the coord model, Phase C mobile + lifecycle, Phase D adjacent surfaces) |
| 11 | Adjacent surfaces (Stripe talent onboarding, hybrid identity, pitch wiring) are **sequenced**, not out-of-scope |

---

## 10 · What this plan does NOT touch

Genuinely out: items unrelated to inquiry-to-booking flow.

- Workspace Settings beyond Payouts (separate parent page)
- Roster grid redesign (separate parent)
- Site/CMS editor (separate parent)
- Pitch authoring UI itself (only inquiry-origin wiring is in scope)
- Platform admin shell
- Marketing site

If any of those become blockers during execution, surface them; never start them silently.

---

## 11 · Execution rules

For whichever session picks this up:

1. **No "should I?" questions on locked decisions** (§9). They're locked. Execute.
2. **Commit per slice.** Each commit message references the slice letter (e.g. `feat(messages slice F): coord-request schema + engine`).
3. **Browser-verify per slice** as the relevant role. Don't ship without watching it work.
4. **TS + lint clean before every commit.** Standard project gate.
5. **If a slice reveals a deeper bug** (e.g. engine breakage), fix it in-line and note in the commit message. Don't park.
6. **If a slice expands beyond 8h of work**, split it before shipping. Each commit should be reviewable in <30 min.
7. **Adjacent slices (K, L, M) only start after Phase A–C are green-light.** Don't multi-track until the core consolidation is shipped.
8. **No new design decisions without updating this doc first.** This doc is the source of truth.

---

## 12 · Hand-off context for any future session

If you are a fresh Claude session picking this up:

- This doc is your spec. Read top-to-bottom before touching code.
- Current state (2026-05-13): Phase A slices 1–4 partially shipped (admin only — see commits `3ff6e376`, `6362fedd`, `2cdc15a5`, `4890a6e8`). They need rework to match the final shell in §1 (current Slice 1 strip stays but moves into the header row 3; Slice 3 dedupe is right but the tab rename needs to happen with it).
- Start with Slice A from §7.
- Memory pointer: `~/.claude/projects/-Users-oranpersonal-Desktop-impronta-app/memory/MEMORY.md` indexes this file.
- Key files:
  - Admin: `web/src/components/admin/shell/internal/messages.tsx` (~15k LOC)
  - Talent: `web/src/app/(workspace)/[tenantSlug]/talent/inbox/InboxShell.tsx` + `[id]/`
  - Client: `web/src/app/(workspace)/[tenantSlug]/client/inquiries/[id]/page.tsx` + `ClientThreadAdapter.tsx`
  - Shared primitive: `web/src/components/reservation-thread/`
  - Engine: `web/src/lib/inquiry/`, `web/src/lib/billing/commission*.ts`
