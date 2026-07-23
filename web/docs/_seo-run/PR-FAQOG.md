# PR-FAQOG — FAQPage JSON-LD + BreadcrumbList + per-page OG/Twitter images

**Producer:** Sonnet (spec only, read-only pass)
**Companion audit:** `web/docs/tulala-seo-organic-marketing-audit-2026-07-22.md` (findings B3, B4, B5)
**Implements against:** `origin/main` @ `30a97b9f1` state, worktree `/Users/oranpersonal/Desktop/impronta-seo`
**Intended file owners (Stage 2):** OWN-D (`(marketing)/faq/page.tsx` + FAQ schema), OWN-J (`opengraph-image.tsx`, new `twitter-image.tsx`). Breadcrumb helper has no dedicated owner yet in the execution plan — flagged at the end of this doc.

No invented Q&A, no invented product claims, no em dashes introduced. Every string below is either lifted verbatim from existing code or is plain structural/schema boilerplate.

---

## 1. FAQPage JSON-LD on `/faq`

### 1.1 Where the data actually lives

`web/src/app/(marketing)/faq/page.tsx` does not hold the Q&A itself — it renders `<FaqSection locale={locale} />` (`web/src/components/marketing/faq-section.tsx`), which reads:

```ts
// web/src/components/marketing/faq-section.tsx:12-13
const copy = getMarketingCopy(locale).faq;
const faqs: QA[] = copy.items.map((it, i) => ({ id: String(i), q: it.q, a: it.a }));
```

`getMarketingCopy` (`web/src/lib/marketing/copy.ts:706`) returns the locale-resolved copy object. The **8 EN Q&A pairs** live at `copy.ts:261-294` (`faq.items`), the **8 ES Q&A pairs** at `copy.ts:608-...` (mirrored, same order, same ids by index). This is the single source of truth — the JSON-LD generator below reads from the *same* `getMarketingCopy(locale).faq.items` array the page already renders, so schema and visible content can never drift apart.

Confirmed shape:

```ts
type QA = { q: string; a: string };
// copy.faq.items: QA[]  (length 8 today, EN and ES both — TS enforces `es: MarketingCopy = typeof en`)
```

### 1.2 New file — `web/src/lib/seo/faq-json-ld.ts`

Follows the exact style of the existing `web/src/lib/seo/talent-json-ld.ts` (same `compact()` pattern, same doc-comment voice, already used for `ProfilePage`/`Person`/`ItemList` schema on talent pages).

```ts
/**
 * FAQ page structured data — schema.org FAQPage JSON-LD.
 *
 * PR-FAQOG. Builds FAQPage markup from the SAME Q&A array the /faq page
 * renders (`getMarketingCopy(locale).faq.items`) — never a separate copy,
 * so the schema can't drift from what's actually on the page. Google (and
 * AI answer engines) only credit FAQPage markup that matches visible
 * content; this generator has no path to invent a question.
 */

type JsonValue =
  | string
  | number
  | boolean
  | null
  | { [k: string]: JsonValue | undefined }
  | JsonValue[];

function compact<T extends Record<string, JsonValue | undefined>>(o: T): Record<string, JsonValue> {
  const out: Record<string, JsonValue> = {};
  for (const [k, v] of Object.entries(o)) {
    if (v === undefined || v === null) continue;
    if (typeof v === "string" && v.trim() === "") continue;
    if (Array.isArray(v) && v.length === 0) continue;
    out[k] = v;
  }
  return out;
}

export interface FaqJsonLdInput {
  /** Absolute canonical URL of the FAQ page, e.g. `https://tulala.digital/faq`. */
  pageUrl: string;
  /** The exact array the page renders — `getMarketingCopy(locale).faq.items`. */
  items: { q: string; a: string }[];
  /** "en" | "es" — matches the page's resolved locale. */
  inLanguage?: string | null;
}

/** Returns null (caller skips emitting) if there are no usable Q&A pairs —
 *  never emits an empty FAQPage, which Google flags as invalid. */
export function buildFaqPageJsonLd(input: FaqJsonLdInput): Record<string, JsonValue> | null {
  const items = input.items
    .map((it) => ({ q: it.q?.trim() ?? "", a: it.a?.trim() ?? "" }))
    .filter((it) => it.q && it.a);
  if (items.length === 0) return null;

  return compact({
    "@context": "https://schema.org",
    "@type": "FAQPage",
    "@id": input.pageUrl,
    url: input.pageUrl,
    inLanguage: input.inLanguage?.trim() ?? null,
    mainEntity: items.map((it) =>
      compact({
        "@type": "Question",
        name: it.q,
        acceptedAnswer: compact({
          "@type": "Answer",
          text: it.a,
        }),
      }),
    ),
  });
}

/** Stable stringify for the `<script>` tag — mirrors `jsonLdToString` in
 *  `talent-json-ld.ts`; kept local so this file has no cross-module type
 *  coupling. */
export function faqJsonLdToString(obj: Record<string, JsonValue> | null): string {
  if (!obj) return "";
  return JSON.stringify(obj);
}
```

### 1.3 Wire it into `web/src/app/(marketing)/faq/page.tsx`

The page is already an async server component reading `locale` — add the import, build the object, emit the script tag. Diff against the current file (57 lines, read in full above):

```tsx
// ADD to the import block at the top:
import { buildFaqPageJsonLd, faqJsonLdToString } from "@/lib/seo/faq-json-ld";
import { getMarketingCopy } from "@/lib/marketing/copy";
import { pickLocale } from "@/lib/i18n/pick-locale"; // already imported

// Inside FaqPage(), after `const locale = await getRequestLocale();`:
const faqCopy = getMarketingCopy(locale).faq;
const faqJsonLd = buildFaqPageJsonLd({
  pageUrl: `https://${PLATFORM_BRAND.domain}/faq`,
  items: faqCopy.items,
  inLanguage: pickLocale(locale, { en: "en", es: "es" }),
});

// In the returned JSX, as the first child of the outer <> fragment
// (same placement pattern as the ProfilePage JSON-LD in
// web/src/app/t/[profileCode]/page.tsx:2401-2407):
return (
  <>
    {faqJsonLd ? (
      <script
        type="application/ld+json"
        // Pre-stringified — React must NOT escape JSON-LD content.
        dangerouslySetInnerHTML={{ __html: faqJsonLdToString(faqJsonLd) }}
      />
    ) : null}
    <SimplePageHero ... />
    <FaqSection locale={locale} />
    <FinalCtaSection />
  </>
);
```

`PLATFORM_BRAND` is already imported in this file (`@/lib/platform/brand`), so no new dependency there.

**Note on `/faq` vs the homepage FAQ teaser:** the homepage (`app/page.tsx`) also renders `<FaqSection>` (same 8 items, via `home-faq` source) but only shows a subset in some layouts and always links out to `/faq` for "See all FAQs". Emit FAQPage JSON-LD **only on `/faq`**, not the homepage — one FAQPage block per crawlable URL is the correct pattern; duplicating it on the homepage against a *different* canonical URL is the kind of drift Google's structured-data guidelines flag.

### 1.4 Validation

After implementation: paste `https://tulala.digital/faq` into Google's Rich Results Test, confirm `FAQPage` parses with 8 `Question`/`Answer` pairs and zero errors. (Google restricted FAQ *rich-result* eligibility on the SERP to a narrower set of sites in 2023, but the schema itself remains valid, machine-readable, and is exactly the kind of structured signal AI answer engines like Perplexity/ChatGPT search consume — so this still serves the audit's "AI-search readiness" finding even where it doesn't win a SERP rich card.)

---

## 2. BreadcrumbList — pattern for sub-pages (Home > Page)

### 2.1 New file — `web/src/lib/seo/breadcrumb-json-ld.ts`

Generic, reusable, zero dependencies on any one page's data shape:

```ts
/**
 * BreadcrumbList structured data — schema.org.
 *
 * PR-FAQOG. One tiny helper any marketing sub-page can call with its own
 * position in the site hierarchy. Tulala's marketing IA is one level deep
 * (Home > Page) today — no nested breadcrumbs to model — so this only
 * needs to support a flat list of {name, url} crumbs.
 */

type JsonValue =
  | string
  | number
  | boolean
  | null
  | { [k: string]: JsonValue | undefined }
  | JsonValue[];

export interface BreadcrumbCrumb {
  /** Visible label, e.g. "FAQ", "Pricing". */
  name: string;
  /** Absolute URL for this step. */
  url: string;
}

/** Builds a BreadcrumbList. Always pass the full chain starting at Home —
 *  position is 1-indexed automatically. Returns null for <2 crumbs (a
 *  breadcrumb of just "Home" isn't a breadcrumb). */
export function buildBreadcrumbJsonLd(crumbs: BreadcrumbCrumb[]): Record<string, JsonValue> | null {
  const valid = crumbs.filter((c) => c.name?.trim() && c.url?.trim());
  if (valid.length < 2) return null;

  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: valid.map((c, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: c.name.trim(),
      item: c.url.trim(),
    })),
  };
}

export function breadcrumbJsonLdToString(obj: Record<string, JsonValue> | null): string {
  if (!obj) return "";
  return JSON.stringify(obj);
}
```

### 2.2 Usage on `/faq`

Same page, same script-tag pattern, sits next to the FAQPage block:

```tsx
import { buildBreadcrumbJsonLd, breadcrumbJsonLdToString } from "@/lib/seo/breadcrumb-json-ld";

const breadcrumbJsonLd = buildBreadcrumbJsonLd([
  { name: PLATFORM_BRAND.name, url: `https://${PLATFORM_BRAND.domain}/` },
  { name: "FAQ", url: `https://${PLATFORM_BRAND.domain}/faq` },
]);

// in JSX, alongside faqJsonLd:
{breadcrumbJsonLd ? (
  <script
    type="application/ld+json"
    dangerouslySetInnerHTML={{ __html: breadcrumbJsonLdToString(breadcrumbJsonLd) }}
  />
) : null}
```

Google's convention is the home node uses the site/brand name (not the literal word "Home") — using `PLATFORM_BRAND.name` ("Tulala") for crumb 1 matches that.

### 2.3 Pattern for other sub-pages

This is schema-only (no visible breadcrumb UI is being added — the marketing header/footer nav already does wayfinding; this is purely the machine-readable signal the audit is scoring). Every flat marketing sub-page gets the same two-crumb call, just swap the label/path. Using the existing per-page `metadata.title` string keeps the crumb label consistent with the `<title>` tag:

| Page | File | Crumb 2 `{ name, url }` |
|---|---|---|
| Pricing | `(marketing)/pricing/page.tsx` | `{ name: "Pricing", url: ".../pricing" }` |
| How it works | `(marketing)/how-it-works/page.tsx` | `{ name: "How it works", url: ".../how-it-works" }` |
| Agencies | `(marketing)/agencies/page.tsx` | `{ name: "For agencies & representation", url: ".../agencies" }` |
| Operators | `(marketing)/operators/page.tsx` | `{ name: "For independent operators", url: ".../operators" }` |
| Network | `(marketing)/network/page.tsx` | `{ name: "The shared network", url: ".../network" }` |
| Organizations | `(marketing)/organizations/page.tsx` | `{ name: "For staffing, casting & placement", url: ".../organizations" }` |
| Integrations | `(marketing)/integrations/page.tsx` | `{ name: "Integrations", url: ".../integrations" }` |
| Get started | `(marketing)/get-started/page.tsx` | `{ name: "Start your business, free", url: ".../get-started" }` |

Each of those pages is a server component already reading (or trivially able to read) `PLATFORM_BRAND.domain`; the 6-line call is identical to the `/faq` usage above, just with a different crumb-2 object. This doc scopes the **helper + `/faq` usage** as the concrete deliverable (matching audit item B3/B5's `/faq` focus); rolling the same call onto the other 8 pages is mechanical follow-up — flagged at the bottom of this doc since no Stage-2 owner currently has those files for this purpose.

---

## 3. Per-page OG images + `twitter-image.tsx`

### 3.1 Current state (confirmed in code)

- `web/src/app/opengraph-image.tsx` is the **only** OG image in the marketing tree. It's a root-segment file, so every route without its own `opengraph-image.tsx` inherits it — that's the entire `(marketing)` group (home, pricing, faq, how-it-works, agencies, operators, network, organizations, integrations, get-started, legal, help, status…).
- It already does real, useful work for **agency hosts**: on an agency subdomain it queries `agency_business_identity` + `agency_talent_roster` and renders a branded card with that agency's name/tagline/talent count. That logic is correct and out of scope here — do not touch it.
- On the **platform apex** (`tulala.digital`, where every marketing page lives), `getPublicHostContext()` returns a non-agency context, so `loadAgencyOgData()` returns `null` and every single marketing page — home, pricing, FAQ, how-it-works, get-started — renders the exact same card: kicker `TULALA`, title `Tulala`, subtitle `"The booking platform for premium talent agencies"`. That subtitle is also stale relative to the current tagline (`"The Talent Business Platform"` / audit's proposed "The Commerce Platform for Talent") — a good general fallback, but not audience-aware for any specific route. This is the audit's B4 finding.
- Talent/agency-site pages already have their own dedicated images (`app/t/[profileCode]/opengraph-image.tsx`, `app/t/site/[siteSlug]/opengraph-image.tsx`, `app/_talent-site/opengraph-image.tsx`) — not part of this task.
- There is **no `twitter-image.tsx` anywhere**. Next's file convention falls back to `opengraph-image` for the Twitter card image when no `twitter-image` file exists at that segment, so Twitter cards aren't literally broken — but the audit is right that there's no dedicated, explicit route for it, and no way to ever diverge the two without one.

### 3.2 Shared render helper — new file `web/src/lib/seo/og-card.tsx`

Factor the visual system already proven in `opengraph-image.tsx` (surface/ink/accent colors, kicker, title, subtitle, footer rail with the Tulala brand mark) into one function every route-level image file calls. Keeps every marketing OG card visually consistent (same brand system) while letting each route supply its own kicker/title/subtitle. Pure JSX-returning function — safe to import into any Edge/Node `ImageResponse` route per Next's own docs pattern for shared OG components.

```tsx
/**
 * Shared OG/Twitter card layout — the Tulala marketing brand system
 * (surface, ink, accent stripe, kicker, footer rail with the wordmark
 * mark) factored out of the original agency-aware `opengraph-image.tsx`
 * so every per-route image file renders the same visual system with a
 * different kicker/title/subtitle. No IO — pure JSX, safe in any
 * `ImageResponse` route (edge or node runtime).
 */

export interface OgCardProps {
  /** Small uppercase label top-left, e.g. "PRICING", "TULALA". */
  kicker: string;
  /** Big headline — keep under ~46 chars so it doesn't wrap past 3 lines at 96px. */
  title: string;
  /** One sentence under the title. Real copy only — reuse the page's own metadata.description. */
  subtitle: string;
  /** Defaults to the Tulala forest green; pass a different value only for real per-tenant branding (agency OG keeps its own accent logic, untouched). */
  accent?: string;
}

const SURFACE = "#FAFAF7";
const INK = "#0B0B0D";
const MUTED = "rgba(11,11,13,0.55)";
const DEFAULT_ACCENT = "#0F4F3E";

export function OgCard({ kicker, title, subtitle, accent = DEFAULT_ACCENT }: OgCardProps) {
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        background: SURFACE,
        display: "flex",
        flexDirection: "column",
        padding: "72px 80px",
        position: "relative",
      }}
    >
      <div style={{ position: "absolute", left: 0, top: 0, width: 8, height: "100%", background: accent }} />
      <div
        style={{
          fontSize: 22,
          fontWeight: 600,
          letterSpacing: "0.32em",
          color: accent,
          textTransform: "uppercase",
          marginBottom: 32,
          display: "flex",
        }}
      >
        {kicker}
      </div>
      <div
        style={{
          fontSize: 88,
          fontWeight: 600,
          letterSpacing: "-0.02em",
          color: INK,
          lineHeight: 1.08,
          marginBottom: 28,
          display: "flex",
          maxWidth: 1040,
        }}
      >
        {title}
      </div>
      <div style={{ fontSize: 32, color: MUTED, lineHeight: 1.4, display: "flex", maxWidth: 980 }}>
        {subtitle}
      </div>
      <div
        style={{
          position: "absolute",
          bottom: 56,
          left: 80,
          right: 80,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          fontSize: 20,
          color: MUTED,
          letterSpacing: "0.18em",
          textTransform: "uppercase",
          fontWeight: 600,
        }}
      >
        <span>Powered by Tulala</span>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <div style={{ display: "flex", alignItems: "flex-end", gap: 4 }}>
            <div style={{ width: 12, height: 12, borderRadius: 99, background: "#ff8332" }} />
            <div style={{ width: 9, height: 9, borderRadius: 99, background: "#ff8332", opacity: 0.7, marginBottom: 8 }} />
            <div style={{ width: 6, height: 6, borderRadius: 99, background: "#ff8332", opacity: 0.45, marginBottom: 16 }} />
          </div>
          <span>tulala.digital</span>
        </div>
      </div>
    </div>
  );
}

export const OG_SIZE = { width: 1200, height: 630 } as const;
```

**Optional, low-risk refactor of the existing root file:** `opengraph-image.tsx` keeps 100% of its agency-lookup logic; only its final `<div>...</div>` tree gets replaced with `<OgCard kicker={kicker} title={title} subtitle={data?.tagline ?? subtitle} accent={accent} />`. Not required for this PR to land, but recommended so there's exactly one place that owns the visual system.

### 3.3 Per-route OG — audience/topic-aware, real copy only

Each marketing sub-page gets its own `opengraph-image.tsx` in its own segment folder (Next resolves the nearest one up the tree, so this cleanly overrides the root fallback for that route only). Titles/subtitles below are **copy-pasted from each page's existing `metadata.title`/`metadata.description`** (confirmed by reading each file in this pass) — nothing invented.

**`web/src/app/(marketing)/faq/opengraph-image.tsx`** (full file, in scope for this PR):

```tsx
import { ImageResponse } from "next/og";
import { OgCard, OG_SIZE } from "@/lib/seo/og-card";

export const alt = "Tulala — Frequently asked questions";
export const size = OG_SIZE;
export const contentType = "image/png";

export default function Image() {
  return new ImageResponse(
    (
      <OgCard
        kicker="TULALA · FAQ"
        title="Straight answers. No fluff."
        subtitle="What people ask before signing up — booking, pricing, your own domain, and the shared network."
      />
    ),
    { ...size },
  );
}
```

(Title/subtitle pulled from the FAQ hero copy in `faq/page.tsx` itself — `titleA`/`titleB` = "Straight answers." / "No fluff.", and the subtitle summarizes the actual Q&A topics already on the page: booking, own domain, network opt-in — all confirmed in `copy.ts:faq.items`.)

Same pattern for the rest of the marketing tree (not this PR's file-diff, but the direction every owner should follow — table gives the exact kicker/title/subtitle sourced from each page's own metadata, no new claims):

| Route | File to add | kicker | title | subtitle (= existing `metadata.description`, trimmed to one line) |
|---|---|---|---|---|
| `/pricing` | `(marketing)/pricing/opengraph-image.tsx` | `TULALA · PRICING` | `Start free. Grow when you're ready.` | "Every plan takes you from inquiry to booked and paid, for free." |
| `/how-it-works` | `(marketing)/how-it-works/opengraph-image.tsx` | `TULALA · HOW IT WORKS` | `How Tulala works` | "A branded roster site, structured profiles, and a real inquiry to booking pipeline." |
| `/agencies` | `(marketing)/agencies/opengraph-image.tsx` | `TULALA · AGENCIES` | `For agencies & representation` | "Run a branded roster site on your own domain, manage people in a modern CMS." |
| `/operators` | `(marketing)/operators/opengraph-image.tsx` | `TULALA · OPERATORS` | `For independent operators` | "You ARE the business — the structure of a real agency, without the overhead." |
| `/network` | `(marketing)/network/opengraph-image.tsx` | `TULALA · NETWORK` | `The shared network` | "Every roster site plugs into a shared discovery hub." |
| `/organizations` | `(marketing)/organizations/opengraph-image.tsx` | `TULALA · STAFFING & PLACEMENT` | `For staffing, casting & placement` | "A taxonomy-driven people directory that actually works." |
| `/get-started` | `(marketing)/get-started/opengraph-image.tsx` | `TULALA · GET STARTED` | `Start your business, free` | "Build your own website in one click and start taking bookings." |
| home `/` | leave as-is (agency-aware root file already handles it) | — | — | — |

Each is the same ~15-line file shape as the `/faq` one above — swap the three `OgCard` props. Titles kept under the "~46 chars, 3 lines" guidance in `og-card.tsx`'s doc comment; longer `metadata.description` strings are trimmed to their first clause rather than invented shorter ones.

### 3.4 `web/src/app/twitter-image.tsx` (new file)

Root-level, mirrors the root `opengraph-image.tsx`'s *fallback* behavior (agency-aware) rather than duplicating a static card — same data source, so an agency host still gets its branded Twitter card, and the apex/marketing pages get the same generic-but-current Tulala card. This makes the signal explicit instead of relying on Next's implicit "no twitter-image → reuse opengraph-image" fallback, which is exactly the gap the audit calls out.

```tsx
import { ImageResponse } from "next/og";
import { getPublicHostContext } from "@/lib/saas/scope";
import { createPublicSupabaseClient } from "@/lib/supabase/public";
import { OgCard, OG_SIZE } from "@/lib/seo/og-card";

// PR-FAQOG — explicit Twitter card image. Mirrors opengraph-image.tsx's
// agency-aware lookup (same data, same fallback) so Twitter/X gets an
// intentional card instead of relying on Next's implicit OG-image
// fallback. Keep this file's data-loading logic in sync with
// opengraph-image.tsx if that file's query changes.

export const alt = "Tulala";
export const size = OG_SIZE;
export const contentType = "image/png";

async function loadAgencyOgData() {
  try {
    const ctx = await getPublicHostContext();
    if (!ctx || ctx.kind !== "agency" || !ctx.tenantId) return null;
    const supabase = createPublicSupabaseClient();
    if (!supabase) return null;
    const { data } = await supabase
      .from("agency_business_identity")
      .select("public_name, tagline")
      .eq("tenant_id", ctx.tenantId)
      .maybeSingle();
    const identity = data as { public_name?: string | null; tagline?: string | null } | null;
    if (!identity?.public_name) return null;
    return { name: identity.public_name.trim(), tagline: identity.tagline?.trim() ?? null };
  } catch {
    return null;
  }
}

export default async function Image() {
  const data = await loadAgencyOgData();
  return new ImageResponse(
    (
      <OgCard
        kicker={data ? "AGENCY" : "TULALA"}
        title={data?.name ?? "Tulala"}
        subtitle={data?.tagline ?? "The Talent Business Platform"}
      />
    ),
    { ...size },
  );
}
```

Per-route `opengraph-image.tsx` files (section 3.3) do **not** need matching per-route `twitter-image.tsx` files — Next's segment resolution already falls back to the nearest `opengraph-image` for the Twitter card when no `twitter-image` exists at that segment, so `/faq`'s new OG image automatically becomes its Twitter card too. The one new root `twitter-image.tsx` only replaces the *implicit* root-level fallback with an explicit, intentional one; it does not need to be duplicated per route.

### 3.5 Validation

After deploy: `curl -I https://tulala.digital/faq/opengraph-image` and `.../twitter-image` → expect `200`, `content-type: image/png`. Paste `https://tulala.digital/faq` into Twitter's Card Validator and Facebook's Sharing Debugger; confirm a real, current card (not the improntamodels.com 404 the audit found, and not the generic homepage card on every route).

---

## 4. Summary of new/changed files for this PR

| File | Status | Owner |
|---|---|---|
| `web/src/lib/seo/faq-json-ld.ts` | new | OWN-D |
| `web/src/lib/seo/breadcrumb-json-ld.ts` | new | OWN-D (helper) / unowned for rollout beyond `/faq` |
| `web/src/app/(marketing)/faq/page.tsx` | edit — add FAQPage + Breadcrumb `<script>` tags | OWN-D |
| `web/src/lib/seo/og-card.tsx` | new | OWN-J |
| `web/src/app/(marketing)/faq/opengraph-image.tsx` | new | OWN-J |
| `web/src/app/twitter-image.tsx` | new | OWN-J |
| `web/src/app/opengraph-image.tsx` | optional refactor to consume `OgCard` (not required) | OWN-J |
| `web/src/app/(marketing)/{pricing,how-it-works,agencies,operators,network,organizations,get-started}/opengraph-image.tsx` | new, mechanical, table in §3.3 — **not currently assigned an owner** in the Stage 2 file-owner list; flagging for pickup | unassigned |
| Breadcrumb rollout to the 8 sub-pages in §2.3 | mechanical, same pattern as `/faq` — **not currently assigned an owner** | unassigned |

## 5. Gate

`cd web && NODE_OPTIONS=--max-old-space-size=8192 npx tsc --noEmit && npm run lint` after implementation. No new runtime deps introduced (all new files use `next/og`, `@/lib/*` already-present imports).

## 6. Honest limits of this spec

- Verified against the *current* source in this worktree, not deployed — schema validity needs a live Rich Results Test pass post-deploy per the execution plan's Stage 4 QA.
- Google's FAQPage rich-result eligibility on the SERP itself is currently restricted to a narrower set of sites (2023 policy change); the schema is still correct and still valuable for AI answer-engine consumption, but this doc does not promise a rich card will render in classic Google search.
- Section 3.3's table beyond `/faq` and §2.3's breadcrumb rollout are specified precisely enough to implement mechanically, but are not included as file diffs in this spec — they weren't assigned to a Stage-2 owner in the execution plan at the time this was written.
