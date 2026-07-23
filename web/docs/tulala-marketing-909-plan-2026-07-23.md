# Tulala Marketing — the 9/10 Plan

**Date:** 2026-07-23
**Baseline:** the live-verified audit of the same date. Scores below are the audited ones, not aspirational.
**Rule of this plan:** every score increase names the work, the owner, and the acceptance test. A function only moves when its test passes live. Where 9 or 10 is not reachable by code, this plan says so instead of pretending.

---

## Scoreboard: current → target, and what stands in the way

| Function | Now | Target | Reachable by code? | Blocker if not |
|---|---|---|---|---|
| Technical SEO | 8 | 9 | Yes (Wave 1) | 10 needs months of clean crawl data |
| Content | 7 | 9 | Mostly (Waves 1+4) | ES human read (owner) |
| Brand system | 7 | 9 | Mostly (Wave 1) | Real social profiles (owner) |
| Analytics | 8 | 9 | Yes (Wave 3) | 10 needs weeks of real conversion data |
| Demand capture | 2 | 8 | Yes (Waves 1+4) | 9+ needs directory density + rankings (time) |
| Email / CRM | 0 | 7 | Yes (Wave 2) | 9 needs list growth + sequence data (time) |
| Social presence | 0 | 6 | No | Accounts must exist (owner); 9 = posting cadence |
| Conversion (CRO) | 6 | 8 | Yes (Wave 3) | 9+ needs A/B data at real traffic (time) |
| Paid / PR | 0 | n/a | — | Deliberately descoped pre-launch; budget decision |

Honesty clause: **10/10 is not code-achievable for any acquisition function.** Rankings, deliverability reputation, follower counts, and statistically significant CRO wins are earned in calendar time. This plan gets every function to the highest score that can be *verified* now, and puts the rest on a measured clock.

---

## Wave 1 — Fix what's broken + capture the demand side (code, ~1 day)

The strategic centerpiece: our own Keyword Planner data shows demand-side terms get ~10x supply-side volume, and the best term found ("agencia de talento", 100–1K/mo, LOW competition) describes the platform. The demand surface `/directory` exists and is orphaned.

| # | Item | Acceptance test |
|---|---|---|
| 1.1 | `/directory` SEO package: canonical + hreflang, sitemap entry, hire-intent title/description EN+ES (ES targets "agencia de talento"/"contratar" phrasing), ItemList JSON-LD of visible talent | Live head shows all four; sitemap contains /directory + /es/directory |
| 1.2 | Hero eyebrow: retire "The talent business platform" (use "Sell your work. Run the business." style value line; category stays in the logo lockup) | Old string absent from live homepage EN+ES |
| 1.3 | Sitemap: add `/integrations`, `/help`, `/discover-agencies` (leave `/status` and `/waitlist` out deliberately — operational pages) | Sitemap count grows by 6 (EN+ES) |
| 1.4 | Per-page OG for all 15 content pages (`/for/*`, `/resources/*`) via the existing `og-card` helper in the dynamic routes | Each route's og:image URL unique; returns 200 image/png |
| 1.5 | Remove placeholder social links from footer (restore when real profiles exist) | No `href="https://instagram.com"`-style bare links in live footer |
| 1.6 | Fold Wave-1 learnings into `_seo-run/keyword-map.md` header pointing to the real-data doc | Doc cross-links |

Moves: Technical SEO 8→9 · Demand capture 2→6 · Brand 7→8 · Content 7→8.

## Wave 2 — Email/CRM from zero (code, ~1 day)

The cheapest owned channel, currently nonexistent. Resend is already wired into the product for transactional mail.

| # | Item | Acceptance test |
|---|---|---|
| 2.1 | `marketing_subscribers` table (email, locale, source, consent timestamp, unsubscribe token) + server action with rate limit and honeypot | Signup writes a row; abuse-tested |
| 2.2 | Capture module on `/resources` + resource article footers: "Get booked more — one practical guide per week" EN+ES | Visible on live pages; mobile OK |
| 2.3 | Welcome email (EN+ES by locale) delivering the best existing guide; unsubscribe link honoured | Test address receives it; unsubscribe works |
| 2.4 | GA4 `generate_lead` event on signup | Event visible in Realtime |
| 2.5 | NOT doing: purchased lists, popups on first paint, fake "join 10,000 others" claims | — |

Moves: Email 0→7. (9 requires list size + engagement data = time.)

## Wave 3 — Conversion audit + analytics completion (code + browser QA, ~1 day)

CRO has never been visually audited; analytics collects pageviews but no conversions.

| # | Item | Acceptance test |
|---|---|---|
| 3.1 | Full-funnel walkthrough in a real browser, EN and ES, desktop + mobile widths: home → pricing → get-started → signup (QA creds) → first-run. Every CTA clicked; dead ends, confusing copy, layout breaks logged | Findings doc with screenshots |
| 3.2 | Fix the P0/P1 findings from 3.1 (scope-boxed: copy, CTAs, layout — no funnel redesign without approval) | Re-walkthrough passes |
| 3.3 | GA4 key events: `sign_up`, `generate_lead`, talent-modal open, get-started submit; marked as key events in GA4 admin | Events flow; marked as conversions |
| 3.4 | `tenant_id` custom dimension on all platform+tenant traffic; registered in GA4 | One tenant = one row in Explore regardless of domains |
| 3.5 | Link GA4 ↔ Search Console property | Search queries visible in GA4 acquisition |
| 3.6 | Bing Webmaster Tools: submit sitemap (free second engine) | Verified + submitted |

Moves: CRO 6→8 · Analytics 8→9.

## Wave 4 — Demand-side content (code, gated, ~2 days when gate opens)

| # | Item | Gate |
|---|---|---|
| 4.1 | Spanish-first "Agencia de talento" landing page (the 100–1K/mo LOW-competition term) presenting the network + directory | None — ship now |
| 4.2 | Per-category **hire** pages ("Hire a private chef in …") backed by live directory listings | Directory density: ≥5 visible talents in that category, else the page over-promises |
| 4.3 | English "hire talent" hub page linking directory + categories | Same gate |

Moves: Demand 6→8 · Content 8→9. Rankings beyond that = time.

## Owner's list (nobody else can do these)

| Item | Unblocks |
|---|---|
| Create Instagram, LinkedIn, X accounts for Tulala (~1h) | Social 0→6 the same day I wire footer + `sameAs` + `twitter:site`; 9 needs a posting cadence — I'll draft a 4-week bilingual content calendar from existing articles the moment handles exist |
| Human read of ES copy (25 pages, ~1–2h) | Content 9 |
| Decision: hero carousel auto-rotate (LCP metric) | Perf metric only — no revenue impact claimed |
| Decision: GA4 tenant traffic — keep platform-wide view or push tenants to own IDs | Analytics cleanliness + privacy posture |
| Decision: any paid budget, or formally descope Paid/PR until post-launch | Removes the standing 0 |

## Measurement cadence (how we know the scores hold)

- Weekly: GSC impressions/clicks by page, GA4 key events, subscriber count. First review 2026-07-30.
- The 12-week content rule from the keyword map stands: any page with zero impressions at 12 weeks gets rewritten or merged, not left to rot.
- Re-audit this scoreboard monthly; scores only move on passing acceptance tests.
