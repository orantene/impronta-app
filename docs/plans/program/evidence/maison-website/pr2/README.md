# Maison website — PR 2 evidence

**Branch:** `cursor/maison-pr2-design-nodes-8b57`  
**Closes:** W9–W16 (architecture + tests)  
**Base:** `fcdbc1cfd` (PR0+PR1 W1–W8)

## Delivered

| W | Work | Proof |
|---|---|---|
| W9 | Maison Design payload = `shellTree` + `homeTree` | `theme-catalog/maison/design-payload.ts` + validate tests |
| W10 | Allowlist kinds used in trees | `services_catalog`, `accordion`, `reveal` in payload (allowlist from PR1) |
| W11 | Visual match ~1280 vs prototype | **BLOCKED** — see below |
| W12 | True phone layout (~390) | `responsive.mobile.layout: stack` on services + contact; catalog `mobileBar: float` |
| W13 | Preview hydration Demo \| My content | `preview-hydration.ts` + tests (preview-time only; booking inert) |
| W14 | Offering behaviour + free-plan prices | `services_catalog` `showPrice: true`; CTAs via existing catalog ladder |
| W15 | Demo-inert CatalogBookingSheet | `catalog-booking-sheet.test.tsx` “W15 demo mode never writes…” |
| W16 | FAQ bind + Fraunces/Inter | accordion `bindSource: talent_faq_items` + loader; Looks fonts |

## Visual sign-off — BLOCKED

Owner pack pieces still **missing** on this VM:

- `pdf-build-scope/` parts 1–2
- `prototype-source/talent-proto.html` + `slice-mz*.js`

No 1280 / 390 screenshots claimed. Re-open visual QA when PDFs/prototype land; do not invent goldens.

## Gates

- `npm run typecheck`
- `npm run lint`
- Maison unit: design-payload / faq-bind / preview-hydration / builtins
- CatalogBookingSheet W15 demo inert

## Migrations

None in PR 2 (FAQ table + catalog kinds landed in PR 1).
