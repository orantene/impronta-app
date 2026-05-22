# Lane D — Card Surface Inventory (D0)

**Date:** 2026-05-22 · **Author:** Lane D agent · **Status:** complete

Cross-check for Lane G1. Lists every profile-card surface across the site with its current
favorite and inquiry affordance wiring. Target state is every surface using `<TalentCardActions>`.

---

## Legend

| Symbol | Meaning |
|---|---|
| ✅ | Present and wired to canonical store |
| ⚠️ | Present but wrong store / bespoke / broken |
| ❌ | Absent |
| 🚫 | Read-only surface — affordances out of scope |

---

## S1 — Public directory grid · route `/directory`

| | |
|---|---|
| **Component** | `TalentCard` @ `components/directory/talent-card.tsx:179` |
| **Rendered by** | `DirectoryInfiniteGrid` @ `components/directory/directory-infinite.tsx:485` |
| **Route** | `app/(public)/directory/page.tsx` |

| Affordance | Status | Detail |
|---|---|---|
| Favorite | ⚠️ Bookmark icon wrong store | `talent-card.tsx:337` → `onSaveToggle` → `discoveryState.setSavedState` — **uses inquiry-cart `isSaved` not `isFavorited`**; icon shows saved = in cart, not = favorited |
| Inquiry | ✅ `ContactTalentButton` | `talent-card.tsx:548` → `directory-inquiry-actions.tsx:ContactTalentButton` → `isSaved`/`setSavedState` (inquiry cart) + `DirectoryInquiryModal.openInquiry()` |

**D1 target:** Replace bookmark icon + `ContactTalentButton` row with `<TalentCardActions>`.

---

## S2 — Page-builder Directory section · route any page with Directory section block

| | |
|---|---|
| **Card component** | `DirectoryCard` @ `lib/site-admin/sections/directory/DirectoryCard.tsx` (PURE — no affordances) |
| **Adapter** | `DirectoryCardAdapter` @ `lib/site-admin/sections/directory/DirectoryCardAdapter.tsx` |
| **Grid** | `DirectoryReactiveGrid` → `DirectoryReactiveResults` → `DirectoryReactiveGrid.tsx:276` |

| Affordance | Status | Detail |
|---|---|---|
| Favorite | ✅ Gold bookmark overlay | `DirectoryCardAdapter.tsx:147` → `discovery.isFavorited` / `discovery.setFavoriteState` → `setTalentFavorited` server action |
| Inquiry | ✅ "INQUIRE / Added ✓" button | `DirectoryCardAdapter.tsx:165` → `discovery.isSaved` / `discovery.setSavedState` → `setTalentSaved` server action |

**Status:** Most correct of all surfaces. Still bespoke inline buttons; D2 will replace with `<TalentCardActions>`.

> **Orphan:** `DirectoryCardActions` @ `lib/site-admin/sections/directory/DirectoryCardActions.tsx` — exported but has **zero importers**. Uses `usePublicDiscoveryState.isSaved` (inquiry cart) for the bookmark and `ContactTalentButton` for inquiry. Delete or absorb into `<TalentCardActions>` during D2.

---

## S3 — Page-builder Featured Talent section · route any page with Featured Talent block

| | |
|---|---|
| **Card component** | `FeaturedTalentCard` @ `lib/site-admin/sections/featured_talent/FeaturedTalentCard.tsx:72` |
| **Rendered by** | `featured_talent/Component.tsx:699` |

| Affordance | Status | Detail |
|---|---|---|
| Favorite | ⚠️ Decorative only | `FeaturedTalentCard.tsx:149` — CSS-only `<span data-card-bookmark>` SVG, `aria-hidden`, no JS handler |
| Inquiry | ⚠️ Static link only | `FeaturedTalentCard.tsx:84` — `requestCta?: { label: string; href: string }` prop → `<Link>`, no cart wiring |

**D2 target:** Add `<TalentCardActions>` overlay; replace decorative bookmark + static CTA.

---

## S4 — Homepage Featured Talent section · route `/` (homepage)

| | |
|---|---|
| **Component** | `FeaturedTalentSection` @ `components/home/featured-talent-section.tsx:31` |
| **Rendered by** | `AgencyHomeStorefront` @ `components/home/agency-home-storefront.tsx` |

| Affordance | Status | Detail |
|---|---|---|
| Favorite | ❌ None | Cards are bare `<Link>` elements |
| Inquiry | ❌ None | Cards are bare `<Link>` elements |

**D1 target:** Wrap each card in a container with `<TalentCardActions>` overlay. (This component
is a thin server component — TalentCardActions will need to be a client island overlay sibling,
same pattern as `DirectoryCardAdapter`.)

---

## S5 — Client Discover cards · route `[tenantSlug]/client/discover`

| | |
|---|---|
| **Component** | `DiscoverCard` inline function @ `app/(workspace)/[tenantSlug]/client/discover/DiscoverShell.tsx:543` |

| Affordance | Status | Detail |
|---|---|---|
| Favorite | ⚠️ Heart icon, right store but bespoke | `DiscoverShell.tsx:641` — inline `<button>` with `♥/♡` → `onToggleFavorite` → `fetch('/api/discover/favorites/${id}', PUT/DELETE)` → `client_favorites` ✓ store is correct, implementation is bespoke |
| Inquiry | ⚠️ Bespoke inline form | `DiscoverShell.tsx:895+` — inline expand-collapse form in the detail drawer, POSTs `/api/discover/inquiry` directly, not via `InquiryDrawer`/`submitInquiry` engine |

**D4 target:** Replace bespoke heart + drawer inquiry form with `<TalentCardActions>`.

---

## S6 — Client Favorites page · route `[tenantSlug]/client/favorites`

| | |
|---|---|
| **Component** | `FavoriteCard` inline function @ `app/(workspace)/[tenantSlug]/client/favorites/FavoritesShell.tsx:~97` |

| Affordance | Status | Detail |
|---|---|---|
| Favorite | ⚠️ Remove-only, bespoke | `FavoritesShell.tsx:150` — ♥ button that only REMOVES from favorites (always filled); calls DELETE `/api/discover/favorites/${id}` |
| Inquiry | ⚠️ Dead link | `FavoritesShell.tsx:~118` — `inquireHref` is just `/client/discover`, not a direct inquiry action |

**D4 target:** Replace remove-only heart with `<TalentCardActions>` (which handles both toggle directions); wire inquiry to `InquiryDrawer`.

---

## S7 — Client Shortlists page · route `[tenantSlug]/client/shortlists`

| | |
|---|---|
| **Component** | Inline card renders @ `app/(workspace)/[tenantSlug]/client/shortlists/ShortlistsShell.tsx` |

| Affordance | Status | Detail |
|---|---|---|
| Favorite | ❌ None | No per-card favorite control |
| Inquiry | ⚠️ Bespoke multi-talent form | `ShortlistsShell.tsx:163+` — inline form POSTs `/api/discover/inquiry` directly (multi-tenant fan-out), not via engine |

**D4 note:** The multi-talent shortlist inquiry is intentionally different from the single-talent
`InquiryDrawer` flow. Confirm with Lane B whether the canonical `InquiryDrawer` handles multi-talent
before replacing here.

---

## S8 — Pitch landing · route `/share/pitch/[token]`

| | |
|---|---|
| **Component** | `TalentCard` inline @ `app/share/pitch/[token]/_pitch-landing.tsx:413` |

| Affordance | Status | Detail |
|---|---|---|
| Favorite | ❌ None | Pitch context: talent is shown to be declined or converted to inquiry |
| Inquiry | 🚫 Pitch-specific | `_pitch-landing.tsx:528` → `convertPitchToInquiryAction` — this is pitch-conversion, not save-to-cart. Out of scope for `<TalentCardActions>` |

**D5 note:** Pitch landing has a domain-specific "Submit as inquiry" action tied to `source_pitch_id`.
Keep bespoke; do not replace with generic `<TalentCardActions>`.

---

## S9 — Shared shortlist view · route `/share/shortlist/[token]`

| | |
|---|---|
| **Component** | `TalentCard` inline @ `app/share/shortlist/[token]/page.tsx:363` |

| Affordance | Status | Detail |
|---|---|---|
| Favorite | 🚫 Read-only | Public shared view, no auth context |
| Inquiry | 🚫 Read-only | No inquiry action (`// no inquiry CTA here; the recipient inquires the normal way.`) |

**D5 note:** Read-only surface — no affordances needed.

---

## S10 — Talent profile page related/similar cards · route `/t/[code]`

| | |
|---|---|
| **Component** | Not yet built |

The talent profile page (`app/t/[profileCode]/page.tsx`) does not currently render any
related/similar talent cards. D3 is the task to ADD this section — it will use
`<TalentCardActions>` from the start.

---

## S11 — Page-builder Talent Type Grid section

| | |
|---|---|
| **Component** | `talent_type_grid/Component.tsx` |

These are **category cards** (e.g., "Models", "Musicians"), not individual talent-profile cards.
Out of scope for `<TalentCardActions>`.

---

## S12 — Hub landing (`/hub`) talent directory

| | |
|---|---|
| **Component** | `HubTalentDirectory` @ `components/home/hub-landing.tsx:108` |

| Affordance | Status | Detail |
|---|---|---|
| Favorite | ❌ None | Cross-agency listing — just links to agency storefronts |
| Inquiry | ❌ None | Directs to agency storefront |

**D5 note:** Hub is cross-tenant and has no session context. Affordances require a resolved
tenant; skip or add a "view on [agency]" CTA instead.

---

## Canonical system status (for Lane G reference)

| System | File | Status |
|---|---|---|
| `usePublicDiscoveryState` | `components/directory/public-discovery-state.tsx` | ✅ Has both `isFavorited`/`setFavoriteState` (client_favorites) and `isSaved`/`setSavedState` (inquiry cart) |
| `usePublicDiscoveryStateOptional` | same file | ✅ Safe null-returning variant for non-provider contexts |
| `MergeGuestFavorites` | `components/client/merge-guest-favorites.tsx` | ✅ Mounted in `app/(public)/layout.tsx` on auth |
| `ContactTalentButton` | `components/directory/directory-inquiry-actions.tsx` | ⚠️ Wires to `DirectoryInquiryModal` / inquiry cart — not `InquiryDrawer` |
| `InquiryDrawer` | (TBD — Lane B target) | ❌ Not yet wired as the canonical path for directory/card surfaces |
| `TalentCardActions` | ❌ Does not exist yet | Gate for D1–D5 |
| `DirectoryCardActions` | `lib/site-admin/sections/directory/DirectoryCardActions.tsx` | ⚠️ Orphaned — 0 importers; merge into `<TalentCardActions>` |

---

## Priority order for D1–D5

| Wave | Task | Surface(s) | Effort |
|---|---|---|---|
| D1 | Homepage cards adopt `<TalentCardActions>` | S4 (homepage FeaturedTalentSection) | M |
| D2 | Page-builder cards | S2 (DirectoryCardAdapter), S3 (FeaturedTalentCard) | M |
| D3 | Talent profile related cards | S10 (build new section) | S |
| D4 | Client dashboard cards | S5 (Discover), S6 (Favorites), S7 (Shortlists) | M |
| D5 | Remaining / audit | S8/S9 (confirm skip), S11/S12 (confirm skip), orphan cleanup | S |
