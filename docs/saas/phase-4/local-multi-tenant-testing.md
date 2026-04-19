# Local multi-tenant testing runbook

The app has four production route contexts, each served from a distinct
hostname. All of them resolve through the same code path —
`resolveTenantContext()` in [host-context.ts](../../../web/src/lib/saas/host-context.ts),
which queries `public.agency_domains`. There is no special case for
`.local`, no fallback for unregistered hosts, and no hardcoding anywhere
in the codebase.

To exercise all four contexts from a single `next dev` process, map four
loopback hostnames in `/etc/hosts` and visit them on `localhost:3000`.
The resolver will look each one up in the DB and route accordingly.

## 1. Add the four local hosts

Edit `/etc/hosts` (requires `sudo`) and append:

```
127.0.0.1  impronta.local
127.0.0.1  hub.local
127.0.0.1  app.local
127.0.0.1  marketing.local
```

One line per host — no wildcard syntax, no aliases on the same line.
macOS caches these; if a browser can't resolve them, run
`sudo dscacheutil -flushcache; sudo killall -HUP mDNSResponder`.

## 2. Confirm the seed is in place

The `.local` rows are seeded by migration
[`20260605100000_saas_p4_unified_domain_registry.sql`](../../../supabase/migrations/20260605100000_saas_p4_unified_domain_registry.sql).
Both hosted and local should already have them — verify with:

```sql
SELECT hostname, kind, tenant_id, status
FROM   public.agency_domains
WHERE  hostname LIKE '%.local'
ORDER  BY hostname;
```

Expected rows:

| hostname          | kind      | tenant_id                            |
|-------------------|-----------|--------------------------------------|
| app.local         | app       | NULL                                 |
| hub.local         | hub       | NULL                                 |
| impronta.local    | custom    | 00000000-0000-0000-0000-000000000001 |
| marketing.local   | marketing | NULL                                 |

If any are missing, re-apply the migration (`npx supabase db push`).

## 3. Start the dev server and visit each host

```
cd web && pnpm dev
```

Then browse to each in turn — the dev server listens on `:3000` and the
`Host` header is what the middleware keys off, not the destination IP.

| URL                             | Context   | What to expect                                                       |
|---------------------------------|-----------|----------------------------------------------------------------------|
| http://impronta.local:3000      | agency    | Agency #1 storefront — `x-impronta-tenant-id` set on every request   |
| http://hub.local:3000           | hub       | Cross-tenant hub (no tenant scope)                                   |
| http://app.local:3000           | app       | Admin/coordination app (auth-gated; no tenant scope)                 |
| http://marketing.local:3000     | marketing | Public SaaS marketing site (no tenant scope)                         |

Visiting `http://not-registered.local:3000` should 404. That's the
fail-hard contract — no silent fallback to tenant #1.

## 4. Isolation smoke tests

Run these while hitting each host to confirm scoping actually works:

- **Storefront directory** — `/directory` on `impronta.local` should
  only return talent whose `roster_tenants` includes tenant #1. On
  `hub.local` it spans all tenants.
- **CMS pages** — `/p/about` should 404 on `hub.local` but render on
  `impronta.local` when the page exists for tenant #1.
- **Site settings / theme** — gold accent color on `impronta.local`;
  default theme on `hub.local` / `marketing.local`.
- **Sitemap** — `/sitemap.xml` on `impronta.local` should only include
  tenant #1's CMS URLs.
- **Talent self-service** — sign in as a talent, visit
  `/talent/representations` on `app.local`; pending requests and
  roster memberships should all be scoped to the signed-in talent.

## 5. When to re-run this

After any change to:

- `resolveTenantContext()` or its callers (`host-context.ts`, `middleware.ts`)
- The `agency_domains` schema or seeds
- Any public storefront query — every one of them must add an explicit
  `.eq("tenant_id", publicScope.tenantId)` or gate on
  `getPublicTenantScope()`.

Touching any of those without running the four-host smoke test is how
cross-tenant leaks sneak in.
