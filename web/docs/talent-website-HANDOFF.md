# Talent website: handoff (2026-09-23)

Live state of the talent free-website work, written so any session can pick it up.
Plan: [`talent-website-execution-plan-2026-09-23.md`](talent-website-execution-plan-2026-09-23.md).
Design brief: [`talent-website-design-brief-2026-09-23.md`](talent-website-design-brief-2026-09-23.md).

## What is being built

The paid "Max site" engine becomes the **free** talent website at `<name>.tulala.digital`, chosen from an extensible **Design x Look** theme gallery, unlocked by completing the profile, edited in the real page builder with locked controls. One paid tier, **Web Office** (`talent_portfolio`, $15/mo, 14-day trial); Pro folds into it with existing subscribers grandfathered. A lapsed plan degrades the site instead of 404ing it.

## Status

| Phase | State |
|---|---|
| 5 Where I appear | **MERGED** to main (#2167) |
| Q QA harness | PR #2164, structural gate green, under review |
| 0 Theme gallery | PR #2166, all gates green, **needs its migration applied** |
| 2 Subdomain routing | PR #2169, all gates green, **needs its migration applied** |
| 1 Free renders, locked builder, Pro fold, rename | building in a worktree, branched off Phase 0 |
| 3 Badge + create wizard | not started, needs 0 and 1 |
| 4 Upgrade, trial, lapse | not started |

Feature switches, all default OFF when unset: `TALENT_THEME_GALLERY_ENABLED`, `TALENT_FREE_WEBSITE_ENABLED`, `TALENT_SITE_SUBDOMAINS_ENABLED`. Founder decision: set each to `true` in Vercel production as its phase merges.

## Merge gate (amended pre-launch: no customers, no traffic)

Structural CI gate green, unit and static tests green, code review with no unresolved findings, migration applied to production. Browser journeys are written per phase and run as a batch once the harness lands; they do not block a merge.

## THE ONE BLOCKER

Migrations must be applied to production before the PR that contains them merges (`CLAUDE.md`, "Schema + code shipping protocol"). The cloud session cannot do this: it has no Supabase credentials and its GitHub integration gets `403 Resource not accessible by integration` on every workflow dispatch, including workflows already on `main`.

A session on the founder's machine can, and `web/.env.local` there is current (verified 2026-09-23).

### Exact sequence, in order

Order matters. Applying 0 then pushing 2 from an un-rebased branch fails with `LegacyDbPushMissingLocalError`, because Phase 2's branch would not contain Phase 0's file.

```
# 1. Phase 0
git fetch origin
git checkout claude/talent-website-phase0-theme-gallery
cd web && npm run db:check && npm run db:push && npm run db:check
#    -> applies 20261231278000_talent_theme_catalog.sql (additive: one new
#       table, new columns on talent_sites). Then merge PR #2166.

# 2. Phase 2, only after #2166 is merged
git checkout claude/talent-website-phase2-subdomain
git rebase origin/main          # must contain 278000 before pushing 280000
cd web && npm run db:push && npm run db:check
#    -> applies 20261231280000_talent_site_subdomains.sql (two RPCs, three
#       namespace triggers, a NOT VALID check constraint). Then merge PR #2169.
```

Phase 1 adds `20261231279000_talent_site_domain_requires_max.sql`, applied the same way when its PR opens.

### Repo secrets (added 2026-09-23)

`SUPABASE_ACCESS_TOKEN`, `SUPABASE_DB_PASSWORD`, `SUPABASE_PROJECT_REF` are set. The token is scoped to Tulala Digital with project-settings read and database/migrations read-write, and **expires 31 Aug 2027**: after that the migrations workflow fails with a permissions error, not an obvious expiry message.

Once `.github/workflows/db-push.yml` is on `main` (it ships with PR #2164), a session that can dispatch workflows runs it instead of the commands above, with `dry_run` first.

## Rules learned the hard way

- **Never apply a migration with `apply_migration` or by hand.** It stamps its own version, so the ledger records a version matching no file, and `db:push` then refuses for everyone. This happened twice (`20260911232448`, `20260918215445`) and was repaired on 2026-09-23 with `supabase migration repair --status reverted`. `db:push` is the only path.
- **Never edit a file in `supabase/migrations/`.** CI-only fixes live in `supabase/ci/`.
- **Never run bare `tsc` or `eslint`.** Use `npm run typecheck` and `npm run lint`; they route through a machine-wide queue and starve it otherwise.
- A new unit test file must be appended to the explicit file list of the `test:builder` lane in `web/package.json`.
- en + es for every user-facing string; no em dashes.

## Known issues, deliberately not fixed

- **No browser journey has ever run.** J0, J1, J2, J3, J4, J7, J8 are written; none has executed. Everything merged so far is verified by unit tests and review only. The harness in PR #2164 is what changes that.
- **Phase 2's J4 has one assertion that fails on purpose**: a free-tier site does not render on its subdomain until Phase 1 moves the public gate. Written against the target behaviour rather than today's 404.
- **Nothing calls `syncBuiltinTalentThemes`.** The gallery falls back to the in-code built-ins, so it works, but authored rows and version bumps need a platform-admin action.
- **`/api/` is a blanket passthrough on talent hosts**, which now sit on the cookie-shared `.tulala.digital` apex. An allow-list keyed on `hostKind` is recommended.
- **CSP still allows inline scripts**, so the no-raw-HTML rule and the href/form neutralizers are the only barrier on a talent-controlled origin.
- The platform hub seeding migration never sets `plan_tier='network'`, which `getPlatformHubTenant()` requires. Production was fixed by hand; a fresh environment breaks.

## Worktrees on the cloud box

`/home/user/impronta-phase0`, `-phase1`, `-phase2`, `-phase5`, `-qa`, `-docs`. Each is a separate branch; `web/node_modules` is symlinked to the phase0 install.

## Mockups

Each approved design becomes one Design plus two to four Looks in the gallery. The handoff format the design agent should follow is in the design brief, under "Theme handoff". Drop frames and `HANDOFF.md` in `web/docs/talent-website-mockups/<slug>/`. The rule that matters: every color and font comes from the Look tokens, never hardcoded in a section, or that design can only ever have one look. Next vertical after the first design is private chef (`private-chefs`: villa, yacht, family chef), whose profile fields already exist.
