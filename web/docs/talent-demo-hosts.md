# Talent demo public hosts

**Convention (Oran, 2026-10-04):** every demo talent’s public host uses the `-demo` suffix so it is obvious the site is a demo.

```
https://{siteSlug}-demo.tulala.digital
```

Examples:

- `https://alba-nail-artist-demo.tulala.digital`
- `https://camila-nails-demo.tulala.digital`
- `https://renata-lashes-demo.tulala.digital`

## What stays the same

- `talent_sites.site_slug` is still the identity / path slug (`alba-nail-artist`, not `alba-nail-artist-demo`).
- Path address remains `/t/site/{siteSlug}`.
- Display names and demo content are unchanged.

## How it works

1. **Lookup** — `talent_site_subdomain_lookup` resolves both the exact `site_slug` and `{site_slug}-demo` when `talent_profiles.is_demo = true` (migration `20261231343000_talent_demo_host_suffix.sql`).
2. **Public URLs** — emitters pass `isDemo: true` into `talentSitePublicUrl` / `talentSiteHostLabel` so links use the `-demo` host.
3. **Cutover redirect** — any demo subdomain whose label is not already `{siteSlug}-demo` 308s to `{siteSlug}-demo.tulala.digital` in `talentSiteHostResponse` (bare cutover and design vanity `*-demo` aliases).
4. **Namespace** — `platform_subdomain_label_taken` treats `{siteSlug}-demo` as taken when a demo already holds `siteSlug`, so a real talent cannot claim a demo’s public host label.

## Design vanity hosts (finished gallery)

These labels are **not** `talent_sites.site_slug` values. They alias to each design’s featured published demo via `talent_site_subdomain_lookup` (migration `20261231345000_design_demo_host_aliases.sql`), then **308 to the featured demo’s canonical `-demo` host** so the browser URL matches the talent:

| Host | Resolves to | Redirects to |
|---|---|---|
| `maison-v2-demo.tulala.digital` (also bare `maison-v2`) | `alba-nail-artist` | `alba-nail-artist-demo.tulala.digital` |
| `folio-demo.tulala.digital` (also bare `folio`) | `mateo-ferrer` | `mateo-ferrer-demo.tulala.digital` |
| `gridline-demo.tulala.digital` (also bare `gridline`) | `alex-trevino` | `alex-trevino-demo.tulala.digital` |

## QA shorthand hosts (GRK-089 / TUL-537)

Short labels that QA typed against demos. They are **not** `site_slug` values. Lookup aliases them (migration `20261231357000_demo_host_shorthand_aliases.sql`), then the host response **308s** to the featured demo’s canonical `-demo` host:

| Host | Resolves to | Redirects to |
|---|---|---|
| `alba-demo.tulala.digital` | `alba-nail-artist` | `alba-nail-artist-demo.tulala.digital` |
| `linh-demo.tulala.digital` | `linh-tran` | `linh-tran-demo.tulala.digital` |
| `sofia-nails-demo.tulala.digital` | `camila-nails` (live nails demo; no `sofia-nails` slug) | `camila-nails-demo.tulala.digital` |

Do **not** seed these (or talent `{siteSlug}-demo` hosts) into `agency_domains` — that table wins first and would serve them as agency/app hosts instead of talent sites.

## Going forward

New demo seeds keep an unsuffixed `siteSlug`. Seed/apply scripts verify lookup with `{siteSlug}-demo` and log that host. Do not rename `site_slug` to include `-demo`.
