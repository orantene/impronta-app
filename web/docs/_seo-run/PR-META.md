# PR-META — Metadata architecture (marketing surface)

Fixes the sitewide broken social image, adds a self-referencing canonical to every
marketing page, and emits `en` / `es` / `x-default` hreflang alternates. Scope is the
**marketing surface only** (the `kind="marketing"` host + the `(marketing)` route group).
Agency, hub, talent, and app hosts already set their own `metadataBase` / canonical and are
NOT touched by this PR.

---

## 1. Root cause of the broken social image

### What is live (confirmed in the audit)

```
curl https://improntamodels.com/opengraph-image?...  →  HTTP 404
```

`og:image` and `twitter:image` are emitted sitewide as an **absolute URL on the wrong host**
(`https://<request-host>/opengraph-image`), and that path 404s.

### Why it happens

Three facts combine:

1. **A file-convention OG route exists at the root segment:**
   `web/src/app/opengraph-image.tsx`. Next.js auto-injects `og:image` +
   `twitter:image` for the `/` segment **and every descendant segment that does not
   set `openGraph.images` explicitly**. The generated tag value is the route path
   `/opengraph-image` resolved to an **absolute** URL against `metadataBase`.

2. **`metadataBase` is unset on the marketing surface.**
   - `web/src/app/layout.tsx` — the root `metadata` export has no `metadataBase`
     (lines 100-127).
   - `web/src/app/page.tsx` — the `ctx.kind === "marketing"` branch of
     `generateMetadata` (lines 168-185) returns `title` / `description` / `openGraph` /
     `twitter` but **no `metadataBase` and no `openGraph.images`**, so the file-convention
     image is used and there is no base to resolve it against.
   - Every `(marketing)` sub-page (`pricing`, `faq`, `how-it-works`, …) uses a static
     `export const metadata` with only `title` + `description` — no `metadataBase` either.

3. **When `metadataBase` is unset, Next.js falls back to inferring it from the deploy /
   request host.** On this surface that resolves to the request host
   (`improntamodels.com`) rather than the marketing apex, so the file-convention image
   serializes to `https://improntamodels.com/opengraph-image`, which does not serve a
   200 there → dead preview on every shared link.

**Root cause in one line:** the marketing metadata never pins `metadataBase` to the
marketing apex, so Next.js resolves the inherited `opengraph-image` file-route against the
wrong origin.

### The fix

Pin `metadataBase` to the marketing apex (`https://tulala.digital`, sourced from
`PLATFORM_BRAND.domain` — never hardcode the string). Once the base is correct the SAME
file-convention route serializes to `https://tulala.digital/opengraph-image`, which renders
the Tulala card and returns 200. No new image asset is required — the existing
`opengraph-image.tsx` already produces a valid 1200x630 card.

The base is set in two places for defense in depth:
- **Root `layout.tsx`** — the inherited default that covers every marketing sub-page that
  keeps a static `metadata` export.
- **The marketing branch of `app/page.tsx`** — pinned explicitly alongside the new
  canonical/hreflang so the homepage is self-contained.

> Safety note: setting `metadataBase` in the ROOT layout affects all hosts, but every
> non-marketing surface (agency/hub in `app/page.tsx`, talent in `t/[profileCode]`) already
> overrides `metadataBase` in its own `generateMetadata`, and page-level metadata wins over
> layout metadata in Next's merge. Agency/hub also set explicit `openGraph.images`, so the
> file-convention route never applies there. The only routes that inherit the new root base
> are the marketing ones (the `(marketing)` group is middleware-gated to marketing hosts),
> which is exactly the intent.

---

## 2 & 3. Self-referencing canonical + hreflang alternates

The marketing surface serves EN unprefixed (`/pricing`) and ES under an `/es` prefix
(`/es/pricing`) through the same route, with locale resolved by middleware and read via
`getRequestLocale()`. So:

- **Canonical** must be self-referencing to the **served locale's** path
  (`/pricing` when EN is served, `/es/pricing` when ES is served).
- **hreflang** must list both locales plus `x-default` (→ EN), identical on both variants.

`buildPublicLocaleAlternates(locale, pathWithoutLocale)` in
`web/src/lib/seo/locale-alternates.ts` already produces exactly this shape — BUT its
`metadataBase` comes from `publicSiteMetadataBase()` = `NEXT_PUBLIC_SITE_URL`, which is the
**app host** (`app.tulala.digital`), not the marketing apex. Reusing it as-is would pin the
marketing canonical to the app host. So we add a marketing-scoped sibling that reuses all the
same path/hreflang logic but bases URLs on the marketing apex.

Because canonical is locale-dependent, any sub-page that currently uses a static
`export const metadata` must convert to an async `generateMetadata` (to read the locale).
Title/description stay the same; most pages already carry bilingual copy in-component that
can feed `pickLocale`.

---

## Per-file edit list

### FILE 1 — `web/src/lib/seo/locale-alternates.ts` (add marketing-scoped helpers)

Add a marketing-apex `metadataBase` and a marketing variant of the alternates builder.
`PLATFORM_BRAND` is a pure constant re-export (`@/lib/brand/tulala`), so no circular-import
risk.

Add the import at the top:

```ts
import { PLATFORM_BRAND } from "@/lib/platform/brand";
```

Append these exports:

```ts
/**
 * metadataBase for the marketing surface — the SaaS apex (tulala.digital),
 * NOT NEXT_PUBLIC_SITE_URL (which is the app host, app.tulala.digital). Used
 * so the inherited `opengraph-image` file-route and every relative canonical
 * resolve to the public marketing origin.
 */
export function marketingSiteMetadataBase(): URL {
  return new URL(`https://${PLATFORM_BRAND.domain}`);
}

/**
 * hreflang + self-referencing canonical for a marketing route, based on the
 * marketing apex. Mirrors `buildPublicLocaleAlternates` (EN unprefixed vs
 * `/es…`) but pins `metadataBase` to tulala.digital.
 */
export function buildMarketingLocaleAlternates(
  locale: Locale,
  pathnameWithoutLocale: string,
): Pick<Metadata, "metadataBase" | "alternates"> {
  const pathEn = pathnameWithoutLocale.startsWith("/")
    ? pathnameWithoutLocale
    : `/${pathnameWithoutLocale}`;
  const pathEs = withLocalePath(pathEn, "es");
  return {
    metadataBase: marketingSiteMetadataBase(),
    alternates: {
      canonical: pickLocale(locale, { en: pathEn, es: pathEs }),
      languages: {
        en: pathEn,
        es: pathEs,
        "x-default": pathEn,
      },
    },
  };
}
```

Note: `canonical` / `languages` values are root-relative paths; Next.js resolves them to
absolute URLs against the `metadataBase` in the same object — so they come out as
`https://tulala.digital/pricing`, `https://tulala.digital/es/pricing`, etc.

---

### FILE 2 — `web/src/app/layout.tsx` (root `metadataBase` default)

`PLATFORM_BRAND` is already imported (line 19). Add one field to the existing `metadata`
export.

Change (lines 100-105):

```ts
export const metadata: Metadata = {
  title: {
    default: `${PLATFORM_BRAND.name} — ${PLATFORM_BRAND.tagline}`,
    template: `%s · ${PLATFORM_BRAND.name}`,
  },
  description: PLATFORM_BRAND.description,
```

to:

```ts
export const metadata: Metadata = {
  // Marketing apex base so the inherited `opengraph-image` file-route and any
  // relative canonical resolve to tulala.digital, not the request host. Every
  // non-marketing surface overrides this in its own generateMetadata.
  metadataBase: new URL(`https://${PLATFORM_BRAND.domain}`),
  title: {
    default: `${PLATFORM_BRAND.name} — ${PLATFORM_BRAND.tagline}`,
    template: `%s · ${PLATFORM_BRAND.name}`,
  },
  description: PLATFORM_BRAND.description,
```

This single line is the P0 fix for the broken social image: it corrects the base for the
homepage AND every `(marketing)` sub-page that inherits the root `opengraph-image` route.

> Optional consistency: `marketingSiteMetadataBase()` from FILE 1 could be imported here
> instead of re-constructing `new URL(...)`. Kept inline above to avoid adding an import to
> the root layout; either is fine.

---

### FILE 3 — `web/src/app/page.tsx`, marketing branch (canonical + hreflang + explicit base)

Add the import (extend the existing line 17 import from `@/lib/seo/locale-alternates`):

```ts
import {
  buildPublicLocaleAlternates,
  buildMarketingLocaleAlternates,
} from "@/lib/seo/locale-alternates";
```

Replace the marketing branch (lines 168-185):

```ts
  if (ctx.kind === "marketing") {
    const title = `${PLATFORM_BRAND.name} — ${PLATFORM_BRAND.tagline}`;
    return {
      title,
      description: PLATFORM_BRAND.description,
      openGraph: {
        title,
        description: PLATFORM_BRAND.description,
        siteName: PLATFORM_BRAND.name,
        url: `https://${PLATFORM_BRAND.domain}/`,
      },
      twitter: {
        card: "summary_large_image",
        title,
        description: PLATFORM_BRAND.description,
      },
    };
  }
```

with:

```ts
  if (ctx.kind === "marketing") {
    const title = `${PLATFORM_BRAND.name} — ${PLATFORM_BRAND.tagline}`;
    const marketingAlt = buildMarketingLocaleAlternates(locale, "/");
    return {
      title,
      description: PLATFORM_BRAND.description,
      ...marketingAlt,
      openGraph: {
        title,
        description: PLATFORM_BRAND.description,
        siteName: PLATFORM_BRAND.name,
        url: `https://${PLATFORM_BRAND.domain}/`,
      },
      twitter: {
        card: "summary_large_image",
        title,
        description: PLATFORM_BRAND.description,
      },
    };
  }
```

`locale` is already in scope (line 64: `const locale = await getRequestLocale();`).
No `openGraph.images` is set here on purpose — the inherited `opengraph-image.tsx` file-route
now resolves correctly against the pinned `metadataBase` and supplies the 200 image.

> Copy aside (out of scope for PR-META, flag for the copy PR): the OG `title` template uses an
> em dash (`${name} — ${tagline}`), which the project's copy rule forbids in user-facing text.
> Not changed here to avoid mixing a copy edit into the metadata PR; call it out separately.

---

### FILE 4 — `(marketing)` sub-page pattern (applies to all pages in the group)

**The 404-image fix already reaches these pages via FILE 2** (they inherit the root
`metadataBase` + `opengraph-image`). This step adds the **self-referencing canonical +
hreflang** (items 2 & 3), which requires reading the locale, so each page converts its static
`export const metadata` to an async `generateMetadata`.

**Canonical pattern (template — using `pricing` as the example):**

`web/src/app/(marketing)/pricing/page.tsx` currently (lines 16-20):

```ts
export const metadata: Metadata = {
  title: "Pricing",
  description:
    "Start free, forever. Upgrade on your schedule. Transparent plans for operators, agencies, and large placement networks.",
};
```

becomes:

```ts
export async function generateMetadata(): Promise<Metadata> {
  const locale = await getRequestLocale();
  return {
    title: pickLocale(locale, { en: "Pricing", es: "Precios" }),
    description: pickLocale(locale, {
      en: "Start free, forever. Upgrade on your schedule. Transparent plans for operators, agencies, and large placement networks.",
      es: "Empieza gratis, para siempre. Mejora tu plan cuando quieras. Planes claros para operadores, agencias y redes grandes.",
    }),
    ...buildMarketingLocaleAlternates(locale, "/pricing"),
  };
}
```

Add these imports to the page (both helpers already exist elsewhere in the file for
`pricing`; add whichever are missing):

```ts
import { getRequestLocale } from "@/i18n/request-locale";
import { pickLocale } from "@/lib/i18n/pick-locale";
import { buildMarketingLocaleAlternates } from "@/lib/seo/locale-alternates";
```

**Rules for applying this pattern to each page in `web/src/app/(marketing)/`:**

1. Replace `export const metadata` with `export async function generateMetadata(): Promise<Metadata>`.
2. Read `const locale = await getRequestLocale();`.
3. Keep the same title/description; localize with `pickLocale` where a Spanish string exists
   (many pages already hold bilingual copy in-component — reuse it rather than inventing new
   Spanish). If no reviewed ES string exists yet, pass the same string for both locales rather
   than machine-translating; the canonical/hreflang wiring is the objective here.
4. Spread `...buildMarketingLocaleAlternates(locale, "<route-path>")` where `<route-path>` is
   the EN, unprefixed, root-relative path for that page.
5. Do NOT set `openGraph.images` — inheriting the root card is intentional until PR B4
   (per-page OG art) lands.

**Path map (EN, unprefixed) for `buildMarketingLocaleAlternates`:**

| Page file | path arg |
|---|---|
| `agencies/page.tsx` | `/agencies` |
| `operators/page.tsx` | `/operators` |
| `organizations/page.tsx` | `/organizations` |
| `network/page.tsx` | `/network` |
| `how-it-works/page.tsx` | `/how-it-works` |
| `pricing/page.tsx` | `/pricing` |
| `faq/page.tsx` | `/faq` |
| `integrations/page.tsx` | `/integrations` |
| `discover-agencies/page.tsx` | `/discover-agencies` |
| `global-directory/page.tsx` | `/global-directory` |
| `get-started/page.tsx` | `/get-started` |
| `help/page.tsx` | `/help` |
| `waitlist/page.tsx` | `/waitlist` |
| `status/page.tsx` | `/status` |
| `legal/privacy/page.tsx` | `/legal/privacy` |
| `legal/terms/page.tsx` | `/legal/terms` |

**Dynamic route — `help/[role]/page.tsx`** already has an async `generateMetadata({ params })`
(line 171). Extend it to build the path from the resolved `role` and spread the helper:

```ts
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { role } = await params;
  const locale = await getRequestLocale();
  if (!isRole(role)) {
    return {
      title: "Help · Tulala",
      ...buildMarketingLocaleAlternates(locale, "/help"),
    };
  }
  const c = ROLE_LABELS[role];
  return {
    title: `${c.title} · Tulala`,
    description: c.intro.slice(0, 160),
    ...buildMarketingLocaleAlternates(locale, `/help/${role}`),
  };
}
```

---

## Verification

1. **Social image (P0):**
   `curl -s https://tulala.digital/ | grep -Eo 'og:image[^>]*'` → shows
   `content="https://tulala.digital/opengraph-image..."`, and
   `curl -sI https://tulala.digital/opengraph-image` → `HTTP 200` `content-type: image/png`.
   Repeat for a sub-page (e.g. `/pricing`).
2. **Canonical:** each marketing page head contains exactly one
   `<link rel="canonical" href="https://tulala.digital/<path>">`, and the `/es/<path>`
   variant self-references `https://tulala.digital/es/<path>`.
3. **hreflang:** each page emits `alternate` links for `en`, `es`, and `x-default`, identical
   across the EN and ES variants of the same page.
4. Run the Rich Results / URL inspection and a social-card validator (opengraph.xyz) against
   `https://tulala.digital/` and `/pricing`.

## Out of scope (tracked elsewhere)

- Per-page / audience-aware OG images + a `twitter-image` route → PR B4.
- Sitemap ES entries + `sitemap.ts` hreflang blocks.
- The em-dash in the OG title template (copy PR).
