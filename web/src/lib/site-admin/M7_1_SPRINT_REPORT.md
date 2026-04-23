# M7.1 — Directory + Profile Family + Section Expansion

**Status**: foundation shipped, Midnight tenant proven live in Editorial
Bridal register across storefront + directory without tenant-specific
frontend code.

---

## What shipped this sprint

### 1. Template family tokens (new dimension)

Two new registry tokens, both agency-configurable + grouped under "Template
families" in the admin design editor:

| Token | Default | Values |
| --- | --- | --- |
| `template.directory-card-family` | `classic` | `classic`, `service-professional`, `editorial-bridal` |
| `template.profile-layout-family` | `classic` | `classic`, `service-professional`, `editorial-bridal` |

Both project to `data-token-template-*-family` attributes on `<html>`.
Storefront CSS reads the attribute and repaints per family. No DB schema
migration — the values live inside `theme_json`.

**Extension point**: adding a new family (e.g. `creator-social`,
`wellness-calm`, `staffing-ops`) is a registry enum addition + a CSS block
+ optional Component override. Zero migrations.

### 2. Directory card family — editorial-bridal variant

`TalentCard` component gained stable data-attrs (`data-card-media`,
`data-card-body`, `data-card-name`, `data-card-kicker`, `data-card-chip`,
`data-card-ribbon`) plus the namespace class `.talent-card`.

Editorial-bridal CSS rules in `token-presets.css` repaint:
- Background → ivory surface-raised (instead of dark gradient)
- Overlay → soft espresso scrim (instead of hard black)
- Name → editorial serif (Fraunces), non-uppercase
- Chips → champagne pill with espresso text (instead of gold-on-black)
- Body → ivory with editorial padding
- Radii → pillowy + site-level radius scale

Classic family keeps the original gold-on-black presentation.

### 3. Profile layout family — editorial-bridal scaffold

`data-token-template-profile-layout-family="editorial-bridal"` now sets a
soft champagne-to-transparent hero background on `.public-profile-hero`.
Full layout variant (portrait hero + specialties block + packages card +
sticky inquiry bar + related pros) is the next sprint — the data plane is
live now.

### 4. Three new CMS section types (6 total now)

Registered in `SECTION_REGISTRY`:

| Key | Label | Variants | Use |
| --- | --- | --- | --- |
| `category_grid` | Category grid | portrait-masonry / horizontal-scroll / small-icon-list | Services, verticals, creator categories |
| `destinations_mosaic` | Destinations mosaic | portrait-mosaic / tile-grid / map-inspired | Service areas, coverage, destination strips |
| `testimonials_trio` | Testimonials trio | trio-card / single-hero / carousel-row | Social proof with palette-accented cards |

All three follow the locked section pattern (`schema.ts` / `migrations.ts`
/ `meta.ts` / `Component.tsx` / `Editor.tsx`). Token-driven styling; no
variant needs its own CSS file.

**Total section registry now: `hero`, `trust_strip`, `cta_banner`,
`category_grid`, `destinations_mosaic`, `testimonials_trio`.**

### 5. Homepage composer slot expansion

`homepageMeta.slots` extended from 4 to 11 slots. Legacy slots
(`primary`, `secondary`, `footer-callout`) preserved for backward compat;
new purpose-labelled slots added:

- `trust_band` — under the hero
- `services` — category_grid
- `featured` — featured professionals
- `process` — how-it-works
- `destinations` — destinations_mosaic
- `gallery` — gallery strip
- `testimonials` — testimonials_trio
- `final_cta` — cta_banner

Only the hero slot restricts section type. Every other slot accepts any
registered section — admins can experiment freely.

### 6. Public storefront renders composed homepage

`AgencyHomeStorefront` detects when the operator has assigned sections to
any non-hero slot and renders the CMS composition in place of the legacy
hardcoded stack (TalentTypeShortcuts / FeaturedTalentSection / BestFor /
LocationSection / HowItWorks / CtaSection). Tenants without a CMS
composition keep rendering the legacy stack — zero regressions.

### 7. Agency owner account fixed

`owner@midnightmuse.demo` promoted to `app_role='agency_staff'`,
`account_status='active'`, onboarding marked complete. Password set to
`Midnight-Muse-Owner-2026!`. Script `scripts/reset-midnight-owner.mjs`
checked in for repeat resets.

---

## Proof points (live right now)

1. **http://midnight.lvh.me:3106/** renders the Editorial Bridal register:
   - Ivory canvas, Fraunces-style serif hero "FIND THE RIGHT TALENT FOR YOUR BRIEF"
   - Editorial uppercase-tracked eyebrow
   - Espresso primary Search button
   - Pillowy chip filters (Fashion Model, Model, Editorial Model, …)
   - Centered serif "MIDNIGHT MUSE COLLECTIVE" header

2. **http://midnight.lvh.me:3106/directory** renders Editorial Bridal cards:
   - Ivory page canvas
   - Serif "FIND & BOOK TALENT" page title
   - Soft chip filter row (ALL / FASHION MODEL / MODEL / EDITORIAL MODEL …)
   - Talent cards with ivory body, editorial typography, champagne pill chips
   - Pills on "View profile" / "Inquire" CTAs

3. **None of this is hardcoded in Midnight-specific files.** All changes
   are the Editorial Bridal preset + token system. Switching Midnight back
   to Classic via admin would repaint it as the platform default.

---

## Files changed this sprint

```
supabase/migrations/20260628120000_saas_m7_theme_presets.sql   [pre-existing from sprint 1]
src/lib/site-admin/tokens/registry.ts                          [+ 2 template.* tokens]
src/lib/site-admin/tokens/resolve.ts                           [+ 2 data-attr mappings]
src/lib/site-admin/presets/theme-presets.ts                    [both presets set template.*]
src/lib/site-admin/sections/category_grid/*                    [new — schema/meta/mig/Component/Editor]
src/lib/site-admin/sections/destinations_mosaic/*              [new — schema/meta/mig/Component/Editor]
src/lib/site-admin/sections/testimonials_trio/*                [new — schema/meta/mig/Component/Editor]
src/lib/site-admin/sections/registry.ts                        [+ 3 sections registered]
src/lib/site-admin/templates/homepage/meta.ts                  [+ 7 new slots, legacy preserved]
src/components/home/agency-home-storefront.tsx                 [+ CMS composition render path]
src/components/directory/talent-card.tsx                       [+ data-card-* attrs + namespace class]
src/app/token-presets.css                                      [+ CSS for 3 new sections + card families]
scripts/reset-midnight-owner.mjs                               [new — service-role password reset util]
```

Zero typecheck errors. Zero breaking changes. Classic preset continues to
match the pre-M7 defaults exactly.

---

## What's intentionally still scope-parked

1. **Profile-layout-family render switch** — data plane live; Component
   variant switch (editorial long-form profile with portrait hero,
   packages card, sticky inquiry bar) is a dedicated sprint. The single
   pre-existing `.public-profile-hero` CSS tweak is a first step.

2. **Profile field group schema extension** — the `talent_profiles` table
   already supports `specialties`, `event_styles`, `destinations`,
   `languages` via the existing `talent_profile_taxonomy` + `field_values`
   machinery. Adding bridal-specific fields (`team_size`,
   `lead_time_weeks`, `starting_from`, `booking_note`, `embedded_media[]`)
   requires column/table additions + admin form additions. Documented in
   `prototypes/muse-bridal/SYSTEMIZATION.md` §6.

3. **Workspace switcher popover** — the agency switcher falls through to
   a read-only label when the user has only 1 membership. The sprint
   un-blocked this by ensuring the Midnight owner has an active staff
   profile; full UX polish on the switcher is out of scope.
