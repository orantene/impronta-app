# Integration Audit — Phases A–F (2026-05-28)

**Companion to:** `product-flow-remediation-plan-2026-05-28.md`, `remediation-phase-prompts-2026-05-28.md`, `product-flow-qa-runbook-2026-05-28.md`.

## Verdict (read this first)

**Each phase is genuinely built — but nothing is integrated.** The six phases live on six separate branches/worktrees. **`main` contains none of them.** Phase A is an *uncommitted* file in the working tree. The currently-running dev server = **Phase E branch + the uncommitted Phase A file**, so it does **not** contain B, C, or D.

"All phases finished" is true at the *branch* level and false at the *product* level. The remaining work is: **one architecture decision, branch integration with conflict resolution, a few real bugs, then merge → deploy → integrated QA.**

This is NOT a rewrite. The hard engineering is done. What's left is assembly.

---

## Where each phase actually lives

| Phase | Branch | Worktree | Commits ahead of `main` | What it contains |
|---|---|---|---|---|
| **A** Storefront homepage | *(none)* | uncommitted file in main checkout | 0 (1 untracked file) | `(workspace)/[tenantSlug]/page.tsx` — hard-coded branded template |
| **B** De-fixture shell | `phase-b-defixture-shell` | `/private/tmp/impronta-phase-b` | 6 | F1 PROTO_TENANT_ID→null, F2/F10/F11/F12 website-state from real bridge, F7 calendar empty state, F8/F17 real roster count + subdomain URL, F21/F23 notifications suppress fixtures, F22 activation banner |
| **C** Page builder | `phase-d-roster-persistence` | *(local branch, not checked out)* | 4 | `workspace_pages` table + migration, server actions, block renderer, builder UI; + Sentry wiring |
| **D** Roster persistence | `phase-d-roster-persistence` | *(same branch as C)* | (incl. above) | F4/F5/F14/F15/F16/F24 — autosave drafts, publish checklist, services taxonomy, badge parity |
| **E** Tab wiring | `phase-e-tab-wiring` | **`/Users/oranpersonal/Desktop/impronta-app` (the main checkout — running now)** | 5 | E1/F6 Messages empty state, E2/F13 pitches mobile icon, E4/F18 Free-tier subdomain visible, E5/F19/F20 prevent silent workspace switch |
| **F** Polish | `phase-f-polish` | `/Users/oranpersonal/Desktop/impronta-phase-f` | 1 | F25 optimistic row-dot clear on override remove, F26 hybrid-flow QA docs |

Note: most "F" polish items were absorbed into B/C/D/E (the F-codes above), so `phase-f-polish` itself is tiny.

---

## What was verified WORKING (live, on the running branch)

- ✅ **Owner dashboard shows real data.** `/hotels-express-lavanderia/admin` renders "Hotels Express Lavanderia · Free · 0 talento · 0 open inquiries · €0 pending" with a correct new-workspace activation arc (Add talent → Publish a profile → Copy storefront link → Demo inquiry → Invite teammate). **No `Vogue Italia` / `4,730` fixtures visible.** De-fixturing is largely effective already; the fixture strings still in source are *definitions* that the `_data-bridge` suppresses for real tenants.
- ✅ **Workspace admin loads** for the owner (`qa-admin` / orantene), full tab bar present (Overview, Messages, Calendar, Roster, Clients, Pitches, Operations, Production, Website, Media, Settings).
- ✅ **Platform-admin tenant control** (create / domains / freeze / cancel / owner-assign / overrides) — shipped and fixed earlier this session.

## What FAILS or is unverifiable on the running branch

- ❌ **Public homepage is unbranded.** `/hotels-express-lavanderia` shows the CMS storefront empty state **"This site hasn't published a homepage yet"** (TULALA chrome + Edit button), NOT Phase A's branded template. See architecture conflict below.
- ⚠️ **Phase C (page builder) cannot be tested here** — its code is on `phase-d-roster-persistence`, not checked out. The `workspace_pages` migration *is* applied to remote, but the running app has no code to use it.
- ⚠️ **Phase D (roster autosave / services taxonomy) cannot be tested here** — same branch, not checked out.
- ⚠️ **Scenario 7 (client inquiry end-to-end)** depends on A (public page) + D (published roster); not testable until integrated.

---

## Findings / what's left — prioritized

### P0 — Integration blockers
1. **Nothing is on `main` and nothing is deployed.** All six phases must be merged into one branch, then to `main`.
2. **Phase A is uncommitted** — it exists only as a working-tree file. It must be committed *or* deliberately discarded (see #4).
3. **🔴 ARCHITECTURE DECISION: who owns the homepage?** Phase A (hard-coded `[tenantSlug]/page.tsx` auto-template) and Phase C (CMS page-builder rendering through `(public)/p/[[...slug]]`) are two competing answers. They cannot both own `/`. **Decide before integrating:**
   - **Option 1 (recommended): Phase C owns it.** A brand-new workspace shows a *sensible default* (auto-generated from name + roster) until the owner publishes a custom page in the builder. Fold Phase A's template into the storefront's empty-state as that default, then delete the standalone `[tenantSlug]/page.tsx`.
   - **Option 2: Phase A owns it.** Keep the hard-coded template as the homepage; the builder only manages secondary pages (`/about`, `/contact`). Simpler, less flexible.
   - Until this is decided, the public homepage is broken (unbranded empty state).
4. **Merge conflicts are guaranteed.** B and E both modify these files (likely D too): `wave2.tsx`, `marketing/get-started-form.tsx`, `marketing/get-started-form-tier-copy.ts`, `(marketing)/get-started/page.tsx`, `eslint-suppressions.json`. Plan the merge order to resolve once.

### P1 — Real bugs (independent of integration)
5. **`is_primary = false` on the sole domain.** `hotels-express.tulala.digital` is the workspace's only domain but isn't primary. A workspace's only domain should auto-promote to primary (and new-workspace seeding should set it). Phase F did not address this. Two parts: (a) backfill existing rows, (b) fix the seed/auto-promote logic.
6. **`hotels-express` (domain) ≠ `hotels-express-lavanderia` (slug).** The seeded subdomain host doesn't match the slug. Confirm this is intentional truncation vs a bug in subdomain derivation.
7. **Roster badge shows "2" but header says "0 talento."** Minor count inconsistency on the running branch — likely draft vs published counting mismatch; verify after D is integrated.

### P2 — Hygiene
8. Three QA-evidence directories are untracked in the working tree (`qa-evidence/...`) — decide whether to commit or gitignore.
9. The four planning docs (plan, prompts, runbook, this audit) are untracked — commit them.

---

## Recommended integration sequence

> Do this in a fresh worktree off `main`, not in any of the phase worktrees. One agent, sequential, TS+lint gate after each merge.

1. **Decide the homepage question (#3).** Everything else assumes an answer.
2. **Branch:** `git switch -c integrate/phases-a-f origin/main` in a new worktree.
3. **Merge in dependency order** (de-fixture is the foundation; builder/roster sit on it; tabs sit on those; polish last):
   1. `phase-b-defixture-shell` (foundation)
   2. `phase-d-roster-persistence` (C + D together)
   3. `phase-e-tab-wiring` (resolve the wave2 / get-started conflicts here)
   4. `phase-f-polish`
   5. **Phase A:** per the #3 decision — either commit + fold into the storefront default, or drop it.
4. **Resolve conflicts** in the 5 overlapping files; re-run the de-fixture and tab empty-state checks after each.
5. **Gate:** `cd web && node --max-old-space-size=8192 ./node_modules/typescript/bin/tsc --noEmit && npm run lint`.
6. **DB:** `npm run db:check` — `workspace_pages` is already applied to remote; confirm no other pending migration. (Only one new migration exists across all phases: `20260528173519_workspace_pages.sql`.)
7. **Fix the P1 bugs** (#5–#7) on the integration branch.
8. **Merge to `main`** → Vercel auto-deploys → alias the custom domains → `npm run deploy:smoke`.
9. **Run the QA runbook** (`product-flow-qa-runbook-2026-05-28.md`) — all 7 scenarios — against the integrated production build. *That* is the real acceptance test.

---

## DB state (confirmed)
- `workspace_pages`, `workspace_page_revisions`, and the full `cms_*` table family exist on remote (`pluhdapdnuiulvxmyspd`). Phase C's migration is applied.
- Test workspace: `hotels-express-lavanderia` (id `8340d45d-…`), plan `free`, status active, owner orantene@gmail.com. One domain `hotels-express.tulala.digital` (subdomain, active, **not primary**).

## Bottom line
~**1–3 days of integration + bug-fix + QA**, not weeks. The phases are real and mostly land cleanly; the work is: pick the homepage owner, merge four branches in order, fix ~3 small bugs, ship to `main`, and run the runbook on the live site.
