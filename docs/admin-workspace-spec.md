# Admin Workspace Spec

**Status:** Phase 1 — Admin Workspace UX Redesign
**Date:** 2026-04-18
**Owner:** Platform
**Scope:** Admin execution-layer workspace for inquiries and bookings. This spec governs the redesign from tab-first to communication-centered split workspace. Out of scope: multi-tenancy, CMS/page builder, new role systems, global notification center.

---

## 1. Product Model

### 1.1 Two-layer operating model

The admin operates in two distinct layers. They must not be confused.

| Layer | Surface | Purpose |
|---|---|---|
| **Decision Layer** | Admin queue | Triage. Pick the next inquiry to work on. |
| **Execution Layer** | Inquiry/booking workspace | All coordination, state changes, and messaging for one inquiry. |

Queue filters, status chips, and unread counts live in the Decision Layer. Everything else — roster changes, offers, approvals, messaging, booking conversion, post-booking adjustments — lives in the Execution Layer.

**Messaging is the center of the Execution Layer.** It is not the entire system, but inside the workspace it is always visible.

### 1.2 Inquiry model (locked)

- One inquiry per client request.
- One shared participant pool per inquiry (grouped by requirement group — see §3).
- Offers are per talent.
- Client approves per talent.
- Booking = the set of approved talent at conversion time.
- Booking is not terminal. Operations continue post-booking (substitutions, coordinator reassignment, messaging, cancellations).

---

## 2. Coordinator Model (locked)

**Coordinator is an assignment per inquiry/booking, not a base role.**

### 2.1 Structure

- **1 Primary Coordinator** — required, one per inquiry.
- **0..N Secondary Coordinators** — optional.

### 2.2 Who can be assigned

Any active user, drawn from:
- Agency admin
- Agency staff
- Talent (specifically, talent selected for the inquiry — a "leader talent")
- External assigned user (e.g. a trusted contractor)

A talent who is also a coordinator on the same inquiry remains in their talent participant row *and* appears as a coordinator. No duplicate identity — one user, two relationships to the inquiry.

### 2.3 Authority scope

Coordinators (primary and secondary) can:
- Manage roster (add/remove talent)
- Send and edit offers
- Handle approvals
- Convert inquiry to booking
- Manage booking adjustments post-conversion
- Participate in both threads

Authority is identical between primary and secondary for Phase 1. The distinction is **visual and organizational**, not permission-based.

### 2.3a Removal rule (NON-NEGOTIABLE)

**A primary coordinator cannot be removed directly.** Every inquiry must have exactly one primary at all times.

To remove a primary:
1. `promoteToPrimary({ userId: <replacement> })` — promotes another coordinator. Old primary is demoted to secondary.
2. `removeSecondaryCoordinator({ userId: <original primary> })` — now permitted.

Engine returns `{ success: false, reason: 'cannot_remove_primary' }` for any direct removal attempt of a primary. Enforced at the engine layer, not UI. UI hides the "Remove" control on the primary row as a UX cue.

### 2.4 UI requirements

- Primary coordinator is clearly highlighted wherever coordinators appear.
- Secondary coordinators are listed but visually lighter.
- Thread membership shows coordinator badge for all assigned coordinators. Primary is further distinguished (e.g. "Lead Coordinator" or bold).
- Assign/reassign controls live in the Coordinators rail panel (§5.2.4).

### 2.5 Defaults

- On inquiry creation, the primary coordinator defaults to the agency admin (or whoever `default_coordinator_user_id` setting resolves to — current behavior in `coordinator-assignment.ts`).
- Secondary coordinators are never auto-assigned.

### 2.6 SCHEMA BLOCKER — multi-coordinator

**Current state:** `inquiries.coordinator_id` is a single nullable `uuid` column. This supports only one coordinator per inquiry.

**Required change (Phase 1, before multi-coordinator UI):**

Introduce a join table:

```sql
create table inquiry_coordinators (
  inquiry_id uuid not null references inquiries(id) on delete cascade,
  user_id    uuid not null references auth.users(id) on delete restrict,
  role       text not null check (role in ('primary', 'secondary')),
  status     text not null default 'active'
             check (status in ('active', 'former_coordinator')),
  assigned_at timestamptz not null default now(),
  assigned_by uuid references auth.users(id),
  primary key (inquiry_id, user_id)
);

create unique index inquiry_coordinators_primary_unique
  on inquiry_coordinators (inquiry_id)
  where role = 'primary' and status = 'active';

create index inquiry_coordinators_inquiry_idx on inquiry_coordinators(inquiry_id);
create index inquiry_coordinators_user_idx    on inquiry_coordinators(user_id);
```

**Migration rules:**
1. Backfill: for every inquiry where `coordinator_id is not null`, insert a row `(inquiry_id, coordinator_id, 'primary', 'active')`.
2. Keep `inquiries.coordinator_id` during transition as the materialized "primary coordinator" pointer. Trigger keeps it in sync with the `primary`+`active` row. This avoids rewriting every read path at once.
3. After all read paths migrate to the join table (M8.2), drop the column.

**Validation queries (migration fails if any return rows):**
```sql
-- every inquiry that had a coordinator now has exactly one active primary
select inquiry_id from inquiry_coordinators
  where role = 'primary' and status = 'active'
  group by inquiry_id having count(*) <> 1;

-- no inquiry with coordinator_id set lacks an active primary row
select i.id from inquiries i
  left join inquiry_coordinators c
    on c.inquiry_id = i.id and c.role = 'primary' and c.status = 'active'
  where i.coordinator_id is not null and c.inquiry_id is null;
```

**Downstream impact:**
- `inquiry-engine-coordinator.ts` needs new actions: `addSecondaryCoordinator`, `removeSecondaryCoordinator`, `promoteToPrimary`.
- RLS policies that key off `coordinator_id` (client thread, group thread membership, workspace permissions) must be updated to check `inquiry_coordinators` membership with `status = 'active'`.
- `inquiry_events` emits new event types: `secondary_coordinator_assigned`, `secondary_coordinator_unassigned`, `primary_coordinator_changed`, `coordinator_joined_thread`, `coordinator_left_thread`.

---

## 3. Requirement Groups (locked, SCHEMA BLOCKER)

### 3.1 Model

An inquiry has 1..N **requirement groups**. Each group is a distinct role requirement with its own fulfillment counters.

Each group has:
- `role_key` — e.g. host, model, promoter. Drawn from a platform-controlled taxonomy.
- `quantity_required` — how many of this role the client needs.
- `notes` — optional free text (describes the specific need: height, language, etc.).

Each talent participant belongs to **exactly one** group.

### 3.2 Progress tracking

Per group, derived from participants + offers + approvals:
- **Selected** — participants assigned to the group (roster member, not yet offered)
- **Offered** — has an active outbound offer
- **Approved** — client has approved their offer
- **Confirmed** — included in booking roster at conversion

### 3.3 Booking conversion rule

`approved ≥ quantity_required` must hold for **every** group, or the admin must explicitly override (see §9.1). Override path is logged as a domain event AND in the action log (§10).

### 3.4 UI surface

The **Requirement Groups** rail panel (§5.2.2) shows one row per group with its counters. Example:

```
Hosts           Need 4 · 6 selected · 4 approved · 4 confirmed
Models          Need 2 · 3 selected · 2 approved · 2 confirmed
```

The roster drill-down editor (§5.3.1) groups the roster table by requirement group, with per-group assignment controls.

### 3.5 SCHEMA BLOCKER — requirement groups

**Current state:** No schema support. No `requirement_group` tables, columns, or code references.

**Required migration (Phase 1, before any requirement-group UI):**

```sql
create table inquiry_requirement_groups (
  id                uuid primary key default gen_random_uuid(),
  inquiry_id        uuid not null references inquiries(id) on delete cascade,
  role_key          text not null,              -- taxonomy-governed
  quantity_required int  not null check (quantity_required > 0),
  notes             text,
  sort_order        int  not null default 0,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index inquiry_requirement_groups_inquiry_idx
  on inquiry_requirement_groups(inquiry_id);

alter table inquiry_participants
  add column requirement_group_id uuid
    references inquiry_requirement_groups(id) on delete set null;

create index inquiry_participants_requirement_group_idx
  on inquiry_participants(requirement_group_id);
```

**Migration rules:**
1. Backfill for existing inquiries: create one default requirement group per inquiry (role = "talent" or taken from inquiry metadata if available), set its `quantity_required` to the count of existing participants, assign all existing participants to it.
2. RLS: requirement_groups inherit the inquiry's read/write policies (admin + coordinator write, inquiry-visible users read).
3. Event types: `requirement_group_added`, `requirement_group_updated`, `requirement_group_removed`, `participant_group_changed`.
4. `requirement_group_id` is **nullable during transition**. After M5 (all drill-downs and engine writes set it explicitly), M5.6 enforces `NOT NULL` and removes all fallback code.

**Validation queries (migration fails if any return rows):**
```sql
-- every inquiry has at least one group
select i.id from inquiries i
  left join inquiry_requirement_groups g on g.inquiry_id = i.id
  where g.id is null;

-- every participant has a group assigned
select id from inquiry_participants where requirement_group_id is null;
```

**Downstream impact:**
- `inquiry-engine-roster.ts` must accept a `requirement_group_id` on talent add/assign.
- Booking conversion (`convert_to_booking` RPC) must check per-group fulfillment.
- Offer creation must know the talent's group for per-group approval tallies.

### 3.6 Post-booking lock (NON-NEGOTIABLE)

Once an inquiry reaches `booked` status, **requirement groups cannot be edited directly.** Engine actions `addRequirementGroup`, `updateRequirementGroup`, `removeRequirementGroup` return `{ success: false, reason: 'inquiry_booked_use_adjustment_flow' }` when the inquiry is booked.

**Why:** booking integrity depends on a stable requirement model. Direct edits post-booking would break history, invoicing, and any downstream settlement.

**Allowed post-booking:** roster substitution (replace talent A with talent B in the same group) via the booking adjustment path. Full booking-adjustment flow (change quantity, add new group) is Phase 2.

### 3.7 Participant-group assignment rules

- Adding a participant to an inquiry **requires a `requirement_group_id`**. UI must force selection. Engine rejects the call if missing.
- A group cannot be removed while participants are assigned to it. Engine returns `{ success: false, reason: 'group_has_participants' }`. Reassign participants first.
- Moving a participant between groups is `assignParticipantToGroup({ participantId, groupId })`. Emits `participant_group_changed` event AND logs `participant_moved_group` action (§10).

---

## 4. Thread Model (locked)

Two threads per inquiry in Phase 1. Internal notes deferred.

### 4.1 Client Thread

**Participants:** client + agency admin + all coordinators (primary + secondaries) with `status = 'active'`.

**Purpose:** client-facing communication, approvals, high-level coordination.

**Badge rendering:**
- Client → no badge
- Agency admin → "Agency"
- Primary coordinator → "Lead Coordinator"
- Secondary coordinator → "Coordinator"
- Former coordinator (past messages only) → "Former Coordinator" (muted)

### 4.2 Group Thread

**Participants:** selected talent (roster members, any status) + agency admin + all active coordinators.

**Purpose:** logistics, real-time execution, group coordination.

**Badge rendering:**
- Talent → no badge
- Agency admin → "Agency"
- Primary coordinator → "Lead Coordinator"
- Secondary coordinator → "Coordinator"
- Coordinator who is also a roster talent → coordinator badge takes precedence
- Former coordinator (past messages only) → "Former Coordinator" (muted)

### 4.3 Membership enforcement (invariant)

**On coordinator assignment** (primary or secondary):
- Membership row added to client thread and group thread (or `status` flipped to `active` if row exists).
- Events emitted: `coordinator_assigned` + `coordinator_joined_thread` (× 2 threads).

**On coordinator unassignment:**
- Membership row **NOT deleted.** `status` set to `former_coordinator`.
- Past messages remain visible. Posting privilege revoked.
- UI renders "Former Coordinator" badge (muted) on the handle.
- Event: `coordinator_left_thread`.

**On roster change (talent added to inquiry):**
- Auto-added to group thread only.
- Event: `talent_joined_group_thread`.

**On roster removal:**
- Remains in thread for history. Cannot post.
- Event: `talent_left_group_thread`.

### 4.4 RLS invariant

Thread membership is the canonical source for read access. Any user in the thread's membership set (any status) can read messages; any user *currently* in the membership set with `status = 'active'` can post. Historical messages are never retroactively hidden.

---

## 5. Workspace IA (Execution Layer)

### 5.1 Layout

```
┌──────────── header + status / "waiting on" strip ────────────┐
│                                                               │
│  CENTER                        RIGHT RAIL                    │
│  ──────                        ──────────                    │
│                                                               │
│  [Client] [Group] ← switcher   Summary                        │
│                                Requirement Groups             │
│  message stream                Offers / Approvals             │
│                                Coordinators                   │
│                                Booking                        │
│  composer                      Needs Attention                │
│                                Recent Activity                │
└───────────────────────────────────────────────────────────────┘
```

### 5.2 Right rail panels

Each panel is a collapsible card. Panels expand inline. None navigate away.

#### 5.2.1 Summary
Client name · event type · event date(s) · city/venue · budget band · inquiry status sentence · last activity timestamp.

#### 5.2.2 Requirement Groups
One row per group: `<role> · Need N · S selected · A approved · C confirmed`. Click row → opens roster drill-down filtered to that group.

#### 5.2.3 Offers / Approvals
Summary counts: `D drafted · S sent · P pending approval · A approved · R rejected`. Link to offer editor drill-down.

#### 5.2.4 Coordinators
- Primary coordinator (highlighted, avatar + name + "Lead Coordinator")
- Secondary coordinators (lighter, stacked list)
- Assign button (opens picker)
- Reassign / promote / remove inline actions per coordinator
- "Remove" hidden on primary row per §2.3a

#### 5.2.5 Booking
- State: "Not yet / Ready to convert / Booked / Cancelled"
- Convert button (enabled only when every requirement group is fulfilled)
- "Convert with override" (admin only, unfulfilled groups) — opens override modal per §9.1
- Post-booking: summary of booking details + link to booking drill-down
- If booked with override: "Converted with override" pill visible; hover reveals reason

#### 5.2.6 Needs Attention
Derived from Tier 1 notification types (§7). Only renders items currently applicable. Empty state: "Nothing needs your attention."

#### 5.2.7 Recent Activity
Last 5 `inquiry_events` rows, formatted. "View full timeline →" opens timeline drill-down.

### 5.3 Drill-down panels (slide-over sheets)

Drill-downs open as slide-overs from the right edge. Messaging stays visible underneath (or in a narrow strip on mobile). Pressing Escape or clicking outside closes.

| Drill-down | Replaces today's | Contents |
|---|---|---|
| 5.3.1 Roster editor | Roster tab | Full participant table, grouped by requirement group, with add/remove/assign controls |
| 5.3.2 Offer editor | Offers tab | Offer creation, editing, revisions |
| 5.3.3 Approval queue | Approvals tab | Full list of approvals + actions |
| 5.3.4 Full timeline | History tab | `InquiryTimeline` component (already shipped) |
| 5.3.5 Booking detail | Booking tab | Booking overview + post-booking adjustment controls |

### 5.4 Header + status strip

**Header** (sticky):
- Back link · inquiry title (client + event summary) · status badge (`formatInquiryStatus`) · primary-action button (`getPrimaryAction`)
- Chip rail: primary coordinator chip · unread chip · participant count chip · booking chip (if linked)

**Status / "waiting on" strip** (below header, above panels):
- State sentence derived from workspace engine
- "Waiting on: Client / Talent (N) / Admin / —" chip
- Recommended action button (admin-owned actions only)
- In locked states: muted, no action button, terminal status only

### 5.5 Principles

1. Messaging is always visible.
2. Context is never lost to navigation.
3. Actions happen beside the conversation, not in place of it.
4. No tab nav for core operations. Drill-downs only.
5. State derivations come from the canonical engine (`getWorkspacePermissions`, `getPrimaryAction`, `isWorkspaceLocked`, `normalizeWorkspaceStatus`, `formatInquiryStatus`). No duplicate logic.

---

## 6. Decision Layer — Admin Queue

Queue is the triage surface. One row per inquiry.

### 6.1 Columns

1. Inquiry (title + client)
2. Status (`formatInquiryStatus`)
3. Waiting on (Client / Talent N / Admin / —)
4. Unread (chip, if > 0)
5. Primary coordinator (avatar / "Unassigned")
6. Last activity
7. Priority (if set)

### 6.2 Filters

- Status (multi-select)
- Waiting on: All / Admin / Client / Talent
- Unread only (toggle)
- Coordinator: All / Mine / Unassigned / pick user
- Actionable only (toggle — primary-action owner is admin)

### 6.3 Interaction

- Row click → opens workspace (not any specific drill-down).
- Bulk: assign coordinator, mark read.
- No bulk status changes. Transitions go through the engine per-inquiry.

---

## 7. Notifications (Phase 1)

### 7.1 No global inbox

Notifications are a **derived layer** over three canonical sources:
1. `inquiry_events` — lifecycle facts
2. `inquiry_message_reads` — unread messages
3. Workflow state derivations (stuck / missing coordinator / ready-to-convert)

No new notifications table. No read/dismiss state. Dismissal = resolving the underlying condition.

### 7.2 Tier 1 types

| # | Type | Trigger |
|---|---|---|
| 1 | Unread message | `inquiry_message_reads` has unread row for user |
| 2 | Pending client approval | approval_submitted event + no response |
| 3 | Pending talent response | talent_invited event + no response > 72h |
| 4 | Ready to convert | all requirement groups fulfilled + no booking |
| 5 | Inquiry cancelled | cancelled event (new, unread) |
| 6 | Booking created | booking_created event (new, unread) |

### 7.3 Surfaces

- **Header chips** — unread, waiting-on
- **Needs Attention rail panel** (§5.2.6)
- **Queue row indicators + filters** (§6)
- **Sidebar badge** — total count of inquiries with any Tier 1 alert for current admin. Not an inbox; just a count that leads back to the queue filtered view.

Not in Phase 1: notification center, email/push delivery, preferences, dismissal state.

---

## 8. Workflow Truth Table

Canonical state machine. All UI surfaces derive from this table via the existing engine.

| Status | Owner (action) | What happens | Allowed actions |
|---|---|---|---|
| **Submitted** | Agency admin | Request received, coordinator not finalized, initial review | Assign coordinator · Clarify request · Build requirement groups · Begin talent selection |
| **Coordination** | Agency admin or assigned coordinator | Talent selected, participants invited, responses collected, groups managed | Add/remove talent · Assign/reassign coordinators · Message client · Message group · Prepare offers |
| **Offer Pending** | Client (approval) · Coordinator (follow-up) | Per-talent offers sent, client reviewing, some approvals pending | Client approve/reject · Coordinator follow-up · Coordinator/admin adjust offer |
| **Approved** | Coordinator / admin | Enough talent approved per group, ready to convert | Convert to booking · Finalize confirmed participants · Adjust final roster |
| **Booked** | Coordinator (ops) · Agency admin (oversight) | Commercial terms closed, event is live operationally | Manage participants (within group) · Replace talent · Message client/group · Reassign coordinators · Update booking details |
| **Closed / Cancelled** | — | Read-only record, history preserved | — |

---

## 9. Inquiry → Booking Continuity

Booking is a commercial lock, not a workflow end.

- Same workspace page. Status changes to "Booked." Messaging threads continue uninterrupted.
- Roster panel still works — but additions/removals now emit `booking_roster_changed` events (distinct from inquiry events, for audit).
- Coordinator reassignment remains allowed.
- **Requirement groups are locked** per §3.6. Only roster substitutions within existing groups.
- History is continuous. Timeline shows inquiry events and booking events in one stream.
- Cancellation post-booking → `booking_cancelled` event. Thread becomes read-only for non-admin roles. Admin can re-open if needed (edge case).

No separate "booking view" page in Phase 1. The same workspace serves both.

### 9.1 Booking conversion override UX (NON-NEGOTIABLE)

When any requirement group is unfulfilled at conversion time, admins (only — not coordinators-who-are-talent) see a "Convert with override" action. This must never be a silent button.

**Flow:**

1. Button renders only when actor is admin AND at least one group has `approved < quantity_required`.
2. Clicking opens a confirmation modal containing:
   - **Shortfall summary per group** (e.g. "Hosts: need 4, approved 3")
   - **Mandatory reason input** (min 10 chars, enforced client + server)
   - **Explicit checkbox**: "I understand this overrides requirement fulfillment"
   - Submit disabled until reason is filled AND checkbox is checked
3. On success:
   - Event `booking_conversion_override` emitted with `{ reason, shortfall, actor_user_id }` payload.
   - Action log entry `booking_conversion_override` recorded per §10.
   - Booking row gets `created_with_override = true` flag.
   - `override_reason` stored on booking row.
4. Post-conversion display:
   - Booking panel shows "Converted with override" pill. Hover reveals reason.
   - Admin queue shows override indicator on the row.
   - Timeline surfaces the override event prominently.

**Schema addition for M2.3:**
```sql
alter table bookings
  add column created_with_override boolean not null default false,
  add column override_reason text;
```

---

## 10. Observability — `inquiry_action_log`

**Distinct from `inquiry_events`.**
- `inquiry_events` = domain facts (success only, user-visible in timeline).
- `inquiry_action_log` = every admin/coordinator action attempt, including failures. Operational/debug. Not user-visible in Phase 1.

### 10.1 Schema

```sql
create table inquiry_action_log (
  id            bigserial primary key,
  inquiry_id    uuid not null references inquiries(id) on delete cascade,
  actor_user_id uuid not null references auth.users(id) on delete restrict,
  action_type   text not null,
  result        text not null check (result in ('success', 'failure')),
  reason        text,         -- failure reason OR override justification
  metadata      jsonb,        -- small context: target_user_id, group_id, etc.
  created_at    timestamptz not null default now(),
  constraint inquiry_action_log_metadata_size
    check (metadata is null or octet_length(metadata::text) < 2048)
);

create index inquiry_action_log_inquiry_idx on inquiry_action_log(inquiry_id, created_at desc);
create index inquiry_action_log_actor_idx   on inquiry_action_log(actor_user_id, created_at desc);
create index inquiry_action_log_type_idx    on inquiry_action_log(action_type, created_at desc);
create index inquiry_action_log_created_at_brin
  on inquiry_action_log using brin (created_at);
```

### 10.2 Action types (Phase 1)

| `action_type` | Emitted from | Result |
|---|---|---|
| `coordinator_assigned` | primary or secondary assignment | success / failure |
| `coordinator_promoted` | `promoteToPrimary` | success / failure |
| `coordinator_removed` | `removeSecondaryCoordinator` (primary removal blocked → failure) | success / failure |
| `participant_moved_group` | `assignParticipantToGroup` | success / failure |
| `booking_conversion_attempt` | every `convert_to_booking` call | success / failure |
| `booking_conversion_override` | successful conversion via override path | success (always) |
| `message_sent` | thread send action (client + group) | success / failure |

### 10.3 Invariants (NON-NEGOTIABLE)

1. **Logging must never block the action.** Helper wraps insert in try/catch; failures log to server console only.
2. No retry logic in Phase 1. A failed log write is lost — accepted tradeoff.
3. `metadata` JSONB must stay under 2KB (CHECK constraint enforces).
4. No PII in metadata. IDs + short scalars only. No message bodies, no full participant objects, no stack traces.
5. Every engine action in §2.3a, §3.7, §9.1, and the messaging send path calls `logInquiryAction` before returning — both success and failure branches.

### 10.4 Retention

Not in Phase 1. Table grows unbounded. Retention policy (e.g. 180 days) is a Phase 3 concern. BRIN index on `created_at` keeps time-range scans cheap in the meantime.

---

## 11. Migration Plan

### 11.1 Principle

Do not remove existing tabs before the new workspace is validated. Ship behind a feature flag (`ff_admin_workspace_v3`). All migrations are additive and reversible until final cutover (M8.2).

### 11.2 Steps (detailed sequencing lives in `admin-workspace-roadmap.md`)

1. **Schema blockers:** `inquiry_coordinators` (§2.6), `inquiry_requirement_groups` (§3.5), `inquiry_action_log` (§10).
2. **Engine extensions:** coordinator actions, requirement group CRUD, booking conversion enforcement, override path, action-log wiring.
3. **Workspace shell behind flag:** split layout, header + status strip, rail container, thread switcher.
4. **Rail panel content wired to real data.**
5. **Drill-down sheets replace tab content.**
6. **M5.6 NOT NULL cutover** on `inquiry_participants.requirement_group_id` + removal of fallback code.
7. **Queue improvements** + sidebar badge.
8. **Dogfood** internal users.
9. **Cutover:** flag default on → remove old workspace → drop `inquiries.coordinator_id`.

### 11.3 What must not happen during migration

- No dual writes. The new workspace and old tabs share the same engine and tables. No shadow data.
- No deletion of the old workspace code until flag is default-on for all admins.
- No schema migrations that break existing reads (`coordinator_id` stays during transition).
- No engine action lands without action-log wiring.

---

## 12. Out of Scope (Phase 1)

- Multi-tenancy / agency data model
- CMS or page builder
- New role system (only `platform_admin` + `agency_admin` exist as base roles; coordinator is assignment)
- Multi-agency dashboards / admin context switching
- Global notification center, inbox, digest, email/push delivery
- Internal notes thread
- Coordinator as a base role anywhere in the UI
- Full booking adjustment flow (change quantity, add new group post-booking) — roster substitution only in Phase 1
- Action log retention / archival policy

---

## 13. Resolved Questions

1. **Coordinator permissions — secondary vs primary.** Identical authority in Phase 1; differentiation is visual and organizational only.
2. **Requirement group role taxonomy.** Platform-controlled list (hosts, models, promoters, talent default). Seeded in migration. Agency-specific roles deferred to tenancy phase.
3. **Booking conversion override.** Allowed for admins only, mandatory reason (≥10 chars), confirmation checkbox, event + action-log entry, persistent "Converted with override" UI pill.
4. **Mobile rail.** Bottom sheet that docks from below the composer. Summary and Needs Attention are the always-visible compact view; remaining panels behind an expand.
5. **Feature flag name.** `ff_admin_workspace_v3`.
6. **Primary coordinator removal.** Blocked directly; must promote replacement first (§2.3a).
7. **Former coordinator handling.** Row preserved with `status = 'former_coordinator'`; past messages remain; cannot post.
8. **Post-booking group edits.** Blocked; roster substitution only (§3.6).

---

## 14. Build Order Summary

**Phase 1 milestones (detailed in `admin-workspace-roadmap.md`):**
- M0 — Feature flag plumbing
- M1 — Schema blockers (coordinators, requirement groups)
- M2 — Engine extensions (including M2.4 action log)
- M3 — Workspace shell (flagged)
- M4 — Rail panel content
- M5 — Drill-down sheets
- M5.6 — NOT NULL enforcement on `requirement_group_id`
- M6 — Queue improvements
- M7 — Internal dogfood + edge-case QA (14 scenarios)
- M8 — Cutover + old workspace removal

**Phase 2 (follow-up):**
- Derived notification refinements (stale thresholds, SLA indicators)
- Internal notes thread
- Full booking adjustment flow

**Phase 3 (deferred):**
- Multi-tenancy, agency context switching
- Notification digest / email
- CMS or page builder
- Action-log retention policy

---

*Spec ends. Changes require PR to this file.*
