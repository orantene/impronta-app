# Home page backups (disaster recovery)

`impronta-home-published-2026-07-08.json` is a full snapshot of the LIVE Impronta
home (`published_homepage_snapshot`, version 1554, 210 nodes) taken 2026-07-08
after the cinematic-hero publish.

## Why this exists
The live home was seeded by a direct write to `published_homepage_snapshot` (not
through the visual builder), so the builder's own draft (`cms_pages.blocks`) is
empty. Opening the builder shows a blank/default composition. **Publishing from
the builder in that state would overwrite the live editorial home.** If that
happens, restore:

```
cd web
npx tsx --env-file=.env.local scripts/marathon-restore-home.mts
```

Then hard-refresh the site (home cache TTL ~5 min).
