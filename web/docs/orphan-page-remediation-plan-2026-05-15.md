# Orphan-page remediation + correct-integration plan — 2026-05-15

**Status: PLAN ONLY. No code changes pending until owner approves scope.**

## Why this exists

Across the Discover/marathon session I created 5 standalone `app/.../page.tsx`
routes (A8, A7, T7, T2/T4/T5, D6) plus `CANONICAL_ROUTE_MATCHERS` wiring that
makes the prototype-SPA shell *yield*. Result: orphan pages with no nav, no
shell chrome, no design-system consistency. The owner never asked for new
full pages. Root cause: I did not investigate the approved SPA framework
before building, and used standalone routes to dodge mega-file merge
conflicts — my convenience, not a design decision.

A8 (commission) is already fully reverted (`c2b3c520e`). Roster routing was
restored (`9ae6c7868` + `b96a64c32`). This plan covers the remaining 4.

## The approved shell has exactly two extension points

**1. Drawer (default for ~all feature UI)**
- `DrawerId` union — `state.tsx:472`
- `DrawerSwitch` case — `drawers.tsx:395`
- Open from any surface: `openDrawer("my-id", payload?)`
- Self-renders on `state.drawer.drawerId === "my-id"`, wrapped in shared
  `<DrawerShell>` → inherits approved slide-in / backdrop / header / footer
  / tokens automatically.

**2. Shell page (only for a true new top-level section)**
- Add value to `WorkspacePage`/`TalentPage` union — `state.tsx:58`
- Add `case "x": body = <XPage/>` to render switch — `pages.tsx:~2420`
- Add to nav array; add THIN `app/.../x/page.tsx = <PageRouteSyncer page="x"/>`
  for URL deep-link sync (exactly the roster stub that was restored)
- `<XPage/>` is an in-shell component (uses `useAdminShell()`, shell
  `COLORS`/`FONTS`, sits in content area with nav + chrome intact)

**Never:** standalone `app/.../page.tsx` with full render + a
`CANONICAL_ROUTE_MATCHERS` entry. That is the orphan anti-pattern.

## Per-feature verdict — most were already built

| Feature | Orphan I made | Already exists in approved shell? | Correct action |
|---|---|---|---|
| **T7** talent trust | `talent/trust/page.tsx` (280 LOC) | **YES — fully.** `TalentTrustCard` on talent Settings page (`talent.tsx:14390`) opens the rich `talent-trust-detail` drawer (`drawers.tsx:20813`: badges, instagram/tulala verification requests, risk score, contact gates). | **Delete orphan. Zero new code.** Feature already shipped + correctly integrated. |
| **D6** client subscription | `client/subscription/page.tsx` (264 LOC) | **Pattern exists.** `PlanCompareDrawer` (`drawers.tsx:23233`) + `SubscriptionLifecycleDrawer` (`24382`) + `ClientTrustDetailDrawer` (`24141`, the orthogonal trust axis). Backend `loadClientSubscription` exists. | **Delete orphan.** Add a `client-subscription` drawer mirroring `PlanCompareDrawer` (Standard/Pro/Enterprise tiers). Trigger from the client shell. |
| **A7** Discover settings | `admin/settings/discover/page.tsx` (305 LOC) | **Home exists.** `WorkspacePageView` (`pages.tsx:10586`) has a `SETTINGS_SECTIONS` registry + `SettingsSectionHeader`. | **Delete orphan.** Add a "Discover" section to `SETTINGS_SECTIONS` (tier matrix + enrollment count + links). Section inside Settings page, not a route. |
| **T2/T4/T5** talent Discover panel | `talent/discover/page.tsx` (431 LOC) | **Surface exists.** `ReachPage()` (`talent.tsx:12832`) already has Discover `DistributionCard`s; `discoverRank` already surfaced (`talent.tsx:4115`). | **Delete orphan.** Add card-preview + travel-radius + 30-day-stats as a section/expansion on the existing Reach surface, or a `talent-discover-detail` drawer opened from the Reach Discover card. |
| **A8** commission preview | `admin/roster/[id]/commission/page.tsx` | n/a | **Already reverted.** If wanted: `commission-preview` drawer opened from the roster talent card, using the kept `resolveBookingCommissions` resolver. |

**Key finding:** T7 was 100% redundant — the trust feature already exists,
fully, in the approved shell. I shipped a worse parallel copy because I
didn't look first.

## Revert scope (what gets removed if owner approves)

Delete (orphan pages):
- `web/src/app/(workspace)/[tenantSlug]/admin/settings/discover/page.tsx`
- `web/src/app/(workspace)/[tenantSlug]/talent/trust/page.tsx`
- `web/src/app/(workspace)/[tenantSlug]/talent/discover/page.tsx`
- `web/src/app/(workspace)/[tenantSlug]/client/subscription/page.tsx`

Revert in `web/src/components/admin/shell/admin-shell-client.tsx` (surgical —
this file is parallel-agent-edited, touch only my lines):
- Remove the 3 `CANONICAL_ROUTE_MATCHERS` entries: `settings/discover`,
  `talent/trust`, `talent/discover`
- Revert `TalentShellClient` `ConditionalAdminShellRoot` → `AdminShellRoot`
  (verify no parallel-agent talent canonical route now depends on it; if one
  does, leave it and just drop my matchers)

## Backend KEPT (design-invisible, no framework conflict, reusable)

Migrations, SQL helper fns, lib resolvers, server actions, D0 submitInquiry
wiring, LineupDrawer dead-code purge (S0.3, a documented plan item). These
overwrite nothing and are exactly what a future *correct* in-shell
integration would consume:
- `talent_discover_index`, `inquiry_message_stars`, `owning_party`,
  `exclusivity_status`, message-target-owning-party, acceptance-summary fns
- `owning-party-resolver`, `cross-tenant-context`, `acceptance-summary`,
  `exclusivity-resolver`, `message-stars`, `is-fixture-id`
- `confirm/declineAgencyExclusivity`, `toggleMessageStar`, contact-policy
  gate in `submitInquiry`
- `<DemoBadge>`, `<StarButton>` components (already correctly wired into
  existing shell surfaces — `pages.tsx`, `ClientMessagesShell.tsx`)

## Category B — edits to approved surfaces (owner to decide separately)

These follow the RIGHT pattern (merged into existing components, not new
pages) but were unrequested. Inert in single-tenant reality:
- `pages.tsx` — Demo badge on fixture rows
- `ClientMessagesShell.tsx` — Star button on bubbles + cross-tenant banner
- `DetailsTab.tsx` — cross-tenant context label

Recommendation: keep (correct pattern + invisible on real data) — but
owner's call.

## Forward operating rule (agreed 2026-05-15)

1. Before building any feature: grep `DrawerId` union + `WorkspacePage`/
   `TalentPage` enum + existing drawers for a home. Assume it may already
   exist (T7 did).
2. Default to a **drawer** off the relevant existing surface, using
   `<DrawerShell>`.
3. Shell **page** only for a true new top-level section — thin
   `PageRouteSyncer` stub + in-shell component, never a standalone route.
4. Never add `CANONICAL_ROUTE_MATCHERS` for feature work.
5. If a feature genuinely requires a mega-file edit (`drawers.tsx`,
   `pages.tsx`, `state.tsx`, `talent.tsx`): **stop and flag it** with the
   proposed integration point. Do not invent a standalone-route workaround.
