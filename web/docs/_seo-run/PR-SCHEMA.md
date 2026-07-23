# PR-SCHEMA — Structured data (JSON-LD) for the marketing surface

**Task ref:** Audit item **A6** (Organization + WebSite schema) and **B6** (SoftwareApplication).
**Goal:** Inject valid, truthful JSON-LD on every marketing page so answer engines and rich-result parsers can identify Tulala as an entity and describe the product.

This spec is copy-ready. Every value below is grounded in real repo content; nothing is invented.

---

## 1. Ground-truth decisions (why each field is what it is)

| Field | Value | Source of truth | Notes |
|---|---|---|---|
| Org name | `Tulala` | `TULALA_BRAND.name` in `src/lib/brand/tulala.ts` | Canonical brand constant. |
| Org legalName | `Tulala Digital` | `TULALA_BRAND.legalName` | Real corporate entity string. |
| url | `https://tulala.digital` | `TULALA_APEX_HOST` (`tulala.digital`) | Production apex. |
| logo | `https://tulala.digital/brand/tulala-mark-512.png` | File exists: `public/brand/tulala-mark-512.png` (512x512 PNG) | Raster + square, meets Google's logo guidance. `tulala-wordmark.svg` also exists but Google prefers raster for `logo`. |
| description | `The Commerce Platform for Talent` | Product-truth line from the task brief | Deliberately the short category line, not the longer `TULALA_BRAND.description` (which is verbose and full of em dashes). No em dashes here. |
| **sameAs** | **OMITTED** | Repo sweep | The footer "social" links (`src/components/marketing/footer.tsx`) point at bare roots `https://instagram.com`, `https://x.com`, `https://linkedin.com` — **not** real Tulala profiles. No verified profile URL exists anywhere in the repo. Per the no-fabrication rule, `sameAs` is omitted entirely. Add it later only when real, owned profile URLs exist. |
| WebSite inLanguage | `["en", "es"]` | Site is served bilingual EN/ES by locale cookie | Matches the product. |
| **WebSite SearchAction** | **OMITTED** | Route sweep | No public marketing search endpoint accepting a query string exists. The only `*/search` routes are internal (`api/ai/search`, `api/admin/...`), not a user-facing `?q=` target. A `SearchAction` here would be fabricated, so it is omitted. |
| SoftwareApplication applicationCategory | `BusinessApplication` | Task brief + product truth | Tulala is a B2B SaaS for talent/agencies/networks. |
| SoftwareApplication operatingSystem | `Web` | Product is a web app / PWA | `manifest.webmanifest` present; installable PWA. |
| **SoftwareApplication offers** | **OMITTED** | Pricing sweep | The marketing pricing tiers (`free`, `studio`, `agency`, `hub`) and their prices are **DB-driven and currency-localized** at request time via `loadMarketingTiers()` / `get-active-prices.ts` (`product_*` tables). There is **no static, verifiable price in the repo**, and amounts change by currency. Emitting `offers` would fabricate a fixed price, so it is omitted. See §4 for the one defensible optional addition (free tier). |

**Cross-linking:** all three nodes ship in a single `@graph` with stable `@id` anchors so the SoftwareApplication and WebSite reference the Organization as `publisher`/`provider` without duplication.

---

## 2. Ready-to-paste JSON-LD

This is exactly what the component below serializes. It is valid JSON and every value matches visible/real content.

```json
{
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Organization",
      "@id": "https://tulala.digital/#organization",
      "name": "Tulala",
      "legalName": "Tulala Digital",
      "url": "https://tulala.digital",
      "logo": {
        "@type": "ImageObject",
        "url": "https://tulala.digital/brand/tulala-mark-512.png",
        "width": 512,
        "height": 512
      },
      "description": "The Commerce Platform for Talent"
    },
    {
      "@type": "WebSite",
      "@id": "https://tulala.digital/#website",
      "name": "Tulala",
      "url": "https://tulala.digital",
      "inLanguage": ["en", "es"],
      "publisher": { "@id": "https://tulala.digital/#organization" }
    },
    {
      "@type": "SoftwareApplication",
      "@id": "https://tulala.digital/#software",
      "name": "Tulala",
      "url": "https://tulala.digital",
      "applicationCategory": "BusinessApplication",
      "operatingSystem": "Web",
      "description": "The Commerce Platform for Talent. Independent operators, agencies, and staffing networks run a branded storefront, a booking pipeline, and a shared discovery network.",
      "publisher": { "@id": "https://tulala.digital/#organization" }
    }
  ]
}
```

Notes on the SoftwareApplication `description`: it expands the category line with a plain, accurate summary of what the product does (storefront + booking pipeline + shared discovery network). This matches the homepage/how-it-works body copy. No em dashes, no invented features, no prices.

---

## 3. New component

**File:** `web/src/components/marketing/platform-json-ld.tsx` (create new)

Server component (no `"use client"`). It renders one `<script type="application/ld+json">`. Values are pulled from the canonical brand constants where they exist; the category description and logo path are hardcoded to the verified real values. The object is fully static (no per-request data), so there is nothing to await.

```tsx
import { PLATFORM_BRAND } from "@/lib/platform/brand";

/**
 * Platform-level JSON-LD for the Tulala marketing surface.
 *
 * Emits a single @graph with three cross-linked nodes:
 *   - Organization  (entity identity for Tulala)
 *   - WebSite       (bilingual EN/ES marketing site)
 *   - SoftwareApplication (the product, BusinessApplication)
 *
 * Deliberate omissions (do NOT re-add without real data):
 *   - Organization.sameAs        — no verified owned social profiles exist
 *     (the footer icons link to bare instagram.com / x.com / linkedin.com
 *     roots, not real Tulala accounts).
 *   - WebSite.potentialAction     — no public site-search endpoint exists.
 *   - SoftwareApplication.offers  — marketing prices are DB-driven and
 *     currency-localized at request time (loadMarketingTiers), so no fixed
 *     price can be truthfully asserted here.
 *
 * Mounted once in MarketingShell so it renders on every marketing page
 * (homepage + all sub-pages) and nowhere else (never on tenant/agency
 * hosts, where the Organization would be the wrong entity).
 */
export function PlatformJsonLd() {
  const origin = `https://${PLATFORM_BRAND.domain}`;

  const graph = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization",
        "@id": `${origin}/#organization`,
        name: PLATFORM_BRAND.name,
        legalName: PLATFORM_BRAND.legalName,
        url: origin,
        logo: {
          "@type": "ImageObject",
          url: `${origin}/brand/tulala-mark-512.png`,
          width: 512,
          height: 512,
        },
        description: "The Commerce Platform for Talent",
      },
      {
        "@type": "WebSite",
        "@id": `${origin}/#website`,
        name: PLATFORM_BRAND.name,
        url: origin,
        inLanguage: ["en", "es"],
        publisher: { "@id": `${origin}/#organization` },
      },
      {
        "@type": "SoftwareApplication",
        "@id": `${origin}/#software`,
        name: PLATFORM_BRAND.name,
        url: origin,
        applicationCategory: "BusinessApplication",
        operatingSystem: "Web",
        description:
          "The Commerce Platform for Talent. Independent operators, agencies, and staffing networks run a branded storefront, a booking pipeline, and a shared discovery network.",
        publisher: { "@id": `${origin}/#organization` },
      },
    ],
  };

  return (
    <script
      type="application/ld+json"
      // JSON.stringify output is safe inside a script tag; escape the
      // sequence "</" defensively so a future string value can never break
      // out of the <script> element.
      dangerouslySetInnerHTML={{
        __html: JSON.stringify(graph).replace(/</g, "\\u003c"),
      }}
    />
  );
}
```

`PLATFORM_BRAND.domain` = `tulala.digital`, `.name` = `Tulala`, `.legalName` = `Tulala Digital` (verified in `src/lib/brand/tulala.ts`), so the rendered output matches §2 exactly.

---

## 4. Where to mount it

**Mount in `MarketingShell` — `web/src/components/marketing/shell.tsx`.**

Rationale: `MarketingShell` is the single component every marketing page passes through — the `(marketing)` route group layout wraps its pages in it, **and** the homepage (`/`, outside the route group) renders `MarketingLanding`, which itself wraps `MarketingShell`. Mounting here covers the homepage **and** all sub-pages with one insertion, and never leaks onto tenant/agency/app hosts (those don't use this shell). Mounting in `src/app/(marketing)/layout.tsx` would miss the homepage; mounting in the root `src/app/layout.tsx` would wrongly emit "Tulala" Organization schema on every tenant storefront.

### Edit 1 — import

At the top of `shell.tsx`, alongside the other `./` component imports:

```tsx
import { PlatformJsonLd } from "./platform-json-ld";
```

### Edit 2 — render it once inside the returned tree

In the `return (...)` block, add `<PlatformJsonLd />` as the first child inside the root `<div data-platform-surface="marketing">`:

```tsx
  return (
    <div
      data-platform-surface="marketing"
      className="flex min-h-screen flex-col"
      style={{ background: "var(--plt-bg)", color: "var(--plt-ink)" }}
    >
      <PlatformJsonLd />
      <MarketingHeader
        locale={locale}
        pathnameWithoutLocale={pathnameWithoutLocale}
        account={account}
        signOutAction={signOut}
      />
      <main className="flex-1 pt-[var(--plt-header-h,64px)] sm:pt-[72px]">{children}</main>
      <MarketingFooter />
      <MarketingModalHost locale={locale} />
    </div>
  );
```

A `<script type="application/ld+json">` placed in the body is valid and standard for App Router; Google and other parsers read JSON-LD from anywhere in the document.

---

## 5. Optional (only if you want a free-tier Offer)

The only price that is **visibly and unconditionally true** on the marketing surface is the free tier ("Start free, forever" / "Every plan starts with a real free tier" on `/pricing`). If you want a single, honest `offers` node, add this to the SoftwareApplication object — and nothing more. Do **not** add the studio/agency/hub tiers, whose amounts are dynamic.

```json
"offers": {
  "@type": "Offer",
  "price": "0",
  "priceCurrency": "USD",
  "description": "Free workspace, no card required"
}
```

Default recommendation: **ship without `offers`** (§2/§3 as written). The free-tier Offer is defensible but adds little rich-result value and any future change to the free tier would silently make the schema stale.

---

## 6. Validation checklist

1. `cd web && npx tsc --noEmit` (component compiles).
2. Load a marketing page (`/`, `/pricing`, `/operators`) and view source — exactly one `<script type="application/ld+json">` with the `@graph`.
3. Google Rich Results Test / Schema.org validator on the live URL: Organization, WebSite, SoftwareApplication all parse with zero errors/warnings.
4. Confirm the block does **not** appear on a tenant host (e.g. `impronta.tulala.digital` or an agency apex) — it must be marketing-only.
5. Confirm `https://tulala.digital/brand/tulala-mark-512.png` returns 200.
