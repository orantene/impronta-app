# Tenant Localization Model

Tulala supports platform UI localization separately from tenant-authored
content. This keeps Spanish a real product language without pretending that
operator-written copy can be safely translated at runtime.

## Current Platform Locales

- English: `en`
- Spanish: `es`

The platform locale allow-list lives in
`web/src/lib/site-admin/locales.ts` and is enforced by database constraints on
`agency_business_identity`.

## Tenant Language Settings

Canonical tenant settings live on `agency_business_identity`:

- `default_locale`
- `supported_locales`
- `show_language_switcher`

Effective public switcher visibility is derived as:

```text
show_language_switcher = true
AND supported_locales has more than one entry
```

This lets a bilingual tenant hide the public switcher by choice while ensuring
Spanish-only or English-only tenants never show a dead toggle.

## Locale Resolution

Tenant hosts resolve language in this order:

1. Explicit locale prefix when the tenant supports it.
2. `locale` cookie for auth/dashboard surfaces.
3. Tenant `default_locale`.
4. Platform fallback `en`.

Path-based localhost tenant routes still use the global URL prefix model for
canonicalization. Agency and hub hosts are the source of truth for production
tenant-default behavior.

## UI Chrome vs Tenant Content

System UI chrome belongs in message catalogs:

- buttons
- nav labels
- form labels
- validation messages
- status badges
- empty states
- dashboard and page-builder controls

Tenant-authored content must not be auto-translated at runtime. Examples:

- page-builder hero titles and body copy
- agency descriptions
- custom page text
- talent bios and service descriptions
- SEO titles/descriptions

## Future Tenant Content Model

Use locale-keyed field payloads instead of parallel pages or machine-generated
runtime translations. Recommended shape:

```ts
type LocalizedField<T> = {
  defaultLocale: "en" | "es";
  values: Partial<Record<"en" | "es", T>>;
  status?: Partial<Record<"en" | "es", "draft" | "published" | "stale">>;
};
```

For CMS section props, add locale-aware fields only to authored text/media alt
fields. Structural props such as layout, spacing, visibility, theme tokens, CTA
link targets, and section ordering should stay shared across locales unless a
future product decision allows locale-specific page variants.

Suggested authoring rules:

- The tenant default locale is required for every published content field.
- Non-default locales may fall back to the default locale with an operator-visible
  warning.
- Editing default-locale text marks existing translated text as `stale`.
- Publishing a locale should validate only fields visible in that locale.
- SEO canonical and alternate URL work should follow after the content model is
  in place.

## Plan Gating Recommendation

Do not enforce billing gates in this localization foundation. Prepare the code
for this model:

- Free: one active public language.
- Studio: English/Spanish bilingual public site.
- Agency/Network: bilingual public site plus future translation workflow tools.

Enforcement should happen at the workspace settings validation boundary and
reuse the existing plan-capability system. Until product approves the gate, the
UI should allow `en`, `es`, or both for all tenants.
