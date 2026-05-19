# Page Builder 2.0 + Impronta Homepage Execution Plan

> **Canonical, repo-tracked source of truth for this workstream.**
> Created 2026-05-17. Supersedes scattered chat checkpoint reports for the
> "convert the Impronta homepage into a real Page Builder 2.0 composition"
> effort. Other `web/docs/builder-*.md` files are background/vision/audit
> for the broader builder program — **this file is operative for Phase
> 0/1/2/4/5 of the Impronta homepage conversion.** Do not fork competing
> plans; update this one.

---

## Current Execution State

- **Last updated:** 2026-05-17
- **Current phase:** **Phase 0–4 COMPLETE locally** → Phase 5 (legacy fallback removal) pending PRODUCTION shell-flag confirmation
- **Current next task:** Owner sets the two shell env vars in **Vercel prod** (`ENABLE_SITE_SHELL=tenants`, `SITE_SHELL_TENANT_IDS=00000000-0000-0000-0000-000000000001`) — owner/deploy action, NOT done here (no push/deploy). Locally verified: modern `site_header`+`site_footer` render for `…0001` only (nova-crew + qa-agency confirmed still on legacy fallback); logo resolves from the sanctioned public mirror `agency_branding.theme_json.logo_url` (new reusable `resolveShellBrandLogoUrl`); header nav + Start-Inquiry CTA (Option-1 routes); footer columns + real copyright, **debug tagline removed**; 9 CMS body sections + editorial-noir intact; no Curated; no edit chrome public; no horizontal overflow at 390/834/1440 (3 reusable shell-CSS responsiveness fixes). **Phase 5 should wait until the prod shell flag is live + prod-QA'd.** `stash@{0}` untouched; nothing committed/pushed.
- **Current branch:** `phase-1`
- **Working tree status:** local-first, uncommitted changes present (nothing committed/pushed for this workstream)
- **Stash status:** `stash@{0}` contains unrelated parked work (admin-shell/server-actions/AI/profile-editor) — **do not reapply**
- **Gate:** Phase 2 Entry Gate was satisfied (all 4 Phase-1 sections complete + gated). Phase 2 composition + the reusable hero-slot foundation fix are tsc-clean + eslint-clean. Public/editor verification is the documented runtime step (no local Supabase).

---

## 1. Executive Summary

We are converting the final Impronta static homepage **design** into a real
**Page Builder 2.0–powered** homepage. This is **not** a static HTML build.

The work creates **reusable, tenant-safe, theme-driven builder
sections/primitives** that any future agency / studio / hub / tenant can
reuse. Impronta is the **first production-quality test case** for the
cleaned builder foundation — its black/gold look must come from a theme
**preset (`editorial-noir`)**, never hardcoded into components. A brand-new
tenant must render a clean **neutral white** foundation by default.

The static prototype lives at `web/prototypes/impronta-home/` and is the
**visual target only** — it is throwaway, never the implementation.

---

## 2. Core Principles (non-negotiable)

- Do **not** create another prototype or static homepage code.
- Do **not** create Impronta-only one-off components.
- Do **not** duplicate the builder, the renderer, or any registry.
- Use the **canonical** section registry + shared renderer + BuilderNode.
- Use **tenant theme tokens**, never hardcoded colors. Impronta black/gold
  comes from `editorial-noir`, not CSS.
- New tenants default to a **neutral white** foundation.
- Do **not** invent phantom DB fields. Verify schema before binding.
- Do **not** rely on public RLS alone for tenant data sections — **always
  filter by resolved tenant id in the query layer**.
- **Local-first.** No deploy / no production push / no `git push` unless
  explicitly instructed.
- Keep chunks **isolated and gated**; never one giant tangled diff.
- **Do not reapply `stash@{0}`** (parked unrelated in-flight work).

---

## 3. Canonical Systems

| System | Path | Purpose | Status |
|---|---|---|---|
| Editor shell | `src/components/edit-chrome/` | In-place storefront editor (no separate route) | Active |
| Theme drawer | `src/components/edit-chrome/theme-drawer.tsx` | Token + **preset picker** UI | Active |
| Section registry | `src/lib/site-admin/sections/registry.ts` | Canonical section registration (`SECTION_REGISTRY`) | Active |
| Section folder pattern | `src/lib/site-admin/sections/<key>/` | `schema.ts · migrations.ts · meta.ts · Component.tsx · Editor.tsx` | Active |
| Section meta lookup | `src/lib/site-admin/sections/section-meta-registry.ts` | **Derives from `SECTION_REGISTRY`** (no parallel map) | Active (P0-6) |
| BuilderNode | `src/lib/site-admin/builder-node/` | Layout / nesting / composition | Active |
| Snapshot↔node bridge | `src/lib/site-admin/builder-node/snapshot-slot-bridge.ts` | Load-bearing (renamed from `legacy-section-tree.ts`) | Active (P0-7) |
| Shared renderer | `src/components/home/homepage-cms-sections.tsx` | **Public + editor** render (one renderer) | Active |
| Draft/publish | `src/lib/site-admin/edit-mode/design-actions.ts`, `server/design.ts`, `server/page-reads.ts` | `theme_json_draft` → publish → `theme_json`; CAS/audit | Active |
| Theme/token resolver | `src/lib/site-admin/tokens/` (`resolve.ts`, `registry.ts`) | `theme_json` → `--token-color-*` + `data-token-*` on `<html>` | Active |
| Token preset CSS | `src/app/token-presets.css` | `data-token-*`-keyed CSS; `editorial-noir`/`-ivory` re-feed palettes | Active |
| Theme presets | `src/lib/site-admin/presets/theme-presets.ts` | `neutral·classic·editorial-bridal·studio-minimal·editorial-noir` + `DEFAULT_THEME_PRESET_SLUG` | Active |
| Section presentation schema | `src/lib/site-admin/sections/shared/presentation.ts` | Per-section appearance (P0-4 extended) | Active |
| Shared primitives kit | `src/lib/site-admin/sections/shared/section-primitives/index.tsx` | `Container·SectionHead·Cta·SearchInput·StatLine·Badge·ChipList·MediaFrame` | Active |
| Data binding scaffold | `src/lib/site-admin/builder-node/data-bindings.ts` | featured-talent / locations / directory source keys | Active |
| Tenant talent picker | `src/lib/site-admin/edit-mode/talent-picker-action.ts` | `searchTenantTalent` editor-safe, tenant-scoped | Active (D3) |
| Roster helpers | `src/lib/saas/talent-roster.ts` | `listTalentIdsOnTenantRoster` / `listAdminRosterTalentIds` (tenant-scoped) | Active |
| Site-shell flag | `src/lib/site-admin/site-shell-flag.ts` | `ENABLE_SITE_SHELL` off\|tenants\|all + `SITE_SHELL_TENANT_IDS` allowlist | Active (off) |
| Globals / neutral base | `src/app/globals.css` | `:root` = neutral fallback (P0-2); per-tenant via tokens | Active |

---

## 4. Do Not Use / Legacy / Deprecated

| Item | Status | Decision | Follow-up |
|---|---|---|---|
| `src/components/home/home-public.tsx` | Deleted | 0 importers, dead | — |
| `src/components/home/editorial-talent-strip.tsx` | Deleted | 0 importers, dead | — |
| `M7_*`/`M8_*`/`HANDOFF_PAGE_BUILDER`/`ADMIN_VERIFICATION_GUIDE` (in `src`) | Archived → `web/docs/archive/page-builder-milestones/` | Stale/misleading in source tree | — |
| Hardcoded fallback stack in `agency-home-storefront.tsx` (`TalentTypeShortcuts`/`FeaturedTalentSection`/`BestForSection`/`LocationSection`/`HowItWorks`/`CtaSection`) | **Deprecated, frozen** (P0-8) | Do NOT expand; Impronta-flavored | Phase 5: replace with seeded neutral CMS composition, then delete |
| Hardcoded `PublicHeader` + inline `<footer>` (live chrome) | Fallback only | NOT canonical long-term | Phase 4: revive modern `site_header`/`site_footer` |
| Old Impronta-flavored `globals.css :root` defaults (cream/gold) | Replaced (P0-2) | Now neutral white | `.site-theme-dark/.site-theme-light` utility classes still carry Impronta values (scoped opt-in, not platform default) — flagged, not yet token-fed |
| `ThemeFoundationsDrawer` (`drawers.tsx`) | Dead UI | Writes unread settings namespace | Phase 4/cleanup: remove/relabel |
| `BrandingDrawer` logo upload / tagline (`agencies.settings`/`theme_json.logo_url`) | Writes-but-never-renders | 3 disagreeing logo stores | Phase 4: logo single-source bridge |
| 3 logo stores (`agency_branding.brand_mark_svg` [live], `*_media_asset_id`, `agencies.settings.branding.logo_url`) | Not consolidated | brand_mark_svg is the only one the live header renders | Phase 4 bridge; full consolidation later |
| `stash@{0}` ("PB2.0-cleanup: park unrelated…") | Parked, untouched | Unrelated admin-shell/server-actions/AI/profile-editor work | Restore later with `git stash apply stash@{0}` — **not by this workstream** |

---

## 5. Decisions Log

### Decision: Neutral default foundation
Status: **completed** (P0-1 + P0-2). Reason: future tenants must not inherit
Impronta black/gold. `neutral` preset added; `globals.css :root` neutralized;
`editorial-noir` preserved via `token-presets.css` attribute rules.

### Decision: Impronta theme via `editorial-noir`
Status: **accepted**. Impronta styling = preset/tokens, never component CSS.
Applied to the Impronta tenant in Phase 4 via the preset picker.

### Decision: Add theme preset picker
Status: **completed** (Decision-1, gated). `applyThemePresetFromEditAction`
wraps the tested `applyThemePreset` lib op; picker in ThemeDrawer → Advanced
tab (5 presets). Applies to **draft**; Publish promotes to live (honest
semantics surfaced in UI). No raw DB write needed; no second theme system.

### Decision: Modern `site_header`/`site_footer` direction
Status: **accepted / planned (Phase 4)**. Revive the modern shell; keep
hardcoded `PublicHeader` as temporary fallback only — NOT canonical. Safe
rollout: `ENABLE_SITE_SHELL=tenants` + add Impronta tenant id to
`SITE_SHELL_TENANT_IDS`, after Impronta has published `site_header`/
`site_footer` rows + a logo single-source bridge. **Do not flip the flag
until Phase 4.** No second header/footer system.

### Decision: Tenant-scoped talent picker
Status: **completed** (Decision-3, gated). `searchTenantTalent` editor-safe
server action; `requireStaff` (authed client) → `requireTenantScope` →
`listAdminRosterTalentIds` → results constrained `.in("id", rosterIds)`;
sanitized query; **no public API; no cross-tenant leakage**. Manual
profile-code paste remains as advanced fallback.

### Decision: Talent Collection DTO limitation
Status: **accepted for now**. `FeaturedTalentCardDTO` is cache-trimmed
(name/primaryType/city/badge/thumbnail only). `secondaryType`, `languages`,
`availability`, true parent-vs-leaf category are **not invented** — schema
toggles persist + Editor exposes them with a "*" note; they render only
after a later DTO-extension chunk (extend `FeaturedTalentCardDTO` + the
`featured_talent/fetch.ts` SELECT/projection). Not a blocker for other
sections unless one needs the same DTO path.

### Decision: Stop conditions (standing)
Stop a marathon only on: migration required · tenant isolation not
guaranteeable · `tsc` fails non-locally · new route/API decision required ·
section too large for one reviewable checkpoint · existing data can't
support a field without a product decision.

---

## 6. Phase Tracker

### Phase 0 — Foundation Cleanup
- [x] De-Impronta `app/page.tsx` redirect (env `DEV_ROOT_REDIRECT`)
- [x] Delete unused homepage files (`home-public`, `editorial-talent-strip`)
- [x] Archive stale page-builder docs → `web/docs/archive/page-builder-milestones/`
- [x] Clean tree (parked unrelated work → `stash@{0}`)
- [x] Create neutral default theme preset + `DEFAULT_THEME_PRESET_SLUG`
- [x] Neutralize global `:root` fallback (editorial-noir preserved via tokens)
- [x] Extend canonical `Cta` primitive (outline/text, sizes, icon, fullWidthMobile, loading, disabled) + CSS
- [x] Extend section presentation schema (designPreset/textTone/overlay/card/border/radius/elevation/layout — additive, no migration)
- [x] Tokenize `FeaturedTalentCard` (remove `to-black`/`--impronta-gold`)
- [x] Consolidate section meta registry (derive from `SECTION_REGISTRY`)
- [x] Rename `legacy-section-tree.ts` → `snapshot-slot-bridge.ts` (13 importers; bridge tests 98/0)
- [x] Mark legacy fallback stack deprecated + Phase 5 handoff (Option B)
- [x] Branding/settings end-to-end audit (3 passes) + low-risk typography fix (`FeaturedTalentCard` → `var(--site-heading-font)`)
- [ ] **Human browser smoke: no-theme tenant = neutral white** (env-limited; code-level + live-render verified, pixel diff outstanding)
- [ ] **Human browser smoke: editorial-noir tenant = black/gold from tokens** (same)

### Phase 1 — Shared Primitives + Smart Sections
- [x] SearchInput primitive
- [x] StatLine primitive
- [x] Badge primitive
- [x] ChipList primitive
- [x] MediaFrame primitive
- [x] Theme preset picker UI (Decision-1)
- [x] Tenant-scoped `searchTenantTalent` action (Decision-3)
- [x] Talent Collection schema extension (cap→15, toggles, cardVariant, parent, requestCta, emptyState)
- [x] Talent Collection Component/Card render wiring (1a)
- [x] Talent Collection Editor wiring + visual picker (1b)
- [x] `talent_type_grid` (5-file section + registry + default-content + CSS)
- [x] `hero_search` (5-file section + fetch tenant-count + registry + default-content + CSS)
- [x] `location_discovery` (5-file section + fetch roster-cities + registry + default-content + CSS)
- [x] `editorial_split_hero` (5-file section + registry + default-content + CSS)
- [ ] Talent Collection DTO extension (secondaryType/languages/availability/true parent) — parallel follow-on

### Phase 2 — Impronta Homepage Composition
- [x] Seed/build Impronta homepage as real CMS composition — defined as canonical builder DATA: `impronta-home` `Recipe` in `src/lib/site-admin/edit-mode/starter-action.ts` `RECIPES` (NOT static HTML, NOT a custom React page, NOT a duplicate builder). Applied per-tenant via the canonical admin one-click starter (`applyStarterComposition`) — tenant resolved from `requireTenantScope()`, never hardcoded.
- [x] Use `hero_search` (slot `hero`, sortOrder 0)
- [x] Use `editorial_split_hero` (slot `hero`, sortOrder 1)
- [x] Use `talent_type_grid` (slot `trust_band`)
- [x] Use `talent_collection` / `featured_talent` (slot `services`)
- [x] Use `location_discovery` (slot `featured`)
- [x] Use process steps section — reuse `process_steps` (slot `process`)
- [x] Use agency trust / value props — reuse `values_trio` (slot `destinations`)
- [x] Use talent CTA — reuse `cta_banner`, audience=talent (slot `gallery`)
- [x] Use client inquiry CTA — reuse `cta_banner`, audience=client (slot `final_cta`)
- [x] Foundation fix (reusable): widened homepage `hero` slot `allowedSectionTypes` → `["hero","hero_search","editorial_split_hero"]` so the Phase-1 hero-class section types can occupy their natural slot (additive; existing `hero`-only compositions still validate; single source of truth honored by save + editor drag + slot-compat). Completes Phase-1 integration.
- [ ] **Runtime step (NOT local-doable — no local Supabase; do not guess tenant):** identify the real Impronta tenant, apply the `impronta-home` starter in that tenant's admin scope, then verify (a) editor loads the composition and (b) public render uses the published snapshot. See "Phase 2 Runtime Apply Step" below.

### Phase 3 — QA / Tenant Isolation
- [ ] Two-tenant data isolation test (A never shows B)
- [ ] `talent_collection` no roster leakage
- [ ] `talent_type_grid` no taxonomy/profile leakage
- [ ] `location_discovery` no leakage
- [ ] Search routes correctly (`/directory?...`)
- [ ] Inquiry CTAs route correctly
- [ ] Talent apply/login routes correctly
- [ ] Mobile 390px QA
- [ ] Tablet 834px QA
- [ ] Desktop 1440px QA

### Phase 4 — Impronta Shell / Header / Footer / Logo  (AUDIT DONE; checkpoint before exec)
- [x] `editorial-noir` already LIVE (done in publish phase — `theme_json`)
- [x] Audit: flag system, loader, sections, render bind, current rows, logo stores
- [x] Impronta `site_shell` row EXISTS + published (`7614645e…` v8; header+footer slots; snapshot has both)
- [x] **Configured** Impronta `site_header` (nav + Start-Inquiry CTA, Option-1 routes; logo via resolver)
- [x] **Configured** Impronta `site_footer` (columns + copyright; **debug tagline removed**)
- [x] Logo bridge — owner Option 1 resolver bind; sanctioned public mirror `agency_branding.theme_json.logo_url` (forced deviation accepted: `agencies.settings` staff-only by design); gated
- [x] Set `ENABLE_SITE_SHELL=tenants` + `SITE_SHELL_TENANT_IDS=…0001` in LOCAL `.env.local` (prod Vercel env = owner/deploy action, documented, NOT done)
- [x] Verified modern shell renders for …0001 only; nova-crew + qa-agency confirmed on legacy fallback
- [x] Verified header nav/CTA, footer, editorial-noir, logo-from-mirror, no debug, no edit chrome, no overflow 390/834/1440

#### Phase 4 Audit Result (2026-05-18)

- **Flag** (`site-shell-flag.ts`): `ENABLE_SITE_SHELL` = off|tenants|all; `SITE_SHELL_TENANT_IDS` allow-list for `tenants` mode. `isSiteShellEnabledForTenant` + belt: `loadPublishedShell` null → fall back to legacy `PublicHeader`. Read at request time (server). Impronta-only = `tenants` + allowlist `…0001`; **NOT global** (`all` would be global — not used).
- **Loader** (`shell-reads.ts`): shell = system `cms_pages` (`system_template_key='site_shell'`, slug `__site_shell__`), slots `header`/`footer`, snapshot in `published_page_snapshot`; anon-safe via RPC `cms_public_pages_for_tenant`; cached, `pages-all` tag-bust.
- **Render bind** (`PublishedShell.tsx`): `shouldRenderSnapshotShell` (flag ∧ published shell) → `PublishedShellHeader/Footer` render slots via the SAME `getSectionType()` + builder-node pipeline as body (tokens/theming identical); `prefixPublicHrefsDeep` applied (same href model — on prod custom domain `publicPathPrefix=""` so `/login`,`/register` stay root → 200, consistent with Option-1). `agency-home-storefront.tsx` un-mounts legacy `PublicHeader` when shell active.
- **Impronta shell state:** row `7614645e-b205-4e65-9b83-5394bed3beb7`, en, **published v8**, `published_page_snapshot.slots=[footer:site_footer, header:site_header]`. Data-ready — **only the env flag gates render.** Header props: `{brand:{href:"/",label:"Impronta"}, navItems:[], tone:surface, variant:standard, sticky:true, authArea:all-true}` — no nav, no logo, no CTA. Footer props: `{brand:{label:"Impronta", tagline:"Builder live-edit 01:58:54 UTC"}, columns:[], social:[], legal:{copyright:"© 2026 Impronta…", links:[]}}` — debug tagline, empty.
- **Logo stores:** (1) `agency_branding.brand_mark_svg` = **null**, `logo_media_asset_id` = **null**; (2) `theme_json` logo keys = only `shell.logo-variant` (no URL); (3) **`agencies.settings.branding.logo_url`** = real PNG (`…/agency-logos/…0001/…png`). Legacy `PublicHeader` renders from `branding.brand_mark_svg` (null → text). `site_header` Component renders `brand.logoUrl` else text label — **no auto-resolve from branding**. Bridge needed; decision options in checkpoint.
- **site_header schema:** brand{label?,logoUrl?,logoAlt?,href}, navItems≤8{label,href,external?}, primaryCta?, sticky, tone(transparent|surface|solid), variant(standard|minimal|split), authArea{showAccountMenu,showLanguageToggle,showDiscoveryTools}. **site_footer schema:** brand{label?,logoUrl?,tagline?}, columns≤5×links≤8, social≤6, legal{copyright,links 1-3}.

#### Phase 4 Logo Bridge — owner Option 1 (resolver bind) + FORCED DEVIATION (2026-05-18)

Owner chose the Component resolver bind, fallback order: section
`brand.logoUrl` → `agencies.settings.branding.logo_url` →
`agency_branding.brand_mark_svg` → text.

**Forced deviation (surfaced for transparency):** `agencies.settings` is
**staff-only by platform design** — the anon/public client returns no
`settings` (RLS; no public-select policy, unlike `agency_branding` /
`agency_business_identity`). Reading it in the public shell render path
would require an RLS policy / SECURITY DEFINER RPC = a **migration** (an
explicit Phase-4 stop condition). The platform already solves this: the
canonical settings-save path (`server-actions/admin-workspace-settings.ts`
:123-143) **mirrors `logo_url` into the publicly-readable
`agency_branding.theme_json.logo_url`** on every save, with the in-code
rationale *"agency_branding is publicly readable; agencies.settings is
staff-only."* So the resolver reads that sanctioned public mirror — same
intent (settings logo = public shell logo; future settings changes
propagate via the existing mirror), no migration, no new source, no
service-role in the public path, no hardcoded URL.

Implemented (gated tsc 0 / eslint 0):
- NEW `src/lib/site-admin/server/shell-brand-logo.ts` —
  `resolveShellBrandLogoUrl({tenantId, brandLogoUrl})`: `brand.logoUrl` →
  `loadPublicBranding(tenantId).theme_json.logo_url` → null (→ text
  wordmark). Reuses the existing cached, tenant-safe public reader.
  `logo_media_asset_id` (no public URL resolver) + `brand_mark_svg`
  (inline-SVG, not an `<img src>`) documented as future fallbacks — not
  implemented (no scope creep).
- `site_header/Component.tsx` + `site_footer/Component.tsx`: now async,
  destructure `tenantId`, render the resolved logo (falls back to the
  existing text-label path). Reusable for every tenant.
- One-time tenant-scoped data alignment for `…0001`: its
  `agencies.settings.branding.logo_url` PNG predated the mirror code, so
  `theme_json.logo_url` was null. Performed the identical
  canonical-pattern merge write (`agency_branding.theme_json` ← `{...tj,
  logo_url}`) — editorial-noir tokens preserved (38→39 keys). NOT a schema
  migration. Production note: a settings re-save (or cache-bust) is what
  normally refreshes `loadPublicBranding`'s `unstable_cache` (`branding`
  tag); a fresh server / publish revalidation picks it up.

Acceptance check: future logo changes via the canonical settings UI
auto-propagate to the public shell through the existing mirror →
"settings logo = public shell logo" satisfied. No fourth logo store; no
branding rewrite.

#### Phase 4 Execution Result — COMPLETE locally (2026-05-18)

Resolver fallback order shipped: `brand.logoUrl` →
`agency_branding.theme_json.logo_url` (sanctioned public mirror) → text
wordmark. Files: NEW `src/lib/site-admin/server/shell-brand-logo.ts`;
`site_header/Component.tsx` + `site_footer/Component.tsx` (async + resolve);
one-time `…0001` `theme_json.logo_url` data alignment (canonical-pattern
merge, editorial-noir preserved). All tsc 0 / eslint 0.

Shell content (configured on the existing draft sections, baked via the
canonical homepage-publish → `republishSiteShellSnapshot`; shell page
`published v9`): **header** brand "Impronta" (logo via resolver, no baked
prop), nav Discover/Talent/Locations→`/directory`, About→`/about`,
Contact→`/contact`, Apply as Talent→`/register`; primaryCta Start
Inquiry→`/contact`; authArea on (AccountMenu = Login access). **footer**
brand + real tagline (debug "Builder live-edit…" REMOVED), columns
Discover[Directory/Contact/About] + Talent[Apply as Talent→`/register` /
Talent Login→`/login`], © 2026 Impronta, social none. Snapshot verified:
0 "Builder live-edit", 0 "Curated".

Flag: `web/.env.local` → `ENABLE_SITE_SHELL=tenants` +
`SITE_SHELL_TENANT_IDS=00000000-0000-0000-0000-000000000001`; dev server
restarted.

QA (no-cookie public + preview): `…0001` renders modern
`data-section-type="site_header"`/`"site_footer"` (×1 each); logo `<img>`
= the settings PNG via the theme_json mirror; nav + CTA present; footer
clean; 9 CMS body sections intact; `data-token-background-mode=
editorial-noir`; **0 "Curated"**, **0 "EDIT HEADER"** (no public edit
chrome). Other-tenant safety: `nova-crew` + `qa-agency` storefronts have
**0** modern shell sections (legacy fallback) — flag correctly
Impronta-only.

Responsive fixes (reusable, token-driven, all tenants on the modern
shell benefit — NOT Impronta-specific): (1) `.site-header__inner` +
(2) `.site-footer__inner` were fixed `width: var(--site-container-max,
1120px)` (no viewport clamp → 1120px overflow on mobile) → changed to the
codebase-canonical `width: min(var(--site-container-max,1120px), 100%)`;
(3) `.site-header__inner` got `flex-wrap: wrap` so the 721–960px tablet
band wraps instead of overflowing (nav stays accessible; no second menu
system built). Verified **no horizontal overflow at 390 / 834 / 1440**.
Pixel-perfect aesthetic pass still needs a human (screenshots denied in
agent env).

**Production action required (owner/deploy — NOT done here):** set the
same two env vars in the Vercel project env, redeploy, then prod-QA the
modern shell on `improntamodels.com`. Until then prod still serves the
legacy `PublicHeader` for Impronta (safe — belt-and-suspenders:
flag-off ⇒ legacy).

## Phase 4 Production Handoff

> Authoritative handoff for taking the locally-verified modern shell to
> production. Phase 5 is gated on this. Created 2026-05-18.

### 1. Local Phase 4 status

- Modern site shell (`site_header` + `site_footer`) works **locally** for
  tenant `00000000-0000-0000-0000-000000000001` only.
- Other tenants remain on the legacy `PublicHeader` shell (verified:
  `nova-crew`, `qa-agency` → 0 modern-shell sections).
- Logo resolves through `agency_branding.theme_json.logo_url` (the
  sanctioned public mirror of the staff-only
  `agencies.settings.branding.logo_url`).
- Header configured: brand + nav (Discover/Talent/Locations→`/directory`,
  About→`/about`, Contact→`/contact`, Apply as Talent→`/register`) +
  Start Inquiry CTA→`/contact`; authArea on (AccountMenu = Login access).
- Footer configured: brand + real tagline, columns
  (Discover[Directory/Contact/About], Talent[Apply as Talent→`/register`,
  Talent Login→`/login`]), © 2026 Impronta. **Debug tagline removed.**
- No horizontal overflow at 390 / 834 / 1440.
- 9 CMS body sections still render (single render; SSR-authoritative).
- Editorial-noir intact (`data-token-background-mode=editorial-noir`).
- No "Curated" anywhere. No public edit chrome (`EDIT HEADER` absent for
  cookieless visitors).
- Pixel-perfect aesthetic pass still needs a human (screenshots denied in
  the agent env).

### 2. Files changed (Phase 4)

- `web/src/lib/site-admin/server/shell-brand-logo.ts` — NEW reusable
  logo resolver.
- `web/src/lib/site-admin/sections/site_header/Component.tsx` — async +
  resolver.
- `web/src/lib/site-admin/sections/site_footer/Component.tsx` — async +
  resolver.
- `web/src/app/token-presets.css` — 3 reusable responsive fixes
  (`.site-header__inner` + `.site-footer__inner` →
  `width: min(var(--site-container-max,1120px),100%)`;
  `.site-header__inner` → `flex-wrap: wrap`).
- `web/.env.local` — LOCAL flags (gitignored; NOT committed; prod uses
  Vercel env, see §3).
- `web/docs/page-builder-impronta-execution-plan-2026-05.md` — this
  tracker.
- Data alignment performed for tenant `…0001` (DB, not files, via
  service-role canonical-pattern writes — NOT schema migrations):
  - `agency_branding.theme_json.logo_url` set = the existing
    `agencies.settings.branding.logo_url` PNG (editorial-noir tokens
    preserved; 38→39 keys).
  - `cms_sections.props_jsonb` of the shell's `site_header` +
    `site_footer` updated to the configured content; baked to
    `published_page_snapshot` via the canonical homepage-publish →
    `republishSiteShellSnapshot` (shell page `published v9`).

### 3. Production env variables required (Vercel project env)

```
ENABLE_SITE_SHELL=tenants
SITE_SHELL_TENANT_IDS=00000000-0000-0000-0000-000000000001
```

`tenants` mode + single-id allow-list = Impronta-only. Do **not** use
`all` (global). Other tenants stay on legacy fallback automatically.

### 4. Production deploy requirement

- **No production shell change is live until the two env vars above are
  set in the Vercel project env AND the app is redeployed.**
- Until then production safely uses the legacy `PublicHeader` fallback
  (belt-and-suspenders: flag-off ⇒ legacy; also `loadPublishedShell`
  null ⇒ legacy). No prod risk from the un-flagged state.
- This is an **owner/deploy action** — not performed here (no
  push/deploy this workstream).

### 5. Production QA checklist (run on `improntamodels.com` after env + redeploy)

- [ ] modern header renders
- [ ] modern footer renders
- [ ] logo appears (from `agency_branding.theme_json.logo_url`)
- [ ] header nav works
- [ ] Start Inquiry works (`/contact`)
- [ ] Login works (`/login`, AccountMenu)
- [ ] Register works (`/register`)
- [ ] homepage body renders all 9 CMS sections
- [ ] deprecated hardcoded body fallback is NOT used
- [ ] editorial-noir remains live
- [ ] no edit chrome for public visitors
- [ ] no horizontal overflow at 390 / 834 / 1440
- [ ] other tenants still use legacy shell unless allow-listed

### 6. Phase 5 gate

**Phase 5 (legacy fallback removal) cannot begin until ALL are true:**

- [ ] production env vars are set (Vercel)
- [ ] production redeploy is complete
- [ ] production QA (§5) passes
- [ ] Impronta modern shell confirmed live on `improntamodels.com`
- [ ] fallback is no longer needed for Impronta

Removing the fallback before prod runs the modern shell **would break
the production storefront** — hard gate.

### 7. Remaining non-blocking cleanup / future work

- `agency_business_identity.footer_tagline` still contains the old debug
  string `"Builder live-edit 01:58:54 UTC"` — feeds the **legacy footer
  only**; modern shell uses the section prop (clean). Separate cleanup.
- Builder `platform-auth` / `app-route` link kind — future platform work
  (so tenant storefronts can link platform/app/auth without absolute
  hardcoding or tenant-prefix breakage).
- Talent Collection DTO extension (Decision-5) — future work.
- Visual taxonomy picker for `talent_type_grid` dynamic mode — future
  work (manual interim shipped).
- `featured_talent` roster visibility (Impronta `…0001`: 1 site_visible /
  27 roster_only → graceful empty-state) — owner/product decision; no
  roster-visibility change is in scope.
- Dynamic `tenant_talent_count` — owner-reserved (hero stat is manual
  "28 represented talent" until then).

---

#### Phase 4 Activation Plan (exact)

1. Configure `…0001` `site_header` + `site_footer` via the canonical shell editor (NOT hardcoded React) — per the spec content below.
2. Logo bridge per owner decision (see checkpoint).
3. LOCAL verify: add to `web/.env.local` → `ENABLE_SITE_SHELL=tenants` and `SITE_SHELL_TENANT_IDS=00000000-0000-0000-0000-000000000001`; restart dev server; confirm modern shell renders for `…0001`, legacy shell still for any other tenant.
4. **Production**: the SAME two env vars must be set in Vercel project env (owner/deploy action — NOT done here; "do not push/deploy"). Documented, not executed.
5. Public QA + other-tenant safety + responsive.

### Phase 5 — Legacy Fallback Replacement
- [ ] Create neutral seeded default CMS composition
- [ ] Route un-composed tenants through canonical CMS renderer
- [ ] Remove deprecated hardcoded fallback stack (`agency-home-storefront.tsx` else-branch + 6 legacy `components/home/*-section` imports)
- [ ] Verify no tenant renders empty chrome/content

---

## Completed Work Log

Chronological. Each entry: status · files changed · gates run · notes.

### Phase 0 — Foundation Cleanup
Status: **Complete & gated**
Files:
- `src/app/page.tsx` (env-driven `DEV_ROOT_REDIRECT`, de-Improntaed)
- deleted `src/components/home/home-public.tsx`, `src/components/home/editorial-talent-strip.tsx`
- `git mv` 6 docs → `web/docs/archive/page-builder-milestones/`
- `src/lib/site-admin/presets/theme-presets.ts` (`neutralPreset` + `DEFAULT_THEME_PRESET_SLUG`)
- `src/app/globals.css` (`:root` → neutral fallback)
- `src/lib/site-admin/sections/shared/section-primitives/index.tsx` (`Cta` extended)
- `src/app/token-presets.css` (`.site-prim-cta` variants/sizes/states)
- `src/lib/site-admin/sections/shared/presentation.ts` (additive appearance fields + attr emission)
- `src/lib/site-admin/sections/featured_talent/FeaturedTalentCard.tsx` (tokenized; later `var(--site-heading-font)`)
- `src/lib/site-admin/sections/section-meta-registry.ts` (derive from `SECTION_REGISTRY`)
- `src/lib/site-admin/builder-node/legacy-section-tree.ts` → `snapshot-slot-bridge.ts` (+13 importers)
- `src/components/home/agency-home-storefront.tsx` (fallback deprecation banner + Phase 5 handoff)
Gates: `tsc` ✅ (0 project-wide) · eslint ✅ · `validateAllPresets()` ✅ · builder-node bridge tests 98/0 ✅ · brand grep ✅ · stash untouched ✅
Notes: Clean tree achieved via `git stash push` → `stash@{0}` (unrelated work). editorial-noir preserved via `token-presets.css` attribute rules (specificity > `:root`). Two human browser smokes (neutral vs noir pixel diff) still open — env-limited.

### Branding/Settings Audit
Status: **Complete** (3-pass audit) + 1 low-risk fix
Fix: `FeaturedTalentCard.tsx` hardcoded Cinzel → `var(--site-heading-font, var(--font-display))`
Gates: `tsc` ✅ · eslint ✅
Notes: Found no preset-picker UI (→ Decision-1), dark modern shell, 3 logo stores, dead `ThemeFoundationsDrawer`. Token+typography chain verified working end-to-end.

### Decision-1 — Theme Preset Picker
Status: **Complete & gated**
Files:
- `src/lib/site-admin/edit-mode/design-actions.ts` (`applyThemePresetFromEditAction` + `DesignPresetResult`)
- `src/components/edit-chrome/theme-drawer.tsx` (Advanced-tab picker, 5 presets)
Gates: `tsc` ✅ · eslint ✅ · brand grep ✅ (CHROME tokens)
Notes: Delegates to tested `applyThemePreset`; writes **draft** (Publish promotes to live — honest UI copy). editorial-noir now assignable via settings; no raw DB write; no second theme system.

### Decision-3 — `searchTenantTalent`
Status: **Complete & gated**
Files: `src/lib/site-admin/edit-mode/talent-picker-action.ts` (new)
Gates: `tsc` ✅ · eslint ✅ · tenant-isolation static check ✅
Notes: `requireStaff` (authed client) → `requireTenantScope` → `listAdminRosterTalentIds` → results `.in("id", rosterIds)`; sanitized query; no public API; no cross-tenant leakage by construction.

### P1 — Shared Primitives
Status: **Complete & gated**
Files: `src/lib/site-admin/sections/shared/section-primitives/index.tsx` (SearchInput · StatLine · Badge · ChipList · MediaFrame) + `src/app/token-presets.css` (`.site-prim-*` CSS)
Gates: `tsc` ✅ · eslint ✅ · brand grep ✅ (token-driven, espresso-aware)
Notes: Server components; SearchInput `directory-query` = native GET (no client JS); AI mode never faked; `visual-only` non-default.

### P1 — talent_collection (featured_talent)
Status: **Complete for this phase & gated**
Files:
- `src/lib/site-admin/sections/featured_talent/schema.ts` (cap→15, toggles, cardVariant, parentCategoryDisplay, requestCta, emptyStateText — additive, non-strict, no migration)
- `.../featured_talent/FeaturedTalentCard.tsx` (display controls, non-nested requestCta structure)
- `.../featured_talent/Component.tsx` (thread schema, hard cap 15, emptyStateText)
- `.../featured_talent/Editor.tsx` (visual `searchTenantTalent` picker + advanced paste fallback + toggles/variant/parent/requestCta/emptyState)
Gates: `tsc` ✅ · eslint ✅ · tenant-isolation (picker self-scoping; fetch.ts roster-scoped) ✅ · brand grep ✅
Notes/limitation: `FeaturedTalentCardDTO` is cache-trimmed — secondaryType/languages/availability/true-parent toggles persist but render only after the documented **DTO-extension** chunk (Decision-5).

### P1 — talent_type_grid
Status: **Complete & gated**
Files:
- `src/lib/site-admin/sections/talent_type_grid/schema.ts`
- `src/lib/site-admin/sections/talent_type_grid/migrations.ts`
- `src/lib/site-admin/sections/talent_type_grid/meta.ts`
- `src/lib/site-admin/sections/talent_type_grid/fetch.ts`
- `src/lib/site-admin/sections/talent_type_grid/Component.tsx`
- `src/lib/site-admin/sections/talent_type_grid/Editor.tsx`
- `src/lib/site-admin/sections/registry.ts`
- `src/lib/site-admin/sections/shared/default-content.ts`
- `src/app/token-presets.css`
Gates: `tsc` ✅ (after local default-content fix) · eslint ✅ · registry wiring ✅ · tenant-isolation static check ✅ · brand grep ✅
Notes: Dynamic mode derives from `listTalentIdsOnTenantRoster` ∩ `talent_profile_taxonomy` ∩ `taxonomy_terms` (`.in("talent_profile_id", roster)`), parent rollup via `taxonomy_terms.parent_id`. Manual mode + safe empty state. Visual taxonomy picker deferred (manual term-id entry is the safe interim). Impronta categories are **defaults only** (default-content), never hardcoded in renderer.

### P1 — hero_search
Status: **Complete & gated**
Files:
- `src/lib/site-admin/sections/hero_search/schema.ts`
- `src/lib/site-admin/sections/hero_search/migrations.ts`
- `src/lib/site-admin/sections/hero_search/meta.ts`
- `src/lib/site-admin/sections/hero_search/fetch.ts`
- `src/lib/site-admin/sections/hero_search/Component.tsx`
- `src/lib/site-admin/sections/hero_search/Editor.tsx`
- `src/lib/site-admin/sections/registry.ts`
- `src/lib/site-admin/sections/shared/default-content.ts`
- `src/app/token-presets.css`
Gates: `tsc` ✅ (0 project-wide) · eslint ✅ · registry wiring ✅ · tenant-isolation static check ✅ · brand grep ✅
Notes: Reuses P1 primitives (SearchInput/ChipList/StatLine/Cta/SectionHead). Default search = directory-query native GET (no client JS); `ai-interpret` only works if operator supplies a real safe endpoint — never faked. Stat `tenant_talent_count` derives tenant-scoped via `listTalentIdsOnTenantRoster` (zero-safe). Chips `service_areas`/`roster_cities` are documented follow-ons; manual is the safe interim. Layout variants centered/split/minimal/editorial. Impronta copy is **defaults only** (default-content), not hardcoded in renderer.

### P1 — location_discovery
Status: **Complete & gated**
Files: `src/lib/site-admin/sections/location_discovery/{schema,migrations,meta,fetch,Component,Editor}.tsx` · `registry.ts` · `shared/default-content.ts` · `app/token-presets.css`
Gates: `tsc` ✅ · eslint ✅ · registry wiring ✅ · tenant-isolation static check ✅ · brand grep ✅
Notes: `roster_cities` mode tenant-scoped (`listTalentIdsOnTenantRoster` → `residence_city_id` → `locations`, `.in("id", roster)`, distinct counts, zero-safe). `manual` mode shipped; `service_areas` + map embed are documented follow-ons (manual interim). No directory location query-param invented — per-location link defaults to `/directory` with operator override.

### P1 — editorial_split_hero
Status: **Complete & gated**
Files: `src/lib/site-admin/sections/editorial_split_hero/{schema,migrations,meta,Component,Editor}.tsx` · `registry.ts` · `shared/default-content.ts` · `app/token-presets.css`
Gates: `tsc` ✅ · eslint ✅ · registry wiring ✅ · brand grep ✅
Notes: Static media mode shipped via `MediaFrame` (operator URL; neutral fallback — no hardcoded mannequin/image). `selected`/`dynamic` talent-preview media modes are documented follow-ons (would couple to the cache-trimmed featured DTO — deferred per Decision-5). Configurable media side + mobile order + overlay (P0-4 model). No tenant data fetch (pure presentational) — tenant-isolation N/A.

### Phase 2 — Impronta Homepage Composition (2026-05-17)

Files: `src/lib/site-admin/edit-mode/starter-action.ts` (`impronta-home` `Recipe` added to `RECIPES`) · `src/lib/site-admin/templates/homepage/meta.ts` (reusable hero-slot widening)

The Impronta homepage is now a real Page Builder 2.0 composition expressed as **canonical builder DATA**, not static HTML / not a custom React page / not a duplicate builder. It is the `impronta-home` recipe consumed by the existing canonical seed mechanism (`applyStarterComposition` — `requireStaff` + `requireTenantScope`, service-role inserts, tenant resolved at runtime, **never hardcoded**). `presetSlug: "editorial-noir"` so the approved dark/editorial direction is applied via the existing tested `applyThemePreset` as part of the recipe — no component-level Impronta colors.

Foundation fix (reusable, tenant-agnostic, additive): the homepage `hero` slot was `allowedSectionTypes: ["hero"]`, which hard-blocked the Phase-1 `hero_search` section at composition save (`server/homepage.ts:677`) and made the required `hero` slot impossible to fill with it (`publishHomepage` gate 5). Widened to `["hero","hero_search","editorial_split_hero"]` — both are above-the-fold hero-class layouts, satisfying the constraint's stated intent. One source of truth (`homepageMeta`) honored by server save, editor drag (`checkSlotTypeCompatibility`), and slot-compat. Existing `hero`-only compositions still validate (purely additive). This completes Phase-1 integration (a hero-class section you can't place in the hero slot was not fully integrated). No new component built (the sections already exist) — so this is not the "stop and explain before building a component" condition; it is the documented narrow gap + its reusable fix.

Slot map (render order = homepage template slot order, then sortOrder within slot) → exact user-specified 9-section order:

| # | Section | type key | slot | dynamic/manual |
|---|---|---|---|---|
| 1 | Hero Search | `hero_search` | `hero` (so 0) | search = real `/directory` GET; stat = **dynamic** (`tenant_talent_count`, tenant-scoped); chips **manual** |
| 2 | Editorial Split Hero | `editorial_split_hero` | `hero` (so 1) | **manual** copy; media = neutral fallback (operator adds image in editor) |
| 3 | Talent Type Grid | `talent_type_grid` | `trust_band` | **manual** 7 discipline cards (dynamic taxonomy mode is a documented follow-on) |
| 4 | Featured Talent | `featured_talent` | `services` | **dynamic** — `auto_featured_flag`, real tenant roster, tenant-scoped; safe empty-state |
| 5 | Location Discovery | `location_discovery` | `featured` | **manual** 4 Riviera Maya locations (roster_cities + map are documented follow-ons) |
| 6 | Process | `process_steps` | `process` | **manual** 4 steps |
| 7 | Agency Trust | `values_trio` | `destinations` | **manual** 3 value cards |
| 8 | Talent CTA | `cta_banner` | `gallery` | **manual**; hrefs `/talent/register` (verified route), `/login` |
| 9 | Client CTA | `cta_banner` | `final_cta` | **manual**; hrefs `/contact`, `/directory` |

Copy: verbatim from the Phase 2 work order. The word **"Curated"** is not used anywhere (process step 2 reworded to "Our team builds a focused shortlist…" to also avoid "curate"). Verified hrefs only — no invented routes (`/talent/register` chosen over the convention `/talent/apply` because the former is the route that actually exists).

Gates: `tsc` ✅ (0 project-wide) · eslint ✅ (both touched files) · brand/hex grep inside recipe ✅ NONE (only schema-enum `bandTone:"espresso"` which token-maps, not a hex) · all 9 section type keys exist in `SECTION_REGISTRY` ✅ · recipe slug reachable on paid plans via `resolveStarterTemplateSlugs` ✅.

---

## Definition of Done for Every New Section

A new section is **not complete** until:

- [ ] Uses the canonical 5-file pattern (`schema.ts · migrations.ts · meta.ts · Component.tsx · Editor.tsx`)
- [ ] Registered in `SECTION_REGISTRY`
- [ ] Added to `default-content.ts` if required by the widened `SectionTypeKey`
- [ ] Uses shared primitives where appropriate
- [ ] Supports `sectionPresentationSchema`
- [ ] Has safe schema defaults (non-strict; no migration for additive optional fields)
- [ ] Has editor controls (`Editor.tsx`, `"use client"`)
- [ ] Renders via the shared public/editor renderer (`homepage-cms-sections.tsx`)
- [ ] No hardcoded Impronta colors/copy in renderer logic (token-driven)
- [ ] Uses tenant-scoped fetchers for data (roster-filtered; never RLS-only)
- [ ] Handles empty state safely
- [ ] Passes `npx tsc --noEmit` (0 project-wide)
- [ ] Passes focused eslint
- [ ] **This tracker updated** (checkbox + Completed Work Log entry)

---

## Phase 2 Entry Gate

**Do not start the Impronta homepage composition until ALL are true:**

- [x] `hero_search` complete and gated
- [x] `location_discovery` complete and gated
- [x] `editorial_split_hero` complete and gated
- [x] `talent_type_grid` complete and gated
- [x] `talent_collection` complete for this phase
- [x] Theme preset picker works (Decision-1)
- [x] `searchTenantTalent` works (Decision-3)
- [x] Tracker updated to reflect the above

**→ Phase 2 Entry Gate SATISFIED (2026-05-17). Impronta homepage CMS
composition may begin.** (Talent-Collection DTO extension remains a
parallel follow-on; it is explicitly NOT a Phase-2 blocker per Decision-5.)

---

## Phase 2 Runtime Apply Step — STATUS: APPLIED (draft), pre-publish stop (2026-05-17)

Owner confirmed target tenant `00000000-0000-0000-0000-000000000001`
(Impronta Models, plan `agency`). Tenant `…0002` (Impronta Hub) untouched.

Canonical apply path used (NOT manual section insertion):
- Added `impronta-home` UI mirror tile to `STARTER_TEMPLATE_TILES`
  (`empty-canvas-starter.tsx`) so the existing server `RECIPES` entry is
  reachable from the canonical Template gallery (tsc/eslint clean).
- Authed as `qa-admin@impronta.test` (Impronta Admin) via dev-signin →
  canonical visual editor `/impronta?edit=1&panel=sections` → Template
  gallery (`impronta:open-template-gallery`) → `impronta-home` tile →
  review/confirm dialog (2 pre-existing drafts → canonical replace path)
  → "Apply 9 sections" → real `applyStarterComposition` server action.

Read-only DB verification (tenant …0001, homepage en page
`90552cf6…`, page now v852, still `status=published`):

| # | slot#sort | section_type | status |
|---|---|---|---|
| 1 | hero#0 | `hero_search` | draft |
| 2 | hero#1 | `editorial_split_hero` | draft |
| 3 | trust_band#2 | `talent_type_grid` | draft |
| 4 | services#3 | `featured_talent` | draft |
| 5 | featured#4 | `location_discovery` | draft |
| 6 | process#5 | `process_steps` | draft |
| 7 | destinations#6 | `values_trio` | draft |
| 8 | gallery#7 | `cta_banner` (talent) | draft |
| 9 | final_cta#8 | `cta_banner` (client) | draft |

9 draft sections, exact intended render order. Both hero-class sections
co-resident in the `hero` slot → **validates the Phase-2 hero-slot
foundation fix** (otherwise `saveHomepageDraftComposition` would have
hard-failed). New `cms_page_revisions` `kind=draft` row written (canonical
audit). `agency_branding`: `theme_preset_slug=editorial-noir`, full noir
token set in `theme_json_draft` (`background.mode: editorial-noir`, light
ink, near-black surfaces, editorial-serif, espresso footer); **live
`theme_json` unchanged** → editorial-noir staged as draft only. Publish
NOT performed (canonical flow + owner instruction require explicit
publish confirmation).

Editor verified (canonical `?edit=1`): renders all 9 sections — "Find the
right talent for your brief.", chips Playa del Carmen/Tulum/Cancún/Riviera
Maya, "Premium talent for events…", "Talent, by Discipline", "An Agency,
Not a Directory", "A Clear, Professional Process". **"Curated" absent**
(`hasCurated:false`) — vs the deprecated fallback's "A house of curated
talent" still live publicly.

Pre-publish findings (non-blocking, for owner review):
1. **editorial_split_hero stray highlight** — recipe set headline+body but
   not `highlight`, so `getLibraryDefault` default `highlight:"destination
   cities."` leaked into render. **Fixed in the recipe** (headline split →
   `highlight:"brand experiences."`, tsc/eslint clean). The already-created
   …0001 draft section still has the old value; a **re-apply** of the
   fixed starter (or an inline edit) is needed to flush it before publish.
2. **hero_search dynamic stat shows "1+ talent profiles available"** —
   `tenant_talent_count` dynamic path works but the count source returns a
   low number despite 28 active roster; investigate the count query during
   Phase 3 QA (non-blocking; it is the dynamic path, not a hardcode).

Recommended next: owner authorizes re-apply of the fixed `impronta-home`
(canonical, idempotent — replaces the draft) then publish; then
public-render verification + Phase 3 QA.

### RE-APPLY (corrected) — 2026-05-17, owner Option 2 (re-apply, do NOT publish)

Owner chose: re-apply fixed starter, investigate hero stat, STOP before
publish. Done:

- **hero stat root cause** (read-only, service-role + anon): tenant
  `…0001` active roster = 28, but breakdown is **1 `active/site_visible`
  + 27 `active/roster_only`**. `tenant_talent_count` →
  `listTalentIdsOnTenantRoster` counts only `status=active ∩
  agency_visibility∈{site_visible,featured}` (shared storefront isolation
  primitive; service-role and anon both return 1 — no RLS discrepancy).
  So "1+" was *correct-by-design* but misleading. Not safely fixable
  here: the only dynamic fixes are (a) changing the shared primitive's
  semantics (broad blast radius, out of scope) or (b) bulk-flipping 27
  production roster rows to `site_visible` (a product/data decision,
  owner-reserved). Per owner instruction → **switched recipe hero stat to
  manual**: `statSource:"manual"`, `statItems:[{value:"28",
  label:"represented talent"}]`.
- **Recipe copy fixes** (canonical reusable data; the only two sections
  with a `highlight` field): `editorial_split_hero` →
  `headline:"Premium talent for events, shoots, and"` +
  `highlight:"brand experiences."`; `hero_search` →
  `headline:"Find the right talent"` + `highlight:"for your brief."`
  (both previously dumped the full sentence in `headline` and leaked the
  `getLibraryDefault` highlight — "destination cities." / duplicated
  "for your brief."). tsc 0 + eslint 0 after each.
- **Re-applied** corrected `impronta-home` via the canonical flow twice
  (once per fix round); each replaced the draft. **Final read-only DB
  verification:** page still `published` (v854, draft NOT published —
  live untouched); 9 draft sections in exact order
  `hero_search > editorial_split_hero > talent_type_grid >
  featured_talent > location_discovery > process_steps > values_trio >
  cta_banner > cta_banner`; `editorial_split_hero` =
  {"Premium talent for events, shoots, and" / "brand experiences."};
  `hero_search` = {"Find the right talent" / "for your brief.",
  statSource manual, "28 represented talent"}; **"Curated" count in all
  draft props = 0**; `theme_preset_slug=editorial-noir` with noir tokens
  in `theme_json_draft` only — **live `theme_json` still just
  `{shell.header-sticky}`**. Editor render confirms: no copy
  duplication, "28 represented talent", no "destination cities.", no
  "Curated".
- **SAFE TO PUBLISH** assessment: yes — draft is clean and correct;
  publishing affects `improntamodels.com` + all Impronta domains and
  promotes editorial-noir + the 9-section CMS homepage live, replacing
  the deprecated fallback. **Publish NOT performed — awaiting explicit
  owner approval.**

### PUBLISHED + Phase 3 QA — 2026-05-17 (owner approved publish)

Two canonical publishes (both required — they are separate actions):
1. **Composition** — editor topbar "Publish now" → `publishHomepage`.
   Result: page `published` v855, **9 LIVE sections** (was 0 → was on
   deprecated fallback before).
2. **Theme** — editor "Theme" drawer → "Publish theme" → confirm "Yes,
   publish" → `publishDesign`. Result: `theme_published_at` 23:40:05,
   `theme_preset_slug=editorial-noir`, **live `theme_json` now 38 keys**
   incl. `background.mode:editorial-noir`, `color.ink:#f4f4f5`,
   `typography.heading-preset:editorial-serif`. (`publishHomepage` does
   NOT publish branding — theme is a separate canonical publish. Documented
   here so future runs publish both.)

Phase 3 QA (authoritative = no-cookie server fetch of
`http://localhost:3000/impronta`; preview DOM 65-section/51k-px bloat is
the documented preview-hydration artifact, NOT real output — each distinct
section heading appears exactly once in server HTML):

| QA item | Result |
|---|---|
| Public renders published CMS snapshot | ✅ 9 sections, rendered once |
| Deprecated fallback not used | ✅ composition is what renders (DB 9 live; server HTML) |
| editorial-noir live | ✅ `data-token-background-mode=editorial-noir`, bg `rgb(10,10,10)`, ink `rgb(244,244,245)` |
| "Curated" absent | ✅ 0 occurrences in public HTML |
| Hero stat | ✅ "28 represented talent" |
| All 9 sections render | ✅ hero_search, editorial_split_hero, talent_type_grid, featured_talent, location_discovery, process_steps, values_trio, cta_banner×2 |
| featured_talent | ⚠️ graceful **empty-state** ("Featured profiles appear here…") — 1 site_visible / 27 roster_only; layout not broken; **no visibility change (owner-reserved)** |
| Links | ✅ `/impronta/directory` 200, `/impronta/contact` 200, Start-Inquiry→`/contact` 200. ⚠️ **Finding B** below |
| Responsive 1440 / 834 / 390 | ✅ no page horizontal overflow at any width; `talent_type_grid` mobile uses intended `horizontal-scroll`. Pixel-perfect aesthetic pass still needs a human (screenshots denied in agent env). |

Post-publish findings:
- **Finding B (route/product decision — reported, not guessed):**
  talent-CTA auth links. Recipe uses `/login` (Talent Login) +
  `/talent/register` (Apply as Talent). The storefront tenant-path-
  prefixes hrefs → `/impronta/login` **404** (login is a ROOT `(auth)`
  route, not tenant-scoped) and host-based `improntamodels.com/talent/
  register` **404** (path-based `/impronta/talent/register` 200). How a
  tenant storefront should link to platform auth (root-absolute vs
  app-host vs a tenant auth entrypoint) is a **product/routing decision**
  — needs owner/product input before a recipe href fix. Client CTAs
  (`/contact`, `/directory`) are correct.
- **Finding C (recipe hygiene — fixed, gated, NOT yet live):**
  `cta_banner` leaked `getLibraryDefault` `reassurance:"Quiet, unhurried,
  always in the same key."` (same default-leak class as the highlight
  leaks; the default `copy` also contained "curated" but the recipe's
  `copy` override correctly suppressed it → 0 "Curated" live). Recipe now
  sets `reassurance:""` on both cta_banner entries (tsc/eslint clean).
  Live page still shows the stray line until an owner-approved
  re-apply + re-publish.

**Net:** the approved outcome is LIVE — editorial-noir 9-section CMS
homepage on `…0001`, deprecated fallback replaced, no "Curated", correct
hero/copy. Open: Finding B (owner decision), optional flush of Finding C +
the earlier hygiene fixes via one more owner-approved re-apply+republish,
featured_talent visibility (owner-reserved).

---

## Post-Publish Correctness Pass — 2026-05-17 (route audit + content integrity)

### Route inventory (Workstream A)

- **Auth/app routes** (`(auth)` group, root-level, NOT tenant pages):
  `/login`, `/register`, `/join` (307 → `/talent/register`),
  `/forgot-password`, `/update-password`, `/talent/register`,
  `/client/register`.
- **`AUTH_PREFIXES`** (allow-listed on agency + hub + app hosts —
  `surface-allow-list.ts`): `/login`, `/register`, `/join`,
  `/forgot-password`, `/update-password`, `/auth`. **NOT allow-listed on
  agency host:** `/talent/register`, `/client/register`.
- **Tenant storefront/public routes:** `/directory`, `/contact` (+ CMS
  clean-URL rewrite), `/t/<code>` (canonical talent, app host),
  `/p/<slug>`, `/models`, `/posts`.
- **Canonical app host:** `agency_domains kind='app'` → resolved by
  `getCanonicalAppHostOrigin()` (server, async, DB+`NEXT_PUBLIC_APP_URL`).
  Prod `app.tulala.digital`; also `app.pdcvacations.com` (white-label),
  `localhost:3000` (dev). **Deployment-driven — must NOT be hardcoded.**
- **Impronta `…0001` addresses:** primary = **custom domain
  `improntamodels.com`** (host-based, `publicPathPrefix=""`); also
  `impronta.tulala.digital` (subdomain) and `tulala.digital/impronta`
  (path-based, `publicPathPrefix="/impronta"`).

### Link handling (Workstream A)

`LinkPicker` kinds: `internal` (tenant-prefixed), `external` (absolute —
bypasses prefix), `email`/`tel`/`anchor` (bypass), `asset`, `talent`
(`/t/`). `prefixPublicHref(href, publicPathPrefix)` prepends the tenant
prefix to **every** internal `/...` href; only scheme:/#/? and absolute
URLs bypass. **There is no platform/app/auth link kind.**

### CTA route correctness (Workstream B — decision table)

| CTA | Current href | Prod primary `improntamodels.com` (host-based) | Path-based `/impronta/…` | Verdict |
|---|---|---|---|---|
| Start Inquiry (client) | `/contact` | 200 ✓ | `/impronta/contact` 200 ✓ | OK |
| Explore Talent / Directory | `/directory` | 200 ✓ | `/impronta/directory` 200 ✓ | OK |
| **Talent Login** | `/login` | `improntamodels.com/login` **200 ✓** | `/impronta/login` **404 ✗** | host-OK, path-broken |
| **Apply as Talent** | `/talent/register` | `improntamodels.com/talent/register` **404 ✗** (not in AUTH_PREFIXES) | `/impronta/talent/register` 200 (secondary only) | **prod-broken** |

### Builder link-model note (Workstream C)

- **Not a one-off.** The builder lacks a reusable "platform/app/auth
  route" link type. Any section/recipe linking to login/register/
  dashboard from a tenant storefront hits this.
- **Current capability:** `internal` (tenant-prefixed) or `external`
  (hardcoded absolute) only.
- **Gap:** no link kind that resolves to the canonical app host at render
  (deployment-portable) with tenant return context (`?next=`).
- **Safest short-term (no new route/auth, no hardcode):** use
  AUTH_PREFIXES-allow-listed routes that work on the production-primary
  host-based pattern — keep `/login`; change `/talent/register` →
  `/register`. Accept that the secondary path-based pattern 404s these
  auth CTAs (documented degradation; Impronta's primary is the custom
  domain).
- **Correct long-term:** add a builder `platform-auth` / `app-route` link
  kind → renderer resolves `getCanonicalAppHostOrigin()` → absolute
  app-host URL + `?next=<tenant return>`. Builder feature; out of scope
  for this pass. **Decision-Log gate** (`surface-allow-list.ts:36-45`)
  explicitly says the auth-surface routing must not change without a
  product decision.

### Content integrity (Workstream D)

Live public HTML + draft/live section props: `curated`=0,
`destination cities`=0, duplicated `for your brief`=0, Lorem/TODO/FIXME=0.
`undefined`/`null` only in the Next.js RSC `__next_f` script stream
(framework sentinels, not visible). `placeholder` = the legit
`<input placeholder>` on hero search. **`Quiet, unhurried…` still LIVE
(×2 cta_banner) — Finding C, recipe fixed (`reassurance:""`) but not yet
flushed.** No new component/route/auth introduced.

### RESOLVED — owner Option 1; corrected version re-applied + republished + QA'd (2026-05-18)

**Owner decision (Option 1, documented short-term):** Talent Login →
`/login`; Apply as Talent → `/register` (was `/talent/register`). Client
CTAs unchanged. No app-host hardcoding, no new auth route. Long-term: a
reusable builder `platform-auth` link kind (tracked in Risks).

**Recipe (gated tsc 0 / eslint 0):** `cta_banner` (talent) →
`primaryCta /register`, `secondaryCta /login`, `reassurance ""`; plus the
prior highlight-split + manual-stat fixes. Re-applied to **`…0001` only**
via the canonical flow (editor → Template gallery → `impronta-home` →
review → Apply 9). Composition re-published via canonical `publishHomepage`.
Theme NOT re-published (editorial-noir already live; draft theme
unchanged).

**LIVE verification (authoritative DB + no-cookie server fetch):** page
`published v857`, **9 LIVE sections** exact order `hero_search >
editorial_split_hero > talent_type_grid > featured_talent >
location_discovery > process_steps > values_trio > cta_banner ×2`. LIVE
talent CTA = `{primaryCta:/register "Apply as Talent", secondaryCta:/login
"Talent Login", reassurance:""}`. LIVE content: **curated 0, "Quiet,
unhurried" 0, "destination cities" 0, dup "for your brief" 0**.
editorial-noir live (`data-token-background-mode=editorial-noir`, bg
`rgb(10,10,10)`). Hero stat "28 represented talent". Each section heading
appears exactly **once** in the server HTML (single render confirmed).

**Route QA — production primary `improntamodels.com` (host-based, the
real customer journey):** `/register` 200 ✓, `/login` 200 ✓, `/contact`
200 ✓, `/directory` 200 ✓ — **all 4 CTAs correct in production**.
Secondary path-based `tulala.digital/impronta`: `/impronta/register` 404,
`/impronta/login` 404 (documented accepted auth-CTA degradation — the
builder `platform-auth` gap; client CTAs 200 in both modes).

**Responsive (clean public render, fresh server):** no horizontal
overflow at 1440 / 834 / 390. Vertical `docHeight` in the preview browser
is inflated by the documented preview-hydration artifact (NOT in the
authoritative SSR/no-cookie output, which is a clean single render);
pixel-perfect aesthetic pass still needs a human (screenshots denied in
agent env).

**Dev-server wedge fixed:** the preview showed a large black void / 65
nested `<section>` / ~50k-px bloat. Root cause = a 1.7 GB corrupt
`web/.next` cache + edit-mode client hydration in the authed preview
browser (the documented recurring wedge — `reference_local_dev_setup.md`).
Fix: stop server → `rm -rf web/.next` → fresh `preview_start` → cookieless
reload. Public SSR was never affected (DB/snapshot is source of truth).

**Net: production-readiness pass COMPLETE.** Impronta `…0001` homepage is
live, correct, hygienic, route-correct on the production-primary domain.
No Phase 4 work started. Phase 4 (shell/header/footer/logo) is the next
recommended phase.

---

## Phase 2 Runtime Apply Step — STATUS: BLOCKED (owner decision, 2026-05-17)

Runtime environment IS reachable: dev server on `localhost:3000` (200),
shared remote Supabase `pluhdapdnuiulvxmyspd` (dev/qa/prod identical),
service-role read-only identification performed (no writes; temp script
`scripts/_phase2-identify-impronta.mjs`, to be removed).

**Read-only identification result — STOP CONDITION HIT (2 name matches):**

| tenant id | slug | display_name | plan | kind | domains | homepage (en) | live/draft sections | branding | active roster |
|---|---|---|---|---|---|---|---|---|---|
| `00000000-0000-0000-0000-000000000001` | `impronta` | Impronta Models | **agency** (paid ✓) | agency | ALL impronta.*/improntamodels.com (primary custom) | page `90552cf6…`, **published**, v851 | **0 live / 2 draft** | `classic` v120 | **28** |
| `00000000-0000-0000-0000-000000000002` | `hub` | Impronta Hub | free | **hub** | none | page `eb0a18f9…`, published, v3 | 1 live / 0 draft | none | 0 |

Assessment: not genuinely ambiguous in product terms — `…0001` is
unambiguously THE Impronta agency storefront; `…0002` is a `kind=hub`
free entity that only matched on the word "Impronta" in its name and is
not an agency-homepage candidate. But the work-order stop condition is
owner-reserved, so **apply is paused pending owner confirmation of
`…0001`**. Nothing has been mutated.

Owner-relevant consequences once confirmed for `…0001`:
- en homepage is `published v851` but has **0 live CMS sections** → public
  site is almost certainly on the deprecated hardcoded fallback stack
  (P0-8) today; to be verified at apply time.
- There are **2 pre-existing draft sections** on that page.
  `saveHomepageDraftComposition` DELETEs all `is_draft` rows and replaces
  them → those 2 drafts will be discarded by the starter apply.
- Branding preset is `classic` v120; the recipe applies `editorial-noir`
  as **draft** tokens (publish is a separate explicit step).
- Plan `agency` ⇒ `impronta-home` (non-free slug) is plan-eligible.

---

## Phase 2 Runtime Apply Step (NOT local-doable — do not guess tenant)

Phase 2 produced the composition as **committed builder data** (the
`impronta-home` recipe + the reusable hero-slot fix), gated locally. The
actual per-tenant application is a runtime step because:

- There is **no local Supabase** (no `:54321` listener); `agency_*`,
  `cms_pages`, `cms_sections`, `agency_branding` are remote-only.
- The real Impronta tenant id/slug must **not be guessed** and there is no
  local admin/tenant context to resolve it from. If multiple Impronta-like
  tenants exist this must be an owner decision.

**Exact runtime step (for whoever has admin access to the real Impronta
workspace):**

1. Sign in as staff and select the Impronta workspace (this sets
   `requireTenantScope()` — the recipe never hardcodes a tenant).
2. Confirm the Impronta tenant: id, slug, plan tier. The recipe is
   plan-gated via `resolveStarterTemplateSlugs` — `impronta-home` is a
   non-free slug, so the workspace must be **Studio / Agency / Network /
   legacy** (not Free). If Impronta is Free, either upgrade or apply via a
   service-role `onboardStarterContent`-style invocation (not plan-gated).
3. Confirm current homepage state: does a `cms_pages` homepage row /
   draft-or-published composition already exist? Does the public site
   currently fall back to the deprecated hardcoded stack
   (`agency-home-storefront.tsx`, P0-8 banner)?
4. Apply the `impronta-home` starter from the structure composer empty
   state (`applyStarterComposition`, `recipeSlug=impronta-home`). This
   applies the `editorial-noir` preset (draft tokens) + creates the 9
   draft sections + saves the draft homepage composition. **Publishing is
   a separate explicit review step** (`publishHomepage`).
5. Verify: editor loads all 9 sections / copy + CTAs editable / reorder /
   save draft / publish; public render serves the published snapshot via
   the canonical shared renderer (not the deprecated stack).

If multiple Impronta-like tenants exist at step 2 → **report and stop for
owner decision** before applying.

`editorial-noir` theme: applied automatically by the recipe's
`presetSlug` at apply time (Decision-1 preset action path). No separate
Phase-4 theme-assign step is required for the homepage palette. Phase-4
shell/header/footer/logo work remains out of scope and was **not** mixed
into Phase 2.

---

## 7. QA Gates (run after every chunk — all must pass)

```
cd web && npx tsc --noEmit                 # 0 errors project-wide
npx eslint <touched files>                  # clean
grep for hardcoded impronta/gold/dark in reusable section paths  # NONE
registry import check (new sections wired in SECTION_REGISTRY)
tenant-isolation static check for data sections (roster .in(), no public client)
preset validation when theme tokens touched (validateAllPresets)
focused tests if touched area has them (e.g. builder-node 98/0)
```

Data-section tenant-isolation rule: every public/storefront query MUST
filter by resolved tenant id (roster ids). Never RLS-only. Prove with a
two-tenant test before Phase 2 sign-off.

Note on test harness: several `*.test.ts` are `node:test`-based — they show
"no suite found" under `vitest run` but pass via the node runner (e.g.
builder-node 98/0). Not a regression signal.

---

## 8. Acceptance Criteria (Impronta homepage "done")

- Homepage is a real Page Builder 2.0 CMS composition (no static/dead HTML).
- New sections registered in canonical `SECTION_REGISTRY`; rendered via the
  shared `homepage-cms-sections.tsx` (public + editor, one renderer).
- Impronta black/gold from `editorial-noir` tokens/preset only — zero
  component hardcoding; a neutral tenant renders clean white.
- Featured talent + talent-type grid + location bind real tenant-scoped data.
- Card field toggles + max-15 cap + parent-category option supported.
- CTAs route to real inquiry/directory/apply/login paths.
- Tenant isolation tested (A ≠ B). Mobile/tablet/desktop polished.
- The word "Curated" never appears (use "Featured Talent" etc.).

---

## 9. Remaining Risks & Follow-ups

- **Talent-CTA auth-link routing (owner/product decision — Finding B)** —
  storefront tenant-path-prefixes recipe hrefs, so `/login` → `/impronta/
  login` 404 (root `(auth)` route) and host-based `improntamodels.com/
  talent/register` 404. Need the canonical pattern for a tenant storefront
  → platform auth (root-absolute, app-host, or tenant auth entrypoint),
  then fix the recipe `cta_banner` (talent) hrefs and re-apply+republish.
- **Recipe hygiene fixes not yet flushed live** — editorial_split_hero +
  hero_search highlight splits, manual "28 represented talent" stat,
  cta_banner `reassurance:""`. All in the recipe + gated; live `…0001`
  page still has the pre-fix copy until an owner-approved
  re-apply + re-publish.
- **Dynamic `tenant_talent_count` follow-up (Impronta `…0001`)** — hero
  stat is currently a **manual** "28 represented talent" because only 1 of
  28 active roster rows is `site_visible` (27 `roster_only`), so the
  dynamic count (`listTalentIdsOnTenantRoster`, publicly-visible only)
  correctly returns 1. To restore the dynamic stat: a product/data
  decision to publish more roster to `site_visible` (then flip the
  recipe/section back to `statSource:"tenant_talent_count"`). Same
  visibility state will also under-fill `featured_talent`
  (`auto_featured_flag`) on the public render — verify during Phase 3 QA.
- **Visual smoke** (neutral vs noir pixel diff, FeaturedTalentCard) needs a
  human browser pass with two seeded host-gated tenants — not reproducible
  in the agent env (code-level + live-render verified; pixel diff open).
- **Talent Collection DTO extension** (Decision-5) — own chunk before
  secondary-type/languages/availability/true-parent render.
- **Visual taxonomy picker** for `talent_type_grid` dynamic mode — manual
  term-id entry shipped as safe interim.
- **Logo single-source bridge** + **modern shell activation** = Phase 4
  prerequisites; do not flip `ENABLE_SITE_SHELL` early.
- **`.site-theme-dark/.site-theme-light`** still carry Impronta values
  (scoped opt-in, not platform default) — token-feed in a later pass.
- Availability has no boolean (`talent_bookings` is date-range) — any
  "available" badge must be derived, never assumed.

---

## 10. Resume Pointer (next agent: start here)

**State as of 2026-05-17:** Phases 0–2 done & gated. `impronta-home`
recipe + hero-slot widening shipped (local, uncommitted). **PUBLISHED on
`…0001`**: 9-section CMS homepage + editorial-noir LIVE via canonical
`publishHomepage` + `publishDesign`. Phase 3 QA + Post-Publish Correctness
Audit done (route architecture mapped; content integrity clean except the
staged Finding C). `stash@{0}` untouched; nothing committed/pushed.

**State 2026-05-18:** Phases 0–4 COMPLETE locally. Impronta `…0001`
homepage LIVE (9-section CMS + editorial-noir + Option-1 CTAs, hygienic);
modern site shell (header/footer + logo resolver bridge) configured,
published, flag-activated **locally** and QA-clean (Impronta-only;
other tenants on legacy fallback; responsive fixed).

**Next chunk — PRODUCTION shell activation (owner/deploy, NOT local):**
set `ENABLE_SITE_SHELL=tenants` + `SITE_SHELL_TENANT_IDS=
00000000-0000-0000-0000-000000000001` in the Vercel project env, redeploy,
prod-QA the modern shell on `improntamodels.com`. **Phase 5 (legacy
fallback removal) must WAIT until the prod shell flag is live + prod-QA'd**
— removing the fallback before prod runs the modern shell would break
prod. Open follow-ups (non-blocking, owner-reserved): builder
`platform-auth` link kind; featured_talent roster visibility
(1 site_visible/27 roster_only); dynamic `tenant_talent_count`;
`agency_business_identity.footer_tagline` still holds the debug string
(legacy-footer-only; modern shell unaffected — separate cleanup).
Talent_collection DTO extension parallel. `stash@{0}` untouched; nothing
committed/pushed. This file is the source of truth, not chat history.

---

## Production Deploy + QA — 2026-05-18 (strategy: finish-and-clean)

**Pushed:** `origin/phase-1` ← clean fast-forward `4e3f1045d..629330cc7`
(7 commits: the 3 Page Builder commits + 4 pre-existing committed admin
commits already in shared phase-1 history; no parked files, no force).

**Prod env (Vercel `tulala`/`oran-tenes-projects`):** set
`ENABLE_SITE_SHELL=tenants` + `SITE_SHELL_TENANT_IDS=…0001` for
**Production** (SITE_SHELL_TENANT_IDS was previously MISSING for Production
— only Preview/Dev had it; that gap is now closed).

**Deploy:** `npm run deploy:promote` → fresh **Production-env** build
`tulala-mqftakab4` (uses `vercel redeploy --target production`, so it
picked up the new env). Re-aliased `tulala.digital`, `app.tulala.digital`,
and (separately) `improntamodels.com`, `www.improntamodels.com`,
`impronta.tulala.digital`. `npm run deploy:smoke` → **all checks passed**.

**Production QA — `https://improntamodels.com/` (no-cookie, HTTP 200):**

| item | result |
|---|---|
| modern `site_header` / `site_footer` render | ✅ 1 / 1 |
| header nav (Discover/Talent/Locations/About/Contact/Apply as Talent) | ✅ all present |
| Start Inquiry CTA | ✅ |
| footer real tagline; **debug tagline gone**; Talent Login; © 2026 Impronta | ✅ / ✅ 0 / ✅ / ✅ |
| 9 CMS body sections (each once) | ✅ |
| editorial-noir live (`data-token-background-mode`) | ✅ |
| no "Curated"; no `EDIT HEADER`; no legacy `public-header` rendered | ✅ 0 / 0 / 0 |
| **header logo `<img>` (`site-header__brand-mark`)** | ❌ **0 — not rendering** |

**Logo finding (root-caused, NOT a code bug, NOT missing data):**
`agency_branding.theme_json.logo_url` for `…0001` IS present (verified via
the anon client `loadPublicBranding` uses). The resolver works (proved
locally). Prod doesn't render it because the Next Data Cache entry for the
`tagFor(…0001,'branding')`-tagged `loadPublicBranding` read was populated
by the **old prod site before the one-time logo alignment**, and the
alignment was a direct DB write that did not bust that tag. Prod-safe
cache busts: only the canonical `saveBranding`/`publishDesign`
(`updateTag('branding')`) — admin-authed; `/api/admin/dev-revalidate` is
404 in production by design.

**Phase 5 gate:** STILL CLOSED. The owner QA checklist requires
"logo renders" — open. Legacy fallback removal must NOT proceed until the
logo is confirmed on prod. (Everything else on the checklist passes.)

**Fix options (owner decision):**
1. One-time prod canonical branding bust — log into prod as admin →
   Impronta Design → "Publish theme" (`publishDesign` → `updateTag`).
   Fixes immediately; no code change; future settings saves stay fresh.
2. Resilient resolver — give the shell logo read its own short-TTL cached
   path (self-heals in minutes, removes the "never-busts" fragility,
   scoped to `resolveShellBrandLogoUrl`). Small reversible code change;
   aligns with "architectural clarity / Page Builder path canonical".
3. Bake the resolved logo into the shell snapshot at
   `republishSiteShellSnapshot` (logo rides the `pages-all` tag the
   canonical Page Builder publish already busts). Most "Page-Builder-
   canonical" but changes the accepted Option-1 render-time design.

---

## Logo Fix (Option 2) + Production QA PASS — 2026-05-18

**Decision:** Owner chose Option 2 (resilient resolver) over a one-time
prod branding publish (fixes only one instance) or baking into the shell
snapshot (weakens the accepted render-time Option-1 design).

**Root cause:** `resolveShellBrandLogoUrl` read `theme_json.logo_url` via
the shared `loadPublicBranding`, whose `unstable_cache` is tagged-only
(`tagFor(tenant,'branding')`) with **no TTL** → a logo set outside the
canonical `saveBranding`/`publishDesign` path (the one-time data
alignment) stayed unresolved on prod indefinitely. Data was always
correct; not a code/shell bug.

**Fix (`6f0d23ac4`, `src/lib/site-admin/server/shell-brand-logo.ts`
only):** resolver now does its OWN narrowly-scoped public read of just
`agency_branding.theme_json` under a distinct cache key
`["site-admin:shell-brand-logo", tenantId]`, `revalidate: 300` + the
tenant `branding` tag. Cache behavior — before: tagged-only, no TTL,
trapped until a canonical branding save. after: distinct key (fresh on
first request post-deploy), 300s self-heal safety net, AND still
instant-busts on the canonical save tag. Fallback order, tenant
filtering, public-only read, no new logo source, no hardcoded URL, no
migration — all preserved.

**Deploy:** push `629330cc7..6f0d23ac4` (FF) → `npm run deploy:promote`
→ fresh Production-env build `tulala-8yeuxdkq7` → re-aliased
tulala/app/improntamodels/www/impronta.tulala → `deploy:smoke` all green.

**Production QA — `https://improntamodels.com/` (no-cookie, 200):**
✅ header logo `<img>` renders (the settings PNG via theme_json mirror) ·
✅ modern site_header + site_footer (1/1) · ✅ header nav + Start Inquiry ·
✅ footer real tagline · ✅ 9 CMS body sections (each once) ·
✅ editorial-noir live · ✅ 0 "Curated" · ✅ 0 edit chrome ·
✅ 0 legacy/​double header · ✅ 0 debug tagline. Responsive CSS fix
(min(),100% + flex-wrap) is in the deployed build (verified locally at
390/834/1440; prod pixel pass still needs a human — screenshots denied
in agent env). Other-tenant safety enforced by the same single-id
allowlist (`SITE_SHELL_TENANT_IDS=…0001`, `tenants` mode) in prod env.

**Phase 5 gate: UNBLOCKED** — "logo renders in production + full shell QA
passes" is now satisfied. Phase 5 (deprecated hardcoded fallback removal)
may begin on explicit go-ahead (not started here per instruction).

---

## Phase 5 — Legacy Body Fallback Removed (2026-05-18)

**Objective met:** the deprecated hardcoded Impronta-flavored homepage
**body** fallback is gone; the CMS / Page Builder composition is the
canonical and only body render path. The modern-shell-vs-legacy-shell
guard (header/footer mutex) is deliberately preserved.

**Refactor — `src/components/home/agency-home-storefront.tsx`:** removed
both legacy body branches (the hardcoded `--impronta-gold` hero
`<section>` + the `TalentTypeShortcuts / FeaturedTalentSection /
BestForSection / LocationSection / HowItWorks / CtaSection` stack) and all
legacy-only imports/data (`getHomepageData` destructure, lifestyle reel,
AI-hero/maps/path-prefix plumbing, the 6 copy objects). Body logic now:
edit + 0 sections → `EmptyCanvasStarter`; ≥1 CMS section → CMS via
`HomepageCmsSections` (hero full-bleed + non-hero in snapshot order);
else → a minimal neutral no-composition state
(`t("public.home.noComposition")`, added to `messages/en.json` +
`es.json`). No "Curated", no Impronta copy, no second static page.

**Component deletions (verified truly fallback-only — 0 other importers):**
`talent-type-shortcuts.tsx`, `how-it-works.tsx`, `cta-section.tsx`,
`lifestyle-backdrop.tsx`. **Kept (NOT fallback-only):**
`featured-talent-section.tsx` / `best-for-section.tsx` /
`location-section.tsx` (export types `lib/home-data.ts` → the **CMS
renderer** `homepage-cms-sections.tsx` depends on) and `hero-search.tsx`
(used by `(public)/directory/page.tsx`). Their storefront usage was
removed; the files remain because deleting them would break the canonical
CMS path / directory.

**Gates:** `tsc --noEmit` 0 project-wide · eslint 0 (storefront) ·
en/es JSON valid.

**Local QA (no-cookie):** Impronta `/impronta` — CMS path unchanged
(9 body sections, 0 legacy classes, 0 "Curated", not the neutral state).
`nova-crew` (un-composed) — neutral message renders (i18n resolved, no
raw key leak), **0 legacy body markers**, no Impronta content, shell
header/footer guard still present (smaller 95 KB vs old marketing bloat).

Deploy + prod QA: see next entry.

### Phase 5 Deploy + Production QA — PASS (2026-05-18)

Commit `5b600f61f` (scoped: storefront refactor + 4 deletions + en/es
i18n + tracker) → push (FF `9d305bc9f..5b600f61f`) →
`npm run deploy:promote` → fresh Production-env build `tulala-bk8ewrgan`
→ re-aliased tulala/app/improntamodels/www/impronta.tulala →
`deploy:smoke` all checks passed.

Production QA:
- **improntamodels.com** (CMS canonical) — HTTP 200, modern site_header
  (1), logo renders (1), 9 CMS body sections (✓✓✓✓), editorial-noir live,
  0 "Curated", **0 legacy body markers**, neutral msg absent (it has a
  composition → CMS path). Unchanged by Phase 5 ✓.
- **tulala.digital/nova-crew** (un-composed) — HTTP 200, neutral
  no-composition message renders, i18n key resolved (no raw-key leak),
  **0 legacy body markers**, shell header/footer guard still present.
- **tulala.digital/qa-agency** — HTTP 200, **0 legacy body markers**
  (renders CMS or neutral; either way the deprecated fallback is gone).

**Result:** the deprecated Impronta-flavored hardcoded homepage body no
longer renders for ANY tenant. CMS / Page Builder composition is the
canonical and only body path; un-composed tenants get a neutral
public-safe state (starter picker in edit mode); the modern-shell
fallback guard is intact. **Phases 0–5 COMPLETE and live.**

Residual non-blocking follow-ups (unchanged, owner-reserved): builder
`platform-auth` link kind; `agency_business_identity.footer_tagline`
legacy debug string (legacy-footer-only); featured_talent roster
visibility; dynamic `tenant_talent_count`; talent_collection DTO
extension; visual taxonomy picker.

---

# Final Handoff — Page Builder 2.0 / Impronta Homepage

> Single source of truth for the COMPLETED Phases 0–5 workstream. A future
> agent/dev/designer/PO should be able to understand current state from
> this section alone. Created 2026-05-18. No competing plan file — this
> tracker is canonical.

## 1. Final Production State

- Impronta homepage is **live through the CMS / Page Builder path**
  (`improntamodels.com`) — 9-section composition rendered by the shared
  snapshot renderer, not static HTML, not a per-tenant React page.
- The **modern site shell is live for Impronta** (`site_header` +
  `site_footer` sections, snapshot-rendered).
- Header, footer, and **logo render** (logo via the resilient resolver
  reading the public `agency_branding.theme_json.logo_url` mirror).
- **editorial-noir is live** purely through theme tokens
  (`data-token-background-mode="editorial-noir"`); no component-level
  hardcoded Impronta colors.
- The **deprecated hardcoded fallback body was removed** (Phase 5).
- Tenants **without** a published composition now get a **neutral
  no-composition state** (public) or the starter picker (edit mode).
- The old Impronta-flavored fallback **no longer renders for any tenant**
  (verified across Impronta, nova-crew, qa-agency).
- Known visible gap (not a regression): Featured Talent / talent cards
  show placeholder silhouettes because only 1 of 28 roster rows is
  `site_visible` (27 `roster_only`) and profiles lack real imagery —
  owner/content decision, see §6/§8.

## 2. Live URLs Checked (production)

| URL | Status | Shell | Body | Routes | Notes |
|---|---|---|---|---|---|
| `https://improntamodels.com/` | 200 | modern site_header+footer, logo renders | 9 CMS sections, editorial-noir, 0 "Curated", 0 legacy, 0 edit-chrome | `/login` `/register` `/contact` `/directory` 200 on this primary host | Fully QA'd; canonical path; talent cards placeholder (roster visibility) |
| `https://tulala.digital/nova-crew` | 200 | shell guard present | neutral no-composition message (i18n resolved), 0 legacy body | n/a | Confirms Phase-5 neutral state for un-composed tenant |
| `https://tulala.digital/qa-agency` | 200 | shell guard present | 0 legacy body (CMS or neutral) | n/a | Confirms legacy fallback gone everywhere |
| `https://tulala.digital/` , `https://app.tulala.digital/` | 200 | n/a (platform) | n/a | CSP + alias parity | `deploy:smoke` all checks passed |
| `https://www.improntamodels.com/` , `https://impronta.tulala.digital/` | aliased to prod build | same deployment as improntamodels.com | (by alias) | — | Aliased to `tulala-bk8ewrgan…`; not separately content-QA'd (same build/content) |

Path-based secondary pattern (`tulala.digital/impronta/login` etc.) 404s
for auth routes — documented limitation, see §7.

## 3. Final Commit History (branch `phase-1`, all pushed; origin == local == `1a50c9658`)

| # | Hash | Message | Purpose |
|---|---|---|---|
| 1 | `a3521ae0a` | refactor(builder): rename legacy-section-tree to snapshot-slot-bridge | P0-7 mechanical rename + 13 import-only updates |
| 2 | `be4e51074` | feat(page-builder): build Impronta homepage foundation and modern shell | Phases 0–4 program code (presets, primitives, 4 smart sections, recipe, hero-slot widening, shell + logo resolver, token CSS, fallback banner, deleted dead files, archived docs) |
| 3 | `629330cc7` | docs(page-builder): add Impronta execution tracker | Canonical tracker doc |
| 4 | `6f0d23ac4` | fix(page-builder): make shell logo resolver resilient to stale branding cache | Option-2 resilient resolver (distinct key + 300s TTL + branding tag) |
| 5 | `9d305bc9f` | docs(page-builder): record Option-2 logo fix + production QA pass | Logo-fix + prod-QA record |
| 6 | `5b600f61f` | refactor(page-builder): remove deprecated hardcoded homepage body fallback | Phase 5 — legacy body removed, neutral state, 4 components deleted, i18n keys |
| 7 | `1a50c9658` | docs(page-builder): record Phase 5 deploy + production QA pass | Phase 5 deploy/QA record |

Production deployments: `tulala-mqftakab4` (Phase 4) → `tulala-8yeuxdkq7`
(logo fix) → `tulala-bk8ewrgan` (Phase 5, current live). Prod env:
`ENABLE_SITE_SHELL=tenants`, `SITE_SHELL_TENANT_IDS=…0001`.

## 4. What Is Now Canonical

**The Page Builder / CMS path is the product path.** There is one body
render path and one shell render path:

- **CMS / Page Builder homepage** = system `cms_pages` homepage row +
  `cms_page_sections` + published snapshot, rendered by the shared
  `HomepageCmsSections` renderer (hero full-bleed + non-hero slots in
  `homepageMeta` slot order).
- **Section registry** (`sections/registry.ts`) — single source of
  section types; locked 5-file pattern (schema/migrations/meta/Component/
  Editor [+fetch]).
- **Modern shell** = system `site_shell` cms_pages row, `site_header` +
  `site_footer` slots, `loadPublishedShell` → `PublishedShellHeader/
  Footer`, gated by `ENABLE_SITE_SHELL` + `SITE_SHELL_TENANT_IDS`.
- **Theme preset system** — `agency_branding.theme_json(_draft)` →
  tokens; `editorial-noir` preset; published via `publishDesign`.
- **Logo resolver** — `resolveShellBrandLogoUrl`: section
  `brand.logoUrl` → public `agency_branding.theme_json.logo_url` mirror
  → text wordmark (own short-TTL+tag cache).
- **Impronta homepage recipe** — `impronta-home` in `starter-action.ts`
  `RECIPES`; applied via the canonical one-click starter
  (`applyStarterComposition`, tenant from `requireTenantScope()`).
- **No-composition behavior** — edit → `EmptyCanvasStarter`; public →
  neutral `public.home.noComposition`. No hardcoded marketing fallback.

## 5. What Was Removed (and intentionally kept)

**Removed:** the hardcoded Impronta-flavored fallback body (legacy
`--impronta-gold` hero `<section>` + the
TalentTypeShortcuts/FeaturedTalentSection/BestForSection/LocationSection/
HowItWorks/CtaSection stack), the legacy-only imports/data plumbing in
`agency-home-storefront.tsx`, old "house of curated talent" / "Curated"
copy, the dead `home-public.tsx` + `editorial-talent-strip.tsx`.
**Deleted files (verified 0 other importers):**
`components/home/{talent-type-shortcuts,how-it-works,cta-section,
lifestyle-backdrop}.tsx`. Stale milestone `.md` docs archived to
`web/docs/archive/page-builder-milestones/`.

**Intentionally kept:** the modern-shell-vs-legacy-shell guard
(header/footer mutex — Phase 5 removed the *body* fallback only);
`components/home/{featured-talent-section,best-for-section,
location-section}.tsx` (export types `lib/home-data.ts` → the CMS
renderer depends on); `components/home/hero-search.tsx` (used by
`(public)/directory/page.tsx`).

## 6. Remaining Follow-Ups (non-blocking, deferred)

- Builder **`platform-auth` link kind** — so tenant storefronts can link
  to platform/app/auth without absolute hardcoding or tenant-prefix
  breakage (current: `/login`,`/register` correct on prod primary host;
  path-based secondary 404s).
- `agency_business_identity.footer_tagline` still holds the legacy debug
  string "Builder live-edit…" — affects the **legacy footer only**; the
  modern shell uses the section prop (clean). Separate cleanup.
- **Featured-talent roster visibility:** Impronta `…0001` = 1
  `site_visible` / 27 `roster_only` → cards/Featured Talent show
  placeholders. Owner/product decision.
- Dynamic `tenant_talent_count` — hero stat is manual "28 represented
  talent" until roster visibility is resolved.
- `talent_collection` DTO extension (secondary type / languages /
  availability / true parent).
- Visual taxonomy picker for `talent_type_grid` dynamic mode (manual
  interim shipped).
- Service-area chips + location map embed (manual interim shipped).
- **Pixel-perfect human design review** — agent env can't screenshot;
  structural QA only; needs a human visual pass.
- Page-kit / template-bundle system (later — see §8 W3).

## 7. Risk Register

| Risk | Impact | Status | Recommendation |
|---|---|---|---|
| Auth links 404 on path-based secondary pattern (`tulala.digital/<slug>/login`) | Low — prod primary is the custom domain where they 200 | Known/documented | Build `platform-auth` link kind (deferred) |
| Featured Talent shows placeholders (roster 1 site_visible/27 roster_only, no real images) | High perceived-quality — page looks unfinished | Open, owner-gated | Workstream 2 (visibility + imagery) before design polish |
| Future tenants have no default homepage | Medium — neutral state is correct but bare | By design | Page-kit/default-starter strategy (W3) |
| Modern shell enabled for Impronta only, not global | None (intentional staged rollout) | Stable | Widen `SITE_SHELL_TENANT_IDS` per tenant after each is composed |
| Unrelated parked work accumulating in working tree + 22 stashes (incl. `stash@{0}`) | Medium — clutter, merge risk for other agents | Untouched (out of scope) | Owner/multi-agent triage of stashes + parked files separately |
| Logo depends on `theme_json.logo_url` mirror staying in sync | Low — canonical save mirrors it; resolver self-heals 300s | Mitigated | None needed; revisit if branding model consolidates |

## 8. Recommended Next 3 Workstreams (priority order)

### Workstream 1 — Live Impronta Design / UX Polish
Make the live homepage feel premium, not just technically correct.
Design pass first (spacing, type scale, section rhythm, mobile, CTA
hierarchy, header/footer refinement, hero balance, category-grid polish,
empty states, real image/media strategy), then implementation. Gated
work, theme-token-driven (no hardcoded Impronta).

### Workstream 2 — Content + Talent Visibility Pass
Make the homepage show real talent + real business content. Owner
decides which profiles are `site_visible` / `featured`; surface 8–15
strong profiles; validate card imagery; tighten location/category copy;
verify client + talent CTA journeys. Mostly an owner/content decision +
small config, not heavy code.

### Workstream 3 — Page Kit / Template System
Turn the proven Impronta composition into reusable kits (homepage,
agency/studio starters, talent landing, contact/inquiry, about, bundle
installer, default nav/footer/theme/section configs). **Do not start
until the live Impronta homepage is polished AND content-real.**

## 9. Recommended Immediate Next Action

**Start Workstream 2 (Content + Talent Visibility) now, in parallel with
a no-code Workstream 1 design audit.**

Rationale: the single biggest perceived-quality problem on the live page
is not spacing or typography — it is that the talent cards and Featured
Talent render **placeholder silhouettes** (only 1 of 28 roster
`site_visible`, no real imagery). No amount of CSS polish makes a
homepage feel premium while its talent grid is empty boxes — and abstract
placeholder imagery is this project's documented #1 "looks unfinished"
signal. W2's core lever (which profiles are `site_visible`/`featured` +
real images) is an **owner/product decision**, so kick it off
immediately. While that decision is pending, run the W1 **design audit**
(analysis only — spacing/type/rhythm/mobile/hero/CTA) so implementation
can start the moment the page shows real people. Then execute W1
implementation on a content-real page. **W3 (page kits) stays gated**
until W1+W2 land — codifying kits from an unpolished, placeholder
composition would bake in the wrong defaults.

One-line answer to "1 polish / 2 content-visibility / 3 page-kits?":
**→ 2 first (owner decision + config), with the 1 design audit running in
parallel; then 1 implementation; then 3.**

---

## Content + Talent Visibility Execution Pass — 2026-05-18

**WS-A (DB, tenant-scoped, reversible — no schema change).** Confirmed
the live `featured_talent` fetch first: all modes gate on roster
`agency_visibility ∈ {site_visible,featured}` + `talent_profiles
.workflow_status='approved'` + `visibility='public'`; `manual_pick`
(verified-supported in `fetch.ts`) selects by `profile_code IN codes`,
order = codes array; `is_featured` only affects `auto_featured_flag`
ordering. Changes:
- 6 approved profiles → roster `agency_visibility='featured'` +
  `talent_profiles.is_featured=true, featured_level=1,
  featured_position=1..6`: TAL-92001 Sofía Herrera (1), TAL-92003 Luis
  Ortega (2), TAL-92004 Marco Sánchez (3), TAL-92002 Carmen Díaz (4),
  TAL-00033 Tina (5), TAL-00034 Nalea (6). All already approved+public;
  all have approved card/gallery media → real thumbnails.
- QA fixture `TAL-AUDIT-0512` → roster `agency_visibility='roster_only'`,
  `is_featured=false` (removed from public).
- Before-state (revert target): all 6 were `roster_only`,
  is_featured=false, level/pos 0; QA fixture was `site_visible`.
- 22 unfinished draft/hidden profiles untouched (no bulk publish).

**WS-B (recipe `impronta-home`, gated tsc 0/eslint 0).**
- featured_talent → `sourceMode:"manual_pick"`,
  `manualProfileCodes:[TAL-92001,TAL-92003,TAL-92004,TAL-92002,
  TAL-00033,TAL-00034]` (deterministic premium control).
- talent_type_grid items trimmed 7→4: Models, Hosts & Promo,
  Performers, Creators & Influencers (Carmen = Influencer, now public).
  Removed Chefs & Culinary, Wellness & Beauty, Music & DJs, Photo/Video
  & Creative (no public roster — do not over-promise).
- Cancún removed from hero_search chips, location_discovery items,
  editorial_split_hero body, values_trio detail. Kept Tulum, Playa del
  Carmen, Riviera Maya. "28 represented talent" kept.

**WS-C (canonical flow).** Re-applied `impronta-home` to `…0001` via the
editor Template gallery → review → Apply 9 → "Publish now" (publishes
homepage composition + republishes shell). LIVE `cms_sections` props
verified: featured_talent manual_pick + 6 codes; talent_type_grid 4
items; location_discovery 3 items; hero chips 3; 0 Cancún; 0 "curated".
Page published v860, 9 live sections.

**Cache note:** publish ran via the local dev runtime → busts local
Next cache only. Prod (`improntamodels.com`) served stale until the
grouped deploy below refreshed the Production Data Cache (same class as
the earlier logo-cache fix; the canonical resolution is a fresh
Production-env build via `deploy:promote`).

Deploy + post-deploy prod QA: see next entry.

### Deploy + Post-Deploy Prod QA — PARTIAL (blocker: prod homepage Data Cache) 2026-05-18

Commit `b6c6002c2` (scoped: starter-action.ts recipe + tracker) → push
(FF `1a50c9658..b6c6002c2`) → `deploy:promote` → prod build
`tulala-hjf9lu09i` → aliased improntamodels/www/impronta.tulala →
`deploy:smoke` all passed.

**Prod QA result:**
- ✅ **Featured Talent now shows the 6 real profiles** (Sofía Herrera,
  Luis Ortega, Marco Sánchez, Carmen Díaz, Tina, Nalea) with real
  thumbnails; **QA fixture TAL-AUDIT-0512 absent**. This proves WS-A
  (roster `agency_visibility=featured` + `is_featured`) is LIVE —
  `featured_talent` resolves at request time from the roster DB.
- ✅ shell + logo + editorial-noir + 9 sections + 0 "Curated" + 0 edit
  chrome + "28 represented talent" intact.
- ❌ **talent_type_grid still renders the OLD 7 categories** and Cancún
  still appears in chips/editorial body/values detail.

**Root cause (NOT a data bug — data is correct):** the LIVE DB
composition is verified correct (9 live sections; exactly ONE
talent_type_grid with items `[Models, Hosts & Promo, Performers,
Creators & Influencers]`; no Cancún). But `loadHomepageForRender`
(`server/homepage-reads.ts`) wraps the composition read in
`unstable_cache` tagged `tagFor(tenantId,'homepage'|'pages-all')` **with
no `revalidate` TTL**. `publishHomepage`'s `revalidateTag` only fires in
the runtime that ran it — my "Publish now" ran on the **local dev
server**, so **prod's Next Data Cache for `loadHomepageForRender(…0001,
en)` stayed stale**, and `deploy:promote` does not clear the Vercel Data
Cache (it persists across deployments). `featured_talent` escaped this
because it re-fetches from the roster DB per request.

**This is the same cache class as the logo-resolver issue (Option 2).**
prod-safe busts: only the canonical `publishHomepage`/`revalidateTag`
run **in prod's runtime** (admin on prod), since `/api/admin/
dev-revalidate` is 404 in production by design.

**Fix options (owner decision — mirrors the accepted logo Option 2):**
1. Apply the same resilience pattern: add a short `revalidate` TTL to
   `loadHomepageForRender`'s `unstable_cache` (keeps the tags for
   instant canonical busts; adds a self-heal safety net so an
   out-of-band/local publish converges on prod within minutes). Small,
   scoped, reversible code change in one read; fixes this class
   permanently for the homepage. Recommended.
2. One-time prod-runtime canonical bust (admin logs into prod →
   re-publish homepage so `revalidateTag` runs in prod runtime). Fixes
   this instance only; the fragility remains.

**Status:** WS-A/B/C data + recipe verified correct and committed/
deployed; Featured-Talent content-realness is LIVE. talent_type_grid /
location trims are correct in the DB but NOT yet visible on prod pending
the cache-resilience decision above. Phase: content-real for Featured
Talent; blocked on prod homepage cache for category/location trims.

### Cache-Resilience Fix (Option 2) — RESOLVED, content-real LIVE 2026-05-18

Owner chose Option 2. `fix(page-builder): add short revalidate TTL to
public homepage cache` (`ca87d3ea9`, scoped: `homepage-reads.ts` only) —
added `revalidate: 300` to `loadPublicHomepage`'s `unstable_cache`
(the non-edit storefront path, also reached via `loadHomepageForRender`).
Cache key + both tags (`homepage:{locale}`, `pages-all`) preserved;
tenant scoping + public render unchanged; single cache in file; no new
route, no schema/renderer change, no service-role in public path. Same
resilience pattern as `shell-brand-logo.ts`. Pushed (FF
`3b33c9319..ca87d3ea9`) → `deploy:promote` → prod `tulala-emjq4ddcq` →
aliased → `deploy:smoke` passed. (One grouped blocker deploy — no
micro-deploys.)

Self-heal verified: the stale prod entry (>300s old) served stale on the
first post-deploy request and revalidated in background; subsequent
requests fresh.

**Production QA — `https://improntamodels.com/` PASS (content-real):**
- ✅ Featured Talent = the 6 real profiles (Sofía Herrera, Luis Ortega,
  Marco Sánchez, Carmen Díaz, Tina, Nalea) with real thumbnails;
  QA fixture absent.
- ✅ talent_type_grid = 4 supported categories (Models, Hosts & Promo,
  Performers, Creators & Influencers); Chefs/Wellness/Music/Photo gone.
- ✅ Cancún removed everywhere (0 occurrences); locations = Playa del
  Carmen / Tulum / Riviera Maya.
- ✅ modern shell + logo + editorial-noir + 9 CMS sections + 0 "Curated"
  + 0 edit chrome + "28 represented talent".

**Result:** the live Impronta homepage is now content-real and honest
(real featured talent + images, no over-promised categories/locations,
no QA fixture). The tag-only-no-TTL stale-cache class is now bounded for
the homepage composition platform-wide (5-min self-heal) — same as the
logo resolver. Content + Talent Visibility workstream COMPLETE.

Remaining content backlog (non-blocking, owner/content): complete the 22
draft/hidden roster profiles (bio/city/approval/media) to grow Featured
Talent toward 8–15 and re-enable trimmed categories/Cancún as real
coverage exists; pixel-perfect human design pass (Workstream 1).

---

## Workstream 1 — Live Impronta Design / UX Polish (AUDIT + PLAN — no code) 2026-05-18

Read-only audit of the live homepage (`improntamodels.com`) via prod
HTML + authoritative DB composition + local responsive structural
metrics. **Honest scope limit:** pixel-perfect aesthetic judgment
(typography weight, micro-spacing, "premium feel") needs a human visual
pass — screenshots are denied in the agent env; the preview DOM is
hydration-bloated. Findings below are the structurally/asset-verifiable
ones; subjective polish is flagged as human-review.

### Audit findings

- **Section order: CORRECT** (authoritative slot-sorted): hero_search →
  editorial_split_hero → talent_type_grid → featured_talent →
  location_discovery → process_steps → values_trio → cta_banner(talent)
  → cta_banner(client). Logical flow; not an issue. (An earlier
  grep-order looked scrambled — that was the multi-render server-HTML
  artifact, not the real order.)
- **Featured Talent: PASS / premium.** 6 real profiles, 100% have real
  card images (`aspect-3/4`, editorial variant, link to `/t/<code>`).
  This is the strong part of the page now.
- **CRITICAL — imageless category grid.** `talent_type_grid` has 4
  manual items (Models, Hosts & Promo, Performers, Creators &
  Influencers) with **0 `imageUrl`** → every card renders the
  `site-prim-media__fallback` (text label on a dark placeholder frame).
  Abstract placeholder boxes are this project's documented #1
  "looks-unfinished" signal. Half the "browse" experience reads as
  builder template.
- **HIGH — editorial_split_hero has no media.** `mediaMode=static`,
  `mediaUrl=NONE` → neutral MediaFrame fallback in a hero-area section
  (high visibility). Reads unfinished next to the real Featured cards.
- **MEDIUM/HIGH — hero_search has no imagery.** Search-first text hero on
  near-black; functional but low first-impression impact for a premium
  agency (no hero visual/backdrop).
- **PASS — responsive.** No horizontal overflow at 390 (and 834/1440 per
  the earlier `min(),100%` + `flex-wrap` fixes). Structurally sound.
- **PASS — integrity.** editorial-noir live, 0 "Curated", 0 Cancún, no
  public edit chrome.
- **Human-review (cannot verify in-env):** type scale/rhythm, section
  vertical spacing cadence, CTA visual hierarchy, card hover states,
  editorial-noir gold accent tastefulness (`color.accent #d4af37` — the
  owner has historically disliked heavy gold/rust; worth a deliberate
  call), header/footer refinement.

### Polish backlog (prioritized)

| Pri | Problem | Section | Recommendation | Path | Risk |
|---|---|---|---|---|---|
| Critical | Category cards imageless (placeholder frames) | talent_type_grid | Add real editorial imagery per category (4 images), set `imageUrl` per item | content (assets) + config | low (config) / owner-gated (assets) |
| High | Editorial split hero has no media | editorial_split_hero | Supply a real editorial hero image, set `mediaUrl` | content + config | low (config) / owner-gated (asset) |
| High | Hero first-impression flat (no imagery) | hero_search | Decide: keep search-first text hero vs add a tasteful backdrop/визуal; if backdrop, it's a section/presentation setting | owner decision → config/CSS | med |
| Medium | Gold accent (#d4af37) heaviness | theme tokens | Owner call: keep editorial-noir gold vs dial accent toward restrained metal/ivory | config (theme token) | low |
| Medium | Type scale / vertical rhythm / CTA hierarchy | all | Human visual pass → targeted token/CSS tweaks | CSS/token | med |
| Medium | Featured `limit:12` vs 6 codes; copy tightening | featured_talent | Set `limit:6`; tighten section copy | config | low |
| Later | Category/Cancún re-enable as roster grows | recipe | Re-add per real coverage (content backlog) | config | low |
| Later | Page-kit/template extraction | platform | Deferred (explicitly not now) | code | n/a |

### Implementation plan (proposed — not yet executed)

- **A. Builder composition/config (no code):** set `imageUrl` on the 4
  talent_type_grid items; set editorial_split_hero `mediaUrl`; tighten
  featured_talent `limit`→6 + copy; (optional) hero backdrop setting;
  (optional) theme accent token. All via the canonical recipe re-apply +
  publish (proven flow). **Blocked on owner-provided real images.**
- **B. CSS/token polish:** only after a human visual pass identifies
  concrete spacing/type/hover issues — token-driven, tenant-agnostic, no
  Impronta hardcode. Small scoped pass.
- **C. Component changes:** none anticipated — existing sections support
  imagery + the needed presentation. Do NOT add components.

### QA targets
1440 / 834 / 390: no horizontal overflow; hero/search/CTAs usable;
category + featured cards premium (real imagery); readable type; clear
button hierarchy; no empty/accidental section; editorial-noir intact.

### Owner decisions needed
1. Provide/approve **4 category images** + **1 editorial-hero image**
   (real photography vs curated stock vs commissioned) — the marquee
   blocker; without real assets the page keeps placeholder frames.
2. hero_search: keep clean search-first text hero, or add a hero
   backdrop/visual?
3. editorial-noir **gold accent**: keep as-is or dial back (owner has
   historically disliked heavy gold/rust)?
4. Sequence: implement config polish now with interim imagery, or wait
   for final real assets and do one grouped premium pass?

### Recommendation
**Wait for owner decisions (esp. imagery/assets) before implementing.**
The highest-impact items (category + hero imagery) are content/asset
decisions, not CSS — and this project explicitly rejects placeholder
boxes, so CSS polish alone won't make it "premium." Recommend: owner
supplies/approves the 5 images + answers the 3 design calls, then ONE
grouped config(+small CSS) polish pass via the canonical re-apply, then
1440/834/390 QA. No code planned beyond optional small token/CSS tweaks
identified by a human visual pass.

## Visual Polish Pass 1 — Imagery + Premium Composition — STATUS: APPLIED + PUBLISHED + PROD-QA'd (2026-05-18)

Owner directive: make the live homepage premium NOW with the best
available materials, config-only, no hardcoded one-off hacks, no new
components, canonical flow, one grouped deploy. Imagery gap solved using
the prototype's sanctioned curated Unsplash editorial frames (the
prototype `v11-features/index.html` `CATS[]`/`U`/`IMGQ` source — same
crop, dark cinematic grade via existing overlay tokens). All changes are
canonical builder DATA in the `impronta-home` recipe — no component code.

**Recipe changes** (`starter-action.ts`, tsc 0 + eslint 0):
- `talent_type_grid` → per-item `imageUrl` on the 4 discipline cards:
  Models `photo-1524504388940-b1c1722653e1`, Hosts & Promo
  `photo-1492684223066-81342ee5ff30`, Performers
  `photo-1493225457124-a3eb161ffa5f`, Creators & Influencers
  `photo-1547355253-ff0740f6e8c1` (IMGQ `?auto=format&fit=crop&q=72&w=1100&h=820`).
  `imageOverlayStrength:medium` + `cardRatio:3/4` + `textPosition:
  overlay-bottom` unchanged → editorial-asymmetric wall stays cohesive.
- `editorial_split_hero` → `mediaUrl`
  `photo-1478720568477-152d9b164e26?...q=80&w=1600&h=1200` (creative/shoot
  set — reinforces "events, shoots, and brand experiences", distinct from
  the 4 cards), `mediaAlt` set, `overlayStrength:none → soft` (cinematic
  grade matching editorial-noir).
- hero_search left intentionally imageless (prototype's primary hero is a
  cinematic dark search hero — correct, not a gap).

**Canonical flow:** re-applied `impronta-home` via the visual-editor
Template gallery → "Apply 9 sections" (`applyStarterComposition`), then
editor topbar Publish → `publishHomepage`. Theme NOT re-published
(editorial-noir already live; imagery-only change touches no theme
tokens). Result: homepage en **published v862** (`published_at`
2026-05-18T06:56:17Z); LIVE snapshot now carries all 5 image URLs +
mediaAlt + `overlayStrength:soft` (read-only DB verified).

**Dev-server gotcha (process learning):** this Next fork's dev server
serves a STALE compiled `"use server"` module after a recipe edit even
across `preview_stop`/`preview_start` + `rm -rf .next`. Two re-applies
silently used the pre-edit recipe (verified: prior props applied, new
imagery keys absent). Fix that worked: force-kill all `next dev` /
`next-server` PIDs (`pkill -9`), nuke `.next`, fresh `preview_start`,
warm. Only then did `applyStarterComposition` emit the new imagery. Add
this to the local-dev stale-wedge playbook.

**Pre-existing publish blocker discovered + fixed (scope addition,
flagged):** the canonical Publish drawer surfaced **12 LINK CHECKS
blockers** — `featured_talent.manualProfileCodes` (TAL-92001 … profile
codes, never anchors) URL-validated as invalid links, hard-disabling
"Publish now". NOT caused by this imagery change (featured_talent is
unchanged prior-phase recipe data; the live v861 snapshot already
shipped these exact codes). Root cause:
`publish-preflight-link-rules.ts` `collectLinkCandidates` recursed into
ANY nested array/object and pushed EVERY reached string as a link
candidate, bypassing the `looksLikeLinkKey` gate for array values.
Pre-existing shared infra (committed by another agent's page-builder
batch `8bf312c61`), on multi-agent `phase-1`. Fixed by threading an
`underLinkKey` flag through recursion: a string is only a link candidate
when reached via an href/url/link key. Minimal, tenant-agnostic,
matches the function's own test intent ("finds nested href/url fields",
not arbitrary strings). Existing 5 preflight tests stay green + added 1
regression test (`manualProfileCodes` array not collected). After the
fix the canonical publish showed **0 blockers / 7 non-blocking
advisories** (pre-existing: alt-text on other tenants' library sections,
the known 30-H1 heading-lint, missing es snapshot — none from this
change, none blocking) and Publish now succeeded.

**Prod QA — improntamodels.com (no-cookie fetch + visual @ 1456/834/390):**
PASS. All 5 Unsplash URLs + mediaAlt + headlines in server HTML (page
v862). Visual: hero_search premium imageless; `editorial_split_hero`
renders the cinematic projector/production frame with soft grade;
`talent_type_grid` renders the editorial-asymmetric wall (large Models
portrait + Hosts & Promo / Performers / Creators & Influencers) with
overlay-bottom labels; `featured_talent` now shows real profiles (Tina,
Nalea); editorial-noir + serif type intact; no horizontal overflow at
any width; tablet/mobile reflow correct (mobile horizontal-scroll). The
"section heading ×N" in the live browser DOM is the documented
client-render artifact — server HTML has each once (curl-verified).

**Files (scoped):** `src/lib/site-admin/edit-mode/starter-action.ts`
(recipe imagery) · `src/lib/site-admin/edit-mode/publish-preflight-link-rules.ts`
(false-positive fix) · `src/lib/site-admin/edit-mode/publish-preflight-link-rules.test.ts`
(regression test) · this tracker. No component, schema, renderer, or
theme code touched.

---

## Targeted Visual Refinement Pass 2 — Header + Hero + Top Fold (2026-05-18) — SHIPPED

**Status:** committed + deployed + production-QA'd on improntamodels.com.

**Brand duplication — root cause.** The `site_header` rendered BOTH the
resolved logo image (the IMPRONTA asset, which itself contains the
"IMPRONTA" wordmark + "AGENCIA DE MODELOS & IMAGEN" tagline) AND a
separate `brand.label="Impronta"` text wordmark, stacked vertically by
the editorial column CSS → a visually duplicated/blocky brand. The
header was also oversized (logo `clamp(42–62px)`, generous padding/gaps)
so it read as a section, not a thin shell.

**`brandDisplay` option (reusable, opt-in).** New `site_header.schema`
enum `brandDisplay: image | text | image-and-text`, default
`image-and-text` (legacy behaviour preserved for every other tenant).
Component renders image-only / text-only / both accordingly; Editor
defaults + a render-test fixture updated for the new required-after-
default field. Impronta config set to `brandDisplay:"image"` (the logo
asset already includes the wordmark) → duplicate removed
(SSR `site-header__brand-label`=0). Editorial header CSS tightened to a
thin premium shell (logo `→clamp 32–44px`, inner padding `→9–14px`,
reduced gaps). `standard/minimal/split` untouched; theme-token-driven.

**Hero scale/padding refinement.** Root cause of the weak/compressed
hero: it used the generic `SectionHead` H2 scale (`clamp 28–48px`) and
P7's uniform `standard` section padding. Fix: scoped reusable CSS
(editorial + centered layouts only) lifts the headline to H1 presence
(`clamp 2.4–4rem`), contains the search bar (`max-width 44rem`), adds
internal rhythm; controlled config bumped `hero_search`
`presentation.paddingTop/Bottom: standard→airy` (revert = `standard`).
Split-hero assessed — no change needed (already prototype-aligned from
P3+P7; "only tune what is needed").

**Commit:** `3bbea2724` — `feat(impronta): refine editorial header and
hero` (5 files: site_header schema/Component/Editor, token-presets.css,
node-presentation-render.test.ts). Pushed to `origin/phase-1`
(`890a96ecc..3bbea2724`).

**Deploy/build:** production `https://tulala-2iwxd8zx0-oran-tenes-projects.vercel.app`
(via `deploy:promote`; migration drift clean 331/331; tulala.digital +
app.tulala.digital re-aliased; `deploy:smoke` all checks passed).

**Production QA — improntamodels.com (no-cookie SSR + visual):** PASS —
brand NOT duplicated (`brand-label`=0, single logo), header
`variant=editorial` thin/refined, editorial nav present, Start Inquiry
present, hero `padding-top=airy` with H1-scale heading, search bar
contained, chips + "28 represented talent" render, split-hero
`card-stack`=1, **9 sections** (not 65), Featured Talent = Anto · Tina
· Nalea · Lanco · Annher · Asia, 0 Cancún, 0 "Curated", 0 QA fixture,
0 edit chrome.

**Remaining visual-polish backlog (deferred — proposed, not built):**
- Header social cluster (WhatsApp/IG/TikTok/phone) + separate
  Saved/Inquiry badge buttons + 3-col `h-top` layout (prototype parity;
  needs new reusable `site_header` structure — bigger lift).
- `location_discovery` richer treatment (SVG map + preview panel) —
  owner-deferred per Decision D; currently honest 3-card grid.
- Final human pixel pass at true 390 / 834 widths (agent screenshot
  tool captures fixed ~1512px regardless of resize).
- Per-section rhythm fine-tuning beyond the uniform P7 `standard`.
- Featured Talent media crop/treatment consistency (Lanco/Annher/Asia
  use IMPRONTA-watermarked agency media — real, correctly attributed).

---

# Page Builder Reusability Plan — Prototype Parity to Builder System

*Planning artifact (2026-05-18). No code/DB/deploy. Source of truth for the
next execution phases (Phase 6A–6G). Supersedes ad-hoc polish: from here,
every prototype-mimic gain ships as a reusable primitive / section variant /
card variant / layout option / editor control / data binding / token —
never Impronta-only CSS.*

## 1. Executive Summary

**Can do today:** modern snapshot shell; editorial-noir theme; real CMS
composition (9 sections, no legacy fallback, renderer-dedup fixed);
manual_pick Featured Talent with real profiles; honest 4-category
discipline grid; honest 3-location grid; reusable `sectionPresentationSchema`
(bg/pad/container/divider/designPreset/cardStyle/overlay/animation/pixel);
new reusable `site_header.variant:editorial` + `brandDisplay`,
`editorial_split_hero.mediaStyle:card-stack`, scoped hero presence CSS.

**Still Impronta-specific / developer-dependent:** hero scale, stack
rotation/overlap, header thinness — live as **hard-coded scoped CSS**, not
operator settings. Featured Talent chrome (save/availability/languages/
verified) is **DTO-blocked**. Header social cluster + Saved/Inquiry +
3-col + drawer are **missing schema/structure**. Links are **raw hrefs**
(route-safety Finding B). Editor exposes a fraction of the schema; no
visual pickers/variant previews. Location map/preview = unbuilt.

**Must become reusable:** card chrome (→ `talent_collection` primitive +
DTO), header shell clusters, link-kind system, editor pickers/previews,
section layout variants (rail/pod/stage), and the data models (save /
inquiry-basket / counts) that all of the above + page kits depend on.

**Why not page kits yet:** kits would ship broken without the DTO, link
system, image-fallback strategy, and no-data empty states. Kits are
Phase 6G — *after* the primitives exist.

**Why Featured-Talent + Header next:** the talent cards are the
credibility surface (client/talent decide if the agency is real) and the
foundational reusable collection primitive every future kit needs; the
header is the first impression and a reusable shell capability already
half-built (`editorial`/`brandDisplay`). They sequence the data models
(DTO → save → inquiry) the rest is blocked on.

**Trajectory:** Phase 6A–6D → ~85% parity / ~80% usability. Phase 6E–6F
→ ~92%. Phase 6G + Phase D items → ~95% and kit-ready.

## 2. Target Builder Capability ("complete enough")

An agency owner, with **no developer**, can: pick a homepage kit or start
blank → edit header/footer (brand, nav, social, utilities, variants) →
choose a hero layout + configure search → add a category grid/rail with
images or dynamic catalog → feature talent (manual or dynamic) showing
real metadata (type/city/languages/availability/verified) → let visitors
save + add-to-inquiry → add location discovery → configure process/trust/
CTA with variants → choose desktop/mobile layouts independently → select
imagery via picker → control spacing/density via presets → see
publish-readiness warnings → publish. **Definition of done = each bullet
is achievable through editor UI on a fresh tenant without code.**

## 3. Reusable Primitive Inventory

| Primitive | Exists? | Needed by | Type | Effort | Dependencies | Notes |
|---|---|---|---|---|---|---|
| SectionHead | ✅ | all | — | — | — | shared head; hero uses H2 scale (lift to H1 via setting) |
| Container | ✅ | all | — | — | — | `min(container,100%)` — overflow-safe |
| Cta | ✅ | all | — | — | LinkKind | currently raw href; must adopt LinkKind |
| SearchInput | ✅ | hero_search | — | — | — | OK; sizing not operator-controlled |
| StatLine | ✅ | hero_search | — | — | tenant_talent_count | count semantics narrow |
| Badge | ✅ | featured/trust | partial | S | — | exists; not used for availability/verified |
| ChipList | ✅ | hero/discipline | — | — | — | OK |
| MediaFrame | ✅ | split/cards | partial | S | focal-point | no crop/focal control |
| card-stack media variant | ✅(new) | editorial_split | — | — | — | fixed rotation/overlap (no settings) |
| editorial header variant | ✅(new) | site_header | — | — | — | thin/centered; no clusters |
| brandDisplay | ✅(new) | site_header | — | — | — | image/text/both |
| sectionPresentationSchema | ✅ | all | — | — | — | strong; underused in editors |
| SocialLinks cluster | ❌ | header/footer/contact | new primitive | M | LinkKind(tel/wa) | reusable platform-enum list |
| Contact action cluster | ❌ | header | new primitive | S/M | LinkKind | phone/WhatsApp |
| Save/shortlist button | ❌ | cards/header | primitive+data | L | save model | needs persistence |
| Inquiry basket button/badge | ❌ | cards/header | primitive+data | L | basket model | Add-to-inquiry is a link today |
| LanguageTag list | ❌ | talent cards | primitive | S | DTO | trivial render once DTO has data |
| AvailabilityPill | ❌ | talent cards | primitive | S | DTO+derivation | derivation logic non-trivial |
| Verified/AgencyApproved badge | ❌ | cards/profile | primitive+product | M | trust model decision | product decision required |
| TalentCard metadata row | partial | featured/collection | component | M | DTO | exists via directory card; not variant-controlled |
| IconPicker / IconGlyph | ❌ | trust/discipline/process | primitive+editor | M | icon set decision | curated SVG set, not arbitrary |
| MapPreviewPanel | ❌ | location | primitive | M(static)/XL(real) | location data | static first |
| LocationPin | ❌ | location | primitive | S | map | static decorative ok |
| CategoryIcon slot | ❌ | discipline | schema+primitive | S/M | IconGlyph | per-item glyph |
| LinkKind picker/renderer | ❌ | every CTA/nav | system | M/L | route model | **critical pre-kit** |
| ImagePicker / media selector | ❌ | every media section | editor primitive | M/L | media library | reuses existing media-public |
| LayoutVariant preview tile | ❌ | every variant enum | editor primitive | M | thumbnails | unblocks operator self-serve |
| Mobile layout control | partial | all | editor + presentation | S/M | — | presentation has mobileLayout; not exposed |
| Publish readiness warning | partial | editor | editor primitive | S/M | preflight | preflight exists; not in-editor |

## 4. Section-by-Section Reusability Plan

Legend for classification: **C**=config exists · **S**=schema ext · **CMP**=component ext · **E**=editor UI · **D**=data dependency · **P**=product/route decision.

### A. `site_header`
- **Current:** brand+brandDisplay, navItems≤8, primaryCta, sticky, tone, variant[standard|minimal|split|editorial], authArea toggles. **Prototype:** social-left / brand-center / utilities-right 3-col + nav row + drawer + shrink-on-scroll + Saved/Inquiry badges.
- **Options needed:** socialCluster `socialLinks[]`+contact (**S+CMP+primitive**) · 3-col `variant:editorial-split` or `headerLayout` (**CMP**) · `logoScale`/`navDensity`/`verticalPadding` settings (**S**, lift from CSS) · utility cluster Saved/Inquiry slots (**CMP+D**) · Account/Menu+language (**C** via authArea) · mobile drawer (**CMP+E+client JS**) · sticky/shrink (**CSS+small JS**) · transparent/surface/solid over full-bleed (**C**, test).
- **Editor:** social rows picker; utility toggles; layout-variant preview tiles; density select.
- **Data:** Saved/Inquiry counts → save & basket models (Phase 6F).
- **Phases:** 6B (clusters+3-col+density, render-only) → 6F (live counts).
- **Acceptance:** a tenant can configure social+contact+utilities+nav+layout+density entirely in-editor; neutral theme valid; no Impronta strings.

### B. `site_footer`
- **Current (strong):** brand/tagline, columns≤5{heading,links≤8}, social≤6(platform enum), legal{copyright,links≤4}, variant[standard|compact|rich], tone[follow|light|deep]. **Gap is config, not capability.**
- **Options needed:** 4th column (Account) = **C**; populate `social` = **C**; `columnRatio`/footer density = **S(small)+CSS**; mobile collapse = **CSS** (verify); newsletter/contact CTA = **S(optional)**.
- **Phase:** 6A (config) + tiny CSS. **Acceptance:** prototype 4-col + social row reproducible via config on any tenant.

### C. `hero_search`
- **Current:** layout[centered|split|minimal|editorial], search modes, chips/stat sources; this session's H1 scale/maxWidth/airy are **CSS-hardcoded**.
- **Options needed:** `heroScale[compact|standard|cinematic]`, `headingScale`, `heroMaxWidth`, `searchSize[sm|md|lg]`, `searchLayout`, `ctaLayout`, `chipDensity`, `statStyle` (**S**, lift CSS→schema) · backdrop image/media + overlay/texture (**C** via presentation `videoBackground`/`imageOverlay`, just wire to editor — **E**) · AI search affordance (**future D**) · multi-city chips (**D**) · trust-badge row (**S+primitive**) · mobile hero layout (**S/CSS**).
- **Phase:** 6A (lift scale/maxWidth to settings) · 6D (backdrop picker) · later (AI/multi-city).
- **Acceptance:** operator sets hero scale/search size/backdrop without code; split/minimal untouched.

### D. `editorial_split_hero`
- **Current:** mediaStyle[single|card-stack], stackUrls≤3, captions≤3, ratio/overlay/side/mobileOrder. card-stack rotation/overlap **fixed in CSS**.
- **Options needed:** `mediaStyle` extend → `classic-stage` (2-col copy+select mini-form+stage) and `media-cascade` (**CMP+S**) · `stackCount`/`rotationIntensity`/`overlapDepth`/`captionStyle`/`mediaFrameStyle` (**S+CSS tokens**) · image focal-point/crop (**primitive+S**) · CTA cluster (**C**) · real-talent media source (`mediaMode:selected/dynamic`) (**D**, DTO) · lifestyle media source = `static` (**C**).
- **Phase:** 6A (expose stack params as settings) · 6E (classic-stage variant) · 6F (real-talent media via DTO).
- **Acceptance:** stack params operator-tunable; ≥2 reusable media variants; neutral-safe.

### E. `talent_type_grid`
- **Current:** mode[manual|dynamic], items≤18, selectedTermIds, parentCategoryMode, desktopLayout[editorial-asymmetric|equal-grid|compact-grid], mobileLayout, ratio/overlay/textPosition, seeAll, per-item imageUrl.
- **Options needed:** desktopLayout += `featured-pod-rail` (3-row snap rail + `cat--lg` pod) (**CMP+S**) · `horizontal-rail` (**CMP**) · per-item `icon` slot (**S+IconGlyph**) · count badge from real category counts (**D**) · per-card CTA (**S**) · active-tenant-catalog source mode (**D**) · visual taxonomy picker (**E**, replace advanced-paste) · desktop/mobile split (**C**, exists; expose **E**) · hide-unsupported (**C**, manual already does) · editor preview thumbnails (**E**).
- **Phase:** 6E (rail/pod + icon slot) · 6D (taxonomy picker) · 6E/6F (counts).
- **Acceptance:** rail/pod selectable; 4 honest cats still valid; icons + counts optional & dynamic-capable.

### F. `featured_talent` / `talent_collection` — **highest value**
- **Current:** sourceMode[manual_pick|auto_*], manualProfileCodes, limit, columnsDesktop, variant[grid|carousel], cardVariant[editorial|compact|minimal|profile], show* toggles — **but** cards render via directory card-family fed by a **cache-trimmed DTO** lacking availability/languages/verified, so the toggles have no data; carousel unverified.
- **Split into 5 deliverables:**
  1. **Render-only/card polish (6A):** consistent image crop, hover, footer rhythm within `cardVariant:editorial` — **CSS/CMP, S effort, low risk.**
  2. **DTO extension (6A→6B):** add `secondaryType, parentCategory, languages[], availability, verified/agencyApproved, city, imageMeta/crop, profileRoute` to FeaturedTalentDTO — **D, M, medium risk** (cache key + RLS).
  3. **Save/shortlist (6F):** model+RLS+heart+header badge — **D+CMP, L, high.**
  4. **Inquiry basket (6F):** model+Add-to-inquiry real+badge+handoff — **D+CMP, L, high.**
  5. **Editor controls (6D):** per-metadata toggles wired to DTO; eligibility warnings; profile-route safety (LinkKind) — **E, M.**
- **Acceptance:** cards show save/availability/languages/verified driven by data + operator toggles; manual+dynamic; reusable as `talent_collection` on any tenant.

### G. `location_discovery`
- **Current:** source[manual|roster_cities|service_areas], items≤24{label,region,href,count}, showMap(flag, unbuilt), layout[grid|list|compact].
- **Near-term (6E):** `layout:map-inspired` static panel + decorative pins + active-location preview card (**CMP+primitive**, no real map).
- **Medium (6E/6F):** per-location real talent count binding (**D**); service-area / roster-city binding surfaced (**C/D**).
- **Long-term (Phase D):** real map system (**XL, deferred Decision D**).
- **Acceptance:** premium map-inspired panel reproducible via config; counts optional/dynamic; honest locations preserved.

### H. `process_steps`
- **Current:** variant[numbered-column|horizontal-timeline|alternating-image], numberStyle.
- **Options:** `iconed` steps variant + IconGlyph slot (**S+primitive**) · connector-line + compact density (**CSS**) · step CTA (**S**) · mobile stacked (**C**).
- **Phase:** 6E (icon variant) + 6A (compact CSS). **Acceptance:** icon/number/compact variants selectable.

### I. `values_trio` / trust
- **Current:** variant[numbered-cards|iconed], numberStyle — renders numbered; `iconed` has no per-item icon picker.
- **Options:** circular-icon pillar CSS for `iconed` (**CSS, 6A**) · IconPicker per item (**primitive+E, 6D**) · trust-badge/verified-claims (**S+product**) · 3/4-col + compact/rich (**C/CSS**) · mobile density (**C**).
- **Acceptance:** circular gold icon pillars reproducible; per-item icons pickable.

### J. `cta_banner`
- **Current:** variant[centered-overlay|split-image|minimal-band], bandTone, bg media, inset.
- **Options:** audience variants `talent-cta`/`client-final` presets (**S/preset**) · split CTA (**C** via split-image) · final-hero CTA style (**CSS variant**) · CTA hierarchy (primary/secondary/tertiary) controls (**S**) · mobile stacking (**C**).
- **Phase:** 6A (final-hero CSS + presets). **Acceptance:** audience-specific premium variants selectable; hierarchy explicit.

## 5. Editor UX Plan

Principle: **progressive disclosure** — common controls visible, power
controls under "Advanced", every variant has a preview tile, every
media/talent/category/link field has a picker (no raw strings), every
section shows data/empty warnings.

| Section | Visible controls | Advanced | Needs picker | Needs preview tiles | Warnings |
|---|---|---|---|---|---|
| site_header | brand, brandDisplay, nav, primaryCta, variant, social | density, tone, sticky, padding | image, link-kind, social | layout variants | missing logo; broken links |
| site_footer | columns, social, legal | tone, columnRatio | link-kind | variant | empty columns |
| hero_search | headline/highlight, search, chips, stat, heroScale | maxWidth, ctaLayout, backdrop | image(backdrop), link | layout, heroScale | no chips/stat source |
| editorial_split | headline, media, CTAs, mediaStyle | stackCount, rotation, caption | image(×3), link | mediaStyle variants | <required images |
| talent_type_grid | headline, items/source, desktopLayout | mobileLayout, overlay, icon | image/cat, taxonomy, link | desktopLayout | unsupported cats; 0 items |
| featured_talent | headline, source, codes/filters, columns, cardVariant, show* | variant, parentCatDisplay | talent, link | cardVariant, grid/carousel | ineligible codes; <limit |
| location_discovery | headline, source, items, layout | showMap, ctaHref | location, link | layout (incl map-inspired) | 0 locations |
| process/values/cta | headline, items/steps, variant, numberStyle/icon | density, bandTone | icon, image, link | variant | <min items |

Cross-cutting editor primitives (Phase 6D): **ImagePicker** (media-public
library + URL fallback), **TalentPicker** (eligibility-aware), **TaxonomyPicker**
(replace advanced-paste), **LinkKindPicker** (§7), **LayoutVariantTiles**,
**Mobile/Desktop split toggle**, **in-editor empty/readiness warnings**,
**SectionPresetPicker**.

## 6. Data / DTO / Backend Plan (plan only)

**FeaturedTalentDTO extension** — add: `secondaryType`, `parentCategory`,
`languages[]`, `availability` (enum/derived), `verified` &
`agencyApproved` (trust model), `city`, `imageMeta{focalX,focalY,crop}`,
`profileRoute` (LinkKind), optional `responseTime`/`bookingReady`. Risks:
unstable_cache key bump + 5-min TTL (documented cache-resilience class);
RLS — fields must be public-safe; availability derivation source TBD
(talentCalendarEntries exists per binding docs).

**Save / shortlist model** — `saved_talent` (tenant_id, talent_profile_id,
client/session scope, created_at). Anonymous = session/cookie; logged-in
= row. RLS: public-safe write/read scoped to session/owner. Powers header
Saved badge + card heart. Effort L, risk high (anon strategy + RLS).

**Inquiry basket model** — `inquiry_basket` (tenant_id, session/client,
talent_profile_ids[], created_at) OR reuse `saved_talent.in_cart` (a
prior funnel column exists — verify, prefer reuse). Add-to-inquiry mutates
basket; header badge counts; handoff seeds the inquiry form
(`createInquiryFromIntent`/`submitInquiry` already accept multi-talent +
source attribution). Effort L, risk medium (reuse path lowers it).

**Location/category counts** — derive category counts (talent_profile_taxonomy
∩ roster ∩ visibility) and location counts (service_areas / roster cities).
Tenant-scoped query layer (never RLS-only). Cache with tags + TTL.
Effort M.

All above: **plan only — no schema/migration now.**

## 7. Link / Route System Plan (critical pre-kit)

Replace raw `href` strings with a `LinkRef` config object across all
section CTAs/nav.

`LinkRef = { kind, value?, label?, external?, openInNew? }`

| kind | stored value | render behavior |
|---|---|---|
| tenant-page | slug | path-prefix-aware (`/impronta/…` vs host root) |
| tenant-directory | optional filter | resolves to directory route |
| talent-profile | profile_code/slug | resolves to public profile route |
| inquiry-start | optional prefill | `/contact` / inquiry intent |
| platform-auth-login | — | app-host login (root `(auth)` route — fixes Finding B) |
| platform-auth-register | role | register route |
| app-dashboard | path | app-host absolute |
| external-url | url | new tab + rel safe |
| mailto / tel / whatsapp | address/number | scheme link |
| anchor | #id | same-page |
| media/download | asset id/url | download |

Deliverables: shared `resolveLinkRef(linkRef, {tenantId, pathPrefix, host})`
renderer (one source of truth, replaces ad-hoc `prefixPublicHref` per
section) · `LinkKindPicker` editor primitive · zod schema · **migration
path**: accept legacy string href (coerce to `{kind:external-url|tenant-page}`)
so existing compositions don't break; new edits write `LinkRef`. Phase 6C.
**This must precede page kits** (kits ship many links across hosts/domains).

## 8. Global Design System / Token Plan

| Control | Home | Notes |
|---|---|---|
| page density / section rhythm presets | sectionPresentationSchema + a page-level preset | P7 used uniform `standard`; add named presets (compact/standard/editorial) |
| mobile density | presentation.breakpoints | exists; expose in editor |
| heroScale | hero_search schema | lift from CSS |
| card style presets | presentation.cardStyle[flat|outlined|elevated|glass|editorial] | exists; underused |
| icon style presets | new IconGlyph + token | curated set |
| gold/accent intensity | theme token (`--token-color-accent` + intensity var) | editorial-noir tuned; add intensity |
| overlay presets | presentation.overlayStrength | exists |
| image treatment presets | new (grayscale→color, grade) | reusable class set |
| hover/motion presets | presentation.animation.hover | exists; standardize |
| border/elevation presets | presentation.borderStyle/elevation/radiusScale | exists |
| button hierarchy standards | Cta variants doc + token | define primary/secondary/tertiary/ghost |
| noir↔neutral parity | test matrix | every new variant validated on both |

Routing of new controls: **token-level** (accent intensity, image grade) ·
**sectionPresentationSchema** (density presets) · **section schema**
(heroScale, stack params) · **CSS reusable classes** (image treatment,
final-CTA) · **editor UI** (preset pickers).

## 9. Page Kit Readiness Plan (do not build now)

**Prerequisites before kits:** LinkRef system (6C) · FeaturedTalent DTO
(6A/B) · ImagePicker + fallback strategy · no-talent/no-image empty
states · plan-gating model · editor variant pickers (6D).

Kit needs: recipe system (`RECIPES`+`applyStarterComposition` exists) ·
page-bundle installer = the Template gallery (extend) · default theme
assignment · header/footer/nav/route defaults · **image-fallback
strategy** (kit-safe neutral placeholders, never broken) · Free/Studio/
Agency gating (recipe→plan map) · industry adaptation (neutral tokens +
swappable copy/taxonomy) · tenant data preflight (warn if 0 talent) · kit
preview screen · apply/replace confirmation (exists, harden) · rollback
(snapshot/revision exists).

Future kits (post-foundation): Premium Talent Agency · Studio Minimal ·
Event Talent · Creator/Influencer · Hub/Network · Professional Services ·
People-Directory (dentist/lawyer/office) — all reuse the same primitives;
verticalization = copy + taxonomy + theme, **not** new components.

## 10. Phased Execution Roadmap

| Phase | Goal | Scope | Files/systems likely | Effort | Risk | Deps | Acceptance |
|---|---|---|---|---|---|---|---|
| **6A** Featured Card System (render + DTO start) | cards match prototype, reusable | card CSS polish; FeaturedTalentDTO +languages/availability/secondaryType/verified/city/route; wire show* toggles; footer/hero/trust CSS quick wins | featured_talent fetch/DTO, card-family, token-presets.css, schemas | M | med | trust-badge product decision; cache key | toggles render real data; cards prototype-grade; reusable |
| **6B** Header Parity System | header matches prototype, reusable | socialLinks+contact primitive; 3-col header layout/variant; logoScale/navDensity/verticalPadding settings; Saved/Inquiry render-only slots; mobile drawer; sticky-shrink | site_header schema/Component/Editor, token-presets.css, new primitives | M/L | med | 6F for live counts | tenant builds full header in-editor; neutral-safe |
| **6C** Link-Kind / Route Safety | kill raw-href risk | LinkRef schema; resolveLinkRef renderer; LinkKindPicker; legacy coercion | shared link lib, all section Components/Editors, schemas | M/L | med | none | all CTAs/nav route correctly across host/path/domain/auth |
| **6D** Editor Control Upgrade | usable without dev | ImagePicker, TalentPicker, TaxonomyPicker, LinkKindPicker, LayoutVariant tiles, mobile/desktop split, in-editor warnings, preset picker | editor-chrome, all Editor.tsx, shared editor primitives | L | med | 6C (link picker) | operator builds premium page w/o raw strings/broken layout |
| **6E** Category / Location Advanced Layouts | richer prototype layouts | talent_type_grid rail/featured-pod + icon slot; location map-inspired panel + preview; category/location counts (dynamic) | talent_type_grid, location_discovery, primitives, count data | M/L | med | 6D pickers; counts data | rail/pod + map-inspired selectable; counts optional |
| **6F** Save / Inquiry Basket | hearts & badges real | saved_talent + inquiry_basket models+RLS; save button; basket+badge; header counts; handoff | new tables/migrations, RLS, header/card Components, inquiry intake | L | high | 6A DTO; product decisions | save persists; inquiry basket → form; header badges live |
| **6G** Page Kit Foundation | reusable kits | extend recipe/installer; kit preview/apply/rollback; default theme/nav/footer/route; image-fallback; plan gating | starter-action RECIPES, Template gallery, plan-catalog, fallback assets | XL | med | 6A–6D (esp links/DTO/editor) | a fresh tenant installs a premium kit that renders safely |

## 11. Prioritization

Ranking (impact × reusability × dependency-order × risk × kit-unlock):

1. **6A Featured Card System** — top credibility surface; foundational
   `talent_collection` primitive; starts the DTO every kit needs.
2. **6B Header Parity** — first impression; reusable shell; half-built.
3. **6C Link-Kind/Route Safety** — correctness; **hard prerequisite for
   6D and 6G**; medium effort, broad payoff.
4. **6D Editor Control Upgrade** — converts "dev adjusts" → "owner
   builds"; the core of the stated objective.
5. **6E Category/Location Advanced Layouts** — visible parity; depends on
   6D pickers + counts.
6. **6F Save/Inquiry Basket** — high product value but heaviest/riskiest
   (data models, anon, RLS); unblocks header badges + card actions.
7. **6G Page Kit Foundation** — last; everything else is its prerequisite.

**Challenge to the expected order:** the user's order matches except note
**6C should not slip behind 6D** — the link picker (6D) depends on the
LinkRef model (6C); keep 6C before/with 6D. Otherwise order stands.

## 12. Acceptance Criteria

**85% prototype parity** (after 6A–6C + 6A footer/trust/CTA CSS):
Featured cards show real type/city/languages/availability/verified via
toggles; header has social cluster + utilities + 3-col + drawer; footer
4-col+social; trust circular-icon pillars; CTAs audience-variant; all
links route correctly. No Impronta-only CSS for any of it.

**90% builder usability** (after 6D): an agency owner builds the whole
homepage (header→footer, all sections, variants, media, talent,
categories, links, mobile) entirely through editor UI with pickers +
previews + warnings, no developer, no raw strings, no broken layout/route.

**Page-kit readiness** (after 6E–6F + 6G prereqs): LinkRef shipped; DTO
complete; save+inquiry models live; image-fallback strategy; no-data
empty states for every section; plan gating; kit preview/apply/rollback;
neutral-theme parity validated → a fresh tenant on Free/Studio/Agency can
install a premium kit that renders safe and credible with zero or partial
data.

## 13. What NOT To Do

- ❌ Page kits before DTO/link/editor (6G is last).
- ❌ More one-off Impronta CSS — lift existing hard-coded scoped CSS into
  reusable schema settings instead.
- ❌ Real map system before card/header/link/editor (Decision D).
- ❌ Raw URL fields anywhere new — LinkRef only.
- ❌ A second homepage renderer or a second shell system.
- ❌ Hide missing data with fake placeholders — build empty states +
  fallbacks, keep honesty constraints (no fake talent, no Cancún,
  no "Curated").
- ❌ Dentist/lawyer verticals before the people-directory primitives are
  solid (verticalize via copy/taxonomy/theme, not new components).
- ❌ Touch parked admin-shell files / stashes / other-agent work.
- ❌ Change roster visibility/content to chase parity.

*End of Page Builder Reusability Plan. Planning only — no code, DB,
deploy, or page changes.*

---

# Phase 6A — Featured Card System — EXECUTION LOG (2026-05-18)

First **code** execution against the Reusability Plan. Local-first,
scoped, gated. No deploy. No Page Kit work. No admin-shell / stash /
other-agent files touched.

## Scope delivered

**6A.1 — Render-only premium card polish (DONE)**
- `FeaturedTalentCard.tsx` rebuilt: stronger 3:4 frame, springier media
  reveal, premium hover lift, clearer name → kicker → meta hierarchy,
  a real metadata line, a layout-ready availability slot, and a premium
  `data-card-actions` footer (View profile + Request) with refined
  rhythm. New reusable hooks: `data-card-meta`, `data-card-availability`,
  `data-card-actions`. Initials fallback kept (no silhouette regression).
- `featured-talent.css`: base, token-driven defaults that hold up on a
  **neutral** tenant (no card-family override) — meta line, availability
  chip, action-row divider, carousel snap. Nothing Impronta-specific.
- `token-presets.css`: `editorial-bridal` family repaint for the new
  hooks (scoped to `.site-featured-talent__card` so directory listing
  cards are untouched) — ivory/noir register, stronger lift, premium
  action footer. Token-driven; travels to any tenant on this family.

**6A.2 — Safe partial DTO extension (DONE — direct path only)**
- `FeaturedTalentCardDTO` extended (all new fields **optional** →
  pre-6A constructors / test fixtures unchanged, zero churn):
  `secondaryTalentTypeLabel`, `languages`, `availabilityLabel`,
  `parentCategoryLabel`.
- Direct-query path (`hydrateRows`) now populates **real** data:
  - **secondary type** via `extractSecondaryRoleTerms()` on the taxonomy
    rows *already joined* — no extra query.
  - **languages** via the M8-editorial `talent_profiles.languages TEXT[]`
    column (public-safe display names, trigger-synced) — one column add
    to `FEATURED_TALENT_SELECT`, no join, no cache change.
- Cached-directory path (`projectDirectoryCard`) deliberately leaves the
  new fields empty — **the shared `DirectoryCardDTO` / directory cache
  key is NOT widened** (bounded blast radius, per the plan). The card
  degrades gracefully (omits) rather than rendering fake.
- `availabilityLabel` / `parentCategoryLabel` are wired into the type +
  card layout but **never populated** — no fabricated data.

**6A.3 — Editor toggles made real (DONE)**
- `Component.tsx` forwards `showSecondaryType` / `showLanguages` /
  `showAvailability` to the card.
- `Editor.tsx`: `Secondary type` + `Languages` moved out of the
  disclaimed group (they now render real data). Disclaimer copy
  rewritten — only `Availability *` + `Parent category *` remain
  asterisked (no reliable source yet); honest "never renders
  fabricated data" wording.

## Decisions deferred (intentional, per owner direction)

- **Save heart** → deferred to **6F** (persistence). No fake/disabled
  heart added (kept the card clean rather than show a misleading
  control).
- **Availability pill** → no reliable public source (calendar-derived,
  not a column). Card is layout-ready; pill never rendered.
- **Verified / agency-approved badge** → every featured card is already
  roster-gated + `workflow_status='approved'`, so an always-true badge
  is non-informative noise and there is no real verification model.
  Deferred. The real `isFeatured` "Featured" chip is kept.
- **Parent category** → needs taxonomy-hierarchy plumbing (extra query /
  risk); not prototype-critical (prototype shows the leaf). Toggle
  persists, stays disclaimed.

## Files changed (scoped)

- `web/src/lib/site-admin/sections/featured_talent/fetch.ts`
- `web/src/lib/site-admin/sections/featured_talent/FeaturedTalentCard.tsx`
- `web/src/lib/site-admin/sections/featured_talent/Component.tsx`
- `web/src/lib/site-admin/sections/featured_talent/Editor.tsx`
- `web/src/lib/site-admin/sections/featured_talent/featured-talent.css`
- `web/src/app/token-presets.css` (editorial-bridal family additions only)
- `web/docs/page-builder-impronta-execution-plan-2026-05.md` (this log)

## Data fields now supported on the card

| Field | Source | Direct path | Cache path |
|---|---|---|---|
| name / primary type / city | existing | ✅ | ✅ |
| featured badge | `is_featured` | ✅ | ✅ |
| **secondary type** | taxonomy (already joined) | ✅ real | — (omits) |
| **languages** | `talent_profiles.languages` | ✅ real | — (omits) |
| availability | none yet | layout-ready, never rendered |
| parent category | none yet | layout-ready, never rendered |

## QA result

(see final report — local QA on Impronta homepage)

## Remaining dependencies for 6F (Save / Inquiry Basket)

- DTO is now the right shape for cards; 6F still needs `saved_talent` +
  `inquiry_basket` tables + RLS + header counts + persistence — none of
  which is in 6A scope.
- The card already exposes a clean `requestCta` slot (routes today; no
  persistence) — 6F upgrades it to basket-backed.
- A future `availabilityLabel` source + a verification model remain
  product decisions before those slots light up.

*End of Phase 6A execution log.*

---

# Phase 6B — Header Parity System — EXECUTION LOG (2026-05-18)

Second code milestone against the Reusability Plan. Local-first, scoped,
gated, in an isolated clean worktree off `origin/phase-1`. No deploy. No
DB write. No Featured/Location/LinkKind/page-kit work. No admin-shell /
stash / other-agent files.

## Audit findings (Step 1)

- `site_header` already had: brand (+`brandDisplay`), navItems, primaryCta,
  sticky, tone, variant (`standard|minimal|split|editorial`), `authArea`
  (account/language/discovery), nodePresentation, presentation.
- **`HeaderAuthArea` already renders REAL saved + inquiry** state
  (`getSavedTalentIds()` + discovery tools). Decision: **reuse `authArea`
  for utilities — do NOT build a parallel fake Saved/Inquiry** (honours
  "no fake count / extend, don't parallel"). Persistent models stay 6F.
- `site_footer` already had a proven reusable social pattern
  (`socialSchema` = platform enum + href). Mirrored, not re-invented.
- Real social source = `agency_business_identity.social_*`; contact
  columns `contact_phone/contact_email/whatsapp` exist on that table.
- Editor is auto-bound `ZodSchemaForm` → schema additions auto-generate
  human-labeled controls (`humanize()` splits camelCase).
- Impronta header is **DB-resident** (live variant = `editorial`;
  backfill default = `standard`). Application = controlled-config
  payload, not a code seed.

## Schema / options added (Step 2)

All additive + backward-compatible (defaults leave every existing tenant
byte-identical):
- `variant` enum gains **`editorial-split`** (premium 3-zone agency
  header). Default stays `standard`.
- `socialLinks[]` (max 6) — `{ platform, href, label? }`, platform ∈
  instagram/tiktok/facebook/youtube/linkedin/x/whatsapp. Default `[]`.
- `contactLinks[]` (max 4) — `{ type: phone|email|whatsapp, value,
  label? }`. Default `[]`. Never synthesised.
- `density?` — `{ logoScale, navDensity, verticalPadding,
  mobileMenuStyle }`, all optional; unset ⇒ no data-attr ⇒ existing CSS
  verbatim.

## Component (Step 3) + mobile (Step 4)

- Renders the social/contact cluster only when links exist (empty ⇒
  nothing ⇒ existing tenants unchanged; no awkward empty cluster).
- Inline `currentColor` SVG icon set (7 social + 3 contact + link
  fallback) — no icon dep, no hardcoding, theme-token painted.
- `contactHref()` safely formats owner values (tel:/mailto:/wa.me) —
  formatting only, never invents a number.
- Right-zone wrapped in `.site-header__actions` (default
  `display:contents` ⇒ layout-transparent ⇒ standard/minimal/split/
  editorial byte-identical; `editorial-split` promotes it to a flex
  zone so the brand stays optically centred).
- Density data-attrs emitted only when set.
- Mobile: ≤860/≤720/≤520px collapse rules — contact labels hide to
  icons, nav wraps/centres, ≤520 stacks zones. No horizontal overflow.
  `mobileMenuStyle:"drawer"` reserved → renders as `compact` until a
  client drawer ships (documented follow-up; never breaks).

## CSS / tokens (Step 5)

One reusable `.site-header` + data-attribute block in
`token-presets.css`. Accent always falls back to the ink token →
neutral themes get the same structure with no gold. No Impronta
selector anywhere. standard/minimal/split/editorial rules untouched.

## Editor controls (Step 6)

Auto-bound `ZodSchemaForm` renders the new fields with humanized labels
("Social Links", "Contact Links", "Density", "Logo Scale", …) — chips
for enums (incl. "Editorial split"), array-of-objects rows for the
clusters. `Editor.tsx` value-literal extended for type-completeness;
no raw/dev labels.

## Impronta config (Step 7)

Read-only check of `agency_business_identity` for Impronta
(`00000000-…-0001`): **all `social_*` null; `contact_phone`,
`contact_email`, `whatsapp` all null.** No real social/contact data
exists. Per non-negotiables, nothing invented. Prepared (NOT written —
shared DB + awaiting approval) controlled-config payload:
`variant:"editorial-split"`, empty `socialLinks`/`contactLinks`,
optional density — reversible, with the existing site_header props as
the revert backup. **Owner must provide** to populate the cluster:
Instagram / TikTok / (etc.) URLs, phone, WhatsApp, email.

## QA (Step 8)

Deterministic async render harness (temp, not committed): **3/3** —
(1) standard variant + empty cluster byte-identical (no cluster, no
density attrs, layout-transparent actions wrapper); (2) editorial-split
+ real cluster premium structure (cluster/socials/contacts, safe
mailto, single brand mark, Start Inquiry, density attrs only when set);
(3) brandDisplay=image suppresses the wordmark. The harness is the
authoritative QA: test (1) renders the exact path Impronta's live
config uses (variant set, empty cluster, no density) and proves it is
byte-identical → no regression for the live tenant. A worktree dev
server for a full-page visual was attempted but Turbopack rejects the
symlinked `node_modules` ("points out of the filesystem root") — an
environmental limitation of the speed optimization, not a code defect
(tsc/eslint/tsx all resolve it fine). Real-host visual of
`editorial-split` belongs in the post-approval deploy preview
(consistent with the no-deploy-until-approved rule).

## Gates (Step 9)

`tsc --noEmit` 0 (after extending the one SiteHeaderV1 test fixture);
focused eslint on the 3 changed `site_header` files clean;
`node-presentation-render` 42/44 — the 2 failures are the **pre-existing
site_header/site_footer async-Component-vs-sync-renderToStaticMarkup
harness** issue (site_footer is untouched by 6B and fails identically →
proof it is not a 6B regression).

## Files changed (scoped)

- `web/src/lib/site-admin/sections/site_header/schema.ts`
- `web/src/lib/site-admin/sections/site_header/Component.tsx`
- `web/src/lib/site-admin/sections/site_header/Editor.tsx`
- `web/src/app/token-presets.css` (one additive Phase 6B block)
- `web/src/lib/site-admin/sections/node-presentation-render.test.ts`
  (fixture extended for the two new defaulted array fields)
- `web/docs/page-builder-impronta-execution-plan-2026-05.md` (this log)

## Deferred to 6F

Persistent saved/inquiry models + counts. The header surfaces the
existing real `authArea` discovery widget today; no new counts, no fake
state. WhatsApp/phone/social population is owner-data-gated, not 6B.

*End of Phase 6B execution log.*

---

# 🔴 URGENT — PHASE 6C IN PROGRESS · FOUNDATION SHIPPED BUT **NOT WIRED** · RESUME HERE (2026-05-19)

> **DO NOT LOSE / DO NOT REBUILD.** The 6C foundation is committed and
> tested but is **inert** — no section uses it yet, so nothing changed
> functionally on any page. A future agent must (a) NOT re-create the
> foundation, and (b) finish the wiring slice below to make it real.
> This section is the single source of truth for 6C state.

## What is DONE (committed, durable, gated)

Commit **`b646c7657`** on `phase-1` — *"feat(6C): LinkRef model +
resolveLinkRef single-source resolver (foundation)"* — 3 files, 433
insertions, **tsc 0 / eslint 0 / 15-of-15 tests pass**:

- `web/src/lib/site-admin/links/link-ref.ts` — `LinkRef
  {kind,value?,label?,external?,openInNew?}` zod schema + 13 kinds
  (plan §7); `coerceLegacyHref()` (legacy string → structured,
  auto-upgrades `/login`,`/talent/register`,… to safe
  `platform-auth-*` kinds); `linkRefOrLegacy` / `optionalLinkRefOrLegacy`
  zod unions (schemas accept BOTH a `LinkRef` object AND a legacy string).
- `web/src/lib/site-admin/links/resolve-link-ref.ts` —
  `resolveLinkRef(ref,{pathPrefix,tenantId,appHostOrigin})` +
  `resolveLinkLike(stringOrRef,ctx)`. Pure/sync/deployment-agnostic.
  `platform-auth-*` resolve **ROOT, never tenant-prefixed** (the
  structural Finding-B fix). app-dashboard degrades to root path if no
  origin. Reuses `prefixPublicHref` for tenant-scoped kinds.
- `web/src/lib/site-admin/links/resolve-link-ref.test.ts` — 15 tests,
  every kind × path-based + host-based, explicit Finding-B assertions.
  Run: `npx tsx --test src/lib/site-admin/links/resolve-link-ref.test.ts`

## STATUS UPDATE 2026-05-19 — Finding B FIXED (first wiring slice landed)

Commit **`8e3f5cb8d`** *"fix(6C): kill Finding-B globally"*: exported
`isPlatformAuthPath()` (single source of truth) + hardened
`prefixPublicHref` (leaf, `src/lib/saas/public-hrefs.ts`) to return
ROOT `(auth)` paths unchanged. One surgical guard → fixes every
section + the deep walker + shell at once. **Verified live on
path-based `/impronta`** (Chrome + DOM): Talent CTAs emit root
`/login` `/register`; ZERO `/impronta/login|register`; tenant pages
still correctly prefixed; no regression. Tests 17/17, tsc 0, eslint 0.

**Finding B (the live route-safety bug) is RESOLVED.** The remaining
6C work below is now a NORMAL-priority enhancement, no longer an
urgent live-bug fix.

## STATUS UPDATE 2026-05-19 (b) — LinkKindPicker + cta_banner pilot SHIPPED

- `2cf124a93` **LinkKindPicker** editor primitive — emits structured
  `LinkRef` (13 kinds, grouped; coerceLegacyHref adoption of legacy
  strings). Self-contained.
- `d8edec488` **cta_banner wired end-to-end** (the proven repeatable
  pattern): schema `href`→`linkRefOrLegacy`; Component →
  `resolveLinkLike(href,{pathPrefix,tenantId})`→`<Cta href newTab>`;
  Editor `LinkPicker`→`LinkKindPicker`; type fallout fixed (3
  node-presentation fixtures + 1 prototype). Verified live on
  path-based `/impronta` (DOM): Talent CTA→ROOT `/register`/`/login`,
  Client CTA→`/impronta/contact`, zero wrongly-prefixed, no regression.
  Gates tsc 0 / eslint 0 / link 17/17 / node-presentation 42/44
  (the 2 = pre-existing site_header/footer async-harness, unchanged).

### THE REPEATABLE PATTERN (apply to each remaining section)
1. `schema.ts`: import `linkRefOrLegacy` from `../../links/link-ref`;
   change the href field(s) `z.string()…` → `linkRefOrLegacy` (or
   `optionalLinkRefOrLegacy`).
2. `Component.tsx`: `import { resolveLinkLike } from
   "@/lib/site-admin/links/resolve-link-ref"`; destructure
   `tenantId, publicPathPrefix`; `const L = resolveLinkLike(href,
   {pathPrefix: publicPathPrefix ?? "", tenantId})`; render
   `href={L.href}` + `newTab/target` from `L.openInNew`.
3. `Editor.tsx`: `LinkPicker`→`LinkKindPicker`; string defaults →
   `coerceLegacyHref("/…")`.
4. Fix inferred-type fallout (Editor defaults + any `*V1` fixtures in
   `node-presentation-render.test.ts` / prototype pages → explicit
   `{kind:"tenant-page",value:"/…"}`).
5. Gate (tsc 0 / eslint / tests) + clean `.next` restart + DOM-verify
   the section's links on `/impronta` + scoped commit. (Stale `.next`
   shows a false auth-prefix regression — always clean-restart before
   judging the live render.)

### REMAINING sections to migrate (mechanical, de-risked)
`site_header` (navItems, primaryCta) · `site_footer` (columns.links,
social) · `anchor_nav` (links) · `editorial_split_hero` (CTAs) ·
`location_discovery` (ctaHref/items.href) · `hero_search` /
`hero` / `talent_type_grid` / `values_trio` / any other `*Cta`/`href`
fields. The auth-prefix guard already protects ALL of them from the
live Finding-B 404; this migration adds the structured editor + the
richer kinds. NORMAL priority.

## ⚠ The blocker the wiring slice MUST solve (verified pipeline finding)

`prefixPublicHrefsDeep` runs on the **raw stored payload BEFORE the
section Component renders**, with no zod-transform in between:

- `web/src/components/home/homepage-cms-sections.tsx:299`
  → `payloadForRender = prefixPublicHrefsDeep(migrated.payload, publicPathPrefix)`
- `web/src/components/site-shell/PublishedShell.tsx:188`
  → `props = prefixPublicHrefsDeep(slot.props, publicPathPrefix)`

It blindly tenant-prefixes any string under keys `href|ctaHref|rsvpUrl|
brandHref` (`web/src/lib/saas/public-hrefs.ts`). So a Component-only OR
schema-only wiring **will not fix Finding B** — `/register` is already
mutated to `/impronta/register` before the Component sees it. The
wiring slice must reconcile/retire this global pre-mutator so
`resolveLinkRef` becomes the single resolution point.

## ▶ NEXT SLICE — exact steps to make 6C real (its own scoped task)

1. **Stop the pre-mutator from clobbering structured links.** In
   `prefixPublicHrefsDeep` (or at both call sites) skip values that are
   `LinkRef` objects (have a `kind` in `LINK_KINDS`); leave legacy
   strings alone there and resolve them at the Component instead.
   Preferred end state: retire `prefixPublicHrefsDeep` for link fields
   entirely; Components own resolution via `resolveLinkRef`.
2. **Pilot section = `cta_banner`** (the Finding-B locus: impronta-home
   recipe `primaryCta:/register`, `secondaryCta:/login`):
   - `sections/cta_banner/schema.ts`: `ctaSchema.href` → `linkRefOrLegacy`.
   - `sections/cta_banner/Component.tsx`: destructure `tenantId,
     publicPathPrefix`; render `resolveLinkLike(cta.href,{pathPrefix:
     publicPathPrefix??"",tenantId})` → pass `.href/.external/.rel/
     target` to `<Cta>`. (Component may need `async` +
     `await getCanonicalAppHostOrigin()` only if app-dashboard links are
     used — not for impronta-home.)
   - Editor: keep existing `LinkPicker` for now (writes legacy string →
     coerced); the structured `LinkKindPicker` UI is a 6D-adjacent
     follow-up.
3. **Gate**: `npx tsc --noEmit && npm run lint` + the resolver tests.
4. **SSR-verify Finding B fixed**: on path-based `/impronta`,
   cta_banner Talent CTAs emit root `/register` `/login` (NOT
   `/impronta/register` → 404). Then roll the same pattern to the other
   link-bearing sections (hero*, header, footer, anchor_nav, …).
5. Acceptance (plan §12): all CTAs/nav route correctly across
   host/path/domain/auth; legacy compositions unbroken.

## Do-not-duplicate

The `LinkRef` model + resolver + tests already exist and are correct.
**Build ON them.** Do not author a second link system. The only
remaining work is the pipeline reconciliation + per-section wiring above.

*End of 6C urgent handoff.*

---

## ✅ 6C STATUS UPDATE — 2026-05-19 (supersedes the "NEXT SLICE" above)

The "NEXT SLICE" plan above is **done and superseded**. Actual state:

**Foundation + GLOBAL Finding-B fix — SHIPPED & verified live**
- `8e3f5cb8d` — `prefixPublicHref` skips auth paths via `isPlatformAuthPath`
  (single source of truth in `links/link-ref.ts`). Because
  `prefixPublicHrefsDeep` calls `prefixPublicHref` at the leaf, this fixes
  Finding B **globally — every section AND the shell** — with no
  per-section work. Verified on `/impronta`: `/register`,`/login` stay
  ROOT; tenant paths still prefix.
- `2cf124a93` — `LinkKindPicker` structured-LinkRef editor primitive.
- Model/resolver/tests (`links/link-ref.ts`, `links/resolve-link-ref.ts`)
  green: resolve-link-ref 17/17.

**Per-section LinkRef rollouts — each gated + DOM-verified on `/impronta`,
committed LOCAL-ONLY (no push/Vercel, per standing instruction):**

| # | Section | Commit |
|---|---------|--------|
| 1 (pilot) | cta_banner | `d8edec488` |
| 2 | editorial_split_hero | `f7cfc55c3` |
| 3 | location_discovery | `bdae95e6b` |
| 4 | talent_type_grid (+ bespoke edit-chrome inspector + preset literal) | `cd105f857` |
| 5 | hero_search (CTAs + chips; `search.actionHref` stays string form-action) | `adfb44b15` |

Repeatable pattern: schema href → `linkRefOrLegacy` /
`optionalLinkRefOrLegacy`; Component drop `prefixPublicHref`/`pfx`, add
`const linkCtx={pathPrefix:publicPathPrefix??"",tenantId}`, resolve via
`resolveLinkLike`, render `href`/`newTab`; hand-written Editor
`LinkPicker`→`LinkKindPicker`, string defaults → `coerceLegacyHref(...)`;
fix inferred-output-type fallout (presets/fixtures/inspectors → explicit
LinkRef literals); gate (tsc 0 · eslint 0 · node-presentation 94/96
[#43/#44 = pre-existing async-harness, not regressions] · resolve-link-ref
17/17); `rm -rf web/.next` clean-restart :3000; DOM-verify; scoped commit.

### Shell (site_header / site_footer) — #6: route-safety DONE; structured-editor upgrade is a GATED FOLLOW-ON. **Do NOT naive-migrate.**

Finding B is **already fully fixed for the shell** (global leaf guard).
Verified live on `/impronta`:
- header brand → `/impronta`; nav → `/impronta/{directory,about,contact}`;
  `/register` → ROOT
- footer columns → `/impronta/{directory,contact,about}`;
  `/register`,`/login` → ROOT
- zero `/impronta/<auth>` anywhere

The remaining shell delta is the structured-LinkRef **editor** model only.
It is **not** a clean rollout-#1–#5-style change because:
- Both shell Editors are driven by the **shared generic `ZodSchemaForm`**
  (`sections/shared/ZodSchemaForm.tsx`), not a per-field `LinkPicker`. It
  renders `hint:"href"` string fields via legacy `LinkPicker` (~line 116).
  A `linkRefOrLegacy` (transformed union) is not a primitive `z.string()`;
  `ZodSchemaForm`'s kind detection (`text/url/.../object`) would fail to
  render an editable control → **breaks nav/column/legal link editing
  across the shell** (forbidden feature regression).
- Correct fix = teach **`ZodSchemaForm`** to detect a LinkRef-union field
  and render `LinkKindPicker` (round-tripping a `LinkRef`). `ZodSchemaForm`
  is shared by many auto-bound editors → its own broad, carefully-tested
  phase. (Alt: rewrite both shell Editors to hand-written LinkKindPicker
  forms — a large rewrite of two complex editors.)

Proven-safe architecture for the eventual wiring (analysis done — recorded
so it is not re-derived):
- `prefixPublicHrefsDeep` only rewrites string values under keys
  `href|ctahref|rsvpurl|brandhref`; a `LinkRef`'s payload is under key
  `value` → **untouched** (no double-prefix). `prefixPublicHref` is
  **idempotent** (already-prefixed guard). So legacy-string AND
  LinkRef-object both resolve correctly through the existing pipeline once
  Components call `resolveLinkLike`.
- `PublishedShell.tsx:188` has `publicPathPrefix` but does NOT pass it to
  shell Components (deep-prefixer consumes it). `SectionComponentProps`
  already has optional `publicPathPrefix`. Wiring: add
  `publicPathPrefix={publicPathPrefix}` to the shell `<Comp/>`; Components
  destructure it + `resolveLinkLike(linkCtx)`.
- Scope when unblocked: migrate ONLY internal-routable `linkSchema.href`
  (navItems / footer columns / legal links / `brand.href` / primaryCta).
  Leave `socialLinkSchema.href` + `contactLinkSchema.value` as strings
  (external / `tel:` / `mailto:`; `EXTERNAL_OR_SPECIAL_HREF` guard; zero
  Finding-B relevance; migrating = churn w/ sitewide risk, no benefit).
- File surface: `ZodSchemaForm.tsx` (LinkRef support — prerequisite) ·
  `site_header/{schema,Component,Editor}.tsx` ·
  `site_header/EditorialSplitActions.tsx` (keep string interface — resolve
  at Component boundary) · `site_footer/{schema,Component,Editor}.tsx` ·
  `PublishedShell.tsx` (+1 line) · fixtures
  `sections/node-presentation.test.ts` + `node-presentation-render.test.ts`
  (#43/#44 shell). `default-content.ts` is `Record<string,unknown>`
  (loose) → NO fallout. `registry.ts` only wires generics → no fallout
  (gate confirms).
- COORDINATION: another agent is mid-flight uncommitted in `registry.ts`,
  `registry-editors.ts`, `shared/default-content.ts`. The shell phase
  shares the section-registry neighborhood — sequence it when that settles
  to avoid shared-branch collision.

Acceptance unchanged (plan §12). Resolver/model/tests are correct — build
ON them; no second link system.

*End 6C status 2026-05-19.*

---

## ✅ 6C STATUS UPDATE 2 — 2026-05-19 (rollouts #6–#7 + gate fix)

**Two more per-section rollouts shipped (local-only, gated + verified):**

| # | Section | Commit |
|---|---------|--------|
| 6 | featured_talent (requestCta + footerCta; presets→LinkRef literals; requestCta resolved at the FeaturedTalentCard boundary, card's prefixPublicHref now an idempotent no-op) | `c72371795` |
| 7 | hero (categoryChips + primaryCta + secondaryCta; `search.actionHref` stays string; hand-written Editor chip input→LinkKindPicker, `patchCategoryChip` no longer `.trim()`s href; fixtures→LinkRef literals) | `6b38beaca` |

Per-section LinkRef rollouts complete: **#1 cta_banner · #2
editorial_split_hero · #3 location_discovery · #4 talent_type_grid ·
#5 hero_search · #6 featured_talent · #7 hero** — every hand-written /
non-shared-kit-Editor section migrated, each gated + verified, all
local-commit-only (no push/Vercel).

### ⚠ GATE-RELIABILITY FIX (do this or tsc lies)

`npx tsc --noEmit` (and `npm run typecheck`) is **poisoned by the
running dev server**: Next regenerates a transient corrupt
`.next/dev/types/routes.d.ts` (TS1005 / unterminated template) that
makes tsc's diagnostics for real source files unreliable — it masked a
live `prefixPublicHref is not defined` ReferenceError in featured_talent
(caught only by the DOM check). **Authoritative gate =** stop the :3000
dev server + `rm -rf web/.next` + THEN `npx tsc --noEmit`. Filtering
`.next/` lines out of poisoned output is NOT sufficient. Always
clean-gate before trusting tsc; always DOM/render-verify too.

### Shared-kit follow-on now spans BOTH primitives

The gated structured-editor follow-on is **two shared primitives**, not
one:
- `ZodSchemaForm` (drives site_header / site_footer / anchor_nav
  auto-bound editors)
- `CtaDuoEditor` + its `CtaShape` in `edit-chrome/inspectors/kit`
  (drives the bespoke featured_talent + hero + talent_type_grid Content
  inspectors)

For #6/#7 the bespoke inspectors stay on the coerced-legacy-string path
(loosely typed `Record<string,unknown>` → no tsc fallout;
backward-compatible; Finding-B-safe via the global guard). Teaching
`CtaDuoEditor`/`ZodSchemaForm` to emit/round-trip `LinkRef` is the
one remaining shared-kit phase — sequence it (with the shell + anchor_nav
schema migrations) after the concurrent directory-section agent's
in-flight `registry.ts` / `default-content.ts` / `registry-editors.ts`
settle.

### ⚠ Pre-existing tree breakage (NOT 6C)

Whole-tree `tsc` currently also reports
`src/lib/site-admin/server/onboard-directory-page.ts(175): Type 'string'
is not assignable to '"en"|"es"'`. That file is **UNTRACKED** — the
concurrent directory-section agent's in-flight work, a locale typing
issue unrelated to LinkRef. Out of 6C scope and not stageable per branch
governance; integration/that agent must resolve it. All 6C-owned files
are tsc-clean.

*End 6C status 2 — 2026-05-19.*

---

## ✅✅ 6C COMPLETE — 2026-05-19 (shared-kit phase shipped)

**Phase 6C is fully done.** Every link-bearing section AND every editor
surface (hand-written · ZodSchemaForm auto-bound · bespoke kit
inspector) now uses the structured `LinkRef` model + single-source
`resolveLinkRef`. The global Finding-B fix is verified live across body
sections + shell.

Shared-kit phase commits (all local-only — no push/Vercel):

| Part | What | Commit |
|------|------|--------|
| A | `ZodSchemaForm` `@linkref`→`kind:"link_ref"`→`LinkKindPicker` (precise; plain z.string() href untouched) | `c8f7d3b3e` |
| C | `site_footer` schema+Component (columns/legal) | `b9e3638a4` |
| D | `site_header` schema+Component (nav/primaryCta/brand; renderRightZone+EditorialSplitActions keep string interface via boundary-resolve) | `9bc554fed` |
| E | `anchor_nav` schema+Component | `8addd5519` |
| B | `CtaDuoEditor` (kit) → `LinkKindPicker`; `CtaShape.href: LinkRef\|string` | `e24f20a79` |

Key architecture notes (so it isn't re-derived):
- `PublishedShell.tsx:258` **already passes** `publicPathPrefix` to shell
  Comps — no shared-infra plumbing was needed. The deep-prefixer
  (`prefixPublicHrefsDeep`) only rewrites string `href`-keyed values;
  `LinkRef.value` is under a `value` key → untouched. `prefixPublicHref`
  is idempotent. So legacy-string AND structured LinkRef both resolve
  correctly through the unchanged pipeline.
- `socialLinks.href` / `contactLinks.value` (shell) deliberately stay
  strings — external / `tel:` / `mailto:`, `EXTERNAL_OR_SPECIAL_HREF`
  guard, zero Finding-B relevance. `ZodSchemaForm` renders them with the
  legacy string `LinkPicker` (the `hint:"href"` branch) while migrated
  fields get `LinkKindPicker` — precise, no collateral.
- Bespoke inspectors (featured-talent/hero/talent-type-grid -content)
  are loosely typed `Record<string,unknown>` + casts → CtaShape widening
  caused zero tsc fallout.

Final certification gate (authoritative — dev stopped + `.next`
cleared): **tsc 0 whole-tree** · **eslint 0 errors** · resolve-link-ref
**17/17** · node-presentation **94/96** (the 2 = the documented
pre-existing #43/#44 async-`renderToStaticMarkup` harness limitation;
their fixtures are now LinkRef-shaped + tsc-valid — NOT 6C regressions).
DOM-verified on `/impronta`: body sections + header + footer all resolve
tenant paths prefixed, `/login`+`/register` ROOT, zero `/impronta/<auth>`.

Pre-existing/baseline (NOT 6C): builder-capabilities #11/#14/#15 fail
with `Cannot find module 'server-only'` (tsx --test harness/env) —
verified identical with all 6C work stashed. The earlier
`onboard-directory-page.ts` locale error has cleared from the tree.

**Nothing pushed or deployed** (per standing instruction). Branch is
local-ahead of `origin/phase-1`; integration (rebase + re-verify) is a
pre-push step, owner-gated.

*End — 6C COMPLETE 2026-05-19.*
