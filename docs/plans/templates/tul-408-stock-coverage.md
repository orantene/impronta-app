# TUL-408 — Platform stock coverage audit

Notion: **TUL-408** (research type). Asserts every **unique-theme demo pack** and every distinct **acceptance-case** business type can draw at least one serving **hero or wide** and one **gallery** image from the resolved lifestyle pool (type rows, then family pack, then universal `custom`).

## Required set

| Source | File |
|---|---|
| TUL-38 demo packs | `web/scripts/demo-talents/unique-theme-map.ts` |
| Templates acceptance fixtures | `web/scripts/acceptance-cases.json` (same default as `seed-stock-engine.ts`) |

The union is deduped by `(businessType, family)`. Fashion model (`businessType: null`, family `custom`) is included explicitly.

## Run the audit (read-only)

From `web/` with production (or staging) Supabase credentials in `.env.local`:

```bash
npm run audit:stock-coverage
```

Or:

```bash
npx tsx --env-file=.env.local scripts/audit-stock-coverage.ts
```

**Environment**

- `NEXT_PUBLIC_SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

Exit **0** when all targets pass; **1** when any target is missing hero/wide or gallery, or when credentials are missing.

## Fill gaps (PM / operator, not the agent)

1. Plan cost: `npx tsx --env-file=.env.local scripts/seed-stock-engine.ts`
2. Generate missing units: `… --apply --types nail-salon,handyman` (or `--families-only` for family slots)
3. Approve heroes in **Platform → Stock → Review** (`/platform/admin/stock/review`). Gallery and detail may serve at `qa_passed`.
4. Re-run `npm run audit:stock-coverage` until green.

No SQL migration ships stock bytes; the git manifest (`docs/plans/templates/stock-manifest.json`) is universal-only and does not prove live coverage.

## Tests

```bash
cd web && npm run test:wt -- scripts/lib/stock-coverage-audit.test.ts
```

The static test pins the required target keys so the trade list cannot drift silently.
