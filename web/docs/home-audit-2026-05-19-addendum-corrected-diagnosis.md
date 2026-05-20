# Home Audit Addendum — Corrected Diagnosis
*2026-05-19 — supersedes the action items in `home-audit-2026-05-19-v11-vs-live.md` after a deeper code-vs-recipe verification.*

## TL;DR

**The initial audit was correct about the LIVE rendering, but the CODE is ahead of the live.** Every P1/P2/P3 recipe item is **already in `starter-action.ts`** (the `impronta-home` recipe), and every Component already supports the schema fields the recipe sets. The live `/impronta` renders OLDER published data on the Impronta tenant — the recipe has been updated since the last `applyStarterComposition` + `publishHomepage` cycle.

**Single action that resolves the entire recipe slice of the audit**: re-apply `impronta-home` to the Impronta tenant + publish. This is owner action `O3` in the multi-agent plan.

## Recipe ↔ Component verification (read this session)

Each item below is **already coded** in `phase-1` HEAD (`641782e1d` or later):

### Recipe slice (already correct in `web/src/lib/site-admin/edit-mode/starter-action.ts`)

- **H1 location_discovery map**: `showMap: true` set; 5 markets including "Los Angeles" + "Madrid" with `status: "coming_soon"`. ✓
- **H2 editorial_split_hero discovery form + stack**: `discoveryForm.enabled: true` with `categoryLabel`, `marketLabel`, `submitLabel`, full `categories[]` + `markets[]`. `mediaStyle: "card-stack"`, `mediaStackUrls[]` with 3 prototype Unsplash sources, `mediaStackCaptions[]`. ✓
- **H5 hero_search**: 4-chip layout (Riviera Maya + Mexico City + Buenos Aires + "More cities coming" soft chip), `secondaryCta: { label: "Apply as talent", href: "/register" }`, `statSource: "manual"` with the stat label (THIS COMMIT improves it slightly — see below). ✓
- **H6 copy**: `location_discovery.eyebrow: "Talent network"` + `headline: "Local faces, international reach"`; `editorial_split_hero.headline: "Discover premium talent across"` + `highlight: "destination cities."`. ✓
- **H8 eyebrows**: `process_steps.eyebrow: "How it works"`, `values_trio.eyebrow: "Why Impronta"`, `cta_banner #2.eyebrow: "For clients"` (deliberately kept for symmetry with #1's "For talent"). ✓

### Component slice (already coded)

- **`location_discovery/Component.tsx:277`**: `: showMap ? (<MarketMap locs={locs} showCount={showCount} />)` — when `showMap === true`, the SVG market map renders with featured / active / coming-soon pin states + the "Featured market" / "Coming soon" kicker panel. ✓
- **`editorial_split_hero/Component.tsx:155–193`**: when `discoveryForm.enabled === true`, renders `<form action={discoveryAction}>` with `<select name="type">` + `<select name="market">` + submit button — natively-submitting GET form to the resolved directory route (no client JS needed). ✓
- **`editorial_split_hero/Component.tsx:103–104`**: `useStack = mediaStyle === "card-stack" && stackUrls.length > 0` — when the recipe sets `mediaStyle: "card-stack"` and provides `mediaStackUrls`, the stacked layered card visual renders. ✓
- **`MarketMap` (inline in `location_discovery/Component.tsx:65–`)**: full SVG world-decoration + positioned pins (CSS-positioned by `pinStyle(index)`) + an aside panel with featured-market kicker / title / region / copy. ✓

### Where the OLD live data comes from

`/impronta` is rendered from the Impronta tenant's **published `cms_page_sections` row** in the database, not from `starter-action.ts` at request time. The `impronta-home` recipe in code is a **starter** that gets applied to the tenant via `applyStarterComposition` → seeds rows in `cms_page_sections` → then `publishHomepage` snapshots that as the live render source.

The last full apply+publish cycle (per the canonical plan doc, Visual Polish Pass 1, 2026-05-18) shipped imagery + overlay tweaks but did NOT include the H1/H2 (`showMap: true`, `discoveryForm.enabled: true`, `mediaStyle: "card-stack"`) recipe fields — those were added to `starter-action.ts` AFTER that publish. Hence the live render gap.

## Corrected action set

**Replaces** the audit doc's `H1` / `H2` / `H3` / `H4` / `H5` / `H6` / `H8` agent assignments. The **single owner action** is what's needed:

### Owner action — **re-apply `impronta-home` to Impronta tenant**

Two ways to do it:

#### Path A — Visual editor (canonical, used in Phase 4)
1. Sign into the Impronta tenant's admin (`/impronta/admin` or `app.tulala.digital`/the relevant admin host).
2. Open the page-builder for the home page.
3. **Template gallery** → "Apply impronta-home" → confirm "Apply 9 sections" (per Phase 4 Visual Polish Pass 1 precedent).
4. Editor topbar → **Publish**.

#### Path B — npm script (if exists)
```
cd web
# Per the project's CLAUDE.md memory note about Phase 4:
npm run reset:impronta-homepage -- --apply --purge-cleared-sections
# (verify the script exists in package.json; if not, use Path A)
```

#### Path C — direct invocation (last resort)
Call `applyStarterComposition({ tenantId: "00000000-0000-0000-0000-000000000001", starterSlug: "impronta-home" })` server-action + `publishHomepage` from a one-off script. Higher risk than Path A; only if A/B unavailable.

### After re-apply — verification (Chrome MCP, this session)

Re-visit `http://localhost:3000/impronta` and verify:
- hero_search secondary CTA reads **"Apply as talent"** (currently shows "Explore Talent").
- hero_search chips: **4 chips** (Riviera Maya / Mexico City / Buenos Aires / "More cities coming" soft) — currently shows 3 (Playa del Carmen / Tulum / Riviera Maya).
- hero_search stat line: **"28 represented talent · agency-managed from brief to confirmation"** — currently shows only "28 represented talent".
- editorial_split_hero: **discovery form** (two `<select>` dropdowns + Explore button) + **card-stack** media (3 layered images). Currently shows static media frame only.
- location_discovery: **SVG map** with positioned pins (featured Riviera Maya gold pin + active CDMX/Buenos Aires + coming_soon LA/Madrid). Currently shows card grid only.
- process_steps eyebrow: **"How it works"** (currently "How booking works").
- values_trio eyebrow: **"Why Impronta"** (currently "What we believe").
- Footer columns: **2 only** today (Discover, Talent). The audit's H3 (4-column + social row + legal links) is a SHELL-level data change — see below.

## What's NOT in starter-action.ts (shell data — separate path)

`site_header` + `site_footer` are **shell sections**, not body sections — they're seeded from `default-content.ts` + `agency_branding` + admin BrandingDrawer/SiteHeaderInspector, NOT from the `impronta-home` starter recipe.

**H3 (footer)** + **H4 (header social cluster)** therefore need:
- `default-content.ts` site_footer entry update (currently 2 columns; needs 4 + social + legal). But **this file is currently being modified by the concurrent directory-section agent** (per git status); **defer** until that work settles, then a small follow-up agent updates the default-content footer entry.
- Alternative: admin-edit the Impronta tenant's shell rows directly via the SiteHeaderInspector + a footer-equivalent — but the footer editor is `ZodSchemaForm`-driven and the data lives in `cms_sections` row for the shell, not in code defaults. Easier path: update `default-content.ts` and re-seed.

## Net status

| Item | Code | Recipe (starter-action) | Tenant data (DB) | Action |
|------|------|--------------------------|------------------|--------|
| H1 map | ✓ done | ✓ `showMap: true` set | OLD | Re-apply recipe (owner) |
| H2 discovery form + stack | ✓ done | ✓ `discoveryForm.enabled: true` + `mediaStyle: card-stack` set | OLD | Re-apply recipe (owner) |
| H3 footer 4-col + social + legal | shell schema supports | NOT in starter (shell) | OLD | Update `default-content.ts` (defer for directory agent settle) + re-seed shell |
| H4 header social + phone | shell schema supports | NOT in starter (shell) | OLD | Same as H3 (default-content + re-seed) |
| H5 hero_search chips + stat + secondary CTA | ✓ done | ✓ done (this commit polishes stat tone) | OLD | Re-apply recipe (owner) |
| H6 copy alignment | ✓ done | ✓ done | OLD | Re-apply recipe (owner) |
| H8 eyebrows | ✓ done | ✓ done | OLD | Re-apply recipe (owner) |
| H9 nav 5 vs 6 | n/a | shell | live keeps 6 | Decision: keep 6 (deliberate) |
| H10 locale toggle e2e | exists in header | n/a | manual verify | Browser-QA after re-apply |

**One small recipe polish landing in this commit**: hero_search stat label → adds "agency-" tone prefix ("agency-managed from brief to confirmation"). Matches the prototype's "agency-managed from inquiry to confirmation" framing more closely. Single-word change.

*End — audit addendum 2026-05-19.*
