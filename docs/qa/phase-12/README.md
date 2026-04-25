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

## Cron sweep — intentionally deferred

The `/api/cron/publish-scheduled` route is **not** in this commit. It needs a small bridge:

- `publishHomepage()` calls `requirePhase5Capability("agency.site_admin.homepage.publish", tenantId)` which queries the user-context. A service-role caller bypasses RLS but does not satisfy the capability check.
- Two clean ways to bridge it:
  1. Add a `bypassCapabilityCheck: 'cron'` flag to `publishHomepage()` that records the bypass in the audit row.
  2. Create a service-account profile with the capability granted and impersonate it from the cron handler.
- Neither is risky — both are ~30 line follow-ups. The schema + UX layer (this commit) is the heavier lift; a row sitting with `scheduled_publish_at` set but no cron is harmless until the sweep ships.

The trigger + partial index are already in place, so once the cron handler lands it just runs:
```sql
SELECT id FROM cms_pages
WHERE scheduled_publish_at IS NOT NULL
  AND scheduled_publish_at <= now()
  AND status = 'draft';
```
and calls `publishHomepage(tenantId, locale)` for each row.

## Notes

- **Visual smoke** — drawer only renders inside the staff-authenticated editor chrome at `?edit=1`. Manual screenshot pass requires a staff session.
- **DB skew** — both client (action) and DB (trigger) enforce a 60-second future floor. The client check gives a clean error before the round-trip; the trigger is the source of truth.
- **Timezone** — picker reads/writes operator's local time; storage is UTC ISO. Helpers `isoToLocalInputValue` / `localInputValueToIso` round-trip via `Date`.
