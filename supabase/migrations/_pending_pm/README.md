# Pending migrations (PM applies)

Files here are **not** scanned by `web/scripts/check-migrations-applied.mjs`
(non-recursive), so Vercel prebuild can pass while the SQL stays in-repo for PM.

Before merge / `db:push`:

```bash
mv supabase/migrations/_pending_pm/<file>.sql supabase/migrations/
cd web && npm run db:push && npm run db:check
```

Wave 1B D6: `20261231357100_talent_site_domains_plan_grace.sql`
