# Tulala.Digital — SEO Foundation Run: Final QA + Rescore

**Date:** 2026-07-22
**Branch:** `seo/tulala-organic-foundation` (worktree `/Users/oranpersonal/Desktop/impronta-seo`, NOT deployed)
**Baseline audit:** [`tulala-seo-organic-marketing-audit-2026-07-22.md`](./tulala-seo-organic-marketing-audit-2026-07-22.md)
**Phase C content plan:** [`_seo-run/keyword-map.md`](./_seo-run/keyword-map.md)
**Method:** In-code verification only. The branch is not deployed, so anything that depends on a live HTTP response (OG image 200, GSC hreflang acceptance, cache-control headers, Lighthouse) is flagged **must-verify-live-after-deploy**, not claimed as banked.

---

## 1. Executive summary

The Phase A foundation shipped in code, plus a meaningful slice of Phase B. Every P0 from the audit is addressed at the source level:

- **Broken social image (CRITICAL):** root cause fixed. `metadataBase` is now `https://tulala.digital` (root layout + a dedicated `marketingSiteMetadataBase()`), the marketing apex emits **no** `images` override so `og:image`/`twitter:image` resolve to the site's own `/opengraph-image` file-route, and the agency branch coerces its image against the request host (never `improntamodels.com`).
- **No canonical / no hreflang:** `buildMarketingLocaleAlternates()` emits a self-referencing canonical + `en`/`es`/`x-default` hreflang, and it is wired into **all 11 core marketing pages + home**. Sitemap now advertises `/es` alternates.
- **Zero marketing schema:** `PlatformJsonLd` (Organization + WebSite + SoftwareApplication `@graph`) is mounted in the root layout on the platform surface only; `/faq` emits FAQPage + BreadcrumbList built from the same visible Q&A copy.
- **Positioning not deployed:** tagline is now **"The Commerce Platform for Talent"**, the logo descriptor renders in header (desktop) + footer in EN and ES, and the hero carries the value message.

**Honest overall: 4/10 → 5/10 in-code (Foundation milestone reached).** It is not yet 6+ because content depth (Phase C) is only planned, per-page OG art is not built, breadcrumbs are only on `/faq`, the 3rd brand message (vision) is not placed, and the whole thing still needs live verification to bank. Performance stays unscored (no Lighthouse run). Authority stays time-gated.

**Gate status (as reported by the build/lint agent):** tsc CLEAN (zero output), lint CLEAN (zero output), no fixes required. The new JSON-LD/OG-image files introduced no type or lint errors.

---

## 2. Before / After scorecard (11 categories)

Scores are the marketing surface only, and honest: a category rises only where the criteria are actually met **in code**. "After" is an in-code score; live verification can raise several of these once deployed.

| # | Category | Before | After (in-code) | Target | Evidence | Remaining work |
|---|---|---|---|---|---|---|
| 1 | Technical SEO | 5 | **7** | 8 | `metadataBase = https://tulala.digital` (layout.tsx:105); `buildMarketingLocaleAlternates` emits canonical + hreflang (en/es/x-default) on all 11 pages + home; sitemap emits `/es` marketing + talent alternates (sitemap.ts) | Live GSC hreflang/International-Targeting confirmation; homepage `force-dynamic` + any `no-store` header still to check live |
| 2 | Content & copy | 5 | **6** | 8 | Owned copy rewritten; **0 em dashes in prose of owned files** (meta descriptions clean); hero H1 no longer a run-on; bilingual body copy intact | Em dashes still live in ~28 **untouched** `components/marketing/*` files (trust-strip, contrast, flagship, case-studies, directory, modals); human read-through of full surface |
| 3 | Brand positioning | 4 | **6** | 8 | `tagline: "The Commerce Platform for Talent"` (brand/tulala.ts:32); descriptor in header (header.tsx:172/776) + footer (footer.tsx:61), EN + ES ("La Plataforma de Comercio para el Talento"); hero = "Your Business. Your Brand. Your Bookings." / "All in one place." + ES equivalents (copy.ts:101-102, 452-453) | **3rd message (vision) "Your Talent. Your Business. Your Digital World." is NOT present anywhere** — no About/vision section to host it |
| 4 | Search-intent coverage | 3 | **3** | 7 | No change in code | Phase C not built — talent-category / use-case / educational / comparison pages only **planned** in `_seo-run/keyword-map.md` |
| 5 | Structured data | 2 | **6** | 8 | Organization + WebSite + SoftwareApplication `@graph` mounted platform-only (platform-json-ld.tsx, layout.tsx:198); FAQPage + BreadcrumbList on `/faq` from same copy (faq/page.tsx:47-71); all JSON validated well-formed | BreadcrumbList only on `/faq` — roll out across sub-pages; SoftwareApplication has no `offers` (deliberate: prices are DB/currency-localized) |
| 6 | Social sharing | 2 | **5** | 8 | OG domain fixed (metadataBase + no apex `images` override → own `/opengraph-image`); agency branch coerces to request host; `twitter-image.tsx` re-exports the OG route; apex card renders "The Commerce Platform for Talent" | **Per-page OG images NOT built** — every sub-page shares one generic card; **live check that `/opengraph-image` returns 200 + validator preview** |
| 7 | AI-search readiness | 4 | **6** | 8 | Organization/WebSite entity + FAQPage machine-readable; bilingual SSR; SoftwareApplication describes the product truthfully | `Organization.sameAs` deliberately omitted (no verified owned social profiles); add once real profiles exist |
| 8 | Conversion experience | 6 | **6** | 8 | Hero message hierarchy aligned to category/value split | Not re-audited in a live visual pass; message hierarchy per-page not verified against real render |
| 9 | Performance & mobile | not scored | **not scored — needs Lighthouse** | 8 | No measurement run | Run Lighthouse/CWV post-deploy; audit still flags 8 preloaded woff2 fonts |
| 10 | Trust & authority | 3 | **3 (time-gated)** | 6 | Organization entity foundation laid in schema | Backlinks, domain authority, verified `sameAs` are earned over time, not code |
| 11 | **Overall organic readiness** | **4** | **5 (Foundation, in-code)** | 9 (staged) | A1–A6 + FAQPage/Breadcrumb/SoftwareApplication/twitter-image/bilingual-metadata all in code | Bank via live verification; then per-page OG, site-wide breadcrumbs, Phase C content, Lighthouse |

**Why not higher:** the audit defines 5/10 as "Foundation" (A1–A6 shipped **and verified**). In code, A1–A6 are done and several Phase-B items landed, but "verified" requires the deploy + live checks in §4, per-page OG and content depth are absent, and inflating past 5 before live confirmation would violate the honesty rule.

---

## 3. Acceptance-criteria checklist (what was verified)

| Check | Result | Detail |
|---|---|---|
| Em dashes in owned marketing copy | **PASS (prose) / residual noted** | **0 em dashes in the prose/body/meta of owned files.** 46 raw `—` chars remain in owned files but all are non-prose: **41 in code comments** (layout, page, sitemap, tulala.ts, og/twitter routes, platform-json-ld) and **5 in `<title>` brand-tagline separators** (`Tulala — The Commerce Platform for Talent`, layout.tsx ×3, page.tsx ×2). `lib/marketing/copy.ts` = 0. Untouched non-owned `components/marketing/*` files still carry ~100 (out of scope for this run). |
| metadataBase → tulala.digital | **PASS** | `layout.tsx:105` `new URL(\`https://${PLATFORM_BRAND.domain}\`)`; `PLATFORM_BRAND.domain = "tulala.digital"`. Marketing apex emits no `images`, so OG resolves to `tulala.digital/opengraph-image`, not improntamodels.com. |
| Canonical + hreflang emitted | **PASS** | `buildMarketingLocaleAlternates` (locale-alternates.ts:54) → canonical + `{en, es, x-default}`; wired into all 11 core pages + home. |
| Organization + WebSite JSON-LD exists + mounted | **PASS** | `PlatformJsonLd` mounted at `layout.tsx:198` (platform surface only, `!publicScope`). |
| FAQPage JSON-LD on /faq | **PASS** | `buildFaqPageJsonLd` from `getMarketingCopy(locale).faq.items` (faq/page.tsx:47), plus BreadcrumbList. |
| JSON well-formed | **PASS** | Plain objects via `JSON.stringify`; platform graph escapes `<`→`<`; reconstructed + `JSON.parse` round-trips clean. Note: faq/breadcrumb do not escape `<` (low risk, controlled copy). |
| Tagline = "The Commerce Platform for Talent" | **PASS** | brand/tulala.ts:32. |
| Descriptor in header + footer | **PASS** | header.tsx:172/776, footer.tsx:61; EN + ES (copy.ts:96, 447). |
| Hero = value message (EN+ES) | **PASS** | copy.ts:101-102 (EN), 452-453 (ES). |
| twitter-image route | **PASS** | `twitter-image.tsx` re-exports `./opengraph-image`. |
| Per-page OG | **FAIL (deferred)** | No per-route `opengraph-image` files; only home sets `openGraph` in metadata. All sub-pages share the one apex card. |
| Gate (tsc + lint) | **PASS (reported)** | Both clean, no fixes; per the build agent's stated result. |

---

## 4. Verified in-code vs must-verify-live-after-deploy

**Verified in code (this QA):**
- metadataBase, canonical, hreflang, sitemap `/es` alternates
- Organization + WebSite + SoftwareApplication + FAQPage + BreadcrumbList JSON-LD present, mounted, well-formed
- tagline, header/footer descriptor, hero value message (EN + ES)
- twitter-image route; marketing apex OG has no wrong-domain image override
- logo asset `public/brand/tulala-mark-512.png` exists (referenced by Organization schema)
- 0 em dashes in owned prose/meta copy

**Must verify live after deploy (do not bank until confirmed):**
1. `https://tulala.digital/opengraph-image` returns **200** + renders the Tulala card (it is a dynamic `ImageResponse`, not a static file); validate on the Facebook/X/LinkedIn preview debuggers.
2. Live `<head>` on `/` and `/pricing` shows `rel=canonical` + hreflang; GSC URL inspection + International Targeting accept the pairs.
3. Rich Results / Schema validator passes Organization, WebSite, FAQPage, BreadcrumbList on live URLs.
4. Homepage cache-control (`force-dynamic` root) does not re-introduce `private, no-store` on the marketing apex.
5. Lighthouse/CWV mobile pass (category 9 stays unscored until then); revisit the 8 preloaded fonts.

---

## 5. Full changelog (files changed on the branch)

**New files (7):**
- `src/app/twitter-image.tsx` — explicit Twitter/X card route (re-exports OG)
- `src/components/marketing/platform-json-ld.tsx` — Organization + WebSite + SoftwareApplication `@graph`
- `src/lib/seo/faq-json-ld.ts` — FAQPage builder (from visible copy)
- `src/lib/seo/breadcrumb-json-ld.ts` — BreadcrumbList builder
- `docs/_seo-run/` — run artifacts: `keyword-map.md` (Phase C plan), PR-BRAND/COPY/META/SCHEMA/FAQOG/BILINGUAL notes
- `docs/tulala-seo-autonomous-execution-plan-2026-07-22.md`
- `docs/tulala-seo-organic-marketing-audit-2026-07-22.md`

**Modified — app / metadata (5):**
- `src/app/layout.tsx` — metadataBase, title/OG/twitter defaults, PlatformJsonLd mount
- `src/app/page.tsx` — marketing/agency OG branches, `toAbsoluteUrl` host coercion, marketing alternates
- `src/app/sitemap.ts` — `/es` marketing + talent alternates
- `src/app/opengraph-image.tsx` — apex "Commerce Platform for Talent" card + agency-aware branch
- `src/lib/seo/locale-alternates.ts` — `marketingSiteMetadataBase` + `buildMarketingLocaleAlternates`

**Modified — 11 marketing pages:** `agencies`, `faq`, `get-started` (+ `actions.ts`), `how-it-works`, `integrations`, `legal/privacy`, `legal/terms`, `network`, `operators`, `organizations`, `pricing` — each adds `buildMarketingLocaleAlternates` + bilingual `generateMetadata`; copy de-em-dashed.

**Modified — brand / copy / components (10):**
- `src/lib/brand/tulala.ts` — tagline + description
- `src/lib/marketing/copy.ts` — descriptor, hero value message (EN+ES), copy rewrite
- `src/lib/marketing/photography.ts`
- `src/components/marketing/{header,footer,hero-section,feature-grid-section,how-it-works-section,get-started-form,case-studies-data}` — descriptor lockup, hero, copy

---

## 6. Remaining work (prioritized)

1. **Deploy + run the 5 live checks in §4** — this is what converts "5/10 in-code" into a banked Foundation score. Nothing else should be claimed until OG returns 200 and canonical/hreflang/schema validate live.
2. **Per-page OG images (B4)** — add audience/topic-aware cards so sub-pages stop sharing one generic image (Social 5→7).
3. **Finish the em-dash sweep** — ~28 untouched `components/marketing/*` files still carry user-facing em dashes (trust-strip, contrast, flagship, case-studies, directory, register/login modals). Sentence-level rewrite, not blind replace.
4. **Place the 3rd brand message (vision)** — "Your Talent. Your Business. Your Digital World." needs an About/vision home; currently absent (caps Brand at 6).
5. **Site-wide BreadcrumbList** — extend beyond `/faq` (Structured data 6→7).
6. **Lighthouse/CWV pass** — unscores → scores category 9; trim preloaded fonts.
7. **Phase C content** — build the high-intent landing/education pages per `_seo-run/keyword-map.md`. Each page must earn its existence; no thin bulk pages (Search-intent 3→7).
8. **Add `Organization.sameAs`** once real verified social profiles exist (currently, correctly, omitted).

Phase C content plan: **[`docs/_seo-run/keyword-map.md`](./_seo-run/keyword-map.md)**.
