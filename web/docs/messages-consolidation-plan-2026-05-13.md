# Messages Consolidation — Binding Product Plan v2

**Status:** Ratified plan v2 (2026-05-13). Integrates the polished addendum. Drives every Messages PR until shipped.
**Author voice:** product owner + designer + business manager — one head, no committees.
**Core product direction:** **Messages becomes the operating room of the reservation.** Chat is not just communication; it is where the inquiry is understood, the lineup is managed, the offer is created, the client approves, payment happens, and the booking is executed.
**Scope:** Everything on the Messages surface across admin / coordinator / talent / talent-coord / client. Adjacent surfaces (Roster, Calendar, Pitch, Stripe onboarding, hybrid identity, settings) are NOT out-of-scope; they are sequenced after the core consolidation.
**Mobile is the default canvas.** Every component is designed at 375×812 first; desktop is the stretched variant.

---

## 0 · The 5 product principles

Every decision below derives from these. Anything violating them is rejected.

1. **Conversation is the dominant surface.** It's the only reason the user opens this page. Everything else exists to support it, never crowd it.
2. **The header answers 5 questions in 4 seconds:** *who* (client + talents) · *what* (project + status) · *when* (date) · *where* (venue) · *how much* (offer total). All five visible without a tap. Each becomes a target that opens a sheet for the detail.
3. **One click from any message to any action.** Approve, draft offer, accept hold, mark paid, open call sheet — all reachable from the persistent footer ribbon. Ribbon is role-aware and ephemeral.
4. **Mobile is the default canvas.** 375×812 first. Desktop is the stretched variant.
5. **One shell, every role.** Same skeleton across admin / coord / talent / talent-coord / client. Differences live in **visibility · default tab · allowed actions · wording · financial presentation · notification responsibility** — never in layout structure.

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
│        (active tab content)          │  CONTENT (fills)
│                                      │
├──────────────────────────────────────┤
│ Type a message...               ▶    │  COMPOSER (52px) — Chat only
└──────────────────────────────────────┘
│ Reply to client · Draft offer    ✕   │  EPHEMERAL ACTION RIBBON
└──────────────────────────────────────┘   (only when a nudge is owed)
```

Header total: **108px** (vs ~200–220px today on admin). ~50% chrome reclaimed for the conversation.

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
│   Vogue MX      │      (Chat tab → Client | Group | DM sub-toggle)    │
│                 ├─────────────────────────────────────────────────────┤
│                 │ ▷ Type a message...                            ▶    │
│                 ├─────────────────────────────────────────────────────┤
│                 │ Reply to client / Draft offer                  ✕    │
└─────────────────┴─────────────────────────────────────────────────────┘
```

Inbox = persistent left rail on desktop. Hidden on mobile (back arrow replaces it).

---

## 2 · The header — line by line

### Row 1 (44px) — identity
- **Back arrow** (mobile) / chevron (desktop).
- **Title:** project name, single ellipsis.
- **Right edge:** ONE primary status pill — "Inquiry" / "Offer sent" / "Booked" / "Today" / "Wrapped". **Tap → Status sheet** with all 4 status families (see §8). Kills the 4-dot pill row.
- **Right edge admin-only:** "Move to ▾" stage-transition dropdown.

### Row 2 (28px) — context line
Inline string: `via Impronta · Aug 14 · Tulum`. Each segment is tap-targeted:
- Workspace name → Workspace sheet.
- Date → Event tab.
- Venue → Maps sheet.
- Source chip (DIRECT / HUB / PITCH / etc.) on the right edge.

### Row 3 (36px) — the at-a-glance trio
This row delivers "see quickly who are the talents, the offers, info of the event."

- **Left half:** overlapping avatar stack (up to 5 circles, then `+N`), then "N talents". Tap → **Lineup sheet** (mobile) or jump to Lineup tab (desktop).
  - Coordinator avatars carry a **star overlay**.
  - Confirmed talents: green dot. Declined: dimmed at 40%.
- **Right half:** offer chip with state tone. Formats:
  - `No offer yet` (gray)
  - `€2,400 · draft` (gold)
  - `€2,400 · sent` (indigo)
  - `€2,400 · accepted` (green)
  - `€2,400 · paid` (green deep)
  - Talent: shows their personal cut (`Your line: €1,800 · sent`).
  - Client: shows what they pay (`You pay €2,400`).
  - Tap → Offer sheet (or Offer tab on desktop).

The current "Live lineup (3) inquiry_participants" band gets folded *into row 3*. Same data, one-third the pixels.

---

## 3 · Tabs

### The 5 tabs (universal, every role)

| Order | Label | Default? | Purpose |
|---|---|---|---|
| 1 | **Chat** | yes, landing tab | Conversation (with sub-toggle inside) |
| 2 | **Lineup** | — | Who's on this thing + add/remove (when authorized) |
| 3 | **Offer** | — | Money + line items + send/accept/counter actions |
| 4 | **Event** | — | When/Where/Transport/Lodging/Call sheet/Activity |
| 5 | **Files** | — | Attachments + briefs + signed contracts |

### Chat tab sub-toggle

The Chat tab has a small segmented toggle at the top of the conversation pane. Visibility depends on the actor's relationship to the inquiry.

```
┌─────────────────────────────┐
│ ⌜ Client │ Group │ DM ⌝     │   sub-toggle (32px) inside Chat tab
└─────────────────────────────┘
```

Per role, default + lock state:

| Role | Default thread | Client tab | Group tab | DM tab |
|---|---|---|---|---|
| Admin (owner/staff) | Client | ✅ | ✅ | ✅ |
| Coordinator | Client | ✅ | ✅ | ✅ |
| Talent (not coord) | **Group** | 🔒 + "Request to join as coordinator" | ✅ | ✅ DM w/ coord only |
| Talent-coord | Client | ✅ | ✅ | ✅ |
| Client | Client (only) | (only, no toggle shown) | hidden | DM w/ coord only |

### Tab naming — locked decisions

- "Client thread" → **Client** (sub-toggle inside Chat).
- "Talent group" → **Group**.
- "Lineup" — universal, no per-POV rebrand (no "Booking team", no "Your team").
- "Project" + "Details" → **Event** on every role.

---

## 4 · Thread governance — system primitives

Threads are not loose chat rooms. They are typed primitives with engine-enforced access rules.

### 4.1 Client Thread
- **Participants:** client + admin + approved coordinators.
- **Purpose:** sales · client questions · offer negotiation · approvals · payment · client-facing logistics.
- **Talent visibility:** none, unless upgraded to coordinator.
- **Special property:** joining this thread *is* the coordinator-upgrade trigger.

### 4.2 Talent Group Thread
- **Participants:** admin + coordinators + assigned talent.
- **Purpose:** internal lineup coordination · availability · rate collection · call time · prep · execution.
- **Client visibility:** never.
- Talent lands here by default on Chat.

### 4.3 Direct Message (DM) Thread
- Admin/coordinator can DM any participant.
- Talent can DM coordinator (and only coordinator) unless they themselves are upgraded.
- Client can DM coordinator (and only coordinator).
- No talent ↔ client DM unless a future "approved client-talent DM" feature ships (not in this plan).

### 4.4 System Activity / Event Log (not a chat room)
- Renders inside Event tab as **"Activity"**.
- Shows structured events: talent added · offer sent · client approved · payment received · call sheet updated · coordinator joined · file uploaded.
- Read-only. Auto-generated. Engine-emitted.

---

## 5 · Structured message cards

The conversation is NOT plain text-only. Specific workflow moments render as cards inside the chat, role-aware, deep-linkable.

| Card type | When emitted | Role-aware variants |
|---|---|---|
| **Plain text** | manual send | identical across roles |
| **File attachment** | upload | preview thumb + filename + size |
| **Offer card** | offer sent / countered / accepted / declined | admin sees breakdown; talent sees own line; client sees gross + line items |
| **Payment request card** | admin sends payment request OR Stripe checkout link | client = "Pay now" CTA; admin = "Mark paid manually" |
| **Talent availability response** | talent accepts/holds/declines | shows talent identity + state |
| **Talent rate submission** | talent submits / counters their rate | shows amount + unit + note |
| **Coordinator request card** | talent requests to join Client thread | approvers (admin/coord/client) get approve/decline inline |
| **Call sheet update card** | call sheet edited | "Call sheet updated · open" deep-links to Event tab |
| **Booking status update** | stage transition | shows old → new stage |
| **System event** | engine-emitted (talent added, etc.) | compact gray bubble |
| **Internal note** | coord/admin posts a note | indigo tone, visible only to staff/coords |

**Acceptance:** the user can understand and act on the workflow without leaving the conversation. Cards deep-link to the right tab/sheet where deeper editing happens.

---

## 6 · Permission matrix — engine-enforced

Every action below is **enforced server-side**, not only hidden in UI. UI hides for clarity; the engine denies for security.

| Action | Admin/Owner | Coordinator | Talent | Talent-coord | Client |
|---|---|---|---|---|---|
| See Client thread | ✅ | ✅ | ❌ | ✅ | ✅ |
| Send to Client thread | ✅ | ✅ | ❌ | ✅ | ✅ |
| See Talent Group thread | ✅ | ✅ | ✅ if invited | ✅ | ❌ |
| Send to Talent Group thread | ✅ | ✅ | ✅ if invited | ✅ | ❌ |
| DM coord | ✅ | (self) | ✅ | ✅ | ✅ |
| DM client | ✅ | ✅ | ❌ | ✅ | (self) |
| DM other talent | ✅ | ✅ | ❌ | ✅ (when coord) | ❌ |
| Add/remove talent on Lineup | ✅ | ✅ | ❌ | ✅ | ❌ |
| Approve coordinator request | ✅ | ✅ | ❌ | ✅ | ✅ (for inquiries they own) |
| Draft / edit offer | ✅ | ✅ | ❌ | ✅ | ❌ |
| Send offer to client | ✅ | ✅ | ❌ | ✅ | ❌ |
| Approve / counter / decline offer | ❌ (client side) | ❌ | ❌ (only own rate) | ❌ (only own rate) | ✅ |
| Counter own rate | ❌ | ❌ | ✅ | ✅ (the talent line) | ❌ |
| Edit call sheet | ✅ | ✅ | ❌ | ✅ | ❌ |
| Upload files | ✅ | ✅ | ✅ (own work) | ✅ | ✅ (brief, references) |
| See gross payment details | ✅ | ✅ | ❌ | ✅ | ✅ (own) |
| See commission splits | ✅ | ✅ | ❌ | ✅ (own share visible) | ❌ |
| Mark booking wrapped | ✅ | ✅ | ❌ | ✅ | ❌ |

**Implementation rule:** every server action validates via `requireStaffTenantAction` or participant-role check before touching the engine. UI hiding is a clarity layer, not a security layer.

---

## 7 · Coordinator model

**Core rule:** *Anyone who chats with the client on a given inquiry IS a coordinator of that work.* Coordinator is a derived role from being in the Client thread. It is not a separate job title — it is a function on a particular inquiry.

### 7.1 Coordinator powers
- Assign / remove talent on Lineup.
- Draft / edit / send offers.
- Approve incoming counters.
- Manage event logistics + edit call sheet.
- Receive commission on the booking (workspace fee share per `coordinator_pct`).

**A coordinator does NOT have to attend the event.** They can take commission and never be on set.

### 7.2 Coordinator join request — flow + lifecycle states

1. Talent taps the locked Client sub-toggle.
2. Request sheet asks for a short pitch ("Why join? You'll see + reply to client, manage lineup, earn commission.").
3. On submit → `coordinator_join_request` row written with state `pending`. Notification fanned out to existing coords + admins + client.
4. Approver (any existing coord OR admin/owner OR client) approves or declines from inline card or notifications tray.
5. Engine flips `inquiry_participants.role` to include `coordinator` on approve. Emits `coordinator_joined` activity event. Talent's UI: Client sub-toggle unlocks, coord star overlays their avatar in the stack.

### 7.3 Lifecycle states (explicit)

| State | Meaning | Who sees what |
|---|---|---|
| `pending` | request submitted | requester: "Request sent"; approvers: actionable pending card |
| `approved` | request granted; talent upgraded to coord | requester: unlocked Client; approvers: silent record |
| `declined` | request denied | requester: subtle "Not approved yet" (low-friction, not publicly embarrassing); approvers: silent |
| `cancelled_by_requester` | talent withdrew their own request | requester: cleared; approvers: pending card disappears |
| `revoked_after_approval` | admin/coord stepped them down | requester: notified privately; lineup star removed |

### 7.4 Commission rules — conflict handling

When commission changes during inquiry lifecycle:

| Coord joins / changes | Commission consequence | Approval gate |
|---|---|---|
| Before offer is sent | Can be included in commission split; default re-balances by even-split | No gate (admin/coord can configure) |
| After offer is sent, before payment | Admin must confirm whether split changes; if changed, send revised offer card to client | Admin approval |
| After payment cleared | Changing split requires admin approval AND creates an audit event | Admin approval + audit log |
| Coord removed | If pre-offer: no impact; if post-payment: earned commission remains by default (admin can override) | Admin override required to claw back |
| Talent-coord earnings | Always two clear lanes: **talent payout** (from talent line) + **coordinator commission** (from workspace fee share). Engine snapshot enforces this. | No gate beyond initial offer drafting |

The header offer chip on talent-coord shows both: `Your line: €1,800 · +€240 coord`.

---

## 8 · Status model — 4 connected families

One primary pill in the header. Status sheet (opened from the pill) exposes all four families with their dates + responsible party + next recommended action.

### 8.1 Inquiry / booking stage
`Inquiry` → `Offer sent` → `Booked` → `Today` → `Wrapped`. Branch: `Cancelled` at any point.

### 8.2 Offer status
`No offer` → `Draft` → `Sent` → `Countered` ↔ `Accepted` / `Declined` / `Expired`.

### 8.3 Talent participation status
Per talent: `Invited` → `Hold` / `Accepted` / `Declined` → `Confirmed` → `Removed`.

### 8.4 Payment status
`Not requested` → `Requested` → `Partially paid` / `Paid` → `Refunded` / `Failed`.

### 8.5 Header pill = primary derived signal

| Pill shown | Derived from |
|---|---|
| "Inquiry" | stage = inquiry AND no offer yet |
| "Offer sent" | stage = inquiry AND offer = sent |
| "Booked" | stage = booked (offer accepted) AND payment ≠ paid |
| "Today" | stage = booked AND event date = today |
| "Paid" | stage = booked AND payment = paid |
| "Wrapped" | stage = wrapped |
| "Cancelled" | stage = cancelled |

---

## 9 · Role variations — exhaustive matrix

| Region | Admin/Owner | Coordinator | Talent | Talent-coord | Client |
|---|---|---|---|---|---|
| Title prefix | bare project | bare project | "X inquiry" | bare project + "Coord" tag | bare project |
| Status pill | full stage palette | full stage | own talent status overlay | full + own talent dot | full stage |
| Header avatar stack | all (coord star) | all + self star | lineup minus self + self badge | all + own coord star | all + coord stars |
| Header offer chip | gross + workspace fee subhint | gross + own commission subhint | own line rate + payout state | own line + own coord cut | gross they pay |
| Chat default | Client | Client | Group | Client | Client (only) |
| Chat sub-toggle | C/G/D all ✅ | same | G ✅ · C 🔒 · DM ✅ | same as admin | none |
| Lineup actions | add · drag · remove · reassign coord | same | read-only | add/remove others; read-only on self | read-only |
| Offer actions | draft · edit · send · adjust workspace fee · adjust coord splits | draft+send+adjust own commission | accept · decline · counter own rate | both | approve · decline · counter |
| Event edits | all + call sheet | same | none (read-only) | schedule + logistics + call sheet | none (read-only) |
| Files upload | yes | yes | yes (own work) | yes | yes (brief, refs) |
| Bottom ribbon prompt | "Reply to client" / "Draft offer" / "Send to client" / "Open call sheet" | same | "Accept · Hold · Decline" / "Send your rate" | role-aware, whichever owed first | "Approve · Decline · Counter" / "Open payment" |
| Bottom ribbon ephemeral? | ✅ (Slice 2) | ✅ | ✅ | ✅ | ✅ |

### 9.1 Client trust layer (non-negotiable copy rules)
Client must feel they are not entering a chaotic chat. Specifically:
- **"Your coordinator" section** in header sheet — single human face, name, "Message" CTA.
- **Verified workspace/agency identity** — the workspace badge (Free/Studio/Agency/Network color palette).
- **"What happens next" mini-timeline** — auto-generated from current stage + 4-status family.
- **Offer summary** with transparent totals (gross, no internal fee breakdown).
- **Payment status** + receipt access.
- **Event plan / call sheet** in plain language — no internal terms.
- **NEVER expose** `inquiry_participants` · `workspace_fee` · `coordinator_pct` · engine state names · commission internals to the client.

### 9.2 Talent trust layer
Talent needs clarity + safety. The shell must answer:
- Who invited me? (coordinator card visible)
- What is the job? (Event tab plain-language)
- What is my rate? (Offer chip + Offer tab line)
- Am I confirmed or only shortlisted? (participation status pill)
- Who is the coordinator? (coord card)
- When do I get paid? (payment status + payout schedule)
- What do I need to prepare? (call sheet + checklist)
- Can I ask a question without bothering the client? (Group thread is default, DM coord available)

Talent should **never feel forced to talk to the client** to participate.

---

## 10 · Inbox operational logic — "Needs Me"

The inbox is not a chronological message list. It is an operational queue ordered by what's actually waiting for the viewer.

### 10.1 Filter chips (all roles, role-aware)

| Chip | Admin/coord | Talent | Client |
|---|---|---|---|
| **Needs Me** | inquiries with `nextActionBy = coordinator` | invited / offer pending / approval needed | offer waiting / payment due |
| **Waiting on Talent** | `nextActionBy = talent` | (not shown) | (not shown) |
| **Waiting on Client** | `nextActionBy = client` | (not shown) | (not shown — that's themselves) |
| **Offer Draft** | offers in `draft` | (not shown) | (not shown) |
| **Payment Pending** | bookings requested / not paid | (not shown) | offer accepted, awaiting their payment |
| **Today** | events with date = today | events with date = today | events with date = today |
| **At Risk** | overdue SLA · payment failed · declined offer · stalled inquiry | (not shown) | offer expired soon |
| **Wrapped** | archive | archive | archive |
| **All** | everything | everything | everything |

### 10.2 Inbox row content

Each row shows the **next required action of the viewer**, not just the last message. Example:

| Today | Row |
|---|---|
| 2h | QA Client Co · *Awaiting your reply to client* · Inquiry · 2 unread |
| 1d | Vogue MX · *Send offer to client* · Coordinating · 0 unread |
| 1d | Aesop · *Talent rate submission expected* · Inquiry · 1 unread |

This replaces "last message preview" as the primary content. Last message is secondary.

---

## 11 · Full lifecycle — inquiry → wrapped

Every stage maps to a specific header state + ribbon verb + tab badge for each role.

| Stage | Status pill | Admin ribbon | Coord ribbon | Talent ribbon | Talent-coord ribbon | Client ribbon |
|---|---|---|---|---|---|---|
| 1 Inquiry created | Inquiry | "Add talent to lineup" | same | (not invited yet) | (not invited yet) | "Shortlist forming, no action" |
| 2 Talent invited | Inquiry | "Waiting on N talents" | same | "Accept · Hold · Decline" | same + secondary "Manage lineup" | "Shortlist forming" |
| 3 Talent accepts / submits rate | Inquiry | "All talent confirmed → draft offer" | same | "Waiting on coord to package offer" | merged | "Shortlist forming" |
| 4 Admin drafts offer | Inquiry | "Send offer to client" | "Send offer to client" | "Your line in draft" | both | "Coord is preparing your offer" |
| 5 Offer sent | Offer sent | "Awaiting client response" | same | "Offer with client" | "Offer with client" | "Approve · Decline · Counter" |
| 6 Client approves | Booked | "Open call sheet" | same | "Booked — open event" | both | "Open call sheet" |
| 7 Payment | Booked | "Send payment request" → "Paid · payout scheduled" | same | "Payout pending" | "Payouts pending (talent + coord)" | "Pay now" → Stripe checkout |
| 8 Shoot day | Today | "Open call sheet · contact talent" | same | "Today's call sheet" | same | "Today's plan" |
| 9 Wrapped | Wrapped | "Mark payout ready" | same | "Payment cleared" | "Payments cleared (both lanes)" | "Receipt · invoice" |

---

## 12 · Event tab — operational truth source

The Event tab is where the booking is actually executed. Must include:

- **Event date/time** (with timezone)
- **Venue / location / map** (with Maps deep-link)
- **Call time** (talent's onsite arrival)
- **Contact person onsite** (with phone + DM CTA)
- **Dress code / preparation notes** (free-form, talent-visible)
- **Transport / parking / access** instructions
- **Talent lineup** (read-only reference; full edit is on Lineup tab)
- **Client-facing schedule** (what the client sees on shoot day)
- **Internal notes** (coord-only, hidden from talent + client)
- **Activity feed** (Slice 4 already shipped on admin; lifts to all roles)
- **Call sheet** (Slice B2 editor; admin/coord edit, talent/client read)
- **Emergency contact**
- **Files relevant to execution** (sub-section, deep-link to Files tab)

---

## 13 · Notifications

### 13.1 Critical events that always notify

| Event | Notify |
|---|---|
| Client sends message | admin + coords |
| Talent accepts / holds / declines | admin + coords |
| Talent submits rate / counters | admin + coords |
| Offer sent | client (primary) |
| Client approves / counters / declines offer | admin + coords |
| Payment completed / failed | admin + coords + client |
| Coordinator request submitted | existing coords + admins + client |
| Coordinator request approved | requester + lineup |
| Call sheet updated | all participants on that booking |
| Booking date is today | all participants |
| Talent has not responded after N hours | admin + coords (escalation) |
| Client has not approved after N hours | admin + coords (nudge to follow up) |

### 13.2 Notification channels — staged rollout

| Channel | When | Status |
|---|---|---|
| In-app (bell) | always | shipped (A9) |
| Email | important events only (offer sent, approved, payment, today) | needs RESEND_API_KEY (B8, ops-blocked) |
| WhatsApp / SMS | future paid layer (Phase D+) | not in scope this plan |

### 13.3 Unread + read receipts

Add explicit read state:
- Message read by participant.
- Client has seen offer.
- Talent has seen call sheet.
- Coordinator has seen client reply.
- Admin has seen urgent risk.

Surfaces in inbox row ("●  unread") and per-message ("Seen at 14:32"). Optional per privacy prefs (existing `readReceiptsEnabled` field, see `lib/server-actions/user-prefs.ts`).

---

## 14 · Search and memory (later phase)

When the system grows, users need retrieval. Sequenced as **Slice S** below.

- Search messages
- Filter files
- Jump to offer / call sheet / payment / client approval
- AI summary: "What is still missing?" (forward-looking, not blocking)

---

## 15 · Empty / error / edge states

No generic "No data" boxes. Every tab has a designed empty state with copy + primary CTA. Specific states required:

- No messages yet
- No talents assigned
- No offer yet
- Offer expired
- Payment failed
- Talent removed after offer sent
- Coordinator removed
- Client cancelled
- Event date changed
- File upload failed
- Offline / reconnecting
- Permission denied (friendly: "This thread requires coordinator status. Request to join?")

---

## 16 · Audit log

Because bookings involve money + approvals + commission, every critical action is auditable. Engine writes structured audit rows for:

- Offer created / edited / sent / accepted / declined
- Client approved / countered / declined
- Payment requested / paid / refunded
- Talent added / removed
- Coordinator added / removed
- Commission split changed
- Call sheet changed
- Booking marked wrapped / cancelled

The Event tab → Activity subsection renders a user-friendly view of the same data. The backend audit table retains full detail (who, when, before/after diff) for compliance.

---

## 17 · Analytics — product success metrics

Track so the product owner knows if Messages is working:

- Time from inquiry to first reply
- Time from inquiry to lineup ready
- Time from offer sent to client approval
- Talent response rate
- Client approval rate
- Payment completion rate
- Number of coordinator requests · approval rate
- Bookings requiring admin intervention
- Messages per booking
- Abandoned inquiries
- Mobile usage rate

Emit via the existing event pipeline (`logInquiryActivity`-equivalent on engine side). Dashboard surfaces under Operations parent page (out of Messages scope, but the emit hooks land here).

---

## 18 · Localization, currency, timezone

- Currency display by workspace + client context (engine already supports `currency_code` per offer).
- Event timezone visible in Event tab (auto-detect from venue or pin to workspace tz).
- Localized date formatting per `default_locale`.
- Multi-language-ready labels (already wired via `createTranslator`).
- Client-facing copy: simple, translatable, no internal jargon.

---

## 19 · Accessibility + mobile polish — acceptance rules

Mobile-first non-negotiables:

1. **All tap targets ≥44×44px** — no exceptions. Hitbox can extend invisibly beyond visual.
2. **Composer works with mobile keyboard** — rises with iOS keyboard, auto-scrolls thread to latest.
3. **Safe-area respected** — `env(safe-area-inset-bottom)` on sticky bars.
4. **Focus states visible** — keyboard navigation across all interactive elements.
5. **Screen reader labels** for tabs, buttons, status chips, avatar overlays.
6. **Color is not the only status indicator** — pair with icon or text.
7. **Reduced-motion support** — `prefers-reduced-motion` disables transitions on sheets/tabs.
8. **No hover-only affordances** — every hover state has a tap equivalent.
9. **No horizontal scroll** except the pill-tab strip.
10. **Sheet pattern, not modal** — `<Sheet>` from primitive handles desktop side-drawer + mobile bottom-sheet.
11. **iOS pinch-zoom disabled** inside conversation pane.
12. **Pull-to-refresh** on Chat tab on every role.

---

## 20 · Prior 24-hour work — wiring map

Nothing built recently gets thrown away. Every commit has a home.

| Prior work | Wired into |
|---|---|
| Stripe Connect commission engine (Phase B PR 3, commits `2f63f41d` + `eda3002b`) | Offer tab breakdown (gross / workspace / talent + coord splits); Client "Pay now" on Chat ribbon at Stage 7; webhook drives status pill to "Booked" + offer chip to "paid" auto |
| Call sheet editor (B2) | Event tab → Call sheet subsection; admin "Open editor" link; talent read-only summary; client shoot-day plan |
| Triage queue (A7) | Inbox filter chips (already shipped); "Needs Me" is the triage queue surfaced |
| Ephemeral action bar (Slice 2 this chat) | Bottom ribbon on all 3 roles. Already cross-POV. |
| Compact lineup avatar strip (Slice 1 this chat) | Header row 3 avatar stack on every role (re-homed from current standalone band) |
| Last activity feed (Slice 4 this chat) | Event tab → Activity subsection on all roles |
| Project tab dedupe (Slice 3 this chat) | Becomes Event tab; dedupe lands on talent + client too |
| Notifications bell (A9) | Header status pulse + inbox row badge (existing) + coord-join-request notifications (NEW) |
| Realtime refresh (B10) | Already on client thread; admin + talent threads get the same channel |
| Inquiry-received email (B8, ops-blocked) | Independent of UI; surfaces when env unblocks |
| Stripe live ops (memory: pending) | Independent; shell works test + live identically |
| Stripe Connect onboarding (talent side, was "PR 4 parked") | Slice K — talent Settings → Payouts + inline Offer-tab prompt when accepted-and-not-KYC'd |
| Hybrid talent×workspace (was "Phase X") | Slice L — talent-coord IS the first concrete hybrid implementation |
| Pitch feature | Pitches generate inquiries → first message in Chat is pre-seeded with pitch context; Slice M wires the inquiry-origin |
| Roster | Lineup tab "Add talent" already wires to existing picker |
| Calendar | Booked inquiries auto-create calendar entries; no Messages change |
| User prefs (`marketingEmailOptOut`, `readReceiptsEnabled`, `showPhone`, `dmControls`) | Read-receipt + DM-control plumbing in §13 + §6 |

---

## 21 · The 18-slice rollout

Each slice ends with a commit + browser-verified screenshot as the relevant role. No slice "shipped" until watched.

### Phase A — Core consolidation (~13h, 5 slices)

| # | Slice | Touches | Effort | Verifiable win |
|---|---|---|---|---|
| **A** | Admin header rebuild: 3-row header (Status + via + avatars + offer chip); kill 4-dot pill row; absorb Live lineup band | `messages.tsx` | 2h | Chrome drops ~220 → ~108px |
| **B** | Admin tab rename + Chat sub-toggle: Client / Group / DM; Lineup tab #2; Project → Event | `messages.tsx` | 2h | New tab vocabulary live |
| **C** | Talent surface gets universal shell: same 3-row header; Booking team → Lineup; Details → Event; header offer chip; avatar stack | `InboxShell.tsx`, talent `[id]/page.tsx` | 4h | Talent visually identical to admin (role-aware content) |
| **D** | Client surface gets universal shell: same 3 rows; chip; stack; via ReservationThread primitive with shared Header | `ClientThreadAdapter.tsx`, primitive Header | 3h | All 3 visually consistent |
| **E** | Action ribbon polish + verbs: Slice 2 ephemeral fix lands on talent + client; verb table from §9 enforced | shared `ShellNextActionBar`, talent + client | 2h | Consistent role-aware verbs, all dismissible |

### Phase B — Coordinator model + thread governance (~16h, 4 slices)

| # | Slice | Touches | Effort | Verifiable win |
|---|---|---|---|---|
| **F** | Coord-request schema + engine: `coordinator_join_requests` table with 5 lifecycle states (§7.3); RPCs (request, approve, decline, cancel, revoke); `inquiry_participants.role` upgrade path; notification emits | new migration, engine module, server actions | 4h | DB + actions ready; no UI yet |
| **G** | Coord-request UI: locked Client sub-toggle on talent shell; request sheet; approver badge in Lineup tab; approve/decline sheet for coords + admin + client; coord star on avatar stack; permission-denied friendly states | shared coord-request component plumbed into talent + admin + client shells | 5h | Talent can request, approve flow works, role flips live |
| **N** | Thread governance + server-side permissions hardening: enforce permission matrix (§6) on every relevant RPC; permission-denied returns friendly error states; engine validates participant role for every read/send | engine permission helpers, server actions, RPC policies | 4h | Talent cannot read Client thread server-side; client cannot read Group; tests pass |
| **H** | Commission UI for talent-coord: Offer drafter shows talent-coord as both line item and commission slider; talent-coord header chip shows both totals; conflict-handling per §7.4 | offer drafter UI, header chip render | 3h | Sofia sees `Your line: €1,800 · +€240 coord`; mid-flow commission change creates audit row |

### Phase C — Cards, status sheet, notifications, mobile (~16h, 4 slices)

| # | Slice | Touches | Effort | Verifiable win |
|---|---|---|---|---|
| **O** | Structured message cards (§5): offer card, payment request card, coord request card, talent availability card, call sheet update card, system event card; role-aware rendering; deep-links to tabs/sheets | new `<ChatCard>` family + emit hooks in engine | 5h | Cards render in chat with concrete actions, no plain-text workflow events |
| **P** | Status sheet + 4-family status model (§8): single primary pill in header opens sheet showing all 4 status families with dates + responsible party + next action | new `<StatusSheet>` + 4-derivation helpers | 3h | Tap pill → full status breakdown sheet |
| **Q** | Notifications + unread + "Needs Me" reliability (§13): inbox row shows next-action not just last message; critical workflow events route to correct role; read-receipt + DM-control prefs honored | inbox row renderer, notification dispatcher, prefs read | 4h | Inbox sorts by operational urgency; critical events never get buried |
| **I** | Mobile shell: `<Sheet>` adoption for Lineup/Offer/Event on mobile; pill-tab horizontal scroll; iOS safe-area + keyboard handling; pull-to-refresh; tap-target audit | all 3 surfaces + `<Sheet>` primitive | 4h | Mobile consistent across roles, thumb-zone correct |

### Phase D — Lifecycle, audit, role QA (~12h, 3 slices)

| # | Slice | Touches | Effort | Verifiable win |
|---|---|---|---|---|
| **J** | Lifecycle wiring sweep: verify each stage 1→9 (§11) lights right pill + ribbon verb + tab badge for every role; Stripe checkout sheet on Chat ribbon Stage 7 client-side | cross-cutting | 5h | Full inquiry-to-wrapped is one fluid surface across all 5 roles |
| **R** | Mobile QA + role walkthrough: real-device test for admin / coord / talent / talent-coord / client; full lifecycle every role; fix all issues found; deliver report with screenshots | testing pass + targeted fixes | 4h | Each role can complete its full lifecycle on mobile, no blockers |
| **AUDIT** | Audit log + analytics emits (§16 + §17): every critical engine action writes audit row; analytics events emit through standard pipeline; dashboard hookable later | engine audit module, analytics emit helpers | 3h | Compliance + product-success measurable |

### Phase E — Adjacent surfaces (~18h, 3 slices)

| # | Slice | Touches | Effort | Verifiable win |
|---|---|---|---|---|
| **K** | Talent-side Stripe Connect onboarding (was "PR 4 parked"): talent Settings → Payouts; inline prompt in Offer tab when accepted-and-not-KYC'd; new talent-keyed helpers in `lib/payments/stripe-connect.ts` | new helpers, talent settings page, offer-tab prompt | 6h | Talent connects bank; offer payout works end-to-end |
| **L** | Hybrid identity formalization (was "Phase X"): top-nav talent⇄workspace toggle; talent-coord is the proof-of-concept; supports talent who owns Free studio AND coordinates on others' workspaces | top-nav, identity router, pref persistence | 8h | One human, one login, switches mental model cleanly |
| **M** | Pitch feature inquiry-origin wiring: pitch-generated inquiries open with pre-seeded context in Chat; pitch link in Event tab; pitch CTA on conversion | inquiry creation hook, Chat tab pre-seed render, Event tab pitch surface | 4h | Pitch → inquiry → booking is one fluid funnel |

### Phase F — Polish + retrieval (~6h, 1 slice)

| # | Slice | Touches | Effort | Verifiable win |
|---|---|---|---|---|
| **S** | Search + memory inside conversation (§14): in-thread message search; file filter; jump-to-offer/call-sheet/payment/approval; opt-in AI summary "What is still missing?" | new search component, AI summary endpoint (stubbable) | 6h | Users can retrieve workflow history without leaving thread |

**Total: ~81 hours of focused work, 18 commits.** Each verifiable in browser as one of 5 roles.

---

## 22 · Locked product decisions

These are PO calls. They are NOT open for re-debate inside this plan.

| # | Decision |
|---|---|
| 1 | Final tab naming: **Chat · Lineup · Offer · Details · Files**. Chat sub-toggle [Client \| Group \| DM] |
| 2 | Kill 4-dot status pill row; one chip on right edge opens Status sheet with 4 status families |
| 3 | Header offer chip on all roles, role-appropriate amount + tone |
| 4 | "Lineup" universal tab name across roles |
| 5 | Merge "Project" + "Details" into **Event** |
| 6 | Coordinator = derived role from being in Client thread |
| 7 | Talent → coord upgrade is request flow with 5 lifecycle states; approval from any of: existing coord, admin/owner, client |
| 8 | Coord does NOT have to attend event; takes commission regardless |
| 9 | Talent-coord working event paid **both lanes** (talent line + workspace commission share) |
| 10 | Thread access enforced **server-side**, not just UI |
| 11 | Structured cards for offer · payment · coord request · talent rate · call sheet · system events — not plain text |
| 12 | Status model has **4 connected families**: inquiry stage · offer status · talent participation · payment |
| 13 | Client never sees internal terms (`inquiry_participants`, `workspace_fee`, `coordinator_pct`) |
| 14 | Talent never forced to talk to client to participate |
| 15 | Inbox sorts by operational urgency, not chronology; "Needs Me" is the primary filter |
| 16 | Notifications staged: in-app first → email second → SMS/WhatsApp later |
| 17 | Read receipts + DM-controls honor existing user prefs (`readReceiptsEnabled`, `dmControls`) |
| 18 | Audit rows written for every money/approval/coord-change event |
| 19 | All tap targets ≥44×44px; mobile is default canvas |
| 20 | Rollout order: A → S (Phase A core → B coord+threads → C cards+mobile → D lifecycle+QA → E adjacent → F polish) |
| 21 | Adjacent surfaces (Stripe talent onboarding, hybrid identity, pitch origin) **sequenced**, not excluded |

---

## 23 · What this plan does NOT touch

Genuinely out: items unrelated to inquiry-to-booking flow.

- Workspace Settings beyond Payouts (separate parent)
- Roster grid redesign (separate parent)
- Site/CMS editor (separate parent)
- Pitch authoring UI itself (only inquiry-origin wiring is in scope, Slice M)
- Platform admin shell
- Marketing site
- WhatsApp / SMS channel (Phase D+ future paid layer)

If any of those become blockers during execution, surface them; never start them silently.

---

## 24 · Execution rules

For whichever session picks this up:

1. **No "should I?" questions on locked decisions** (§22). They're locked. Execute.
2. **Commit per slice.** Each commit message references the slice letter (e.g. `feat(messages slice F): coord-request schema + engine`).
3. **Browser-verify per slice** as the relevant role. Don't ship without watching it work.
4. **TS + lint clean before every commit.** Standard project gate.
5. **If a slice reveals a deeper bug** (e.g. engine breakage), fix in-line and note in commit. Don't park.
6. **If a slice expands beyond 8h**, split it. Each commit should be reviewable in <30 min.
7. **Phase E (K/L/M) only starts after Phase A-D are green.** Don't multi-track until core is shipped.
8. **No new design decisions without updating this doc first.** This doc is source of truth.
9. **Permission checks are engine-level.** Hiding UI is NOT permission enforcement. Every read/send must pass server-side validation.
10. **Mobile QA per role is mandatory before declaring Phase D done.** Slice R is a real testing pass, not a code change.

---

## 25 · Hand-off context for future sessions

If you are a fresh Claude session picking this up:

- This doc is your spec. Read top-to-bottom before touching code.
- Current state (2026-05-13): Phase A slices 1–4 partially shipped (admin only — see commits `3ff6e376`, `6362fedd`, `2cdc15a5`, `4890a6e8`). They need rework to match the final shell in §1 (current Slice 1 strip stays but moves into header row 3; Slice 3 dedupe is right but the tab rename needs to happen with it).
- Start with Slice A from §21.
- Memory pointer: `~/.claude/projects/-Users-oranpersonal-Desktop-impronta-app/memory/MEMORY.md` indexes this file.
- Key files:
  - Admin: `web/src/components/admin/shell/internal/messages.tsx` (~15k LOC)
  - Talent: `web/src/app/(workspace)/[tenantSlug]/talent/inbox/InboxShell.tsx` + `[id]/`
  - Client: `web/src/app/(workspace)/[tenantSlug]/client/inquiries/[id]/page.tsx` + `ClientThreadAdapter.tsx`
  - Shared primitive: `web/src/components/reservation-thread/`
  - Engine: `web/src/lib/inquiry/`, `web/src/lib/billing/commission*.ts`
  - User prefs: `web/src/lib/server-actions/user-prefs.ts`

---

## 26 · Developer instruction prompt (drop-in for any agent)

> Continue from the Messages Consolidation plan v2. Treat Messages as the reservation command center, not only a chat page. The universal shell must remain consistent across admin, coordinator, talent, talent-coordinator, and client, but each role must have correct visibility, permissions, wording, and financial presentation.
>
> Do not treat messaging-related surfaces as out of scope. Client chat, Talent Group chat, DM, coordinator request flow, offer cards, payment cards, event/call-sheet cards, unread states, notifications, and action ribbons are all part of the same reservation experience.
>
> First, audit the current admin, talent, and client message surfaces. Compare layout, spacing, header, tabs, information hierarchy, action ribbons, mobile behavior, thread access, and role-specific workflows. Identify every inconsistency, duplicated detail, wasted space, broken permission, unclear label, missing state, and mobile UX issue.
>
> Then execute the plan slice-by-slice (§21). Start with Slice A — universal shell and compact header. Then unify tab vocabulary. Then harden thread governance and permissions (engine-level, not UI). Then implement the coordinator request model with explicit lifecycle states. Then wire structured message cards, status sheet, unread logic, and lifecycle actions. Then mobile QA per role. Then adjacent surfaces.
>
> Core rules:
> - Conversation is the dominant surface.
> - Header answers who, what, when, where, how much in <4 seconds.
> - Chat has Client, Group, DM sub-threads. Talent sees Group by default; cannot access Client unless approved as coordinator.
> - Anyone approved into Client thread becomes coordinator for that inquiry.
> - Coordinator manages lineup, offers, logistics, commission — does not have to attend event.
> - Talent-coord who attends event earns both talent payout and coordinator commission.
> - Client never sees internal group chat or internal commission logic.
> - Every workflow moment must be a structured card or clear action, not loose text.
> - All permission checks enforced server-side, not only UI.
> - Mobile is default design canvas.
>
> Browser-test each role separately. Test full lifecycle: inquiry created → talent invited → talent accepts/holds/declines → offer drafted → offer sent → client approves/counters/declines → payment requested → payment completed → call sheet opened → booking wrapped. Verify header, tabs, thread access, action ribbon, notifications, status sheet are correct at every stage for every role.
>
> Deliver a report with screenshots, what was fixed, what remains, and any product gaps discovered.

---

## 27 · Final business recommendation

Do not build three different message dashboards. Build **one universal reservation shell with role-aware permissions**.

The winning product experience:

- **Client** feels guided and protected.
- **Talent** feels clear and not exposed to the client unless approved.
- **Coordinator** feels in control of the sale and execution.
- **Admin** sees every inquiry as an operational pipeline.
- **Mobile** feels like a premium messaging app.
- **The system** behaves like a real business workflow engine.
