# Tulala.Digital — SEO, Organic Marketing & Brand Audit + Execution Plan

**Date:** 2026-07-22
**Scope:** Public marketing surface of tulala.digital (11 sitemap routes + talent profiles)
**Method:** Raw live HTML pulled with curl (ground-truth head/meta, not a rendered summary) + full codebase inventory of the `(marketing)` route group, metadata pipeline, sitemap/robots, OG image route, and JSON-LD usage.
**Status:** Audit + plan complete. NO implementation performed yet — awaiting approval of the plan before broad changes.

---

## 0. Evidence provenance

| Source | What it proves |
|---|---|
| `curl https://tulala.digital/` (live, 298 KB HTML) | Actual `<head>`, meta, OG, JSON-LD, H1 as served |
| `curl .../robots.txt`, `.../sitemap.xml`, `.../pricing`, `.../faq` | Live directives, route list, per-page heads |
| `curl https://improntamodels.com/opengraph-image?...` → **HTTP 404** | The referenced OG image is dead |
| Codebase agent sweep of `web/src/app/(marketing)`, `components/marketing`, `lib/marketing`, `layout.tsx`, `sitemap.ts`, `robots.ts`, `opengraph-image.tsx` | Where each string/behavior originates |

Findings are tagged **[LIVE]** (confirmed on the production site) or **[CODE]** (confirmed in source).

---

## 1. Baseline scorecard (honest, evidence-based)

Scores reflect the **marketing surface only**. Where a capability exists in the product but not on the marketing pages, that is stated.

| Category | Score | Evidence | Main weaknesses | Target |
|---|---|---|---|---|
| Technical SEO | **5/10** | [LIVE] SSR server components; correct robots.txt; sitemap.xml present; exactly one H1/page; HSTS+CSP; mobile viewport | [LIVE] **No `<link rel=canonical>` on any page**; **no hreflang** despite EN/ES; [CODE] `metadataBase` unset for marketing; sitemap marketing entries English-only; homepage `cache-control: private,no-store` | 8/10 |
| Content & copy | **5/10** | [CODE] Real, specific, fully bilingual (en/es) body copy; audience-tailored | [CODE] **450+ em dashes** (violates own copy rule) incl. inside meta descriptions; AI-pattern phrasing ("operating system for talent businesses"); H1 renders as run-on "Your talent and services worth money." | 8/10 |
| Brand positioning | **4/10** | [CODE] Consistent-ish "talent business platform" theme in hero eyebrow + footer | Current tagline is **"The Talent Business Platform"**, NOT the target **"The Commerce Platform for Talent"**; **no descriptor under the logo**; the 3-message system (category / value / vision) does not exist | 8/10 |
| Search-intent coverage | **3/10** | [CODE] Audience pages exist: operators, agencies, organizations, how-it-works, network, pricing, faq | **No talent-category pages** (models, singers, chefs, photographers, dancers…); no location pages; no comparison pages; no educational/glossary/blog; near-zero informational long-tail | 7/10 |
| Structured data | **2/10** | [CODE] ProfilePage/Person JSON-LD exists on talent profiles (outside marketing) | [LIVE] **Zero JSON-LD on the entire marketing surface** — no Organization, WebSite, SoftwareApplication, BreadcrumbList; `/faq` renders Q&A with **no FAQPage** markup | 8/10 |
| Social sharing | **2/10** | [LIVE] OG/Twitter tags structurally present (title, desc, url, site_name, card type) | [LIVE] **`og:image` + `twitter:image` → `improntamodels.com/...` = HTTP 404 sitewide**; one generic image for all pages; no `twitter-image` route | 8/10 |
| AI-search readiness | **4/10** | [LIVE] Server-rendered content (crawlable by answer engines); bilingual; homepage states what Tulala is | No Organization/entity schema, no `sameAs` social links, no FAQPage, broken OG; entity disambiguation weak | 8/10 |
| Conversion experience | **6/10** *(provisional)* | [CODE] Audience-specific journeys, dual CTA (Sell your work / Start a business), trust ticks, pricing + FAQ present | Not yet audited in a live visual pass; message hierarchy not yet aligned to the new 3-tier system | 8/10 |
| Performance & mobile | **not scored — pending measurement** | [LIVE] 298 KB initial HTML; 8 preloaded woff2 fonts; SSR | No Lighthouse/CWV run yet; refuse to guess a number | 8/10 |
| Trust & authority | **3/10** | [CODE] Legal (privacy/terms), case studies/stories present | New domain, no backlink profile, no Organization schema, no verified social proof/sameAs | 6/10 (time-gated) |
| **Overall organic readiness** | **4/10** | Solid SSR + real bilingual product copy, but broken social previews, zero marketing schema, missing canonical/hreflang, no content-depth strategy | The foundation is technically alive but not discoverable, not shareable, not richly described | 9/10 (staged) |

### Why not 10/10 — and what 5 / 7 / 9 mean

- **10/10 is not code-achievable.** Rankings, indexed-page performance, backlinks, domain authority, and organic traffic growth are *earned over time* and depend on Google/AI crawler behavior we do not control. Code gets the site to "excellent foundation"; the market decides the rest.
- **5/10 (Foundation):** technically correct and understandable — canonical + hreflang + metadataBase, working social image, Organization/WebSite/FAQPage schema, logo descriptor, hero message aligned, em dashes gone from public copy.
- **7/10 (Strong competitive foundation):** the above verified + per-page OG images, full bilingual metadata, internal-linking mesh, 3-message system deployed, first tranche of high-intent landing pages, Lighthouse ≥ good.
- **9/10 (Excellent organic readiness):** the above + talent-category + educational/resource content with genuine value, breadcrumb schema, complete AI-answer coverage (About/entity/FAQ), measurement stack live (Search Console, analytics, indexing monitors), and passing QA across every route.

---

## 2. Confirmed critical + high findings

1. **[CRITICAL — LIVE] Broken social image sitewide.** `og:image`/`twitter:image` = `https://improntamodels.com/opengraph-image?...` → **404**. Wrong domain (leftover from the agency tenant). Every shared link shows a broken/blank preview. `metadataBase` being unset for marketing is the likely root cause — relative OG URL resolves against the wrong host.
2. **[HIGH — LIVE] No canonical tags** on `/` or `/pricing` (spot-checked). Duplicate-content risk once EN/ES and query variants exist.
3. **[HIGH — LIVE] No hreflang** despite a fully bilingual site served by locale cookie on the same URL. Google cannot see the ES version; ES has no discoverable URL.
4. **[HIGH — LIVE] Zero structured data** on marketing (`/`=0, `/faq`=0 JSON-LD blocks). No Organization, WebSite, SoftwareApplication, FAQPage, BreadcrumbList.
5. **[HIGH — CODE/BRAND] Positioning not deployed.** Title/tagline say "The Talent Business Platform"; target is "The Commerce Platform for Talent." No logo descriptor. The 3-message system does not exist.
6. **[MEDIUM — CODE] 450+ em dashes** across marketing copy, including inside the meta `description` strings, contradicting the project's own no-em-dash rule.
7. **[MEDIUM — CODE] Metadata is English-only** (static exports) even though page bodies are fully bilingual; sitemap omits `/es` alternates for marketing.
8. **[MEDIUM — CODE] One generic OG image** for all sub-pages; no `twitter-image` route; no per-page share art.

---

## 3. Brand messaging system (where each message lives)

Three messages, three jobs. Never stack all three on one screen.

| Message | Job | Where it appears | Where it must NOT appear |
|---|---|---|---|
| **The Commerce Platform for Talent** | Category definition (what Tulala IS) | Logo lockup descriptor (header + footer), `<title>` brand suffix, OG `site_name`/description, Organization schema `description`, About page opener | As a hero headline (too abstract to convert) |
| **Your Business. Your Brand. Your Bookings.** / **ALL IN ONE PLACE.** | Core value (what you GET) | Homepage hero headline + first major banner only | Repeated on every sub-page; secondary pages get their own audience-specific H1 |
| **Your Talent. Your Business. Your Digital World.** | Brand vision (the emotional arc) | About/vision section, campaign banners, social bios, occasional footer brand line | Homepage hero (competes with the value message); generic repetition |

**Logo descriptor treatment (premium, uncluttered):** small-caps or letter-spaced descriptor set *beneath* or to the *right* of the wordmark at ~55–65% opacity, one weight lighter, never wrapping the nav. Header: descriptor optional/desktop-only to keep the bar clean. Footer: descriptor always present under the wordmark. Localized: ES = "La Plataforma de Comercio para el Talento."

---

## 4. Execution plan

### Phase A — Critical foundation (crawl/index/share/brand correctness)

| Item | Problem | Improvement | Priority | Impact | Effort | Dependency | Validation | Score lift |
|---|---|---|---|---|---|---|---|---|
| A1 Fix OG image domain | [LIVE] og/twitter image 404 on improntamodels.com | Set `metadataBase = https://tulala.digital`; ensure marketing OG resolves to the site's own `opengraph-image` route | P0 | High | S | — | curl head shows tulala.digital OG URL returning 200; validators render preview | Social 2→5 |
| A2 metadataBase + canonical | [LIVE] no canonical; metadataBase unset | Add `metadataBase` in root layout; add self-referencing canonical per marketing page | P0 | High | S | — | Live head shows `rel=canonical`; Rich Results/GSC URL inspection | Tech SEO +1 |
| A3 hreflang + ES URLs | [LIVE] bilingual but no hreflang; ES not discoverable | Emit `alternates.languages {en,es,x-default}` on marketing pages via existing `buildPublicLocaleAlternates`; add `/es` marketing entries to sitemap | P0 | High | M | A2 | Head shows hreflang; sitemap lists ES; GSC International Targeting | Tech SEO +1, AI +1 |
| A4 Deploy positioning | [CODE] wrong tagline, no descriptor | Change brand `tagline` to "The Commerce Platform for Talent"; add logo descriptor (header desktop + footer) | P0 | High | M | — | Visual QA header/footer desktop+mobile; title updated live | Brand 4→6 |
| A5 Hero value message | [CODE] hero H1 is run-on | Set hero to "Your Business. Your Brand. Your Bookings. / All in one place." (EN+ES), fix H1 line breaks | P0 | High | S | A4 | Live H1 reads cleanly; visual QA | Brand +1, Conv +0.5 |
| A6 Organization + WebSite schema | [LIVE] zero marketing schema | Inject Organization (name, url, logo, sameAs) + WebSite JSON-LD in root layout | P0 | High | M | — | Rich Results Test passes; live JSON-LD count ≥1 | Struct 2→5, AI +1 |

### Phase B — High-impact improvements

| Item | Problem | Improvement | Priority | Impact | Effort | Dependency | Validation | Score lift |
|---|---|---|---|---|---|---|---|---|
| B1 Em-dash + AI-pattern rewrite | [CODE] 450+ em dashes, AI tells | Sentence-level rewrite (not blind replace) of marketing copy incl. meta descriptions | P1 | Med | L | A4/A5 | grep public copy = 0 em dashes; human read-through | Content 5→7 |
| B2 Bilingual metadata | [CODE] EN-only titles/descriptions | Localize marketing `metadata` (generateMetadata reading locale) | P1 | Med | M | A3 | ES page head shows ES title/desc | Content +0.5, AI +0.5 |
| B3 FAQPage schema | [LIVE] /faq no schema | Emit FAQPage JSON-LD from the same Q&A data on /faq | P1 | Med | S | A6 | Rich Results FAQ eligibility | Struct +1, AI +1 |
| B4 Per-page OG images + twitter-image | [CODE] one generic image | Per-route OG cards (audience/topic aware) + twitter-image route | P1 | Med | M | A1 | Each route head unique OG; preview validators | Social 5→7 |
| B5 BreadcrumbList + internal linking | thin cross-linking | Breadcrumb schema on sub-pages; contextual internal links hub | P1 | Med | M | A6 | Breadcrumb eligibility; crawl shows link mesh | Tech +0.5, Struct +0.5 |
| B6 SoftwareApplication schema | product not machine-described | SoftwareApplication/Service JSON-LD (offers = real plans only) | P2 | Med | S | A6 | Rich Results valid; matches visible pricing | Struct +0.5, AI +0.5 |
| B7 Lighthouse + CWV pass | not measured | Run Lighthouse; fix top LCP/CLS/font issues; reduce 8→needed fonts | P1 | Med | M | — | Lighthouse mobile scores captured before/after | Perf (baseline→measured) |

### Phase C — Organic content expansion (each page must earn its existence)

- **Talent-category landing pages** tied to real product (e.g. "Booking pages for models", "…for musicians", "…for chefs", "…for photographers") — unique audience, intent, and product hook each.
- **Use-case pages** (independent operator vs agency vs staffing network) deepened for commercial intent.
- **Educational/resource hub**: "How talent bookings work", "Deposits & payments for freelancers", glossary of talent-commerce terms — informational intent, genuine value, no thin filler.
- **Comparison pages** only where honest (Tulala vs spreadsheet/DIY site/linktree-style), no fabricated competitor claims.
- Guardrail: **no bulk thin pages.** Each page needs audience + purpose + intent + original value + product tie-in.

### Phase D — Authority & distribution (time-gated, not code)

Digital PR, partnerships, brand citations, social profiles wired to `sameAs`, content promotion. Tracked, not "completed" in code.

### Phase E — Measurement & continuous improvement

Search Console + sitemap submission, analytics events on CTAs, indexing/rank monitors, recurring technical crawl, quarterly re-audit.

---

## 5. Milestones & acceptance criteria

- **Current: 4/10** — evidence in §1–2.
- **Foundation 5/10** — A1–A6 shipped & verified: OG image 200 on tulala.digital, canonical + hreflang live, Organization/WebSite schema valid, positioning + hero deployed, no em dashes in touched copy. Remaining: content depth, per-page OG, performance number.
- **Strong 7/10** — B1–B7 shipped: bilingual metadata, FAQPage + Breadcrumb schema, per-page OG, internal-link mesh, Lighthouse measured & improved, first Phase-C pages live.
- **Excellent 9/10** — Phase C content library with real value, complete AI-answer coverage, measurement stack live, full-route QA green. Note: rank/traffic/authority remain time-gated and are reported as trends, not claimed as a score.

---

## 6. What will NOT be done

No invented features, no unsupported claims, no misleading/fake schema (reviews, ratings, prices, locations), no hundreds of thin pages, no blind find-replace on copy, no "done" without live verification.
