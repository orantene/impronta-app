# AGENT KICKOFF PROMPT — Representation Engine

> Paste everything below the line into a fresh agent session. It is written to make the agent fully self-sufficient. It pairs with the detailed spec `web/docs/representation-engine-spec-2026-06-05.md` (the source of truth) and the runnable task plan `web/docs/representation-engine-plan-2026-06-05.md`.

---

You are a senior full-stack engineer joining the **Tulala / Impronta** codebase (Next.js + Supabase + Vercel, multi-tenant SaaS for talent agencies). You are taking over a well-scoped, already-investigated feature. **Your #1 job: read the spec, then execute it phase by phase, shipping real working code to production — not mockups.**

## 0. FIRST ACTIONS (do these before anything else)
1. **Read the spec in full:** `web/docs/representation-engine-spec-2026-06-05.md`. It is the source of truth. This prompt is the orientation; the spec is the detail. If they ever disagree, trust the code, then the spec, then this prompt — and fix the stale doc.
2. **Read these memory files** (under `~/.claude/projects/-Users-oranpersonal-Desktop-impronta-app/memory/`): `project_tulala_enterprise_hub.md` (the hub + routing + visibility model), `CLAUDE.md` at repo root (deploy protocol), `reference_qa_credentials.md` (QA accounts).
3. **Do NOT start coding until you've confirmed the 4 open decisions** in spec §12 with the human (auto-enroll gate, leave grace-period, drawer shape, notifications). If the human is unavailable, use the spec's stated defaults and call out the assumption.

## 1. THE MISSION (what & why, in plain terms)
A talent's "representation" (which agencies/hubs list them, and where they're publicly visible) is shown across **three** surfaces that each render the same data differently and partly fake. We are unifying them into **one shared `RepresentationDrawer`**, opened from all three entry points, that shows the **true effective visibility** of every place the profile appears and exposes the real actions (visit, set primary, hide/show, pause, leave). And we are fixing three correctness bugs found during investigation:

1. **URGENT — new talents are invisible.** New signups are NOT auto-added to the platform "Tulala" hub, so they 404 on `tulala.digital/t/<code>` and never appear in `/directory`. (The current 101 talents only work because of a one-time manual SQL batch.)
2. **"End relationship" is a lie.** It sets the roster to `inactive` immediately but the "14-day wind-down" countdown is cosmetic — no cron ever finishes it, and there is no true "leave now."
3. **Membership ≠ visibility.** "Where you appear" lists rosters a talent is *on*, but most are `roster_only` (the agency hasn't published them) — so the talent looks listed when they're actually hidden. The new drawer must surface this (and the reverse: talent-hidden-on-agency).

## 2. THE PRODUCT FACTS YOU MUST INTERNALIZE (don't re-discover these)
- **The visibility truth table** (spec §1.1): a talent is publicly shown on a tenant **iff** `roster.status='active' AND roster.agency_visibility IN ('site_visible','featured') AND roster.talent_site_hidden=false AND talent_profiles.is_publicly_hidden=false AND deleted_at IS NULL`. Enforced in 3 places that must agree: DB fn `talent_has_public_roster()`, `web/src/lib/saas/talent-roster.ts`, and the existing `ProfileVisibilityDrawer`.
- **Two switches, two parties:** `agency_visibility` = the AGENCY's eye; `talent_site_hidden` = the TALENT's eye; `is_publicly_hidden` = the talent's GLOBAL kill-switch (overrides everything). The whole feature is about surfacing when these conflict.
- **The platform hub:** `agencies.id = 40081ec3-5ca8-43a0-b50b-31c927b2716b`, slug `tulala`, `kind='hub'`, `plan_tier='network'`. **Never hardcode that UUID in app code** — resolve via `getPlatformHubTenant()` in `web/src/lib/saas/platform-hub.ts` (it finds kind=hub+plan=network; uses the service-role client).
- **~70% already exists** — reuse, don't rebuild: `ProfileVisibilityDrawer` (per-agency hide + agency-eye detection), `TalentAgencyRelationshipDrawer` in `talent-drawers/agency.tsx` (status/take-rate/"what this agency can do"/set-primary/leave), actions `selfLeaveAgency` + `selfSetPrimaryAgency` in `talent-self-profile-sections.ts`, the `useAdminShell()` shell plumbing (`openDrawer`/`bridgeTalentAgencies`). Entry points: `MoneyAgencyCards.tsx` (line ~319), `talent/pages/SettingsPage.tsx`, settings visibility card.

## 3. WHAT TO BUILD (high level — full detail in spec §2–§9)
- A canonical `resolveEffectiveVisibility()` helper (`web/src/lib/talent/representation.ts`) — the single source for the chip states. **Build + unit-test this first.**
- A `loadRepresentation(talentProfileId)` loader returning the unified row model (extend `bridgeTalentAgencies` so all entry points share it).
- The `RepresentationDrawer` component (list + accordion; two modes: talent / agency) wired to all 3 entry points.
- The auto-enroll fix (DB trigger migration, spec §4) — **ship this standalone, FIRST.**
- The honest end-relationship rewrite (pause / resume / remove, spec §7).
- The agency-mode mirror (Phase 4).

## 4. ENVIRONMENT & WORKFLOW (non-negotiable)
- **Repo:** `/Users/oranpersonal/Desktop/impronta-app`; the app lives in `web/`. The main checkout is **shared by ~8 agents — never `git switch` there.** For each phase: `git fetch origin main && git worktree add /Users/oranpersonal/Desktop/<name> -b <type>/<topic> origin/main`.
- **`main` is canonical** (Vercel production branch + GitHub default). Branch off it, open a PR, merge via PR.
- **Gate before every commit:** `cd web && npx tsc --noEmit && npm run lint`. ⚠️ Worktrees often have **no `node_modules`** — if so, either `npm install` in the worktree (slow) or rely on the **Vercel PR build as the typecheck gate** (a green "Vercel" check == types compiled). A standalone `tsc` on one file fails on `react/jsx-runtime` — that's a false positive; ignore it.
- **Migrations are NOT auto-applied.** If your work adds a migration (Phase 0 does), `cd web && npm run db:push` **before** the dependent code ships, or prod 500s. `npm run deploy:smoke` reports drift.
- **Prod deploy is MANUAL.** Merging to `main` does NOT reliably go live. To ship: `cd web && npm run deploy:promote && npm run deploy:smoke`. The promote re-aliases `tulala.digital` + `app.tulala.digital`. If the promote script times out mid-poll, the deploy still built — finish with `npx vercel alias set <deploy-url> tulala.digital --scope oran-tenes-projects` (and `app.tulala.digital`).
- **You have the Supabase MCP** (project `pluhdapdnuiulvxmyspd`) for live DB reads/writes and `apply_migration`. Use `execute_sql` to verify facts before and after every change.

## 5. ORDER OF WORK (ship incrementally; each phase = its own PR)
- **Phase 0 — Auto-enroll (URGENT, ship alone first).** Spec §4: DB trigger + backfill + `db:push`. This stops new signups from being invisible. **AC:** create a new approved talent → it has an active `site_visible` Tulala-hub roster row → `/t/<code>` = 200 premium template → in `/directory` after a matview refresh.
- **Phase 1 — Read-only unified drawer.** `resolveEffectiveVisibility` + `loadRepresentation` + the drawer list with chips, wired to all 3 entry points. **AC:** TAL-92026 (Orlando) shows 5 entries; Tulala = 🟢 Live; the 3 `roster_only` agencies = 🔴 "Agency isn't showing you"; identical drawer from My pages / Money / Settings.
- **Phase 2 — Visibility + primary actions** (hide/show per-roster, global hide, set primary, preview links; disabled-with-helper for agency-override + global-hidden).
- **Phase 3 — Honest leave** (pause/resume/remove; delete the 14-day lie).
- **Phase 4 — Agency-mode mirror** + override notifications.
Read each phase's exact acceptance criteria in spec §8.

## 6. LANDMINES (memorize — these already cost real time this project; spec §10 has all 10)
1. **The apex is sacred:** `tulala.digital` MUST stay `agency_domains.kind='marketing'`. Repointing it to the hub breaks the marketing site, the directory, AND every `/t/` page. Resolve a tenant on the apex via `getPlatformHubTenant()`, never by changing the host.
2. **Verify routing with `x-matched-path`:** `tulala.digital/directory` → `(marketing)/global-directory` (NOT `(public)/directory`); `/t/<code>` → `/t/[profileCode]`. Edit the route that's actually served.
3. **The directory is matview + cache gated:** changes need `talent_profiles.is_discoverable=true`, a `refresh_talent_discover_index()` (or the 15-min cron), and survive a 120s cache. Don't judge "it didn't work" from a curl within 2 minutes.
4. **Cross-tenant reads need service-role:** anon RLS can't read another tenant's `agencies` row. Use `createServiceRoleClient()` (present in prod).
5. **Never copy the `toast("… (demo)")` fake-save fallback** found in some settings drawers — error visibly instead.
6. **Manual deploy + manual aliasing** (point 4 of §4 above).
7. **One primary per talent** (partial unique index) — clear others before setting a new primary.

## 7. ACCOUNTS / IDs / COMMANDS YOU'LL NEED
- Prod Supabase project id: `pluhdapdnuiulvxmyspd`. Platform hub tenant: `40081ec3-5ca8-43a0-b50b-31c927b2716b`.
- Test talent for QA: **Orlando = TAL-92026** (user `orantenemx`), Sofía = TAL-92001. Hub owner = `orantene@gmail.com`; hub admin = `qa-admin@impronta.test`. QA passwords live in memory `reference_qa_credentials.md`. (You cannot type passwords into login forms — have the human log in, or use `/api/dev/signin` on localhost.)
- Deploy: `cd web && npm run deploy:promote && npm run deploy:smoke`. Migrate: `cd web && npm run db:push`. Read-only deploy check: `npm run deploy:check`.
- Verify live routing: `curl -sD - -o /dev/null "https://tulala.digital/directory" | grep x-matched-path`.

## 8. DEFINITION OF DONE
- All 5 phases shipped to prod via PRs, each gated (tsc+lint or green Vercel build) and `deploy:smoke` green.
- A brand-new approved talent is automatically live on `tulala.digital/t/<code>` + in the directory (Phase 0).
- The single `RepresentationDrawer` opens identically from My pages, Money, and Settings; shows correct effective-visibility chips incl. the two-way 🔴 conflicts; and every action (visit/primary/hide/show/pause/resume/leave) performs a **real** DB mutation with visible success/error (no demo fallbacks).
- The "14-day" lie is gone; leave/pause semantics are honest.
- The spec file is updated to reflect anything you changed.

## 9. HOW TO COMMUNICATE
- Show **visible, QA-proven results** (the user judges by demonstrated behavior on a real host, not tsc-clean commits). After each phase, verify live (DB census in spec §11 + the connected browser) and report what you proved.
- Be honest about what's real vs. stubbed. If you hit a wall, say so and show the evidence (logs, headers, SQL) — don't claim success off a single unverified curl.
- Ask before any irreversible/outward-facing action beyond the planned deploys.

Start by reading the spec and confirming the §12 decisions. Then ship Phase 0.
