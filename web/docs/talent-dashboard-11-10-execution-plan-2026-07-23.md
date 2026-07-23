# Talent Dashboard 11/10 — Execution Plan (2026-07-23)

**Status: BINDING execution plan — autonomously executable by any agent.**
Owner surface: `/talent/*` (platform talent dashboard, admin-shell client).
Quality bar: the workspace admin shell (Shopify-grade, PRs #743/#751/#753).
History: W1–W10 shipped as PRs #839 #843 #844 #847 #853 #854 #858 #862 #865
(see memory `project_talent_dashboard_polish_2026.md` for what each did).

## Standing rules (apply to every wave)

1. Branch off latest `origin/main`: `feat/talent-dashboard-w<N>`. One wave = one PR.
2. Gates before every commit: `cd web && NODE_OPTIONS=--max-old-space-size=8192
   npx tsc --noEmit` (0 errors) and `npm run lint` (clean; if suppressions are
   stale after removing inline styles run `npx eslint . --quiet
   --suppressions-location eslint-suppressions.json --prune-suppressions`).
3. NEVER add `style={{…}}` under `components/admin/shell` — the
   `ratchet/no-new-inline-style` baseline is count-based per file; one new
   inline style un-suppresses the entire file. Use className (tailwind
   arbitrary values are fine) or existing token utility classes.
4. Every user-visible string: wrap in `copy.t("English")`
   (`useDashboardText()` from `internal/dashboard-i18n`) AND add the
   English→Spanish pair to `ES_TEXT` in `dashboard-i18n.ts`. Latin American
   Spanish, no em dashes, "cliente" never "comprador". No duplicate keys.
5. QA in real Chrome on localhost:3700 (webpack dev server) as
   `tulum-talent-sofia@impronta.test` via
   `/api/dev/signin?email=…&next=/talent/today`. Wait ~30s for hydration
   before judging visuals (the pre-hydration fade makes healthy pages look
   broken). QA BOTH locales (account menu → Language → ES).
6. Ship: PR to main → wait for "Structural quality gate" = pass (Fidelity
   goldens red = known storefront flake, ignore) → squash-merge → wait for
   the Vercel production deploy (2–3 min) → `cd web && npm run deploy:smoke`
   must pass → delete branch → append results to the memory file.

## W11 — Talent left sidebar (the workspace design language)

Goal: replace the talent surface's horizontal tab strip with the workspace's
grouped left rail so hybrid users get ONE navigation identity.

Files:
- `web/src/components/admin/shell/internal/talent.tsx` — `TalentSurface`
  (currently `TalentTopbar` + centered `<main>`), `TalentTopbar` (to retire),
  `TalentRouter`.
- Reference implementation: `internal/page-modules/WorkspaceShell.tsx`
  (`WorkspaceSidebarShell`, `SIDEBAR_GROUPS`, `SIDEBAR_ICON`) — copy its
  visual pattern (rail width, group caps-labels, active row treatment,
  collapse behavior), do NOT import workspace-specific data.

Build:
1. `TALENT_SIDEBAR_GROUPS`: Today (ungrouped, top) · WORK: Messages,
   Calendar, Money · PRESENCE: Profile, My pages, Catalog & Pricing,
   Reviews · Settings (bottom, above the rail footer). Labels =
   `TALENT_PAGE_META[p].label` through `copy.t` (already in ES_TEXT).
2. Rail footer carries what the topbar had: Plan badge (opens
   `talent-tier-compare`) + "Preview profile" external link.
3. Unread badge on Messages (same source the topbar tab used, if any) —
   check `bridgeTalentUnread` in `useAdminShell()`.
4. Mobile (<900px): match the workspace's responsive behavior (check what
   WorkspaceSidebarShell does — collapse to icons or hide behind a toggle);
   whatever the workspace does, mirror it.
5. Keep a11y: roving tabindex on the rail (`useRovingTabindex`), aria-label
   "Talent sections", skip-link target unchanged (`#tulala-talent-content`).
6. Delete/retire `TalentTopbar` once the rail owns navigation (keep the
   component exported-but-unmounted for one release ONLY if something else
   imports it — check importers first).
QA: click every rail item → right page renders + active state; Plan badge
opens compare drawer; Preview profile opens /t/<code>; ES shows Spanish
labels; mobile viewport (resize to 375px) navigable.

## W12 — Kill the dead pre-hydration fade

Goal: the shell renders dimmed until the client app hydrates (~1–3s prod,
~30s local); replace "whole surface faded" with honest per-region loading.

Investigate first (30 min cap): find the fade — grep `proto-fade`,
`opacity` transitions on the shell root in `admin-shell-client.tsx` /
`globals.css` / `admin-color-bridge.css`. Understand what toggles it
(hydration effect? `mounted` state?).
Then EITHER (a) scope the fade to interactive controls only, keeping text
readable at full contrast, OR (b) replace with skeleton rows on the 2–3
slow regions (Today reply queue, Messages list). Choose the smaller diff
that removes the "dead dashboard" first impression. Do NOT attempt bundle
splitting or architectural perf work in this wave — if the fade turns out
to be genuinely load-bearing (e.g. masks unhydrated-click bugs), document
why and ship only what is safe.

## W13 — Power parity with the workspace

Goal: the workspace's keyboard-speed features on the talent surface.
1. J/K next/previous + Enter open on the talent Messages job list
   (reference: workspace `admin-1.tsx` inbox implementation of J/K/E/R).
2. E = archive/close, R = reply-focus inside a talent thread IF the
   equivalent actions exist on the talent side; skip what has no action.
3. ⌘K palette: check `BottomActionFab` palette (admin-shell-client.tsx) —
   it already handles the talent surface's quick actions; extend its item
   list with talent navigation targets (all 9 pages) if missing.
4. "?" shortcuts modal on the talent surface listing whatever shipped.
All shortcuts must not fire while typing in inputs (copy the workspace's
guard) and must be listed in the shortcuts modal, bilingual.

## W14 — Riders (small, batch into one PR)

1. Premium-page drawers (media embeds / press / custom domain in
   `talent-drawers/premium-pages.tsx`): keep read-only notice, but check
   whether `talent-site` server actions already exist to wire a REAL save
   (the My pages manager saves these — if a clean action exists, wire it;
   if not, leave the notice).
2. `FirstSessionChecklist` (today-1.tsx): derive `polaroidCount`,
   `channelsLive`, `payoutSet` from the real bridge profile instead of
   stubbed zeros (TodayPage.tsx:~305); persist dismissal in user prefs
   (`loadUserPrefs`/`setPreferredSurface` file shows the prefs pattern).
3. Delete `TalentAgencyContextSwitcher.tsx` (unused since W1).
4. `talent-drawers/today.tsx` offer footer: hide the permanently-disabled
   Accept/Decline buttons (real accept/decline lives in Messages).

## Explicitly OUT of scope (needs the owner's go-ahead, own session)

- Whitelabel accent color into the admin chrome: `COLORS.accent` is a JS
  constant used inline across the ENTIRE admin shell (workspace included);
  a CSS-var-only bridge was proven to produce a partial rebrand. Requires
  a bounded color-system refactor. Do not attempt as a side effect.
- Talent-surface URL/IA changes (routes stay as-is).
