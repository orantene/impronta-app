# Phase 5/6 — M0 post-apply follow-ups

**Status:** M0 apply landed 2026-04-21 on linked DB `pluhdapdnuiulvxmyspd`.
Verifier green (`--post-m0` exit 0, 15 M0 probes pass). Hub-approval
trigger verified via service-role smoke (insert → accept → roster row
written with hub tenancy → cleanup, zero residue).

The items below are **non-blocking** — deliberately scoped out of the M0
stream so it could close cleanly. Pick up in any order as separate
slices.

## 1. Tenant B fixture cleanup

**Why:** M0 `20260625100000` rewrote the hub UUID row in place with
`ON CONFLICT (id) DO UPDATE`. The pre-apply occupant "Tenant B
(Verification)" had:

- 2 `agency_domains` rows (fixture hostnames) — rebound to the hub by
  migration `20260625110000` (intended behaviour).
- 1 `cms_pages` row (`slug='about'`) now cosmetically hub-attributed.
- 0 memberships / 0 inquiries / 0 bookings / 0 roster rows (confirmed
  pre-apply).

**How to apply:** Short SQL slice to delete the stale fixture domains
and the orphaned `about` CMS page. Safe — they predate the hub and are
not referenced by any production flow.

```sql
-- Drop after confirming in staging first.
DELETE FROM public.cms_pages
 WHERE tenant_id = '00000000-0000-0000-0000-000000000002'
   AND slug = 'about'
   AND created_at < '2026-04-21';

DELETE FROM public.agency_domains
 WHERE tenant_id = '00000000-0000-0000-0000-000000000002'
   AND host IN ( /* list the 2 fixture hostnames here */ );
```

## 2. `logAnalyticsEventServer` tenant_id threading

**Why:** Migration `20260625140000` created `analytics_events` with
`tenant_id NOT NULL DEFAULT '00000000-…-000000000001'` (demo tenant).
The server writer (`web/src/lib/analytics/server-log.ts`) does not pass
`tenant_id` today — every event is attributed to the demo tenant.
Per-tenant analytics dashboards will reflect this distortion once they
land.

**How to apply:** Thread the request-context tenant through
`logAnalyticsEventServer`. Call sites should already have tenant scope
via `getTenantScope()`. Unit test that the writer honours an explicit
tenant override.

## 3. OG / invite visual review

**Why:** The invite-accept flow (`9e35451`) and canonical talent OG
image (`/api/og/talent/[code]`) are covered by 16 unit tests but have
never been pixel-reviewed. Not a correctness concern — a polish one.

**How to apply:** Browser smoke — generate an invite as a tenant admin,
open the landing page, verify copy fits and OG image renders with
correct font/watermark/brand colours. Capture screenshots for the phase
record.

## Not included here

These items were already folded into the M0 stream and need no follow-up:

- `analytics_events` table bootstrap — shipped in `20260625140000`.
- Verifier `--post-m0` probes — shipped in `fda6910`.
- Verifier membership-role CHECK label fix — shipped in `b7293a3`.
