---
title: Canonical Admin Migration — Execution Plan
status: ready to execute
created: 2026-05-11
companion_to: docs/plans/admin-migration-manifest-2026-05-11.md
branch: migration/admin-canonical (from stable-work)
estimated_duration: 3-4 hours focused work, half-day end-to-end including ship
risk: low (code-only, no DB changes, two-commit revert)
---

# Canonical Admin Migration — Execution Plan

This document is the step-by-step companion to the read-only manifest (`admin-migration-manifest-2026-05-11.md`). The manifest captures **what** and **why**; this plan captures **how** and **when**.

**Goal:** remove the `prototype` namespace from production code paths. After this lands, no production file imports anything under `app/prototypes/`, `components/prototype/`, or `lib/prototype/`. The admin shell still exists — just under canonical admin-owned paths.

**Non-goals:** breaking up `_drawers.tsx` / `_pages.tsx` / `_state.tsx` (refactor — Phase 2). Replacing `PageRouteSyncer` with native Next.js navigation (Phase 3). These are the actual scalability wins; this migration is the *unblocker*.

---

## Phase 0 — Pre-flight (✅ completed 2026-05-11)

- [x] Confirmed all 4 in-flight worktrees were already merged to `stable-work` (photo upload state machine, portfolioCount, Phase 6.1 inquiry skill — all present)
- [x] Removed 4 stale worktrees (`agent-a7910dac6cc963a2c`, `agent-ad44e4fcdcd06b769`, `competent-kapitsa-cb86e8`, `great-ptolemy-1747d5`)
- [x] `git worktree list` shows only main worktree
- [x] `stable-work` tree clean (only untracked is `docs/plans/admin-migration-manifest-2026-05-11.md` from this session)

---

## Phase 1 — Branch + baseline (15 min)

```bash
# 1. Branch from stable-work
git checkout -b migration/admin-canonical

# 2. Commit the manifest (the read-only inventory document)
git add docs/plans/admin-migration-manifest-2026-05-11.md docs/plans/admin-canonical-migration-execution-plan-2026-05-11.md
git commit -m "docs(admin-migration): add inventory manifest + execution plan"

# 3. Baseline build green
cd web && pnpm install --frozen-lockfile && pnpm typecheck
# Expect: green. If red, stop — pre-existing issue, not migration-caused.

# 4. Baseline localhost smoke
pnpm dev  # in one terminal
# In a browser, sign in with each of the 4 QA accounts from reference_qa_credentials memory:
#   - admin (workspace surface)
#   - talent (talent surface)
#   - client (client surface)
#   - super_admin (platform surface)
# Click through one page per surface. Take SCREENSHOTS — this is the "before" we'll compare to.
# Drawer-open at least one talent profile drawer (tests the largest UI path).
```

**Exit gate for Phase 1:** typecheck green, screenshots captured for all 4 surfaces.

---

## Phase 2 — Commit A: pure `git mv` (30 min)

This commit ONLY moves files. The build will be RED after this commit; no file content changes. The goal is `git mv` everywhere so blame/history is preserved.

### A.1 — Sanity check before moves

```bash
git status --short
# Expect: clean (the manifest + plan are already committed in Phase 1)
```

### A.2 — Move `lib/prototype/` → `lib/admin/`

```bash
mkdir -p web/src/lib/admin/shell

git mv web/src/lib/prototype/admin-prototype-nav.ts          web/src/lib/admin/admin-nav.ts
git mv web/src/lib/prototype/admin-prototype-nav-match.ts    web/src/lib/admin/admin-nav-match.ts
git mv web/src/lib/prototype/admin-prototype-prefs.ts        web/src/components/admin/shell/internal/prefs.ts
# (prefs.ts is shell-internal — only used by admin-shell. Goes with the shell.)

# Confirm lib/prototype/ is now empty:
ls web/src/lib/prototype/ 2>/dev/null
# Expect: empty (or "No such file or directory" after git stages the dir removal)
```

### A.3 — Move `components/prototype/` → `components/admin/shell/`

```bash
mkdir -p web/src/components/admin/shell/internal

git mv web/src/components/prototype/admin-prototype-shell.tsx   web/src/components/admin/shell/admin-shell.tsx

# plan-viewbar.tsx: VERIFY UNUSED, then delete OR keep under prototypes
# Run: grep -rln "plan-viewbar\|PlanViewbar" web/src --include="*.ts" --include="*.tsx" | grep -v "/prototype/"
# If zero matches: rm web/src/components/prototype/plan-viewbar.tsx
# If matches: git mv it to web/src/components/admin/shell/plan-viewbar.tsx
```

### A.4 — Move `app/prototypes/admin-shell/_*` → `components/admin/shell/internal/`

Public-entry file goes to top-level of `shell/`. Everything else goes to `internal/`. Underscore prefixes drop.

```bash
# Public entry (one file)
git mv web/src/app/prototypes/admin-shell/_shell-client.tsx          web/src/components/admin/shell/admin-shell-client.tsx

# Internals — wedge modules (4 files)
git mv web/src/app/prototypes/admin-shell/_state.tsx                 web/src/components/admin/shell/internal/state.tsx
git mv web/src/app/prototypes/admin-shell/_data-bridge.ts            web/src/components/admin/shell/internal/data-bridge.ts
git mv web/src/app/prototypes/admin-shell/_taxonomy-loader.ts        web/src/components/admin/shell/internal/use-taxonomy.ts
git mv web/src/app/prototypes/admin-shell/_actions.ts                web/src/components/admin/shell/internal/actions.ts

# Internals — large UI modules (8 files)
git mv web/src/app/prototypes/admin-shell/_pages.tsx                 web/src/components/admin/shell/internal/pages.tsx
git mv web/src/app/prototypes/admin-shell/_drawers.tsx               web/src/components/admin/shell/internal/drawers.tsx
git mv web/src/app/prototypes/admin-shell/_talent_drawers.tsx        web/src/components/admin/shell/internal/talent-drawers.tsx
git mv web/src/app/prototypes/admin-shell/_messages.tsx              web/src/components/admin/shell/internal/messages.tsx
git mv web/src/app/prototypes/admin-shell/_talent.tsx                web/src/components/admin/shell/internal/talent.tsx
git mv web/src/app/prototypes/admin-shell/_workspace.tsx             web/src/components/admin/shell/internal/workspace.tsx
git mv web/src/app/prototypes/admin-shell/_platform.tsx              web/src/components/admin/shell/internal/platform.tsx
git mv web/src/app/prototypes/admin-shell/_client.tsx                web/src/components/admin/shell/internal/client.tsx

# Internals — chrome (5 files)
git mv web/src/app/prototypes/admin-shell/_primitives.tsx            web/src/components/admin/shell/internal/primitives.tsx
git mv web/src/app/prototypes/admin-shell/_palette.tsx               web/src/components/admin/shell/internal/palette.tsx
git mv web/src/app/prototypes/admin-shell/_notifications-hub.tsx     web/src/components/admin/shell/internal/notifications-hub.tsx
git mv web/src/app/prototypes/admin-shell/_help.tsx                  web/src/components/admin/shell/internal/help.tsx
git mv web/src/app/prototypes/admin-shell/_dashboard-i18n.ts         web/src/components/admin/shell/internal/dashboard-i18n.ts

# Internals — feature panels (3 files)
git mv web/src/app/prototypes/admin-shell/_media-page.tsx            web/src/components/admin/shell/internal/media-page.tsx
git mv web/src/app/prototypes/admin-shell/_pitch-compose.tsx         web/src/components/admin/shell/internal/pitch-compose.tsx
git mv web/src/app/prototypes/admin-shell/_metrics-ribbon.tsx        web/src/components/admin/shell/internal/metrics-ribbon.tsx

# Internals — phase-gated / wave2 (4 files)
git mv web/src/app/prototypes/admin-shell/_wave2.tsx                 web/src/components/admin/shell/internal/wave2.tsx
git mv web/src/app/prototypes/admin-shell/_modern-features.tsx       web/src/components/admin/shell/internal/modern-features.tsx
git mv web/src/app/prototypes/admin-shell/_phase7-drawers.tsx        web/src/components/admin/shell/internal/phase7-drawers.tsx
git mv web/src/app/prototypes/admin-shell/_admin-tour.tsx            web/src/components/admin/shell/internal/admin-tour.tsx
git mv web/src/app/prototypes/admin-shell/_guided-tour.tsx           web/src/components/admin/shell/internal/guided-tour.tsx

# Internals — talent skills cluster (14 files)
git mv web/src/app/prototypes/admin-shell/_field-catalog.ts          web/src/components/admin/shell/internal/field-catalog.ts
git mv web/src/app/prototypes/admin-shell/_profile-store.ts          web/src/components/admin/shell/internal/profile-store.ts
git mv web/src/app/prototypes/admin-shell/_skill-helpers.ts          web/src/components/admin/shell/internal/skill-helpers.ts
git mv web/src/app/prototypes/admin-shell/_skill-helpers.test.ts     web/src/components/admin/shell/internal/skill-helpers.test.ts
git mv web/src/app/prototypes/admin-shell/_skill-tokens.ts           web/src/components/admin/shell/internal/skill-tokens.ts
git mv web/src/app/prototypes/admin-shell/_skill-row.tsx             web/src/components/admin/shell/internal/skill-row.tsx
git mv web/src/app/prototypes/admin-shell/_skill-proficiency.tsx     web/src/components/admin/shell/internal/skill-proficiency.tsx
git mv web/src/app/prototypes/admin-shell/_skill-slot-panel.tsx      web/src/components/admin/shell/internal/skill-slot-panel.tsx
git mv web/src/app/prototypes/admin-shell/_skill-add-search.tsx      web/src/components/admin/shell/internal/skill-add-search.tsx
git mv web/src/app/prototypes/admin-shell/_skill-verify-dialog.tsx   web/src/components/admin/shell/internal/skill-verify-dialog.tsx
git mv web/src/app/prototypes/admin-shell/_skill-discovery-panel.tsx web/src/components/admin/shell/internal/skill-discovery-panel.tsx
git mv web/src/app/prototypes/admin-shell/_skill-aspirations.tsx     web/src/components/admin/shell/internal/skill-aspirations.tsx
git mv web/src/app/prototypes/admin-shell/_skill-freshness-banner.tsx web/src/components/admin/shell/internal/skill-freshness-banner.tsx
git mv web/src/app/prototypes/admin-shell/_skill-hints-banner.tsx    web/src/components/admin/shell/internal/skill-hints-banner.tsx
git mv web/src/app/prototypes/admin-shell/_skill-overrides-panel.tsx web/src/components/admin/shell/internal/skill-overrides-panel.tsx
git mv web/src/app/prototypes/admin-shell/_csv-parser.ts             web/src/components/admin/shell/internal/csv-parser.ts
git mv web/src/app/prototypes/admin-shell/_csv-parser.test.ts        web/src/components/admin/shell/internal/csv-parser.test.ts
```

### A.5 — Stage the deletions of obsolete routes

These are NOT renames — they're deletions. We'll do them as `git rm` so they show up in the same Commit A as removals (paired with the moves). The build is already broken; cleaning up now keeps Commit B focused on imports.

```bash
# admin-preview was the cutover staging route; canonical absorbed its role
git rm -r web/src/app/\(workspace\)/\[tenantSlug\]/admin-preview/

# The /prototypes/admin-shell/ route entry (52 lines) — delete unless it's still demoed
# VERIFY no production code links to /prototypes/admin-shell first:
#   grep -rn "prototypes/admin-shell" web/src --include="*.ts" --include="*.tsx" | grep -v "components/admin/shell\|app/prototypes/"
# If only comments remain (or empty): proceed with delete
git rm web/src/app/prototypes/admin-shell/page.tsx

# The URL-compat shim for talent profile edit (26 lines)
git rm -r web/src/app/prototypes/admin-shell/talent/

# The (now empty) parent dir gets removed automatically
```

### A.6 — Commit A

```bash
git status --short  # Verify only renames + deletes, no edits
git diff --stat HEAD  # Quick sanity-check the move list
git commit -m "$(cat <<'EOF'
migration/admin-canonical: move prototype namespace to admin-owned paths (commit A — rename only)

Pure git mv of:
- lib/prototype/admin-prototype-nav*.ts          → lib/admin/admin-nav*.ts
- components/prototype/admin-prototype-shell.tsx → components/admin/shell/admin-shell.tsx
- app/prototypes/admin-shell/_shell-client.tsx   → components/admin/shell/admin-shell-client.tsx
- app/prototypes/admin-shell/_*.{ts,tsx}         → components/admin/shell/internal/*.{ts,tsx}

Plus deletion of obsolete routes:
- app/(workspace)/[tenantSlug]/admin-preview/    (cutover staging, role absorbed by canonical admin)
- app/prototypes/admin-shell/page.tsx            (demo route, no production links)
- app/prototypes/admin-shell/talent/             (URL-compat shim)

Build is RED after this commit — Commit B (rewrites + symbol renames) restores green.
No file content changed in this commit; git follows the renames so blame is preserved.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

**Exit gate for Phase 2:** `git log -1 --name-status` shows R (renamed) for moves, D (deleted) for the three obsolete trees. No M (modified). One commit on the branch.

---

## Phase 3 — Commit B: rewrites + symbol renames (1.5–2 hours)

This commit restores the build. Three categories of edits:

- **B.1** — Internal-tree imports inside the moved files (relative paths, drop underscores)
- **B.2** — 10 production importers (path updates + symbol renames)
- **B.3** — Symbol renames inside the moved tree itself (`useProto` → `useAdminShell` etc.)

### B.1 — Internal-tree import rewrites (mechanical)

Inside `components/admin/shell/internal/`, files reference each other via relative paths that previously included underscore prefixes. Run these search/replaces across the entire internal tree.

```bash
# Note: use a search-and-replace with caution. Test with --dry-run first if your sed supports it.
# Recommended: open VS Code multi-file replace ⌘⇧H scoped to web/src/components/admin/shell/

# Pattern 1: relative imports lose their underscores
#   from "./_state"        → from "./state"
#   from "./_drawers"      → from "./drawers"
#   from "./_pages"        → from "./pages"
#   ... (all 38 modules)

# A script-friendly way:
cd web/src/components/admin/shell/internal
for f in *.ts *.tsx; do
  # Replace './_name' or "./_name" with './name' or "./name" — only at start of identifier
  sed -i.bak -E 's@(from[[:space:]]+["'"'"'])\./_([a-z][a-zA-Z0-9_-]*)@\1./\2@g' "$f"
done
rm *.bak
cd -

# Pattern 2: any absolute imports from the OLD paths must also be rewritten
# (these would only exist if internal files used absolute paths instead of relative — uncommon, but check)
grep -rln "@/app/prototypes/admin-shell\|@/components/prototype\|@/lib/prototype" web/src/components/admin/shell/

# For each match: rewrite to the new canonical absolute path.
```

**Note on the `_talent_drawers.tsx` filename:** I'm renaming it to `talent-drawers.tsx` (underscore → dash) for kebab-case consistency. The relative-import sed above handles `./_talent_drawers` → `./talent_drawers` — you'll need a second pass to also convert `./talent_drawers` → `./talent-drawers`, or do it manually since it's the only file with a mid-name underscore.

### B.2 — Production importer rewrites (hand-edit, 10 files)

Each importer file gets path + symbol updates. Do these by hand for safety.

| # | File | Path edits | Symbol edits |
|---|---|---|---|
| 1 | `app/(workspace)/[tenantSlug]/admin/layout.tsx` | `@/app/prototypes/admin-shell/_data-bridge` → `@/components/admin/shell/internal/data-bridge`; `@/app/prototypes/admin-shell/_shell-client` → `@/components/admin/shell/admin-shell-client`; `@/app/prototypes/admin-shell/_state` → `@/components/admin/shell/internal/state` | `AdminShellPrototypePageClient` → `AdminShellClient` |
| 2 | `app/(workspace)/[tenantSlug]/admin/_page-route-syncer.tsx` | `@/app/prototypes/admin-shell/_state` → `@/components/admin/shell/internal/state` | `useProto` → `useAdminShell` |
| 3 | `app/(workspace)/[tenantSlug]/admin/workspace-page-routing.ts` | same path edit | (types only — `WorkspacePage` keeps its name) |
| 4 | `app/(workspace)/[tenantSlug]/talent/layout.tsx` | same path edits as #1 | `TalentShellPrototypePageClient` → `TalentShellClient` |
| 5 | `app/(workspace)/[tenantSlug]/talent/_talent-page-route-syncer.tsx` | same as #2 | `useProto` → `useAdminShell` |
| 6 | `app/(workspace)/[tenantSlug]/_data-bridge.ts` | `@/app/prototypes/admin-shell/_state` → `@/components/admin/shell/internal/state` | (type `TalentProfile` keeps name) |
| 7 | `app/(workspace)/[tenantSlug]/_data-bridge/roster.ts` | same as #6 | (type only) |
| 8 | `components/admin/admin-new-inquiry-sheet.tsx` | `@/app/prototypes/admin-shell/_taxonomy-loader` → `@/components/admin/shell/internal/use-taxonomy` | `useLiveTaxonomy` keeps name |
| 9 | `components/admin/admin-shell-top-bar.tsx` | `@/lib/prototype/admin-prototype-nav` → `@/lib/admin/admin-nav` | `ADMIN_NAV_LABEL_BY_SEGMENT` keeps name |
| 10 | Cleanup: 3 comment-only references in `components/edit-chrome/theme-drawer.tsx:84`, `lib/site-admin/sections/gallery_strip/Component.tsx:16`, `lib/talent/profile-shell-taxonomy-sync.ts:2` | update "prototype" mentions in comments to reference canonical paths | n/a |

### B.3 — Symbol renames inside the moved tree

These are renames that affect both DEFINITIONS (inside the moved tree) and CALLSITES (everywhere). Search-and-replace across `web/src/components/admin/shell/` and `web/src/lib/admin/`:

| Old symbol | New symbol | Where defined |
|---|---|---|
| `AdminShellPrototypePageClient` | `AdminShellClient` | `components/admin/shell/admin-shell-client.tsx` |
| `TalentShellPrototypePageClient` | `TalentShellClient` | same file |
| `AdminPrototypeShell` | `AdminShell` | `components/admin/shell/admin-shell.tsx` |
| `ProtoProvider` | `AdminShellProvider` | `components/admin/shell/internal/state.tsx` |
| `useProto` | `useAdminShell` | same file |
| `ADMIN_PROTOTYPE_NAV` | `ADMIN_NAV` | `lib/admin/admin-nav.ts` |
| `ADMIN_PROTOTYPE_BASE` | `ADMIN_NAV_BASE` | same file |
| `PrototypeNavItem` (type) | `AdminNavItem` | same file |
| `prototypeNavItemStableId` | `adminNavItemStableId` | same file |
| `flattenPrototypeNavWithOrder` | `flattenAdminNavWithOrder` | same file |
| `prototypeNavItemMap` | `adminNavItemMap` | same file |
| `ADMIN_PROTOTYPE_PINNED_KEY` | `ADMIN_PINNED_KEY` | `components/admin/shell/internal/prefs.ts` |
| `ADMIN_PROTOTYPE_TOP_SHORTCUTS_KEY` | `ADMIN_TOP_SHORTCUTS_KEY` | same file |
| `prototypeNavPath` | `adminNavPath` | `lib/admin/admin-nav-match.ts` |
| `isPrototypeNavActive` | `isAdminNavActive` | same file |

**Symbols that KEEP their name** (already canonical):
- All page enum types: `WorkspacePage`, `TalentPage`, `ClientPage`, `PlatformPage`
- All data types: `TalentProfile`, `BridgeData`, `Surface`, `Plan`, `Role`, `EntityType`
- All loader functions: `loadInquiriesForMessages`, `loadWorkspaceRosterForCurrentTenant`, `createBridgeDataFromRoster`, etc. (14 of them)
- `useLiveTaxonomy`
- `RegisterPhotoResult`
- `ADMIN_NAV_LABEL_BY_SEGMENT`
- All page-meta constants: `WORKSPACE_PAGES`, `TALENT_PAGES`, `CLIENT_PAGES`, `PLATFORM_PAGES`, `PAGE_META`, etc.

Execute the renames with a single multi-file replace per row of the table above. VS Code ⌘⇧H scoped to `web/src/` works well — verify the count of matches makes sense before confirming each.

### B.4 — Build green

```bash
cd web
pnpm typecheck
# Expect: green. If red, the error message points to the file — fix and re-run.

pnpm lint
# Expect: green. Lint may complain about unused imports left over from moves — clean them up.

pnpm test
# Expect: green. The two test files in the moved tree (_skill-helpers.test.ts, _csv-parser.test.ts → 
# now skill-helpers.test.ts, csv-parser.test.ts) should still pass since their imports moved together.
```

### B.5 — Commit B

```bash
git add -A
git status --short  # Sanity-check what's about to commit

git commit -m "$(cat <<'EOF'
migration/admin-canonical: rewrite importers + rename symbols, restore build (commit B)

- 10 production importers updated to canonical paths
- Internal-tree imports rewritten (drop underscore prefix, kebab-case talent-drawers)
- Symbol renames across moved tree:
    AdminShellPrototypePageClient → AdminShellClient
    TalentShellPrototypePageClient → TalentShellClient
    AdminPrototypeShell → AdminShell
    ProtoProvider → AdminShellProvider
    useProto → useAdminShell
    ADMIN_PROTOTYPE_NAV → ADMIN_NAV (+ related nav exports)
    ADMIN_PROTOTYPE_PINNED_KEY → ADMIN_PINNED_KEY (+ related prefs keys)
- Comment-only "prototype" references in non-importer files updated for clarity

Page enum types (WorkspacePage/TalentPage/ClientPage/PlatformPage), data types,
and loader function names kept as-is — already canonical.

Build green. Behavior unchanged from stable-work.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

**Exit gate for Phase 3:** `pnpm typecheck && pnpm lint && pnpm test` all green.

---

## Phase 4 — Local smoke test (30 min)

Start `pnpm dev` (if not still running from Phase 1).

Open each surface with the QA account from `reference_qa_credentials` memory:

1. **Tenant admin** (`/{tenantSlug}/admin`) — admin account
   - Land on overview without flash
   - Click through: Roster → open a talent drawer → close
   - Messages: load inbox
   - Calendar: load
   - Site / Settings: navigate
   - Compare against Phase 1 screenshots — should be visually identical

2. **Talent admin** (`/{tenantSlug}/talent`) — talent account
   - Land on Today
   - Open Profile → edit drawer → close (don't save — preserve state)
   - Inbox: load
   - Agencies: load
   - Compare against screenshots

3. **Client admin** (`/{tenantSlug}/client`) — client account
   - Load home / Today / Discover / Inquiries
   - Quick sanity — client surface should be totally unaffected (no prototype imports)

4. **Platform admin** (`/platform/admin`) — super_admin account
   - Load Today / Tenants / Users
   - Quick sanity — platform surface unaffected

**Hybrid mode check:** if there's a QA account that is both admin AND talent on the same tenant, switch between Talent | Workspace modes. Both should work; the toggle should remember preference.

**Exit gate for Phase 4:** all 4 surfaces visually identical to Phase 1 baseline screenshots. No console errors during the click-through.

---

## Phase 5 — Push + preview QA (30 min)

```bash
git push -u origin migration/admin-canonical
```

Wait for Vercel preview build to complete (~5 min). Per `project_vercel_deployment` memory, raw `*.vercel.app` preview URLs return 404 because the middleware checks `agency_domains`. To QA:

```bash
# Get the preview URL
vercel ls --scope oran-tenes-projects | head -5

# Alias to a seeded host (any tenant slug from agency_domains works for QA)
# Pick the preview-URL of this branch's build, then:
vercel alias set <preview-url> <seeded-host>.tulala.digital --scope oran-tenes-projects
```

Smoke-test on the seeded host with the same QA accounts as Phase 4. Same exit gate: visually identical to baseline.

**Exit gate for Phase 5:** preview smoke green.

---

## Phase 6 — Merge + promote (20 min)

```bash
# Open the PR
gh pr create --title "migration/admin-canonical: stop importing from prototype namespace" --body "$(cat <<'EOF'
## Summary
- Moves the production admin shell + state + data bridge + taxonomy hook + nav module out of `app/prototypes/`, `components/prototype/`, `lib/prototype/` into canonical admin-owned paths under `lib/admin/` and `components/admin/shell/`
- Renames `Prototype`-prefixed symbols to canonical forms (`AdminShellClient`, `useAdminShell`, `ADMIN_NAV`, etc.)
- Deletes `admin-preview/` (role absorbed by canonical admin), `/prototypes/admin-shell/` route + URL-compat shim
- Two commits: (A) pure `git mv` + delete, (B) imports + symbol renames

## Why
Per `docs/plans/admin-migration-manifest-2026-05-11.md`: the production admin was importing 5 modules from prototype namespaces, across 10 importer files. That's the wedge. After this PR no production code imports anything with "prototype" in the path. The admin shell still exists — just under canonical paths.

## Non-goals
- Refactoring `_drawers.tsx` (29k lines) / `_pages.tsx` (12k lines) / `_state.tsx` (9k lines) — those move intact; refactor is Phase 2.
- Replacing `PageRouteSyncer` with native Next.js navigation — that's Phase 3.

## Test plan
- [x] `pnpm typecheck && pnpm lint && pnpm test` green
- [x] Localhost smoke: tenant admin / talent admin / client admin / platform admin — all 4 surfaces visually identical to pre-migration baseline
- [x] Drawer opens (Roster talent profile drawer — touches the largest UI path)
- [x] Hybrid mode toggle works for admin-also-talent accounts
- [x] Preview-host smoke on a seeded tulala domain

## Rollback
`git revert` the two commits. No DB changes, no data migration. Promote previous preview if anything regresses post-promote.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"

# Merge (after self-review)
gh pr merge --merge

# Promote to production
vercel promote <preview-url-for-stable-work> --yes

# Manual alias set per CLAUDE.md (post-promote hook only fires on GitHub Deployment events, not vercel promote)
vercel alias set <preview-url> app.tulala.digital --scope oran-tenes-projects
vercel alias set <preview-url> tulala.digital --scope oran-tenes-projects
```

Then production smoke-test: load `app.tulala.digital`, sign in, click through one of each surface. Confirm green.

**Exit gate for Phase 6:** production accessible, all 4 surfaces working.

---

## Rollback paths (by phase)

| Phase | If it fails | Recovery |
|---|---|---|
| Phase 1 (baseline) | typecheck red on `stable-work` | Pre-existing issue. Stop. Fix on stable-work first. |
| Phase 2 (Commit A) | `git mv` errors (file not found / dir conflict) | `git reset --hard HEAD` to undo any partial moves. Re-run script. |
| Phase 3 (Commit B) | typecheck red after rewrites | Specific files in error output. Fix imports there. If unrecoverable: `git reset --hard HEAD~1` to drop Commit B, fix locally, re-commit. |
| Phase 4 (local smoke) | UI broken / drawer doesn't open / etc. | Diff against baseline screenshots. Likely a missed import or symbol rename — search the file path in error/console. Worst case: `git reset --hard origin/stable-work && git checkout -b migration/admin-canonical-v2` to restart. |
| Phase 5 (preview) | Build red on Vercel but green locally | Probably a case-sensitivity bug (`talent_drawers` vs `talent-drawers` rename) or an env-only path. Fix and force-push. |
| Phase 6 (post-merge production regression) | Users see broken admin | `git revert <commit-A>..<commit-B>` on `stable-work`, push, `vercel promote` the resulting preview. ~10 min recovery. |

---

## Cleanup follow-ups (separate small PRs, ship anytime)

These don't block the wedge cut:

- [ ] Delete dangling branches from removed worktrees (`claude/competent-kapitsa-cb86e8`, `claude/great-ptolemy-1747d5`, `worktree-agent-a7910dac6cc963a2c`, `worktree-agent-ad44e4fcdcd06b769`)
- [ ] Consider barrel `components/admin/shell/index.ts` if `internal/` paths in importers feel awkward
- [ ] Move `app/prototypes/audit-phase-e/` and `drawer-preview/` to a `docs/` or storybook dir (optional hygiene)
- [ ] Delete `components/admin/shell/plan-viewbar.tsx` if confirmed unused in Phase 2 step A.3

---

## What this PR is NOT

For reviewers, to set expectations:

- **Not a refactor.** `_drawers.tsx` is still 29k lines after this. `_state.tsx` is still 9k lines. Those move intact — see manifest §3c for the schedule.
- **Not a behavior change.** The 4-surface admin still works exactly as before. The same code is just located in admin-owned paths now.
- **Not a feature.** No user-visible change.
- **Not a tear-down of the SPA shell architecture.** That's Phase 3: page-by-page extraction using the client surface as the architectural reference.

---

*Plan ends. Two commits, one PR, ~half day. After this lands, the codebase looks honest: production admin lives in admin-owned paths, the prototype namespace contains only what's actually a prototype (`audit-phase-e`, `drawer-preview`).*
