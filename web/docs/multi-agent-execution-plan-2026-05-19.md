# Page-Builder Impronta — Multi-Agent Execution Plan
*2026-05-19 — covers items #1–#18 from the post-6C remaining-work list.*

## Status at write time

- **6C COMPLETE** — 17 local commits on `phase-1` (latest `641782e1d`).
  Branch is `ahead 27, behind 41` of `origin/phase-1`.
- **Chrome-browser-QA verified on `/impronta` 2026-05-19**:
  header brand → `/impronta`; 5 nav links tenant-prefixed; footer
  columns prefixed + root `/register`/`/login`; hero search action +
  CTAs + chips + 7 talent-type cards + featured_talent CTA + cta_banner
  all resolve correctly; **zero console errors**; zero
  `/impronta/<auth>` anywhere.
- Standing constraints: **nothing pushed or deployed**; branch
  governance: scoped local commits only.

## Per-agent contract (applies to EVERY agent in this plan)

1. **Worktree isolation** (`isolation: "worktree"` on `Agent` calls).
   Required for any agent that may edit files — prevents shared-branch
   collisions with concurrent agents and the directory-section agent.
2. **Scoped local commits only** — touch only the files for the
   assigned item; NEVER stage other agents' files; NEVER push, deploy,
   rebase, or reset shared branches.
3. **Authoritative gate** — `npx tsc --noEmit` is **poisoned by the
   running dev server** (corrupt `.next/dev/types/routes.d.ts`). Before
   trusting tsc, ALWAYS stop the :3000 dev server, `rm -rf web/.next`,
   then run tsc. Filtering `.next/` lines from poisoned output is NOT
   sufficient.
4. **Chrome MCP for QA** — use `mcp__Claude_in_Chrome__*` (real
   browser, console, network), not just curl/fetch. The DOM check
   caught a `prefixPublicHref is not defined` regression in
   featured_talent that tsc masked.
5. **Continue improving** — if an agent encounters errors / gaps /
   small bugs in adjacent code while working on its item, fix in-scope.
   For larger out-of-scope findings, use
   `mcp__ccd_session__spawn_task` to flag a separate session.
6. **Final report** — commit hashes (or worktree branch + hashes),
   Chrome QA evidence (URL + element findings + console = clean), and
   any newly-flagged bugs / follow-ons.

---

## Wave 0 — OWNER GATES (blocking; you, not an agent)

| # | Action | Unblocks |
|---|--------|----------|
| O1 (#1) | Approve push of the 17 local 6C commits | Wave 1 |
| O2 (#2) | Set Vercel prod env vars `ENABLE_SITE_SHELL=tenants`, `SITE_SHELL_TENANT_IDS=00000000-0000-0000-0000-000000000001` | Wave 4 |
| O3 (#3) | Apply `impronta-home` starter in the real Impronta tenant admin scope (post-push) | Wave 4 |

## Wave 1 — Integration (SINGLE agent, serial, after O1)

**One agent only.** Rebasing the shared branch is single-threaded.

1. (#4) `git fetch origin && git pull --rebase origin phase-1` — expect
   conflicts with the directory-section agent in `registry.ts`,
   `default-content.ts`, `registry-editors.ts`. Resolve preserving 6C
   intent + their additions.
2. (#5) Authoritative re-gate: stop dev, `rm -rf web/.next`,
   `npx tsc --noEmit`, `npm run lint`, `npm run test:node-presentation`,
   `npx tsx --test web/src/lib/site-admin/links/resolve-link-ref.test.ts`.
3. (#6) Chrome-browser re-QA of `/impronta` (use the same baseline JS
   evaluator pattern). All hrefs identical or stronger; zero console
   errors; zero `/impronta/<auth>`.
4. (#7) `git push origin phase-1` then `npm run deploy:promote` +
   `npm run deploy:smoke`. Confirm `tulala.digital` + `app.tulala.digital`
   aliased to the new deployment.

## Wave 2 — Independent parallel agents (can start NOW, no user gate)

Three short, scoped, fully-independent items. Spawn in parallel
worktrees.

| Agent | Item | Scope |
|-------|------|-------|
| W2-A | (#17) builder-capabilities harness | Fix `Cannot find module 'server-only'` in `tsx --test` for `workspace-template-rows.test.ts` / `section-meta-registry.test.ts` / `section-template-starters.test.ts` (#11/#14/#15). Likely a tsx config tweak or test-isolation shim. |
| W2-B | (#16) Discipline glyph library | Expand the 8 preset icons in `talent_type_grid` (`Component.tsx` `renderCardIcon` + `Editor.tsx` `ICON_PRESETS`). Pure additive; Chrome-QA on `/impronta` (tt-grid cards). |
| W2-C | (#10) ThemeFoundationsDrawer cleanup | Remove the dead UI + its unread-settings writes. Verify no remaining importers + Chrome-QA admin loads cleanly. |

## Wave 3 — Section follow-ons (parallel after Wave 2, each worktree)

Six deeper items. Each gets its own worktree agent.

| Agent | Item | Scope |
|-------|------|-------|
| W3-D | (#11) talent_type_grid taxonomy picker | Replace the manual term-id text field in `talent_type_grid/Editor.tsx` with a visual taxonomy-term picker. Reuse the existing query layer; do NOT invent taxonomy fields. |
| W3-E | (#12) hero_search dynamic chip sources | Implement `service_areas` + `roster_cities` modes in `hero_search/fetch.ts`. Tenant-scoped (`listTalentIdsOnTenantRoster`); zero-safe; manual stays interim. |
| W3-F | (#13) location_discovery enhancements | `service_areas` mode + (separately) map embed. Map = token-driven, no external dep duplication. |
| W3-G | (#14) editorial_split_hero dynamic media | `selected` / `dynamic` talent-preview media modes (couples to the cache-trimmed featured DTO — coordinate with W3-H). |
| W3-H | (#15) featured_talent DTO extension | Extend `FeaturedTalentCardDTO` with `secondaryType` / `languages` / `availability` / true parent-category. Schema-additive; back-compat. |
| W3-I | (#9) Logo single-source bridge | Consolidate the 3 stores (`agency_branding.brand_mark_svg` is live; `*_media_asset_id` + `agencies.settings.branding.logo_url` are stale). Phase-4-followup. |

## Wave 4 — Production cleanup (gated on O2 live + Wave 1 pushed)

| Agent | Item | Scope |
|-------|------|-------|
| W4-J | (#8) Phase 5 legacy fallback removal | Delete `PublicHeader` / hardcoded inline `<footer>` / the deprecated `agency-home-storefront.tsx` fallback stack (TalentTypeShortcuts / FeaturedTalentSection / BestForSection / LocationSection / HowItWorks / CtaSection). Verify nothing imports them. |

## Wave 5 — Coordination (continuous, not a wave)

- (#18) **Directory-section agent**: their in-flight uncommitted
  `registry.ts` / `default-content.ts` / `registry-editors.ts` + new
  `directory/` section + new untracked server files share the
  section-registry neighborhood. Sequence the Wave 1 rebase around
  their commit timing. If they push first, the W1 agent resolves any
  conflicts preserving 6C; if W1 pushes first, they rebase onto 6C.

---

## Spawn order this session

Wave 2 fires NOW in parallel (3 agents, worktree-isolated,
local-commit-only). Wave 3 fires after Wave 2's three agents return
their final reports — to keep the human-review surface tractable and
to avoid 9 worktrees mid-flight. Wave 1, Wave 4, Wave 0 are owner-gated.

*End — multi-agent plan 2026-05-19.*
