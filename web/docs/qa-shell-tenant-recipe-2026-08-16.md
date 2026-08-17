# QA recipe: render the snapshot site-shell on a non-impronta tenant

**Status:** recipe verified via static code read + read-only DB checks
(2026-08-16). The actual env var + backfill call have **NOT been executed**
— see "Not verified live" at the bottom. This doc exists so the integrator
(and future lanes) don't have to rediscover the gate + backfill mechanics
from scratch.

## Why this is needed

The snapshot-rendered site shell (header + footer, replacing the hard-coded
`PublicHeader` / `PublicCmsFooterNav`) only renders for a tenant when BOTH:

1. `isSiteShellEnabledForTenant(tenantId)` in
   [`web/src/lib/site-admin/site-shell-flag.ts`](../src/lib/site-admin/site-shell-flag.ts)
   returns true, AND
2. the tenant has a **published** `cms_pages` row with
   `system_template_key = 'site_shell'` (checked by
   [`loadPublishedShell`](../src/lib/site-admin/server/shell-reads.ts)).

Impronta (`00000000-0000-0000-0000-000000000001`) is hard-coded into
`LAUNCH_SHELL_TENANT_IDS` and is the only tenant with both conditions met in
production today. Impronta itself is off-limits for QA — localhost points at
the **production** Supabase project (see the root `CLAUDE.md`), and the
header inspector autosave-publishes, so any click-through on impronta writes
to the real, live site.

## The QA tenant: nova-crew

- **tenant_id:** `33333333-3333-3333-3333-333333333333`
- **slug:** `nova-crew`
- **seeded local host:** `nova.lvh.me` (also `nova.local`; both rows exist in
  `public.agency_domains`, `status = 'active'`) — raw `localhost:<port>` 404s
  ("Host not registered"), you must hit the app through one of these hostnames.
- **owner dev-signin:** `nova-qa-owner@impronta.test` (passwordless
  `@impronta.test` dev-signin; membership = owner on nova-crew). See the
  user-memory `reference_qa_credentials.md` for the full credential list.
- **plan:** `free` tier (`agencies.plan_tier`) — the backfill action itself
  has no plan gate, but double-check any surface you're testing doesn't
  independently require a paid plan.

nova-crew already has ONE `site_shell` row (locale `en`, id
`5f6490ac-a98a-4406-a363-4e2f71b8a92d`) from a prior lane's attempt. Its
`status` is currently `archived` — its `published_page_snapshot` JSONB is
intact (2 slots, real Nova Crew content), but its `cms_page_sections` /
`cms_sections` child rows were deleted (archival in this codebase can't
hard-delete the `is_system_owned` `cms_pages` parent row, so the prior
attempt archived the parent and the children were removed separately). This
is exactly the case the backfill route's **repair path** (added in this PR)
now handles — see "Step 2" below.

## Step 1 — opt nova-crew into the RENDER gate (local env only)

Add to `web/.env.local` (gitignored, per-worktree — do **not** set this in
Vercel prod for a QA tenant):

```
ENABLE_SITE_SHELL=tenants
SITE_SHELL_TENANT_IDS=33333333-3333-3333-3333-333333333333
```

This does not touch `LAUNCH_SHELL_TENANT_IDS` (impronta stays hard-coded,
unconditionally on) and does not widen the default (unset `ENABLE_SITE_SHELL`
is still `off` for every tenant but impronta). The parser
(`readShellTenantAllowlist` in `site-shell-flag.ts`) accepts a comma list,
trims whitespace, and drops empty entries — you can list multiple QA tenants
here, comma-separated. See `web/src/lib/site-admin/site-shell-flag.test.ts`
(`[QA-shell] …` tests) for the full env-shape matrix this relies on.

The EDIT surface (Arrange tab, header/footer inspector) is gated
independently by `ENABLE_SITE_SHELL_EDIT` / `SITE_SHELL_EDIT_TENANT_IDS` —
set those too if you want to open the builder surface, not just view the
rendered result:

```
ENABLE_SITE_SHELL_EDIT=tenants
SITE_SHELL_EDIT_TENANT_IDS=33333333-3333-3333-3333-333333333333
```

Restart `npm run dev` after editing `.env.local` (Next.js only reads env at
process start).

## Step 2 — repair/backfill the shell row

Sign in as the nova-crew owner, then hit the dev-only backfill route on the
`nova.lvh.me` host:

```
GET http://nova.lvh.me:<port>/api/dev/backfill-shell
```

This route (`web/src/app/api/dev/backfill-shell/route.ts`) is only reachable
when `NODE_ENV=development` or `VERCEL_ENV=preview` (403s in production). It
calls `backfillSiteShellForCurrentTenant()`, which as of this PR does one of
three things depending on nova-crew's row:

| Existing row state | Action | What happens |
|---|---|---|
| none | `created` | fresh row + sections, seeded from `agency_business_identity` + `cms_navigation_links`, published immediately |
| `status = 'published'` | `already_existed` | no-op |
| `status != 'published'` (nova-crew's current `archived` row) | `repaired` | rebuilds header/footer `cms_sections` + `cms_page_sections` rows on the **same page id** — sourced from the row's own `published_page_snapshot` (preserves nova-crew's existing content instead of re-seeding from identity tables), then republishes |

**Preview first, before writing anything:**

```
GET http://nova.lvh.me:<port>/api/dev/backfill-shell?dryRun=1
```

Returns `{ ok: true, dryRun: true, wouldAction: "repaired", existingPageId,
existingStatus: "archived", brandLabel: "Nova Crew", headerNavItemCount,
footerNavColumnLinkCount, socialLinkCount, sourcedFromExistingSnapshot: true,
... }` for nova-crew's current row — no writes happen. Confirm the preview
looks right, then drop `?dryRun=1` to actually run it.

## Step 3 — view the result

With both env vars set and the shell row published, visit
`http://nova.lvh.me:<port>/` — the snapshot header (Nova Crew brand + nav)
and footer should render instead of the legacy `PublicHeader` /
`PublicCmsFooterNav`. With the edit-surface env also set, the Arrange tab /
inspector / variant gallery should be reachable from the site-admin shell for
this tenant.

## Which writes are safe on nova-crew

nova-crew is the established demo/QA tenant precisely because writes to it
are expected and low-risk — unlike impronta, it is not the live production
storefront anyone depends on. That said, localhost is still the **production
Supabase project** (per the root `CLAUDE.md`), so:

- Publishing / editing nova-crew's shell is the intended, safe QA action.
- Do not touch impronta's rows (`00000000-0000-0000-0000-000000000001`) while
  doing this QA — the render gate change in this PR does not add impronta to
  any new code path, but it's easy to fat-finger a tenant id when copy-pasting
  curl/env values. Double-check the tenant id before every write.
- The backfill route's `dryRun=1` mode exists specifically so a first pass
  can be read-only.

## Not verified live

This PR ships the gate extension test matrix, the backfill route's repair +
dry-run modes, and this recipe — but per the task's browser/dev-server
restriction, nobody has actually:

- set the two env vars in a running `npm run dev` and loaded `nova.lvh.me`,
- called `/api/dev/backfill-shell?dryRun=1` or the real (write) call against
  nova-crew,
- opened the Arrange tab / header inspector / variant gallery on nova-crew
  and confirmed they work end-to-end.

The integrator should run Step 1–3 above and confirm: (a) the dry-run preview
matches the table above, (b) the real call flips nova-crew's row to
`published` with fresh `cms_sections`/`cms_page_sections` rows, (c)
`nova.lvh.me` renders the snapshot shell, (d) the shell editor surfaces open
and save without error.
