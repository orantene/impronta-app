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
3. **Cutover redirect** — a bare demo host (`{siteSlug}.tulala.digital`) 308s to `{siteSlug}-demo.tulala.digital` in `talentSiteHostResponse`.
4. **Namespace** — `platform_subdomain_label_taken` treats `{siteSlug}-demo` as taken when a demo already holds `siteSlug`, so a real talent cannot claim a demo’s public host label.

## Going forward

New demo seeds keep an unsuffixed `siteSlug`. Seed/apply scripts verify lookup with `{siteSlug}-demo` and log that host. Do not rename `site_slug` to include `-demo`.
