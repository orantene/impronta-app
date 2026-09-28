# tulala.digital SEO audit, 2026-09-27

Full audit, strategy, keyword map, 90-day roadmap and measurement plan:
https://claude.ai/artifact/VrNEhZrd3GEoSMPSDn4rC5 (private to the owner).

Builds on the July program (`tulala-seo-organic-marketing-audit-2026-07-22.md`,
`tulala-keyword-data-real-2026-07-23.md`). Where they disagree, this is newer.

## Method

- Crawled all 315 URLs in the live `sitemap.xml` as Googlebot: status, title,
  description, canonical, robots, hreflang, H1, JSON-LD types, alt text, words.
- Read-only production query of the sitemap's talent gate vs
  `talent_discover_index`, and a scrape of `/directory` pages 1 to 5.
- Header checks (cache, TTFB) on key pages. PageSpeed API quota was exhausted,
  so performance numbers are TTFB plus the July Lighthouse baseline.

## Fixed in this PR

| Finding | Fix |
|---|---|
| All 166 `/t/*` sitemap URLs canonicalised to `app.tulala.digital`, whose robots.txt is `Disallow: /` | `canonicalTalentUrl` maps the platform app host to the apex (`talentCanonicalOrigin`). Share URLs and media-kit links follow. |
| Sitemap listed 29 fixture profiles the directory hides (Luna Alvarez / Mateo Rossi / Sofia Bennett x9, 2 QA fixtures): 58 URLs, duplicate titles | Talent branch intersects with `talent_discover_index`; falls back to the column gate if the index read fails. |
| `/get-started` (a redirect while the onboarding module is on) was in the sitemap | Listed only while it renders a page. |
| `/discover-agencies` had no canonical/hreflang; ES URL had an English title | Localized `generateMetadata` + `buildMarketingLocaleAlternates`. |
| `/es/t/*` titles in English; em-dash titles; fallback description said "Impronta" | Titles follow the page locale, query-shaped ("Maia, Modelo de moda en Playa del Carmen"); neutral bilingual fallback description. |
| Homepage `<title>` was the tagline only | "Sell what you do: booking website and payments" / "Vende lo que haces: página web con reservas y pagos". OG/Twitter keep the full tagline. |
| Compare titles "Tulala vs X" | `comparisonSeoTitle`: "X alternative: Tulala vs X" / "Alternativa a X: …". H1 unchanged. |
| 15 descriptions over 165 chars (up to 280) | Rewritten to 140 to 160. |
| Pricing / How it works titles had no keywords | Keyword titles. |
| `sitemap.platform-talent.test.ts` ran in no CI lane | Registered in `test:tenant-isolation` with the new `canonical-hosts.test.ts`. |

## Needs a human decision (not done)

- **Repo visibility:** `orantene/impronta-app` is PUBLIC and a PR page is in
  Google results.
- **Fixture cleanup.** These pages still serve 200. Per the standing rule
  (never act on `is_test_account` or name heuristics without a per-row human
  check), confirm each one before a reversible soft-delete:
  - Luna Alvarez: TAL-92117, 92121, 92127, 92130, 92133, 92136, 92139, 92142, 92146
  - Mateo Rossi: TAL-92118, 92122, 92128, 92131, 92134, 92137, 92140, 92143, 92147
  - Sofia Bennett: TAL-92119, 92123, 92129, 92132, 92135, 92138, 92141, 92144, 92148
  - QA fixtures: TAL-QAFIXFREE, TAL-QAFIXMAX
  - Also review: TAL-92074 "OrlandoAdmin" (in the directory; the name reads like a test account).

## After deploy

1. `cd web && npm run deploy:smoke`.
2. `curl -s https://tulala.digital/t/TAL-00045 | grep canonical` should show `https://tulala.digital/t/TAL-00045`.
3. `curl -s https://tulala.digital/sitemap.xml | grep -c '<loc>'` should drop by 60
   (58 fixture URLs + 2 `/get-started`).
4. GSC: request indexing for `/` and 3 talent URLs, resubmit the sitemap.

## Open engineering items (roadmap)

- Every page is `Cache-Control: private, no-store`, `x-vercel-cache: MISS`;
  TTFB 0.5 to 1.1 s single, 5 to 7 s under 6-way crawl; homepage HTML 557 KB
  (310 KB RSC payload). Make marketing routes static/ISR.
- Bing Webmaster Tools + IndexNow (ChatGPT search uses Bing's index).
- `Organization.sameAs` once brand profiles exist.
