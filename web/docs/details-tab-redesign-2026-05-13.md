# Details Tab — Binding redesign plan v3

**Status:** Execution-ready QA + redesign plan (supersedes the "Event tab" naming in plan v2 §3).
**Primary correction:** Rename `Event` → **Details** everywhere.
**Product principle:** The reservation/inquiry thread is the core product. Chat creates momentum, but the **Details** tab creates trust, clarity, conversion, and operational execution.

This doc is binding for the Details-tab redesign. It supersedes the
v2 plan's "Event" tab vocabulary while preserving the rest of the v2
universal-shell architecture (header, sub-toggle, action ribbon,
permission matrix, coord model, etc).

---

## 1 · Naming correction (immediate, mechanical)

| Old | New |
|---|---|
| `Event` (tab label + id) | **`Details`** (label; id stays `event` for back-compat) |
| `Project` (tab label) | **`Details`** |
| Universal tab strip | `Chat · Lineup · Offer · Details · Files` |

Section titles INSIDE the tab may still read "Job Details", "Booking
Details", or "Inquiry Details" as state-appropriate. The TOP-LEVEL
tab label is always **Details**.

**Acceptance check:** no top-level tab says `Event` or `Project` on
any of admin, talent, talent-coord, coordinator, or client surfaces.

---

## 2 · Core product rule

The **Details tab is the source of truth for the job**.

- **Chat** is where people communicate.
- **Lineup** is who is involved.
- **Offer** is money and approval.
- **Files** are supporting materials.
- **Details** is the canonical job record.

It must answer, at any stage:

> What is happening? Who is it for? When is it? Where is it? Who is
> needed? What is included? What has changed? What is missing? What is
> the next step?

---

## 3 · The 9 canonical sections (every role, role-visibility-gated)

The Details tab on all 5 roles uses the SAME 9-section structure.
Visibility is gated per role; structure does not change.

### 1. Status Summary
Stage chip · current state in one line · "Next action" CTA pointing
to the right surface (Lineup / Offer / Chat / payment).

### 2. Job Brief (Client Request)
Request title · description · category / talent type · talent count
requested · style / requirements · special notes · reference links ·
attachments.

### 3. Schedule
Date · start time · end time · duration · timezone · flexible-date
indicator · deadline to confirm.

### 4. Location
Venue · address · city / area · map · meeting point · parking /
access · remote/online flag.

### 5. People (Lineup Snapshot)
Client · coordinator(s) · invited / accepted / hold / declined talent
counts · on-site contact · talent gaps (when shortfall vs requested
count).

### 6. Offer & Payment (role-shaped)
- **Client:** what they pay · payment status
- **Talent:** their rate / payout · payout status
- **Talent-coord:** their rate + their commission both shown
- **Coordinator:** workspace fee + own commission
- **Admin:** full revenue breakdown (gross / workspace / talent /
  platform / coord splits)

### 7. Operational Requirements (Logistics)
Wardrobe · equipment · transport · lodging · meals · arrival time ·
rehearsal / prep time · on-site contact · client contact · emergency
notes.

### 8. Risk & Missing Info (admin/coord only)
Missing date · missing location · missing client approval · missing
talent confirmation · missing payment · missing call sheet · missing
payout setup · conflicting edits · unanswered client message · at-risk
flags.

### 9. Activity & Change Log
Who changed what · old → new · timestamp · actor role · reason / note
(when provided) · related chat message link (when applicable). Visible
to all roles but filtered by visibility scope.

---

## 4 · Role visibility + edit matrix

### 4.1 Field visibility (read)

| Section | Client | Talent | Talent-coord | Coord | Admin |
|---|---|---|---|---|---|
| Status Summary | ✅ | ✅ | ✅ | ✅ | ✅ |
| Job Brief | ✅ | ✅ | ✅ | ✅ | ✅ |
| Schedule | ✅ | ✅ | ✅ | ✅ | ✅ |
| Location | ✅ | ✅ | ✅ | ✅ | ✅ |
| People | ✅ (lineup names, no rates) | ✅ (lineup names, coord identity, own status) | ✅ (full) | ✅ | ✅ |
| Offer & Payment | client-side total only | own rate only | own rate + own commission | full | full |
| Operational Reqs | ✅ (client-facing parts) | ✅ (talent-facing parts) | ✅ | ✅ | ✅ |
| Risk & Missing Info | ❌ | ❌ | ✅ (when coord-active) | ✅ | ✅ |
| Activity Log | filtered: client_visible | filtered: talent_visible | both filtered scopes | coord+admin visible | all |

### 4.2 Field edit permissions (write)

| Field | Client | Talent | Coordinator | Admin |
|---|---|---|---|---|
| Client request / brief | ✅ | ❌ | ✅ | ✅ |
| Date / time | request change | ❌ | ✅ | ✅ |
| Location | request change pre-booking | ❌ | ✅ | ✅ |
| Talent lineup | ❌ | ❌ | ✅ | ✅ |
| Offer amount | counter / approve | counter own rate | ✅ | ✅ |
| Talent rate | ❌ | own only | ✅ | ✅ |
| Coord commission | ❌ | own visible only (talent-coord) | limited | ✅ |
| Logistics (client-owned) | ✅ | read-only | ✅ | ✅ |
| Files | ✅ | limited upload | ✅ | ✅ |
| Internal notes | ❌ | ❌ | ✅ | ✅ |
| Call sheet | read post-booking | read post-booking | ✅ | ✅ |

### 4.3 Every edit must write to activity

Each edit creates an activity row with:

```
actor_id · actor_role · field_group · field_key · old_value · new_value
· timestamp · visibility_scope · related_inquiry_id
```

Visibility scopes (drives which roles see the row in Activity):
`client_visible` · `talent_visible` · `coord_visible` · `admin_only`

---

## 5 · Inquiry → booking continuity

Details tab does NOT reset when the inquiry becomes a booking. It
**evolves**:

| Stage | Section emphasis |
|---|---|
| Inquiry | Request · Missing info · Talent needs · Offer prep |
| Offer | Offer summary · Client decision · Talent confirmation · Price |
| Booked | Execution · Call sheet · Arrival · Payment · Logistics |
| Wrapped | Receipt · Payouts · Files · Feedback · Rebooking |

**Acceptance rule:** no information disappears after conversion. It
either remains visible, moves into a booked-state card, or becomes
archived in Activity.

---

## 6 · Message ⇄ Details connection

The Details tab and Chat tab support each other.

### Required structured message cards
When these events happen, the engine emits a typed message into Chat
AND updates the Details cards:

- Inquiry created
- Client edited job details
- Coordinator edited job details
- Talent accepted / countered / declined
- Talent requested client-chat / coordinator access
- Coordinator request approved / declined
- Offer drafted / sent
- Client approved / countered
- Payment requested / completed
- Booking confirmed
- Call sheet updated
- Job wrapped

### Card behavior
Each card has: short human-readable summary · action button (when
relevant) · link to the right Details / Offer / Lineup section ·
role-aware copy.

Example:

> **Schedule updated**
> Maria changed the call time from 4:00 PM to 3:30 PM.
> [View Details]

---

## 7 · Trust + conversion improvements per role

### Client
"Your coordinator" card · "What happens next" · "Who is confirmed"
summary · "What you are paying for" · "Last updated" timestamp ·
payment confidence copy · approval confirmation · clean receipt /
invoice.

### Talent
"Your status" · "Your rate" · "What you need to know" · "Who to
contact" · "Changes since you accepted" · payout setup warning when
Stripe not enabled.

### Admin / Coordinator
Missing-info checklist · at-risk flags · revenue snapshot · talent
confirmation matrix · client decision status · internal notes ·
change log · last client activity · next best action.

---

## 8 · Layout

### Mobile-first (≤640px) — single column, cards in stack
Order: Status Summary → Job Brief → Schedule → Location → People →
Offer & Payment → Logistics → Files & References → Activity (collapsed).

### Desktop (≥1024px) — two columns
- **Left:** Status Summary · Job Brief · Schedule · Location · Logistics
- **Right:** People · Offer & Payment · Missing Info · Files · Activity

### Design rules
- Cards, not long flat text.
- One purpose per card.
- Edit action only when role allowed.
- Empty fields show friendly missing-state copy.
- Important missing fields surface as warning chips.
- All edits open sheets/drawers, never full-page navigation.
- Activity collapsed by default, always accessible.
- Client copy: simple, reassuring.
- Admin copy: operational.
- Talent copy: clear, action-oriented.

---

## 9 · Required test users + scenarios (for QA pass)

### Test users
- Workspace owner / admin
- Coordinator
- Talent (standard invited)
- Talent-coordinator (talent with client-chat access)
- Client (external inquiry view)

### Test inquiries
- New inquiry with missing info — empty states / missing flags
- Inquiry with 3 invited talent — lineup states
- Talent countered rate — offer / rate workflow
- Talent requested coordinator access — locked-thread approval flow
- Offer sent to client — client trust + approval
- Client countered offer — negotiation
- Client approved offer — booking conversion
- Payment pending — payment CTA
- Payment complete — confirmed booking state
- Day-of booking — call sheet + logistics
- Wrapped booking — receipt / payout / feedback

### Viewports
- 375×812 mobile
- 390×844 mobile
- 820×1180 tablet
- 1440×900 desktop

---

## 10 · QA checklist (universal Details tab)

- [ ] Tab is named **Details**
- [ ] Loads without errors on all 5 role surfaces
- [ ] Status summary, job brief, schedule, location, people,
      role-appropriate offer/payment, logistics, files, activity all
      present
- [ ] Missing information visible (warning chips)
- [ ] Role-locked information hidden per §4.1
- [ ] Edit actions only appear for authorized roles per §4.2
- [ ] Updates write to activity per §4.3
- [ ] Updates refresh across roles (realtime or revalidate)
- [ ] Mobile layout clean at 375
- [ ] Desktop layout clean at 1440
- [ ] No internal technical terms (no `inquiry_participants`,
      `workspace fee`, `coordinator_pct`, `commission snapshot`,
      `engine event`, `tenant`, `RPC`, `role upgrade`) ever shown to
      client

---

## 11 · Rollout sequence (binding execution order)

This is a multi-PR initiative. Execute in this exact order:

1. **Rename Event → Details globally** ← *done in commit landing this doc*
2. Audit client inquiry experience first
3. Audit same inquiry from admin perspective
4. Extract what info is missing or poorly organized in existing
   Project / Details tabs
5. Build the canonical 9-section Details component (shared across
   roles, role-visibility-gated)
6. Apply to:
   - Client
   - Talent
   - Talent-coordinator
   - Coordinator
   - Workspace Admin
7. Enforce role-specific visibility + edit permissions per §4
8. Wire every edit to inquiry_audit_log with field-level granularity
9. Ensure inquiry information carries into booking state per §5
10. Browser-test the full inquiry → booking lifecycle per §9
11. Fix errors immediately
12. Polish UX until premium, trustworthy, mobile-first
13. Deliver audit report with screenshots per §12 below

---

## 12 · Expected deliverables when this work ships

1. Before/after findings (what was broken / confusing / missing /
   redesigned)
2. Role-by-role audit report (client / talent / talent-coord / coord
   / admin)
3. Details tab redesign summary (data shown · role visibility · edit
   permissions · mobile + desktop behavior)
4. Fix log (files changed · components changed · schema changes ·
   permission changes · test data used)
5. Browser QA evidence (URLs tested · users tested · viewports
   tested · screenshots · console / network results · remaining
   issues)
6. Final product-owner notes (remaining risks · recommended polish ·
   what should not be changed again)

---

## 13 · Final acceptance standard

This work is accepted only when:

- A client can open the inquiry and trust the agency.
- A talent can open the inquiry and know exactly what job they are
  accepting.
- A coordinator can manage the client, talent, offer, and execution
  without leaving the inquiry surface.
- An admin can understand business status, revenue, risk, and next
  action.
- The Details tab remains useful from inquiry creation through
  booking completion.
- Mobile feels like the primary product, not a compressed desktop
  page.
- Every role sees the same product system with the right
  information for them.

---

## 14 · Status today (2026-05-13)

**Shipped in this commit:**
- Rename `Event` → `Details` in tab labels everywhere
- Plan v2 doc updated to reflect Details naming
- This doc (v3) lands in repo as the binding spec for the redesign

**Still pending (multi-session work):**
- 9-section canonical component (build + role gating)
- Field-level activity tracking schema
- 16 structured message-card emit hooks
- Edit-permission enforcement on every editable field
- Inquiry → booking continuity engine wiring
- Browser QA matrix across 5 roles × 4 viewports

**Recommended kickoff:** fresh focused session, Opus-high, read this
doc top to bottom + the existing plan v2 (`messages-consolidation-
plan-2026-05-13.md`) + audit handoff (`messages-pending-handoff-
2026-05-13.md`). Start at §11 step 4 (audit existing surfaces) and
work the 13-step rollout sequence.
