# Tulala SEO — Autonomous Multi-Agent Execution Plan

**Date:** 2026-07-22
**Branch:** `seo/tulala-organic-foundation` (off `origin/main` `30a97b9f1`, == current prod)
**Worktree:** `/Users/oranpersonal/Desktop/impronta-seo` (isolated; main checkout untouched)
**Companion audit:** `tulala-seo-organic-marketing-audit-2026-07-22.md`
**Execution model:** Background Workflow. Producers fan out (read-only, write specs), file-owners implement disjoint files in parallel, then a gate + QA pass. You can walk away and return to a verified, ready-to-review branch.

---

## Model assignment strategy

| Tier | Model | Used for | Why |
|---|---|---|---|
| Correctness-critical | **Opus 4.8** | Metadata architecture (metadataBase/canonical/hreflang), JSON-LD schema design, root layout, sitemap, tsc/lint gate, final QA + rescore | Wiring errors here break indexing sitewide; schema must validate |
| Implementation + copy | **Sonnet 5** | Sub-page metadata, copy.ts, header/footer descriptor, hero, em-dash rewrites, FAQPage/breadcrumb | High-volume, well-specified edits with quality bar |
| Fast mechanical/creative | **Fable 5** | Bilingual ES strings, sitemap ES entries, legal-page edits, OG/twitter-image, case-study & photography copy, keyword long-tail generation | Cheap, fast, good at bulk text transforms |

## Task map (who does what, which model)

### Stage 1 — Producers (parallel, read-only; write specs to `web/docs/_seo-run/`)

| ID | Model | Output spec | Covers |
|---|---|---|---|
| PR-META | Opus | `PR-META.md` | metadataBase fix (root cause of OG 404), canonical + hreflang pattern, per-file edit list |
| PR-SCHEMA | Opus | `PR-SCHEMA.md` | Organization + WebSite + SoftwareApplication JSON-LD (real data only), mount point |
| PR-BRAND | Sonnet | `PR-BRAND.md` | 3-message system, logo descriptor treatment, hero copy EN/ES, tagline change |
| PR-COPY | Sonnet | `PR-COPY.md` | Em-dash + AI-pattern sentence-level rewrites (EN/ES), per file |
| PR-FAQOG | Sonnet | `PR-FAQOG.md` | FAQPage JSON-LD, per-page OG image plan, twitter-image, breadcrumb |
| PR-BILINGUAL | Fable | `PR-BILINGUAL.md` | ES titles/descriptions per page, sitemap ES entries |
| PR-KEYWORDS | Fable | `keyword-map.md` | Keyword + search-intent map, Phase C page briefs (content plan only) |

### Stage 2 — File owners (parallel, disjoint files; read specs, implement)

Each file has exactly one owner (no two agents touch the same file → conflict-free parallel).

| ID | Model | Files owned |
|---|---|---|
| OWN-A | Opus | `layout.tsx`, `lib/brand/tulala.ts`, new `components/marketing/platform-json-ld.tsx` |
| OWN-B | Opus | `app/page.tsx` (marketing metadata), `app/sitemap.ts`, `app/robots.ts` |
| OWN-C | Sonnet | `(marketing)/{operators,agencies,organizations,how-it-works,network}/page.tsx` |
| OWN-D | Sonnet | `(marketing)/pricing/page.tsx`, `(marketing)/faq/page.tsx` (+ FAQPage schema) |
| OWN-E | Sonnet | `(marketing)/get-started/{page.tsx,actions.ts}`, `get-started-form.tsx` |
| OWN-F | Fable | `(marketing)/legal/{privacy,terms}/page.tsx` |
| OWN-G | Sonnet | `lib/marketing/copy.ts` (hero, footer desc, em-dash, bilingual) |
| OWN-H | Sonnet | `components/marketing/{header.tsx,footer.tsx}` (logo descriptor) |
| OWN-I | Sonnet | `components/marketing/{hero-section,feature-grid-section,how-it-works-section,simple-page-hero}.tsx` |
| OWN-J | Fable | `app/opengraph-image.tsx`, new `app/twitter-image.tsx` |
| OWN-K | Fable | `components/marketing/case-studies-data.ts`, `lib/marketing/photography.ts`, `(marketing)/integrations/page.tsx` |

### Stage 3 — Gate (Opus)

`cd web && NODE_OPTIONS=--max-old-space-size=8192 npx tsc --noEmit && npm run lint`. Fix any introduced errors. Report pass/fail.

### Stage 4 — QA + rescore (Opus)

Re-read changed files, verify each Phase A/B acceptance criterion in code, grep marketing copy for remaining em dashes, produce before/after scorecard + changelog + remaining work. Write `tulala-seo-final-report-2026-07-22.md`.

---

## Acceptance criteria (verified in-code by the run)

- metadataBase set → marketing OG resolves to `tulala.digital` (no more improntamodels.com 404)
- Self-referencing canonical on every marketing page
- hreflang (en/es/x-default) on marketing pages + ES entries in sitemap
- Organization + WebSite JSON-LD in root; FAQPage JSON-LD on /faq; both valid JSON
- Tagline = "The Commerce Platform for Talent"; logo descriptor in header (desktop) + footer
- Hero = "Your Business. Your Brand. Your Bookings. / All in one place." (EN + ES)
- 0 em dashes in owned public marketing copy files
- Per-page OG config + twitter-image route present
- `tsc --noEmit` clean, `lint` clean

## Honest limits of this run

- **Verified in-code, not live.** SEO tags only prove out on the deployed site. After merge + deploy to `tulala.digital`, run: smoke test, Google Rich Results Test, GSC URL inspection, and a social-preview check. The run cannot do those from an unmerged branch.
- **No content pages built.** Phase C is delivered as a plan + keyword map, not auto-generated pages (thin-page guardrail + quality review needed).
- **Performance not scored here.** Needs a real Lighthouse run post-deploy.
- **Rankings/backlinks/authority are time-gated** and never claimed as a score.

## After the run

The branch will be ready to review. To ship: review the diff, merge `seo/tulala-organic-foundation` → `main` (auto-deploys), re-alias domains if needed, run `npm run deploy:smoke`, then do the live SEO validations above.
