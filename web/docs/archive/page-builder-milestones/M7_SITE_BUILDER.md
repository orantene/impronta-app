# M7 — Site-Builder Foundation

**Status**: phase 1 of a multi-phase conversion of Muse Bridal from a static
prototype into a dynamic admin-controlled site-building system.

This doc reports what shipped, what's now admin-controlled, what remains
intentionally hardcoded (and why), and the natural extension seams for
future prototype families.

---

## 1. New admin capabilities

| Capability | Where | Controls |
| --- | --- | --- |
| **Theme preset picker** | `/admin/site-settings/design` → top card | Apply a whole design system in one click (Classic / Editorial Bridal). Merges preset token bundle into draft; preserves orthogonal overrides (logo, custom primary, etc.). Tracks active preset via `theme_preset_slug`. |
| **Grouped token editor** | `/admin/site-settings/design` → lower card | All 29 tokens now surface, grouped by concern (Brand colors / Editorial colors / Typography / Shape / Motion / Density / Icons / Site shell / Page background). Each token shows description hint, draft value, live value, default value. |
| **Re-apply preset** | Preset card "Re-apply" button | One click to reset all preset-governed tokens to the preset defaults after experimenting — without wiping logo, favicon, or any custom token an operator has set outside the bundle. |
| **Audit log** | Existing audit table | Preset applications log under `agency.site_admin.design.edit` with `applied preset "editorial-bridal" → draft (29 tokens)`. |

The existing Save Draft / Publish / Revision Restore flow is unchanged —
preset application lands in draft and respects the same CAS + capability +
revision discipline.

---

## 2. What's now a tenant-level Theme Setting

Everything in §2 lives in `theme_json` and `theme_json_draft` on
`agency_branding`. Every value is governed by the registry in
`src/lib/site-admin/tokens/registry.ts` and validated at every save.

### 2.1 Colors (10 slots)

- `color.primary`, `color.secondary`, `color.accent`, `color.neutral`,
  `color.background` (existing M6)
- **New**: `color.blush`, `color.sage`, `color.ink`, `color.muted`,
  `color.line`, `color.surface-raised`

Every color projects to a CSS custom property (`--token-color-*`) on the
root element via `designTokensToCssVars()`. Components can consume them
without knowing which preset is active.

### 2.2 Typography (5 controls)

- `typography.heading-preset`: `sans | serif | display | editorial-serif`
  (Fraunces now registered as a first-class preset font)
- `typography.body-preset`: `sans | serif | refined-sans`
- `typography.label-preset`: `uppercase-tracked | italic-serif | sans-bold`
- `typography.scale-preset`: `compact | standard | editorial`
- `typography.tracking-preset`: `tight | normal | editorial`

### 2.3 Shape & feel (3 controls)

- `radius.base`: `none | sm | md | lg` (existing)
- `radius.scale-preset`: `sharp | soft | pillowy | pill` (**new** — whole-scale feel)
- `shadow.preset`: `none | crisp | soft | ambient` (**new**)

### 2.4 Motion (1 control)

- `motion.preset`: `none | snappy | refined | editorial` (**new**) —
  flips CSS-variable timing and easing for every storefront transition. All
  presets respect `prefers-reduced-motion`.

### 2.5 Density (3 controls)

- `spacing.scale`: `compact | cozy | comfortable | editorial` (existing + `editorial`)
- `density.section-padding`: `tight | standard | airy | editorial` (**new**)
- `density.container-width`: `narrow | standard | wide | editorial` (**new**)

### 2.6 Icons (1 control)

- `icon.family`: `lucide | editorial-line | geometric` (**new**) —
  ready for a future icon-renderer component that consumes it.

### 2.7 Page background (1 control)

- `background.mode`: `plain | aurora | editorial-ivory | champagne-gradient | noise-texture` (**new**)

`editorial-ivory` also **bridges** the legacy `--impronta-*` and shadcn
`--background/--primary/--secondary` vars so existing storefront components
repaint without a component-by-component rewrite.

---

## 3. What's now a Site-Shell Setting

Still in `theme_json` but grouped under Site shell in the admin UI:

- `shell.header-variant`: `classic-solid | editorial-sticky | espresso-column | centered-editorial | minimal`
- `shell.header-sticky`: `on | off`
- `shell.header-transparent-on-hero`: `on | off`
- `shell.footer-variant`: `classic-minimal | espresso-column | ivory-minimal | serif-editorial`
- `shell.mobile-nav-variant`: `drawer-right | full-screen-fade | sheet-bottom`

Each is set as a `data-token-shell-*` attribute on `<html>` by the resolver.
Storefront CSS in `src/app/token-presets.css` targets these attrs and
flips styles on the `.public-header` element. Additional header/footer
Component variants can be ship incrementally — the data is already wired.

---

## 4. What became a CMS Section Type

Two new section types registered in `SECTION_REGISTRY` this sprint. Both
follow the locked pattern (`schema.ts` / `migrations.ts` / `meta.ts` /
`Component.tsx` / `Editor.tsx`) so they ship end-to-end: server render +
admin editor + Zod-gated save + audit/revision inheritance.

### 4.1 `trust_strip`

Editorial positioning band. Fields:
- Content: `eyebrow`, `headline`, `items[] { label, detail, stat }` (max 6)
- Presentation: `variant` (`icon-row | metrics-row | logo-row`),
  `background` (`neutral | ivory | champagne | espresso`), `density`
  (`tight | standard | airy`)

### 4.2 `cta_banner`

Emotional conversion block. Fields:
- Content: `eyebrow`, `headline`, `copy`, `reassurance` (italic),
  `primaryCta`, `secondaryCta`, `backgroundMediaAssetId` /
  `backgroundImageUrl`
- Presentation: `variant` (`centered-overlay | split-image | minimal-band`),
  `imageSide`, `bandTone` (`ivory | champagne | espresso | blush`),
  `overlayOpacity` (0–100), `insetCard` (bool)

Both are fully styled via the token CSS (`.site-trust-strip`,
`.site-cta-banner` + child classes) so they inherit the active theme
automatically. Both appear under the homepage composer's section picker
(`listAgencyVisibleSections()`) once a homepage slot permits them.

---

## 5. Template-variant infrastructure

**Status**: data layer only, render still single-family.

- The token system now supports a `shell.header-variant` /
  `shell.footer-variant` / `shell.mobile-nav-variant` axis with named
  variants. Current `PublicHeader` / `PublicCmsFooterNav` components react
  to the `data-token-shell-header-*` attrs via CSS but haven't been split
  into per-variant Components yet — promoting them is a 2–3-day follow-up,
  not a blocker for this phase.
- Directory card and Profile page template families are **not yet wired**.
  Next sprint.

---

## 6. Profile field support

**Not extended in this sprint.** The existing profile schema still drives
directory + profile pages. The Muse Bridal prototype under
`/prototypes/muse-bridal/*` stays the reference spec for what fields a
"service professional" family should support; the real schema extension is
one of the next three sprints.

Design spec is already written — see
`/web/src/app/prototypes/muse-bridal/SYSTEMIZATION.md` §6 for the full
column-level proposal (team_size, lead_time_weeks, starting_from,
booking_note, destinations[], event_styles[], languages[],
embedded_media[]).

---

## 7. What remains intentionally hardcoded

These are on purpose, not oversights:

- **Logo, favicon, OG image** stay in M1 `agency_branding` columns — out of
  `theme_json`. They're media assets with their own upload lifecycle;
  bundling them into a preset doesn't make sense (a preset shouldn't stomp
  a tenant's logo).
- **Inquiry engine wiring** — the prototype's contact form submits a mock
  response. When a tenant uses `cta_banner` → `/contact`, the live
  inquiry engine takes over (`submitInquiry()`). This is intentional: the
  content is CMS, the submission pipeline is platform code.
- **Directory card layout + Profile page layout** — still single-family.
  Keeping them hardcoded this sprint was a scope call; they're the biggest
  single refactor left on the roadmap.
- **Section Component render decisions below the data-attr layer** —
  button hover animation, image zoom on card hover, etc. — live in CSS and
  aren't admin-surfaced. Exposing every CSS value would make admin
  impenetrable; presets remain the right abstraction here.
- **Talent image lifestyle reel** (`resolveStorefrontLifestyleSlides`)
  stays hardcoded per tenant for now. It uses curated image sets that
  belong in a media-asset CMS, not a token. Migrating this to a CMS
  media-collection is the next `hero` section extension.

---

## 8. How close admin can now get to the prototype

**Today, from the admin dashboard alone:**
- ✅ Select "Editorial Bridal" preset → entire storefront shifts to
  Muse Bridal register (ivory canvas, serif headings, pillowy radii,
  refined motion, sticky-transparent header, espresso-column footer).
- ✅ Fine-tune any of the 29 exposed tokens (palette, typography, shape,
  motion, density, icons, shell).
- ✅ Add `trust_strip` and `cta_banner` sections to the homepage via the
  existing CMS section picker (when composer surfaces them — composer
  slot config update in the next step below).
- ✅ All changes respect draft → publish → revision history discipline.
- ✅ Live proof point: Midnight tenant (`midnight.local:3106`) is currently
  running Editorial Bridal — the full storefront repainted without any
  tenant-specific code change.

**Not yet reproducible from admin alone:**
- Editorial directory card family (Muse uses a portrait-ratio ribboned
  card; Midnight still renders the classic directory card).
- Editorial profile page layout family.
- Muse's specific section compositions (trust strip with 4 items, services
  grid with 8 categories, testimonials trio with blush accent, destinations
  portrait-mosaic, final-CTA with image-inset card). Two of these have
  section registrations; the remaining three (`category_grid`,
  `destinations_mosaic`, `testimonials_trio`) follow the exact same pattern
  — mechanical ~2-hour each.
- Homepage composer slot allowlist doesn't yet list the two new sections
  (config-only change).

**Gap closure estimate:** a full reproduce-from-admin is ≈2 further sprints
— one for the three remaining section types + composer config, one for the
directory/profile template families.

---

## 9. Extensibility for future prototypes

The infrastructure is deliberately pattern-based, not bridal-specific:

### Adding a new theme family (e.g. "Creator / Social", "Wellness / Calm",
"Staffing / Operational"):

1. Append an entry to `THEME_PRESETS` in
   `src/lib/site-admin/presets/theme-presets.ts` — bundle of token values.
2. If the family needs a new enum value on an existing token (e.g. a new
   `background.mode` like `gradient-radial-accent`), add the value to the
   token validator in `registry.ts` and a matching selector block in
   `token-presets.css`.
3. Preset-registry integrity validator runs at module load — typos fail
   the build, not the render.

Zero DB migration required. No admin UI work — the picker auto-renders the
new preset card.

### Adding a new section type:

1. Create `src/lib/site-admin/sections/<slug>/` with
   `schema.ts` / `meta.ts` / `migrations.ts` / `Component.tsx` / `Editor.tsx`
   (follow the `trust_strip` or `cta_banner` copy-paste path).
2. Register in `sections/registry.ts`.
3. Done. `ALL_SECTION_TYPE_KEYS` is derived from the registry, audit
   discipline is inherited, admin section picker auto-lists it.

### Adding a new header / footer / mobile-nav variant:

1. Add the variant value to the enum in `registry.ts`
   (e.g. `shell.header-variant: ... | "floating-pill"`).
2. Add a CSS rule block in `token-presets.css` keyed to
   `html[data-token-shell-header-variant="floating-pill"] .public-header`.
3. If the variant needs a different internal layout (not just styling),
   split `PublicHeader` into a variant-switch component that reads the
   active variant and renders a variant-specific subtree.

### Adding a new directory-card / profile-page family:

Still needs the parent template-family infrastructure that hasn't been
built. The token system is ready for it (template-family selection is a
natural shell-level token — `template.directory-card-family`,
`template.profile-layout-family`). Follow-up sprint.

---

## Files changed this sprint

```
supabase/migrations/20260628120000_saas_m7_theme_presets.sql     [new]
src/lib/site-admin/tokens/registry.ts                            [extended: 9 → 29 tokens]
src/lib/site-admin/tokens/resolve.ts                             [extended: + 6 color vars, + 15 data-attrs]
src/lib/site-admin/presets/theme-presets.ts                      [new]
src/lib/site-admin/sections/trust_strip/*                        [new]
src/lib/site-admin/sections/cta_banner/*                         [new]
src/lib/site-admin/sections/registry.ts                          [+ 2 sections]
src/lib/site-admin/server/design.ts                              [+ applyThemePreset + preset_slug plumbing]
src/lib/site-admin/server/reads.ts                               [+ theme_preset_slug column]
src/lib/site-admin/server/branding.ts                            [BrandingRow + theme_preset_slug]
src/lib/site-admin/index.ts                                      [export presets + grouped tokens]
src/app/(dashboard)/admin/site-settings/design/page.tsx          [+ preset picker]
src/app/(dashboard)/admin/site-settings/design/design-editor.tsx [grouped tokens + metadata]
src/app/(dashboard)/admin/site-settings/design/theme-preset-picker.tsx  [new]
src/app/(dashboard)/admin/site-settings/design/actions.ts        [+ applyThemePresetAction]
src/app/token-presets.css                                        [new — 470 lines of token-driven CSS]
src/app/globals.css                                              [+ @import token-presets.css]
src/app/layout.tsx                                               [+ Fraunces font]
```

Zero files removed. All M6 flows still valid. Classic preset exactly matches
the pre-M7 platform defaults so existing tenants observe no visual change.
