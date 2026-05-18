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
