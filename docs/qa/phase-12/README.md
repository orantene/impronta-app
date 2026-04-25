# Phase 12 QA — Scheduled publish (schema + drawer)

Code-level verification passed (2026-04-25).

## Build

- **Source commit:** `eae3711` — `feat(edit-chrome): Phase 12 — scheduled publish (schema + drawer)`. Adds the migration, server actions, drawer component, EditContext mutex slot, topbar wiring, and command-palette row.
- **Branch:** `phase-1` (auto-deploys preview to Vercel; promote to prod via `vercel promote`).
- **TypeScript:** `cd web && npx tsc --noEmit` exits clean at HEAD.

## Acceptance criteria

| Item | Status | Evidence |
|---|---|---|
| Migration | ✅ | `supabase/migrations/20260701120000_cms_p12_m0_scheduled_publish.sql` — adds `scheduled_publish_at TIMESTAMPTZ`, `scheduled_by UUID REFERENCES profiles`, `scheduled_revision_id UUID REFERENCES cms_page_revisions`. Partial sweep index `idx_cms_pages_scheduled_sweep` on `(scheduled_publish_at)` `WHERE scheduled_publish_at IS NOT NULL AND status = 'draft'`. Trigger `cms_pages_scheduled_publish_check` rejects past fire times with 60s skew window. Column comments record Phase 12 intent. |
| Server actions | ✅ | `web/src/lib/site-admin/edit-mode/schedule-actions.ts` — `schedulePublishAction`, `cancelScheduledPublishAction`, `loadScheduledPublishAction`. All three gate on `requireStaff` + `requireTenantScope`. Schedule action enforces 60s future floor client-side (mirrors trigger). Cancel is idempotent. Load returns ISO + `scheduledByName`. |
| Drawer component | ✅ | `web/src/components/edit-chrome/schedule-drawer.tsx` — native `<input type="datetime-local">` with `min={now+60s}`. `defaultPickerValue()` defaults to 1hr-from-now rounded to next 5-min slot. Reloads via `loadScheduledPublishAction` on every open via `lastOpenRef` guard. Cancel-scheduled CTA appears when a schedule is set. Friendly Intl-formatted "currently scheduled for" header. |
| EditContext mutex | ✅ | `edit-context.tsx` adds `scheduleOpen / openSchedule / closeSchedule`. All 5 sibling open-* callbacks set `setScheduleOpen(false)` to mutex with the new drawer; `openSchedule` closes the 5 others. Value memo + dep array updated. |
| Drawer mount | ✅ | `edit-shell.tsx` imports `ScheduleDrawer` and mounts after `<AssetsDrawer />`. Width `460` registered in `DRAWER_WIDTHS`. |
| Topbar wiring | ✅ | `topbar.tsx` — `onSchedule?: () => void` added to `TopBarProps`; the publish split-button menu's "Schedule…" item now calls `onSchedule?.()` (replacing the Phase 11 console.info placeholder). `edit-shell.tsx` passes `onSchedule={openSchedule}`. |
| Escape priority chain | ✅ | `edit-shell.tsx` — keydown handler's drawer-Escape branch includes `scheduleOpen` in the predicate and `closeSchedule()` in the body. Dependency array updated. |
| Command palette row | ✅ | `command-palette.tsx` — `drawerRow("open-schedule", "Schedule publish", ...)` with synonyms `["schedule", "later", "future", "cron", "publish"]`. |

## Cron sweep — shipped (commit `3d55ab2`)

`/api/cron/publish-scheduled` is live as of `3d55ab2`. The capability bridge taken: `publishHomepage()` now accepts a `bypassCapabilityCheck?: boolean` opt-in flag. **Only** the cron route sets it; UI-driven publishes still go through `requirePhase5Capability`. The audit row continues to attribute the publish to the human in `scheduled_by`, so the trail is honest.

| Item | Status | Evidence |
|---|---|---|
| Cron route | ✅ | `web/src/app/api/cron/publish-scheduled/route.ts` — Bearer `CRON_SECRET` gated; service-role Supabase client; sweeps `cms_pages.scheduled_publish_at <= now() AND status = 'draft'`; per-row `publishHomepage()` call with `bypassCapabilityCheck: true`. |
| Schedule clear on success | ✅ | After successful publish, the route clears `scheduled_publish_at`, `scheduled_by`, `scheduled_revision_id`. Failed publishes leave the schedule intact so the next sweep retries. |
| Idempotency | ✅ | `publishHomepage()` itself uses CAS on `version`; a duplicate fire on a stale draft is rejected at the DB layer. |
| Capability bridge | ✅ | `publishHomepage()` lines 781–800 — `bypassCapabilityCheck?: boolean` parameter; gates the `requirePhase5Capability` call. JSDoc spells out that only `/api/cron/publish-scheduled` should set it. |
| Audit trail | ✅ | The audit row's `actor_profile_id` is set to `scheduled_by` (the human who scheduled), not a service identity. |

**Configure** the cron in `vercel.json` or via the Vercel dashboard:

```json
{
  "crons": [
    { "path": "/api/cron/publish-scheduled", "schedule": "* * * * *" }
  ]
}
```

Note: Vercel Hobby plan limits crons to once-per-day. For minute-level firing, the project must be on Pro or higher. The schedule string is otherwise standard cron.

## Notes

- **Visual smoke** — drawer only renders inside the staff-authenticated editor chrome at `?edit=1`. Manual screenshot pass requires a staff session.
- **DB skew** — both client (action) and DB (trigger) enforce a 60-second future floor. The client check gives a clean error before the round-trip; the trigger is the source of truth.
- **Timezone** — picker reads/writes operator's local time; storage is UTC ISO. Helpers `isoToLocalInputValue` / `localInputValueToIso` round-trip via `Date`.
