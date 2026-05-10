# Phase B — Site shell (header / footer)

**Capability:** Builder v1 (see [builder-convergence-plan.md](./builder-convergence-plan.md) §3) — header and footer editable like body sections with inspector parity.

## Ship checklist (Bucket C)

1. **`site_shell` / synthetic page join** — convergence plan Phase B; snapshot rendering for `PublicHeader` + footer in edit mode.
2. **Selection + inspector** — match body section affordances on the storefront shell regions.
3. **Publish + cache (C2)** — when shell content publishes, every tenant route that embeds the shell must invalidate. Homepage publish path calls `republishSiteShellSnapshot` and revalidates `pages-all` plus **`storefront`** (`composition-actions.ts`). Audit remaining reads if any shell-specific cached surfaces appear.

## Feature flag

Roll out behind tenant flag if shell edits risk breaking live storefronts during migration.

## References

- [builder-convergence-plan.md](./builder-convergence-plan.md)
- [builder-experience-execution-plan.md](./builder-experience-execution-plan.md) — Bucket C
