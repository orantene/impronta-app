# Phase 5/6 — M0 blockers against the shared linked DB

**Status as of 2026-04-21.** Decision: option (3) — M0 migrations are NOT
applied to the linked DB; treat Phase 5/6 M0/M4/M5 code as **reviewed,
structurally verified where possible against the current shape, but NOT
visually proven against a real hub-enabled environment**.

See `scripts/verify-phase56-readonly.mjs` for the automated probe and
`docs/saas/phase-5-6/m0-apply-runbook.md` for the apply sequence once a
safe target is approved.

## What the current linked DB actually has (Tier 1 — verified green)

21 structural PASSes against `pluhdapdnuiulvxmyspd`, covering:

- **P1 agencies** — table shape + 3 seeded rows
- **P1.B tenancy** — `inquiries`, `agency_bookings`, `cms_pages`,
  `cms_sections`, `cms_navigation_menus` all carry NOT NULL `tenant_id`
- **P2 RLS** — enabled on `talent_profiles`, `agency_talent_roster`,
  `agency_memberships`, `talent_representation_requests`
- **P2 anon denial** — `talent_representation_requests` and
  `agency_memberships` fully deny anon; `agency_talent_roster` anon view
  is bounded to `status='active' AND agency_visibility IN
  ('site_visible','featured')` (21 rows visible, all in-window)
- **P4 CMS unique indexes** — every non-PK unique on tenantised CMS tables
  starts with `tenant_id` (`cms_pages_tenant_locale_slug_key`,
  `cms_pages_system_lookup_idx`, `cms_sections_tenant_name_key`,
  `cms_navigation_menus_tenant_zone_locale_key`)
- **P7 representation requests** — 15 columns, 2 non-internal triggers
  (`trg_..._effectuate`, `trg_..._touch_updated_at`), 4 RLS policies
- **Role RLS behavior** — talent SELECTs own profile; talent cannot see
  other talents' rep requests; super_admin reads all 25 live talent
  profiles and all rep requests (count=0)

## Informational findings (not blockers, but worth recording)

1. **`analytics_events` table does not exist on this DB.**
   `web/src/lib/analytics/server-log.ts` inserts via service role and
   swallows errors silently (`.from("analytics_events").insert(...)`
   fails, logs only in `NODE_ENV=development`). Consequences:
   - All `PRODUCT_ANALYTICS_EVENTS` writes are no-ops in prod (including
     pre-existing events, `invite_link_clicked`, `invite_converted`).
   - GA4 browser pings (if `NEXT_PUBLIC_GA_MEASUREMENT_ID` is set)
     continue to work — this only affects the internal `analytics_events`
     dual-write.
   - **This is pre-existing — not caused by M5 work.** Scope as a
     separate remediation task: either create the table, or remove the
     write call.

2. **Hub UUID `00000000-0000-0000-0000-000000000002` is currently
   occupied by "Tenant B (Verification)" with slug `tenant-b`.**
   M0 migration `20260625100000` contains `INSERT … ON CONFLICT (id) DO
   UPDATE SET slug='hub', display_name='Impronta Hub', kind='hub', …` —
   so applying M0 will **rewrite that row in place**. Any test data keyed
   by `tenant_id='00000000-…-000000000002'` becomes attributed to the
   hub. Pre-apply decision required (see runbook §2).

## What is NOT verifiable on this DB (Tier 2 — M0-dependent, SKIPPED)

Each item below is gated by a specific pending migration. The verifier
reports `skip` rather than `fail` for these — they're expected gaps, not
regressions.

### M0 schema gaps (four SKIPs in the latest run)

| Gap | Requires |
|---|---|
| `organization_kind` ENUM (`'agency','hub'`) absent | `20260625100000_saas_p56_m0_org_kind_and_hub_seed.sql` |
| `agencies.kind` column absent | `20260625100000` (same migration) |
| `agency_memberships_role_check` CHECK in M0 shape absent | `20260625120000_saas_p56_m0_membership_role_check.sql` |
| `talent_profiles.phone_e164` column absent | `20260625130000_saas_p56_m0_talent_phone_e164.sql` |

The `agency_domains` hub-rebind migration (`20260625110000`) has no
directly testable column-shape change — it UPDATEs existing rows'
`tenant_id` to the hub UUID once the hub exists. It cannot be verified
by column/constraint probe; only by post-apply data inspection.

### M4 — already-in-shape, but behavior unverifiable without M0

The verifier reports `pass` on three M4 probes because P7 (created the
rep-requests table) already ships with the needed columns, CHECK, and
partial unique index:

- `target_type` CHECK already allows `'agency','hub'`
- `talent_representation_requests_active_uniq` partial unique index
  exists
- `agency_talent_roster` has `hub_visibility_status`, `agency_visibility`,
  `status`, `tenant_id` columns

However, **behavior is unverifiable** because:

- No rows with `target_type='hub'` exist — the flow that creates them
  (agency-listing → submit-to-hub, talent-self → apply-to-hub) requires
  the hub agency row to be `kind='hub'` so the app-side routing can
  treat the hub correctly.
- The effectuation trigger's hub branch (moving an approved hub request
  into `agency_talent_roster` with `tenant_id=hub` and
  `hub_visibility_status='approved'`) has never fired on this DB.

### M5 — canonical talent surface + invite

- `profile_code` column + unique index already present (pre-M0
  baseline, pass).
- Canonical `/t/[profileCode]` overlay gate logic (app-host render, see
  `web/src/app/t/[profileCode]/page.tsx` — if it exists on this branch)
  branches on `agencies.kind`. Without `kind`, any branch taken is via
  code assumption, not DB-asserted state.
- Invite-accept analytics (`invite_link_clicked`, `invite_converted`)
  would write to the missing `analytics_events` table (info item #1
  above). Cookie round-trip, HMAC verification, and representation-
  request creation via `submitRepresentationRequest` ARE covered by the
  16 unit tests committed in `9e35451`.

## What is NOT verifiable period, without visual proof

Even once M0 is applied, the following require a real browser +
session to confirm. The read-only verifier does not cover them:

1. **UI wiring** — whether an agency/hub admin can generate an invite
   link, whether the recipient sees the correct copy on the landing
   page, whether post-auth redemption lands on `/talent/representations`.
2. **Pixel-level OG image render** — `/api/og/talent/[code]` output
   (Next.js ImageResponse): text fit, font loading, watermark position,
   brand colors. Server-run OK but visual is OK needs screenshot review.
3. **Hub admin approval flow** — picking up a request, writing a reason,
   effectuation side-effects visible in hub landing `/` render.
4. **Tenancy cookie bounce** — logging in on agency host A then
   navigating to agency host B triggering the tamper logger correctly.
5. **Middleware + allow-list** — `/invite/[token]` only reachable on the
   app host; all other hosts 404 it. `surface-allow-list.test.ts`
   covers the allow-list matrix but does not exercise middleware in a
   live Next dev server.

## Decision log

**2026-04-21** — User chose option (3): leave shared DB untouched, scope
verification to current shape, document blockers, continue non-
destructive work only. Do NOT run `supabase db push` without explicit
approval after the environment-safety question is re-opened.

Triggers that require reopening this decision:
- A safe target environment is approved (new preview project, a
  throwaway DB, Pro-plan branch).
- A user-facing surface requires live M0 data to proceed (e.g. a demo).
- The `analytics_events` silent-drop becomes a blocker for a customer-
  visible metric.
