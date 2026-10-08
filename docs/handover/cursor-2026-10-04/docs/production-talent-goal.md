# Production talent goal (Oran 2026-10-03)

## Goal
1. Verify on **production** that a talent gets the full experience end-to-end: sign up → onboarding → pick/switch theme (Folio, Maison, Gridline) → services → booked → paid → Messages → Money. Every finished feature working live — not localhost, not cohort-only.
2. Then build more themes and apps on that foundation.

## Jorgelina (TAL-JORGBEAUTY / book-jorgelina.tulala.digital)
- Real friend talent; Oran hands her the account in days for real use + feedback.
- **100% working on production** — every finished feature ON like any real talent.
- No allow-lists / cohorts / QA-only gates may hold finished features back. Prefer product-on for everyone (e.g. Maison=`all`).
- After Jor works: Oran registers a **brand-new talent from zero** on production; same full SaaS, no manual help.
- **Configure-ok, no fake money:** may set settings/theme/services on Jor so it works; **no** fake bookings, test payments, or QA data on her account. Paid/booking QA → **TAL-93900** only.

## Themes (learn before adding)
- Talent Factory (Builder Lab) — `web/src/components/builder-lab/talent-factory/*` — separate from agency starters.
- Catalog + sync — `web/src/lib/talent-site/theme-catalog/*`
- Releases — `web/src/lib/talent-site/theme-releases/*` (release-manager, merge-site, base-resolver, lazy-fan-out, offer-actionable)
- ThemeUpdateNotice — Presence + page builder
- Designs = editable defaults (fonts/sizes/colours/shapes overridable)
- ~32 themes; first perfect: **Folio, Maison v2, Gridline**
- Planned: Talent Theme Studio (not built)

Live prove chain: author/release in Talent Factory → TAL-93900 update notice → preview → upgrade keeps content → demos get it.

## Apps
- Trade add-ons; Apps tab + gallery badge; Nail Designer first (port 1:1 from Oran’s design); apps ↔ templates both ways.

## Order of work
1. Jorgelina 100% live (Maison=`all` + #2508, Change design/Colors, finished features visible) → tell Oran when handoff-ready
2. Full production proof (DONE + QA stories) on TAL-93900 + fresh signup
3. Folio/Maison/Gridline switch flawless + release/update chain live
4. Only then: new themes + apps

## hCaptcha
Production guest captcha stays. QA: Take Control once, **or** propose server-side bypass for `@impronta.test` + env secret (not a public flag). Don’t stall S4–S6.

Update STATUS.md + FEATURES.md as we go.
## Master directive (2026-10-03)

- [Master directive](./cursor-master-directive-2026-10-03.md)
- [Prod human QA + front chat](./prod-human-qa-and-front-chat.md)
- [Plan](/opt/cursor/artifacts/plans/prod_human_qa_chat_3496ad50.plan.md)
