# Workspace Activity Log

A per-workspace audit trail: one row for every meaningful action inside a
workspace, with who did it, when, and from where. Lives at
**Admin → Settings → Advanced → Activity log** (`/admin/activity-log`).

Built for two audiences:
- **Workspace admins/owners** — "who changed this setting / deleted that photo?"
- **Tulala support** — reconstructing what happened before a complaint.

---

## Where it sits among the existing audit layers

This is an **additive fifth layer**. It does not replace any of the four that
already existed, and none of them were repointed:

| Layer | Table | Scope |
|---|---|---|
| Platform (HQ) audit | `platform_audit_log` | cross-tenant security/compliance, super-admin actions |
| Builder Lab governance | `builder_lab_audit` | catalog/template governance with before/after diffs |
| Inquiry timeline | `inquiry_events` | user-visible inquiry facts |
| Booking timeline | `booking_activity_log` | commercial booking timeline |
| **Workspace Activity Log** | **`workspace_audit_events`** | **everything that happened inside one workspace** |

Two of the existing helpers **mirror** into the new table so the log stays
complete without instrumenting hundreds of call sites twice:

- `lib/site-admin/audit.ts` (`emitAuditEvent` / `scheduleAuditEvent`) — every
  page/section/navigation/homepage publish and every branding/identity/design
  edit already flowed through here. Branding/identity/design map to category
  `settings`; everything else maps to `pages`.
- `lib/server/commercial-audit.ts` (`logBookingActivity`) — booking lifecycle.
- `lib/bookings/transactions.ts` (`emitTransactionEvent`) — the single choke
  point for **every** transaction transition (created → requested → paid →
  payout → refunded / disputed / failed), so all of them land in `billing`.

---

## Schema

`supabase/migrations/20261111030000_workspace_audit_events.sql`

```
workspace_audit_events
  id, tenant_id, created_at
  actor_user_id, actor_label, actor_kind    -- who (label snapshotted at write time)
  action, category                          -- what (dotted action + filter bucket)
  target_type, target_id, target_label      -- what was touched
  summary                                   -- human one-liner shown in the table
  metadata JSONB                            -- small structured extras
  ip_address INET, country, user_agent      -- from where
  correlation_id                            -- ties rows to server logs
```

`category` is a CHECK-constrained enum-ish set (the filter dropdown):
`settings, team, roster, media, pages, billing, messages, auth, domain,
integration, security, system`.

`actor_kind`: `staff, talent, client, platform, system, guest`.

**Security model**
- **No INSERT policy.** All writes go through the service-role client, so rows
  cannot be forged or spoofed from a browser.
- **SELECT** is RLS-gated to `is_staff_of_tenant(tenant_id)` (membership-based).
- The page itself gates on the `manage_agency_settings` capability
  (admin/owner) because the log exposes IP addresses and failed-sign-in events.
- Rows are append-only; nothing in the app updates or deletes them except the
  retention job.

---

## Writing an event

```ts
import { scheduleWorkspaceAudit } from "@/lib/audit/workspace-audit";

scheduleWorkspaceAudit({
  tenantId,
  category: "settings",
  action: "settings.branding.updated",
  summary: "Updated branding: logo, accent color",
  targetType: "agency",
  targetId: tenantId,
  metadata: { changedKeys },
});
```

Or, in files close to the 800-line budget, the compact positional form
(`lib/audit/emit.ts`) — it also absorbs the `tenantId` null-guard:

```ts
import { auditEvent } from "@/lib/audit/emit";
auditEvent(tenantId, "settings", "settings.branding.updated", "Updated branding",
  { metadata: { changedKeys } });
```

Rules:
- **Call without `await`.** It is fire-and-forget and never throws; an audit
  failure must not break the mutation that already succeeded.
- **Success path only.** The one deliberate exception is
  `auth.sign_in_failed` (category `security`), which logs rejected credentials.
- **Actor, IP, country and user agent are captured automatically** from the
  request. Do not pass them, except in auth flows where the session is not yet
  the one you want to record.
- **Keep `metadata` small** (changed key names, ids, counts). Never full entity
  snapshots, and never secret values — integration actions log the *field name*
  only, never the key.

### Failures and refusals

`auditFailure(...)` (same module) records something that **failed or was
refused** — a permission denial, an upload that did not land, a payment that
failed. Its `reason` goes into `metadata.reason`.

This is deliberately **not** a mirror of `logServerError`: there are ~480 of
those, most carry no workspace context, and piping them all in would flood the
log and the retention cap with noise support cannot act on. Ordinary crashes
stay in Sentry; the two systems answer different questions.

Currently recorded:

| Event | Where |
|---|---|
| `security.permission_denied` | `requireStaffTenantAction` — a signed-in member tried something their role does not grant (the single choke point for staff actions) |
| `media.upload.failed` | signed-upload register route — rejected or unprocessable image |
| `auth.sign_in_failed` | rejected credentials |
| `billing.payment.failed` / `billing.payout.failed` | transaction state machine (already flows through `emitTransactionEvent`) |

**Convention:** a failure action ends in `.failed` / `.denied` / `.rejected`,
with either `.` or `_` before the word. `isFailureAction()` in `filter.ts`
detects it and the table shows a red **Failed** badge and tints the row — no
schema column, so adding a failure event never needs a migration.

### Why it costs almost nothing at request time

`scheduleWorkspaceAudit` captures request context (headers + session)
**eagerly**, while the request scope is alive, then defers the actual INSERT
past the response flush via Next's `after()`. The user never waits on the audit
write.

When building the event itself needs work the caller should not wait on (for
example resolving a tenant id from a booking row), use
`scheduleWorkspaceAuditWith(resolve)` — context is still captured eagerly, but
`resolve()` runs after the response too. Returning `null` skips the write.

`logWorkspaceAudit` is the awaited variant, for contexts where `after()` is not
available (cron routes, webhooks).

### IP is the trusted hop

Vercel appends the real client IP to the **right** of `x-forwarded-for`, so the
rightmost hop is platform-set and non-spoofable; the leftmost is
attacker-controlled. The helper prefers `x-real-ip`, then the rightmost XFF
hop. Country comes from `x-vercel-ip-country`.

---

## Keeping the table small

Two bounds, both enforced by
`public.workspace_audit_events_trim(retain_days := 180, max_rows_per_tenant := 50000)`:

1. delete everything older than 180 days;
2. then trim any tenant still above 50k rows to its newest 50k.

Run nightly at 03:30 UTC by `/api/cron/workspace-audit-trim` (declared in
`web/vercel.json`, authorised by `CRON_SECRET` like every other cron route).
The function is `SECURITY DEFINER` and revoked from `anon`/`authenticated`, so
it is service-role only.

Indexes are deliberately few (the table is insert-heavy): `(tenant_id,
created_at DESC)`, `(tenant_id, category, created_at DESC)`, and a partial
`(tenant_id, actor_user_id, created_at DESC)`.

The page loads the newest 300 rows by default (`?limit=` up to 1000) and
filters client-side, so a large table never turns into a large query.

---

## Adding a new event type

1. Pick an existing `category` (adding one means a migration to widen the CHECK
   constraint **and** an i18n key `dashboard.adminActivityLog.category.<id>`).
2. Use a dotted `action` — `<area>.<thing>.<verb>`, e.g. `roster.talent.created`.
3. Write a plain-English `summary`. No em dashes (product copy rule).
4. Add the call on the success path of the server action.

Filter logic is pure and unit-tested:
`src/app/(workspace)/[tenantSlug]/admin/activity-log/filter.ts` +
`filter.test.ts`, run in CI via `npm run test:activity-log`.
