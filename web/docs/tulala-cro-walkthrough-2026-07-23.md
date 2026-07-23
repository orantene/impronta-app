# Tulala CRO Funnel Walkthrough (Plan Wave 3.1)

**Date:** 2026-07-23
**Method:** logged-out visitor, in-app headless browser, EN + ES, desktop (1280) + mobile (375). Every CTA link validated by HTTP sweep. Ambiguous client-state results confirmed against deployed code, never guessed.
**Subject:** the two conversion paths — talent signup and business signup — plus pricing and the mobile/ES variants.

---

## Verdict: the funnel is healthy. No P0, no P1 defects.

This is a genuine pass, not a soft one. Both signup paths work, no CTA is dead, pricing is clear, mobile and Spanish are solid. The honest outcome of "fix the P0/P1 findings" (Wave 3.2) is that there are none to fix. Conversion moves 6 (provisional, never audited) → 8 (audited live, verified healthy), not because code changed but because it is now verified.

It is not 9/10 because two things remain open design/strategy calls (below) and because true CRO 9+ needs A/B data at real traffic, which does not exist yet.

---

## What was verified working

| Path / surface | Result | Evidence |
|---|---|---|
| **Talent signup** (primary CTA "Sell your work · free") | ✅ Opens a clean modal: "JOIN AS TALENT · FREE / Your talent page, live in minutes", Google + email/password | Opened live in-session |
| **Business signup** ("Start a business" / "Get started" → /get-started) | ✅ Business-name-first, low friction, "Free · no card", "under ten minutes", inline `tulala.digital/your-business` preview, email lower, everything else optional | Rendered live |
| **No dead ends** | ✅ Every funnel CTA (incl. `?tier=`, `?audience=` deep links) returns 200 | HTTP sweep of all extracted hrefs |
| **Pricing** | ✅ 4 tiers (Free / Studio $49 "Most Popular" / Agency $149 / Network $499), **MXN auto-detected** for LATAM, per-tier CTA, full comparison table, "annual saves 20%, data always yours" | Rendered live |
| **Mobile hero (375)** | ✅ H1 wraps cleanly, both CTAs full-width tap targets, trust ticks 2 rows, 7 carousel dots; descriptor correctly hidden to keep the bar clean | Screenshot |
| **Mobile nav** | ✅ Code-correct (`onClick` toggles `menuOpen`, renders full nav panel) | header.tsx:263-300 |
| **Spanish funnel** | ✅ Fully localized, natural Mexican "tú", zero English leakage in body | get_page_text on /es |
| **Copy quality** | ✅ Specific, no prose em dashes, no fabricated claims; comparison-table `—` are legitimate not-included glyphs | get_page_text |

---

## Open items (owner decisions, deliberately not changed unilaterally)

- **P2 — Hero photography is ~90% obscured.** At every width the hero reads as a near-black block; the editorial talent photo only emerges behind the modal backdrop blur. This is intentional dark/premium design, and reducing the left-side gradient opacity risks H1 legibility. It is a design call (like the carousel auto-rotate decision), not a defect. Recommendation if you want the photography to land: a lighter gradient on the photo-side third, or a brighter lead slide.
- **P2 — `/es` homepage `<title>`** renders the English brand line. Defensible (brand + category name), but a Spanish homepage title could help ES ranking. Left as-is because the homepage title is the brand line by design.

---

## Tool limitations (disclosed, worked around)

- The headless pane does not propagate React `onClick`/`useState` for some components (scroll-reveal sections render blank; mobile-menu toggle did not fire). Confirmed those are code-correct rather than logging false bugs. The CustomEvent-based talent modal *did* drive, so it was verified visually.
- The get-started form was **not** submitted end-to-end — a real submission creates a live workspace and requires email verification. Its structure and copy were audited; the newsletter signup on /resources was already proven end-to-end earlier (row in DB), which exercises the same server-action + email pattern.

---

## Score

Conversion (CRO): **6 (provisional) → 8 (audited, healthy)**. Path to 9: resolve the two P2 design calls and gather A/B data at real traffic.
