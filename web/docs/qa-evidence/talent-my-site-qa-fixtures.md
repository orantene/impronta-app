# Talent My Site — QA fixtures & known blockers

**Last updated:** 2026-05-26

## Apply fixtures

```bash
# Prerequisites: seed_tulum_spanish_talent.sql + register:tulum-demo-talent
cd web && npm run seed:talent-my-site-qa
```

SQL source: `supabase/seed_talent_my_site_qa.sql`

## Sign-in matrix (localhost)

| Flow | Email | Password | Plan | Profile code |
|------|-------|----------|------|----------------|
| A Free | `tulum-talent-sofia@impronta.test` | `Impronta-Tulum-Talent-2026!` | `talent_basic` | `TAL-92001` |
| B Pro | `tulum-talent-carmen@impronta.test` | `Impronta-Tulum-Talent-2026!` | `talent_pro` | `TAL-92002` |
| C Max | `qa-talent-dashboard-audit@impronta.test` | (see reference QA creds) | `talent_portfolio` | `TAL-AUDIT-0512` |

Do **not** use `qa-admin@impronta.test` for talent-surface My Site QA — `app_role=super_admin` redirects to the admin workspace.

## Agency sitemap roster

After the seed, `TAL-92001`, `TAL-92002`, and `TAL-AUDIT-0512` have `created_by_agency_id` set to the Impronta demo tenant. `TAL-AUDIT-0512` is also reset to `talent_portfolio` for Flow C. On `impronta.local`, `/sitemap.xml` should list the roster URLs for these profiles (EN + ES).

## Dev server

Prefer webpack when Turbopack shows route/API drift on `/talent/site`:

```bash
cd web && npm run dev -- --webpack
```

## Known from 2026-05-26 QA report

- Pro identity: use Carmen (`tulum-talent-carmen@impronta.test`), not `qa-admin@impronta.test`.
- Agency sitemap: requires `created_by_agency_id` roster rows — run `seed:talent-my-site-qa` if count is zero.
- Duplicate React keys on My site preview links: fixed via `publicProfileUrl` → `/t/<code>?preview=1`.
- Full `npm run ci` may fail on unrelated untracked `talent-self-services.ts` lint — not part of My Site ship gate.
