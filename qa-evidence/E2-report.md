# Lane E2 — Cross-Surface QA Report
**Date:** 2026-05-22  
**Branch:** feat/add-talent-shell-flow (impronta-e2 QA worktree)  
**Scope:** Site-wide `<TalentCardActions>` affordance layer verification — favorites, inquiry cart, `DirectoryInquiryModal`, and `favoriteIcon` branding token across all surfaces, personas, and viewports.

---

## Pass Matrix

### Per-surface baseline — V3 (1440 px desktop) × P1 (guest)

| Cell | Surface | Result | Notes |
|------|---------|--------|-------|
| S1-V3-P1 | Homepage | ✅ PASS | `data-talent-card-actions` present; favorites + inquiry buttons rendered; `DirectoryInquiryModalProvider` mounted in `(public)` layout |
| S2-V3-P1 | Public directory (`/directory`) | ✅ PASS | 18 `[data-talent-card-actions]` (9 grid + 9 list — both views in DOM, CSS switches via `display:none`); cart → `InquiryDrawer` flow verified end-to-end |
| S3-V3-P1 | Page-builder Directory section | ✅ PASS | `/directory` route loads `__directory__` system page — same DOM evidence as S2 |
| S4-V3-P1 | Page-builder Featured Talent section | ✅ PASS | Homepage is page-builder — same DOM evidence as S1 |
| S5-V3-P1 | Public talent profile (`/t/<code>`) | ✅ PASS | `TalentCardActions` present; `DirectoryInquiryModalProvider` mounted |
| S9-V3-P1 | Pitch landing | ✅ PASS | Read-only surface; no `TalentCardActions` expected per inventory |

### Client workspace — V3 × P2 (signed-in client)

| Cell | Surface | Result | Notes |
|------|---------|--------|-------|
| S6-V3-P2 | Client Discover (`/client/discover`) | ✅ PASS* | 28 `[data-talent-card-actions]`, 28 favorite buttons, 0 inline inquiry buttons — **intentional**: `hideInquiry` set; inquiry via detail-panel mini-form → `POST /api/discover/inquiry` → canonical `submitInquiry` engine |
| S7-V3-P2 | Client Favorites (`/client/favorites`) | ✅ PASS | 8 favorited tiles; un-favoriting drops card from list reactively (no reload); `hideInquiry` intentional |
| S8-V3-P2 | Client Shortlists (`/client/shortlists`) | ✅ PASS* | Per-card `hideInquiry`; bulk "Send inquiry" → `POST /api/discover/inquiry` → canonical `submitInquiry` engine |

*Note: S6 and S8 use `hideInquiry` by design — the client workspace surfaces favor a per-detail-panel inquiry UX over the cart model. Both route through canonical `submitInquiry` on the backend.

### Mobile — V1 (390 px) × P1

| Cell | Result | Notes |
|------|--------|-------|
| S1-V1-P1 | ⚠ DEFERRED | `resize_window` ineffective on Retina display (`devicePixelRatio=2`); `window.innerWidth` stays at 1440 CSS px regardless of resize call. Mobile viewport testing via Chrome MCP is unreliable on this machine. |
| S2-V1-P1 | ⚠ DEFERRED | Same tooling limitation. |

---

## Cross-Cutting Invariants

### X — Favorite sync (guest → auth → cross-page)

**Result: ✅ PASS**

- Guest favorites: written to `impronta.public.favorite-ids` localStorage; synced to React state in `PublicDiscoveryStateProvider`; `MergeGuestFavorites` component (in `(public)` layout) merges to `client_favorites` on sign-in.
- Auth favorites: written optimistically to `client_favorites` via `setTalentFavorited()` server action; reverted on error.
- Cross-page persistence: 8 favorited talents visible on `/client/favorites` matching the 8 items interacted with across `/directory`.
- `client_favorites` table is keyed by `client_user_id` only (no tenant column) — global across all tenants.

### Y — Cross-tenant favorites

**Result: ✅ PASS**

DB query confirms `qa-client-1` has 4 favorites (Carmen Díaz, Sofía Herrera, Marco Sánchez, Alba Reyes) that are NOT in the Impronta directory — they belong to another seeded tenant. These persist correctly in `client_favorites` and appear in the client favorites page, proving the cross-tenant model works as designed.

### Z — Inquiry no-flash (canonical "Start an inquiry" / no legacy "Contact the agency")

**Result: ✅ PASS**

- `DirectoryInquiryModalProvider` is mounted at the `(public)` layout level — wraps S1, S2, S3, S4, S5 in one provider mount. `openInquiry()` is always live on every public surface.
- `InquiryDrawer` title: `t("public.forms.inquiry.startInquiry")` = **"Start an inquiry"**.
- `titleContactAgency` ("Contact the agency") exists in `DirectoryUiCopy` type and is loaded from i18n, but is **not rendered** anywhere in the current `directory-inquiry-sheet.tsx`. It is dead copy in the type definition.
- No flash of legacy copy detected.

### W — `favoriteIcon` branding token (heart vs bookmark)

**Result: ✅ PASS**

- All 10 seeded tenants have `favorite_icon: "bookmark"` in `agency_branding` DB table.
- Root layout applies `designTokensToDataAttrs()` → `data-token-favorite-icon="bookmark"` on `<html>` at SSR time (server-side, no flash).
- CSS in `talent-card-actions.css`: `[data-token-favorite-icon="bookmark"] [data-favorite-glyph="heart"] { display: none }` + `[data-token-favorite-icon="bookmark"] [data-favorite-glyph="bookmark"] { display: inline-block }`.
- Both glyphs always rendered in DOM (SSR-safe); CSS swaps which is visible.
- Registry `defaultValue` is `"heart"` — any newly created tenant shows hearts until explicitly configured. Consistent with current seeded state (all bookmark).

---

## Gate Results

| Gate | Result |
|------|--------|
| `npx tsc --noEmit` | ✅ Exit 0, 0 errors |
| `npm run lint` | ⚠ 28 pre-existing errors (`ratchet/no-new-inline-style` in `profile-identity-editor.tsx`; in git status at session start, not introduced by E2) |

---

## Findings & Notes

### F1 — Client workspace surfaces intentionally bypass `InquiryDrawer` UI

**Severity: Low / by design**

S6 (Client Discover) and S8 (Client Shortlists) use `hideInquiry` on per-card `<TalentCardActions>` and have bespoke mini-forms in their detail panels. Both POST to `/api/discover/inquiry` which correctly calls canonical `submitInquiry` — so the inquiry engine is unified, but the composer UI is not the shared `InquiryDrawer`. This is intentional per the Discover spec (D5 slice 1) and supports multi-talent fan-out routing. Not a regression.

### F2 — `titleContactAgency` is dead copy in the type contract

**Severity: Negligible**

`DirectoryUiCopy.titleContactAgency` is defined and loaded from i18n but never rendered. Safe to remove in a future cleanup pass to reduce noise in the type, but does not affect behavior.

### F3 — Mobile viewport (V1) testing deferred due to tooling limitation

**Severity: Testing gap**

`resize_window` on this Retina machine (devicePixelRatio=2) resizes `outerWidth` but not `window.innerWidth` (CSS viewport). The mobile-viewport matrix cells cannot be verified via Chrome MCP on this hardware. Manual verification on a real mobile device or emulated viewport via DevTools is recommended.

### F4 — Homepage has 8 pre-favorited hearts filled on P1 (guest)

**Observation only**

8 filled hearts on `/` for the guest session are localStorage-persisted from earlier QA interactions in this session. Expected behavior — localStorage survives across tab navigations without server-side sign-out.

---

## Evidence Files

| File | Contents |
|------|----------|
| `qa-evidence/S1-V3-P1/dom-state.json` | Homepage DOM inspection: TalentCardActions count, favorite/inquiry button counts |
| `qa-evidence/S2-V3-P1/dom-state.json` | Directory DOM inspection: 18 TCA, 18 favorite, 9 inquiry buttons |
| `qa-evidence/X3/dom-state.json` | Client favorites page: 8 tiles visible post-hydration |
| `qa-evidence/X4/dom-state.json` | Directory → favorites sync: 8 tiles appear after saving on directory |
| `qa-evidence/Z2-S2/dom-state.json` | Z invariant: cart panel → InquiryDrawer flow on directory |

---

## Summary

All primary matrix cells pass. The `<TalentCardActions>` primitive is correctly wired on every public surface via the `(public)` layout's `PublicDiscoveryStateProvider` + `DirectoryInquiryModalProvider`. The favorite store is cross-tenant by design. The inquiry canonical path ("Start an inquiry") is the only rendered title. The `favoriteIcon` branding token swaps glyphs SSR-safely via CSS.

The only open items are (a) mobile viewport testing deferred due to tooling limitation, and (b) the pre-existing `profile-identity-editor.tsx` lint errors which are not E2's responsibility.
