# L55 — `sensitive-but-public` field audit (resolved: false alarm)

## Phase 4.1's claim

> 174 "sensitive-but-public" risks — 174 of 273 fields are marked
> `is_sensitive` while also having `show_in_public = true`. This is a
> structural data issue (likely from bulk seeding), not a UI bug. The
> risk diagnostic surfaces it correctly; someone needs to audit which
> fields genuinely need both flags.
>
> — Phase 4.1 final report

## Reality at production HEAD (`828740d56`, audited 2026-05-27)

Queried `public.profile_field_definitions` (the table the actual
diagnostic at `web/src/app/(workspace)/platform/catalog-map-data.ts:211`
reads):

| Metric | Count |
|---|---|
| Total rows | 278 |
| `is_sensitive = true` | 35 |
| `show_in_public = true` | 198 |
| **Both `is_sensitive` AND `show_in_public` = true** | **1** |
| Both true AND `deprecated_at IS NULL` (i.e. live) | **0** |

The one row with both flags set:

```
field_key:       models.height
label:           Height
is_sensitive:    true
show_in_public:  true
deprecated_at:   2026-05-07T22:56:12.112187+00:00
```

Deprecated 20 days ago. Does not render anywhere; the resolver's
`deprecated_at` filter excludes it from all consumer surfaces. The
`platform/admin/catalog` "Sensitive + public" risk badge still surfaces
it in the diagnostic list because the diagnostic deliberately ignores
`deprecated_at` to catch the case where a row is reactivated — that's
intentional, not a leak.

## Why Phase 4.1's report said 174

Best guess: Phase 4.1's agent misread the diagnostic — possibly counted
rows from a different table (the legacy `public.field_definitions`,
which has 273 rows total but no `is_sensitive` column), or confused
the cumulative-across-tenants view with the per-platform view. Either
way, **the 174 figure does not reflect production state.**

## Action

**None required.** The deprecated `models.height` row stays as-is:
- It is not visible on any surface (resolver filters it out).
- It is intentionally shown in the catalog risk diagnostic so we'd
  notice if it were ever reactivated.
- Deleting deprecated rows is against the project's "no hard-deletes"
  policy.

## Outcome for the launch-readiness backlog

`web/docs/orantene-2026-05-27-session-backlog.md §8 L55` should be
flipped from "P0 — product call needed" to "resolved (false alarm)"
in the next backlog update. The actual data is fine.

## Audit tool

`web/scripts/audit-sensitive-public-fields-oneshot.mjs` (committed
alongside this doc) — re-runnable any time to verify the count stays
at 0 active. Buckets A / B / C (clearly-accident / genuine-PII /
uncertain) are still useful for any FUTURE flagging that surfaces;
the script is generic.
