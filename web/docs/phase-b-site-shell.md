# Phase B — Site shell (header / footer)

**Capability:** Builder v1 (see [builder-convergence-plan.md](./builder-convergence-plan.md) §3) — header and footer editable like body sections with inspector parity.

## Ship checklist (Bucket C)

1. **`site_shell` / synthetic page join** — convergence plan Phase B; snapshot rendering for `PublicHeader` + footer in edit mode.
2. **Selection + inspector** — match body section affordances on the storefront shell regions.
3. **Publish + cache (C2)** — when shell content publishes, every tenant route that embeds the shell must invalidate. Homepage publish calls `republishSiteShellSnapshot` then revalidates **`pages-all`** plus **`storefront`** (`composition-actions.ts`); shell seed/backfill publish uses the same pair (`site-shell-backfill-action.ts`); admin "publish draft" of a `site_shell` page row via `publishPageSnapshot` (`page-composer-action.ts`) revalidates **`pages:{pageId}`** + **`pages-all`** + **`storefront`**. `loadPublishedShell` is tagged with `pages-all` only (`shell-reads.ts`) so any of those busts invalidates it. Audit remaining reads if any shell-specific cached surfaces appear.

   **Hub IA:** Staff bookmarks to **`/admin/site`** (dashboard) use the same thin redirect as **`/admin/site-settings`** → workspace **Website** (`legacy-site-settings-redirect.ts`), so the control-center label and the legacy CMS tree stay one hop apart without 404s.

## Feature flag

Roll out behind tenant flag if shell edits risk breaking live storefronts during migration.

## References

- [builder-convergence-plan.md](./builder-convergence-plan.md)
- [builder-experience-execution-plan.md](./builder-experience-execution-plan.md) — Bucket C
