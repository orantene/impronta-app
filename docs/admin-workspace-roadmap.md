# Admin Workspace V3 — Execution Roadmap

**Status:** Execution contract for Phase 1
**Date:** 2026-04-18
**Companion doc:** [admin-workspace-spec.md](admin-workspace-spec.md)
**Branch:** `feature/admin-workspace-v3` (off `phase-1`)
**Flag:** `ff_admin_workspace_v3`

This roadmap is the authoritative sequence for the V3 build. Every item is sized to one PR. Dependencies are explicit. Validation gates are named. Changes require PR to this file.

---

## Phase 1 Success Criteria

Phase 1 is complete only when **all** of the following hold:

- [ ] **Schema blockers landed safely.** `inquiry_coordinators`, `inquiry_requirement_groups`, and `inquiry_action_log` migrations applied. All validation queries return 0 rows. All indexes present. Backfills verified.
- [ ] **V3 workspace functional behind flag.** Split layout with messaging center + right rail. All 7 rail panels wired to real data. All 5 drill-down sheets operational. No placeholder/stub data on any surface.
- [ ] **Queue aligned with V3 model.** Waiting-on column, unread chip, primary-coordinator column, Tier 1 filters operational. Sidebar badge live.
- [ ] **No regression in existing admin/client/talent flows.** Old workspace remains functional with flag off. Existing inquiry operations (status transitions, offers, approvals, booking conversion) work unchanged from user perspective.
- [ ] **Internal dogfood passes.** At least one week of flag-on for internal admins. No P0/P1 open. Admins prefer V3 for daily use.
- [ ] **All 14 M7 QA scenarios pass.** Including concurrency (#13) and rapid-repeated-action (#14) cases. Documented with results.
- [ ] **Cutover only after M7 signoff.** Flag default-on and old workspace removal happen only after explicit go/no-go review against this checklist.

---

## Milestone Map

| Milestone | Purpose | PR count |
|---|---|---|
| M0 | Feature flag plumbing | 1 |
| M1 | Schema blockers | 2 |
| M2 | Engine extensions (+ action log) | 4 |
| M3 | Workspace shell (flagged) | 5 |
| M4 | Rail panel content | 7 |
| M5 | Drill-down sheets | 5 |
| M5.6 | NOT NULL cutover on `requirement_group_id` | 1 |
| M6 | Queue improvements | 2 |
| M7 | Internal dogfood + 14-scenario QA | 0 (feedback PRs as needed) |
| M8 | Cutover | 2 |
| **Total** | | **~29** |

Sequencing is strict: **M0 → M1 → M2 → M3 → M4 → M5 → M5.6 → M6 → M7 → M8.** Parallelism only within M4 (after M3.5) and within M5 (after M5.1).

---

## Definition of Done (per milestone)

A milestone is complete only if:

1. Schema changes applied and validated (validation queries return 0 rows).
2. Required indexes present.
3. Engine actions have unit tests passing.
4. UI uses real data — no stubs, no placeholders.
5. No duplicated logic (no local status maps, no hand-rolled primary actions).
6. No regression in existing flows.
7. All gates listed under the milestone verified.
8. Action log entries recorded for every action-capable ticket (where applicable).

If any condition fails → STOP and fix before continuing.

---

## M0 — Prep

### M0.1 — Feature flag plumbing
- Add `ff_admin_workspace_v3` to the settings table (or existing flag registry).
- Helper `isWorkspaceV3Enabled(userId)` — reads setting; allows per-user override for staging dogfooding.
- No UI change yet.

**Gate:** Flag readable in server + client components. Per-user override verified in dev.

---

## M1 — Schema Blockers

### M1.1 — `inquiry_coordinators` join table

**Migration contents:**
- Table per spec §2.6, including `status` column (`active` | `former_coordinator`).
- Partial unique index on `(inquiry_id)` where `role='primary' and status='active'`.
- Indexes on `(inquiry_id)` and `(user_id)`.
- Backfill: `insert ... select id, coordinator_id, 'primary', 'active' from inquiries where coordinator_id is not null;`
- Trigger keeps `inquiries.coordinator_id` in sync with the `primary`+`active` row.
- RLS mirrors existing inquiry policies.
- Extend thread-membership table with `status` column (`active` | `former_coordinator`) if separate, or add equivalent column to the controlling relation.

**Validation queries (hard fail if any return rows):**
```sql
-- 1. every inquiry that had a coordinator has exactly one active primary
select inquiry_id from inquiry_coordinators
  where role='primary' and status='active'
  group by inquiry_id having count(*) <> 1;

-- 2. no orphan: every inquiries.coordinator_id has a matching active primary row
select i.id from inquiries i
  left join inquiry_coordinators c
    on c.inquiry_id=i.id and c.role='primary' and c.status='active'
  where i.coordinator_id is not null and c.inquiry_id is null;

-- 3. no duplicate (inquiry_id, user_id)
select inquiry_id, user_id, count(*) from inquiry_coordinators
  group by inquiry_id, user_id having count(*) > 1;
```

**Non-UI code:** read helper `getInquiryCoordinators(inquiryId)` returning `{ primary, secondaries[] }`. No consumers yet.

**Gate:** migration runs clean on dev + staging snapshot. Trigger verified by updating `coordinator_id` directly (sync in both directions). Validation queries return 0 rows.

### M1.2 — `inquiry_requirement_groups` table + participant column

**Migration contents:**
- Table per spec §3.5.
- `inquiry_participants.requirement_group_id` nullable during transition.
- Indexes on `inquiry_requirement_groups(inquiry_id)` and `inquiry_participants(requirement_group_id)`.
- Backfill: one default group per inquiry, role = `"talent"` (or inquiry-metadata-derived), `quantity_required = count(participants)`, assign all participants.
- Seed role taxonomy: `hosts`, `models`, `promoters`, `talent` in a small lookup.
- RLS inherits inquiry policies.

**Validation queries (hard fail if any return rows):**
```sql
-- 1. every inquiry has ≥1 group
select i.id from inquiries i
  left join inquiry_requirement_groups g on g.inquiry_id=i.id
  where g.id is null;

-- 2. every participant has a group
select id from inquiry_participants where requirement_group_id is null;
```

**Report query (eyeball before merge):**
```sql
select g.id, g.role_key, g.quantity_required,
       count(p.id) filter (where p.status in ('active','offered','approved','confirmed')) as selected_count
from inquiry_requirement_groups g
left join inquiry_participants p on p.requirement_group_id=g.id
group by g.id, g.role_key, g.quantity_required
order by g.inquiry_id, g.sort_order;
```

**Non-UI code:** read helper `getRequirementGroups(inquiryId)` returning groups + derived counters.

**Gate:** every existing inquiry has exactly one default group. Every existing participant has `requirement_group_id` set. Counters match by spot-check on 3 live staging inquiries.

---

## M2 — Engine Extensions

### M2.1 — Coordinator engine actions

**File:** `web/src/lib/inquiry/inquiry-engine-coordinator.ts`

**New actions:**
- `addSecondaryCoordinator({ inquiryId, userId, actorUserId })`
- `removeSecondaryCoordinator({ inquiryId, userId, actorUserId })`
- `promoteToPrimary({ inquiryId, userId, actorUserId })` — demotes current primary to secondary.
- All emit `inquiry_events`: `secondary_coordinator_assigned`, `secondary_coordinator_unassigned`, `primary_coordinator_changed`.
- All call `logInquiryAction` with success/failure result (§10 in spec).

**Rules (enforced):**
- Primary removal directly → blocked with `reason='cannot_remove_primary'` (spec §2.3a).
- Thread membership updated per spec §4.3 invariant on every assignment/unassignment.
- On unassignment: row in thread membership flipped to `status='former_coordinator'`, NOT deleted.

**Tests:**
- add/remove secondary
- promote (primary swap clean)
- remove primary directly → blocked
- unauthorized actor → blocked
- thread membership side effects verified
- action log entries verified (both success and failure paths)

**Gate:** all tests pass. Spot-check on staging inquiry: promote a secondary, verify primary swap + events + log entries.

### M2.2 — Requirement group engine actions

**File:** `web/src/lib/inquiry/inquiry-engine-requirement-groups.ts` (new)

**New actions:**
- `addRequirementGroup({ inquiryId, roleKey, quantityRequired, notes, actorUserId })`
- `updateRequirementGroup({ groupId, patch, actorUserId })`
- `removeRequirementGroup({ groupId, actorUserId })` — blocked if participants assigned (`group_has_participants`).
- `assignParticipantToGroup({ participantId, groupId, actorUserId })`

**Extend existing:** `inquiry-engine-roster.ts` accepts `requirementGroupId` on talent add. Engine rejects participant-add call if missing.

**Rules (enforced):**
- Post-booking lock per spec §3.6: all CRUD returns `inquiry_booked_use_adjustment_flow` when status=`booked`.
- Events emitted: `requirement_group_added/updated/removed`, `participant_group_changed`.
- Action log: `participant_moved_group` on assignments, both success and failure.

**Tests:**
- CRUD happy path
- Remove group with participants → blocked
- Add participant without group → blocked
- Post-booking edit → blocked
- Move participant → counters update
- Action log verified

**Gate:** all tests pass. Counter-update spot check on staging.

### M2.3 — Booking conversion enforces per-group fulfillment + override

**Changes:**
- Extend `convert_to_booking` RPC to check `approved_count >= quantity_required` for every group.
- Accept optional `override_reason` param (min 10 chars).
- If unfulfilled + no override → `{ success: false, reason: 'requirement_groups_unfulfilled', shortfall: [...] }`.
- If override path taken → emit `booking_conversion_override` event AND action log. Set `bookings.created_with_override = true`, `bookings.override_reason = <reason>`.
- Always log `booking_conversion_attempt` action, success or failure.
- Update `isWorkspaceLocked` / `getPrimaryAction` so "Ready to convert" only shows when all groups fulfilled OR actor is admin (who sees "Convert with override").

**Schema addition:**
```sql
alter table bookings
  add column created_with_override boolean not null default false,
  add column override_reason text;
```

**Tests:**
- Fulfilled → converts clean
- Unfulfilled, no override → blocked
- Unfulfilled, admin with override → succeeds, flag + reason persisted, both logs emitted
- Unfulfilled, coordinator (non-admin) with override attempt → blocked
- Existing single-group inquiries (from M1.2 backfill) convert unchanged

**Gate:** all tests pass. Staging conversion verified end-to-end.

### M2.4 — `inquiry_action_log` + wiring

**Migration:** spec §10.1 — table, 3 btree indexes, 1 BRIN index, metadata size CHECK constraint.

**Helper:** `web/src/lib/inquiry/inquiry-action-log.ts` exposing `logInquiryAction(supabase, { inquiryId, actorUserId, actionType, result, reason, metadata })`.

**Rules (enforced by convention + tests):**
1. Logging must never block the action. Helper wraps insert in try/catch; failure logs to server console only.
2. No retry logic in Phase 1.
3. Metadata stays small (CHECK enforces <2KB).
4. No PII in metadata.

**Wire points:** every engine action from M2.1, M2.2, M2.3 and the messaging send path calls `logInquiryAction` on both success and failure branches.

**Action types wired (Phase 1):**
- `coordinator_assigned`
- `coordinator_promoted`
- `coordinator_removed`
- `participant_moved_group`
- `booking_conversion_attempt`
- `booking_conversion_override`
- `message_sent`

**Tests:**
- Each engine action writes exactly one row with correct result.
- Forced insert failure → engine action still returns success; server console has error line.
- Metadata >2KB rejected at DB.
- No PII in metadata (code review gate).

**Gate:** manual staging spot-check — trigger 3 failures + 3 successes across action types, verify `select action_type, result, reason, metadata from inquiry_action_log order by created_at desc limit 10;`.

---

## M3 — Workspace Shell (flagged off)

All rendered only when `ff_admin_workspace_v3` is on. Route unchanged: `/admin/inquiries/[id]`. Old workspace renders when flag is off.

### M3.1 — Route-level flag gate + v3 page scaffold
- In `web/src/app/(dashboard)/admin/inquiries/[id]/page.tsx`, branch on flag.
- New `admin-inquiry-workspace-v3.tsx` client component. Skeleton "coming soon" with inquiry header.
- Old workspace untouched.

**Gate:** flag on → new shell renders. Flag off → old workspace renders. No regression in old workspace.

### M3.2 — Split layout (center + rail)
- Two-column CSS grid. Mobile: rail collapses to bottom sheet (docked, not fullscreen).
- Center: empty thread placeholder. Rail: empty panel placeholders.

**Gate:** verified at 1440 / 1024 / 768 / 390 widths.

### M3.3 — Header + status/"waiting on" strip
- Header: back link, title, status badge (`formatInquiryStatus`), primary-action (`getPrimaryAction`).
- Chip rail: primary-coordinator, unread, participant-count, booking.
- Status strip: state sentence + waiting-on chip + recommended action.

**Gate:** locked inquiries → muted strip, no action button. Open inquiries → primary action matches old workspace.

### M3.4 — Thread switcher in center column
- `[Client] [Group]` toggle at top of center column.
- Uses existing messaging components — no rewrite.
- URL param `?thread=client|group` preserves state on reload.

**Gate:** both threads render correctly. Switching preserves per-thread scroll position.

### M3.5 — Rail container (collapsibles)
- Each panel is a `<Collapsible>` with per-user persistent open/closed state.
- Empty content — wiring in M4.

**Gate:** collapse state persists across reloads.

---

## M4 — Rail Panel Content

Each PR wires one panel to real data. M4.1–M4.7 can run in parallel after M3.5, but strongly recommend sequencing one per day and eyeballing it.

- **M4.1 — Summary panel** — from inquiry loader
- **M4.2 — Requirement Groups panel** — from `getRequirementGroups` (M1.2)
- **M4.3 — Offers / Approvals panel** — from existing offer/approval tables
- **M4.4 — Coordinators panel** — from `inquiry_coordinators`; assign/promote/remove wired to M2.1 actions (Remove hidden on primary per §2.3a)
- **M4.5 — Booking panel** — current state; Convert button enabled per M2.3 rules; "Convert with override" modal per spec §9.1 (only shown to admins with unfulfilled groups)
- **M4.6 — Needs Attention panel** — new `lib/inquiry/inquiry-alerts.ts` module (derived, built in this PR)
- **M4.7 — Recent Activity panel** — `<InquiryTimeline inquiryId={id} limit={5} previewMode />` (add `limit` + `previewMode` props to existing component)

**Gate per PR:** panel renders real data for a staging inquiry. Action-capable panels (M4.4, M4.5) verified by performing the action and observing state change + event in `inquiry_events` + row in `inquiry_action_log`.

---

## M5 — Drill-down Sheets

Slide-over sheets from the right edge, replacing today's tab content. Messaging visible underneath.

### M5.1 — Shared `<WorkspaceDrillSheet>` component
- Slide-over from right. Escape to close. Click-outside to close.
- URL-state: `?drill=roster|offers|approvals|timeline|booking`.

### M5.2 — Roster editor sheet (replaces Roster tab)
Full participant table, grouped by requirement group, with add/remove/assign controls wired to M2.2 `assignParticipantToGroup`. UI forces group selection on add.

### M5.3 — Offer editor sheet (replaces Offers tab)
Reuses existing offer UI inside the sheet shell.

### M5.4 — Approval queue sheet (replaces Approvals tab)
Reuses existing approval UI.

### M5.5 — Full timeline sheet (replaces History tab)
`<InquiryTimeline inquiryId={id} />` (no limit).

### M5.6 — Booking detail sheet (replaces Booking tab)
Booking overview + post-booking adjustment controls (roster substitution only per §3.6). Requirement group edit controls explicitly hidden/disabled post-booking.

**Gate per sheet:** feature parity with the tab it replaces. No regression in existing engine actions triggered from within.

---

## M5.6 — Enforce `NOT NULL` on `requirement_group_id`

Runs **after all M5 drill-downs merged**, confirming no code path creates a participant without a group.

**Steps:**
1. Verification: `select id from inquiry_participants where requirement_group_id is null;` → must return 0 rows.
2. If 0: `alter table inquiry_participants alter column requirement_group_id set not null;`
3. Remove all fallback code handling `null requirement_group_id`. Grep for null checks on the column, delete.

**Gate:** zero null values at migration time. Full test suite green after fallback removal. Grep returns no remaining null-handling for this column.

---

## M6 — Queue Improvements

### M6.1 — Queue row + filter enrichment
- Extend queue loader: `primary_coordinator`, `unread_count`, `waiting_on_owner`, `has_tier1_alert`.
- New columns: Waiting-on, Unread chip, Primary coordinator.
- Filter bar: Waiting-on multi-select, Unread-only toggle, Actionable-only toggle, Coordinator filter (All / Mine / Unassigned / pick user).
- Row click → opens workspace (not any specific drill).

### M6.2 — Sidebar Tier 1 badge
- Count next to "Inquiries" nav item.
- Count = inquiries with any Tier 1 alert for current admin.
- Click → queue filtered to Actionable + Unread.

**Gate:** filters return correct set on 5 staging inquiries. Badge count matches manual query.

---

## M7 — Internal Dogfood + Edge-case QA

Enable `ff_admin_workspace_v3` for internal admins only. Minimum one week. Exit criterion: internal admins prefer V3 for daily use; no P0/P1 bugs open.

### M7 QA Checklist — 14 scenarios

Every scenario must pass before M8 go/no-go.

| # | Scenario | Expected |
|---|---|---|
| 1 | Remove primary coordinator directly | Blocked with `cannot_remove_primary`. Action logged as failure. |
| 2 | Promote secondary → primary | Primary swap clean. Old primary becomes secondary. Events + action log emitted for both. |
| 3 | Assign existing roster talent as coordinator | Appears as coordinator AND stays on roster. Coordinator badge visible in group thread. |
| 4 | Unassign coordinator | Thread membership `status='former_coordinator'`. Past messages remain. Cannot post. UI shows "Former Coordinator" badge. |
| 5 | Convert booking with unfulfilled group (coordinator) | Blocked with `requirement_groups_unfulfilled`. Attempt logged. |
| 6 | Convert booking with unfulfilled group (admin, no override) | Blocked. |
| 7 | Convert with override (admin + reason + checkbox) | Succeeds. `bookings.created_with_override = true`. Override event + action log entries. "Converted with override" pill visible. |
| 8 | Remove requirement group with participants assigned | Blocked with `group_has_participants`. |
| 9 | Move participant between groups | Counters update on both groups in rail panel within same render. Action log entry recorded. |
| 10 | Add talent to inquiry without specifying group | UI forces selection. Engine rejects if missing. |
| 11 | Locked/cancelled inquiry | All mutating actions disabled. Read-only UI. |
| 12 | Two admins edit same inquiry concurrently | No silent overwrite. Either version conflict surfaced ("Inquiry changed — please reload") or last-write-wins on non-conflicting fields with both writes in action log + events. Nothing lost silently. |
| 13 | Booking override visible in UI | Pill visible on booking panel. Hover reveals reason. Admin queue shows override indicator. Timeline surfaces override event. |
| 14 | Rapid repeated actions (button-spam, quick toggle) | No duplicate rows in `inquiry_coordinators` or `inquiry_participants`. State consistent with last legitimate action. Every attempt — including rejected duplicates — lands in `inquiry_action_log`. UI debounces or disables in-flight controls. |

**Additional checks:**
- [ ] Post-booking requirement group edit → blocked per §3.6.
- [ ] Action log entries for every action type listed in §10.2 observed in staging.

**Exit gate:** all 14 scenarios documented as passed. No P0/P1 open. Go/no-go review recorded in the dogfood issue before M8.

---

## M8 — Cutover

### M8.1 — Default flag on
- Flip `ff_admin_workspace_v3` default to on for all admins.
- Keep flag code path. Per-user override remains available for quick rollback.

**Gate:** 1–2 weeks flag-on-by-default with no regressions. Monitored via `inquiry_action_log` failure rates and qualitative admin feedback.

### M8.2 — Remove old workspace
- Delete `admin-inquiry-workspace-v2.tsx` and associated tab components.
- Remove flag branch in `page.tsx`.
- Remove flag itself from settings.
- Drop `inquiries.coordinator_id` column and associated sync trigger from M1.1.

**Gate:** no references to removed components. Type check + full test suite green. `inquiries.coordinator_id` drop validated by zero read references in grep.

---

## Cross-cutting Rules

### Testing pattern per PR
- Engine changes → unit tests (existing `*.test.ts` pattern).
- UI changes → preview-based verification (snapshot + interaction + resize).
- RLS changes → policy tests against staging DB.
- Every action-capable PR → verify entry in `inquiry_action_log`.

### Migration safety
- All migrations additive until M8.2. No destructive schema changes during M1–M7.
- Old workspace must remain functional at all times until M8.2.
- Every migration reversible during M1–M7 window.

### Rollback plan
- Any milestone PR can be reverted individually.
- Flag-off returns users to old workspace instantly.

### Parallelism
- **Strictly sequential:** M0 → M1 → M2 → M3 → M4 → M5 → M5.6 → M6 → M7 → M8.
- **Parallel within milestone:** M4.1–M4.7 (after M3.5), M5.2–M5.6 (after M5.1).
- **Dependencies:** M2.1 before M4.4, M2.3 before M4.5, M2.4 before any M2 PR merges, M5 complete before M5.6.

### Failure conditions (STOP)
- Validation queries return rows after a schema migration.
- Engine action lands without action-log wiring.
- UI ships with placeholder data.
- Duplicated logic (local status maps, hand-rolled primary actions, parallel notification systems) detected.
- Existing admin/client/talent flow regresses.

If any failure condition is hit → stop, report, fix before proceeding.

---

## Output Required (per milestone)

At each milestone close, report:
- What was completed (ticket list)
- Files created / modified
- Validation query results
- Test results
- Issues found (if any)
- Action log spot-check output (for M2.4+)

At Phase 1 completion, report:
- Full PR list
- Confirmation of data integrity (all validation queries 0)
- Confirmation of no duplication (grep results)
- QA results (all 14 scenarios)
- Dogfood summary
- Readiness for cutover

---

*Roadmap ends. Changes require PR to this file.*
