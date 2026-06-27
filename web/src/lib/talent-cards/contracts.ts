/**
 * Lane G — Foundation & canonical contracts.
 *
 * THIS FILE IS THE PUBLISHED CONTRACT. Lanes A / B / D build against the
 * type signatures here; treat them as frozen unless the integrator agrees
 * a change. Implementations live in:
 *
 *   - `@/lib/talent-cards/use-favorites`        → `useFavorites()`
 *   - `@/lib/talent-cards/use-inquiry-cart`     → `useInquiryCart()`
 *   - `@/lib/talent-cards/use-favorite-icon`    → `useFavoriteIcon()`
 *   - `@/components/talent-cards/talent-card-actions` → `<TalentCardActions>`
 *
 * Canonical stores (spec §2):
 *   - Favorites  → `client_favorites` (auth) + `impronta.public.favorite-ids`
 *                  localStorage (guest), bridged by `MergeGuestFavorites`.
 *   - Inquiry cart → `saved_talent` (auth) + `guest_add_saved_talent` RPC
 *                  (guest), surfaced through `usePublicDiscoveryState`.
 */

// ───────────────────────────────────────────────────────────────────────────
// Source attribution
// ───────────────────────────────────────────────────────────────────────────

/**
 * Known surfaces a talent card renders on. Flows into inquiry
 * `source_page` attribution + product analytics. `sourcePage` props are
 * typed `string` (forward-compatible with page-builder slugs); these
 * constants keep the common values consistent across lanes.
 */
export const TALENT_CARD_SOURCE_PAGES = {
  home: "home",
  directory: "directory",
  profile: "profile",
  search: "search",
  pitch: "pitch",
  clientDashboard: "client-dashboard",
  pageBuilder: "page-builder",
} as const;

export type TalentCardSourcePage =
  (typeof TALENT_CARD_SOURCE_PAGES)[keyof typeof TALENT_CARD_SOURCE_PAGES];

// ───────────────────────────────────────────────────────────────────────────
// Talent reference
// ───────────────────────────────────────────────────────────────────────────

/**
 * The minimum a card must know about a talent to drive the favorite +
 * inquiry affordances. `talentProfileId` (= `talent_profiles.id`) is the
 * canonical key for both stores; `profileCode` + `displayName` are carried
 * for inquiry composer metadata and a11y labels.
 */
export interface TalentCardRef {
  /** `talent_profiles.id` — canonical key for favorites + inquiry cart. */
  talentProfileId: string;
  /** Public profile code (`/t/[code]`). */
  profileCode: string;
  /** Display name — composer metadata + a11y labels. Optional. */
  displayName?: string;
}

// ───────────────────────────────────────────────────────────────────────────
// useFavorites()
// ───────────────────────────────────────────────────────────────────────────

/**
 * Canonical favorites contract. Wraps the `PublicDiscoveryState` provider +
 * the `setTalentFavorited` server action. Optimistic toggle, reverts +
 * flashes on failure. Works guest (localStorage) and auth (`client_favorites`)
 * transparently — the server action branches by session.
 */
export interface UseFavoritesResult {
  /** Talent-profile IDs currently favorited. */
  favoriteIds: readonly string[];
  favoritesCount: number;
  isFavorited: (talentProfileId: string) => boolean;
  /** True while a favorite toggle for this id is in flight. */
  isPending: (talentProfileId: string) => boolean;
  /** Optimistic toggle; persists; reverts + flashes on error. */
  toggleFavorite: (talentProfileId: string) => void;
  /** Explicit set (idempotent). */
  setFavorite: (talentProfileId: string, favorited: boolean) => void;
  /**
   * False when no `PublicDiscoveryState` provider is mounted — favorites
   * are inert and `<TalentCardActions>` hides the control.
   */
  isReady: boolean;
}

// ───────────────────────────────────────────────────────────────────────────
// useInquiryCart()
// ───────────────────────────────────────────────────────────────────────────

/** Options for the canonical `openInquiry()` entry point. */
export interface OpenInquiryOptions {
  /** Source surface for attribution; defaults to the cart's last-noted page. */
  sourcePage?: string;
}

/**
 * Canonical inquiry-cart contract. Wraps the `PublicDiscoveryState`
 * provider (`saved_talent` mirror), the `setTalentSaved` server action,
 * and the `DirectoryInquiryModal` provider for the single `openInquiry()`
 * entry. Optimistic toggle, reverts + flashes on failure.
 */
export interface UseInquiryCartResult {
  /** Talent-profile IDs currently in the inquiry cart. */
  cartIds: readonly string[];
  cartCount: number;
  isInCart: (talentProfileId: string) => boolean;
  /** True while a cart toggle for this id is in flight. */
  isPending: (talentProfileId: string) => boolean;
  /**
   * Optimistic add/remove; persists via `setTalentSaved`; reverts +
   * flashes on error. `sourcePage` (on add) is recorded for inquiry
   * source attribution without clobbering an existing directory search
   * context.
   */
  toggleInCart: (talent: TalentCardRef, sourcePage?: string) => void;
  /** Explicit set (idempotent). */
  setInCart: (talent: TalentCardRef, inCart: boolean, sourcePage?: string) => void;
  /** Open the canonical inquiry composer for the current cart. */
  openInquiry: (options?: OpenInquiryOptions) => void;
  /**
   * False when no `PublicDiscoveryState` provider is mounted — the cart
   * is inert and `<TalentCardActions>` hides the control.
   */
  isReady: boolean;
  /** True when the canonical inquiry composer can be opened on this surface. */
  canOpenInquiry: boolean;
}

// ───────────────────────────────────────────────────────────────────────────
// useFavoriteIcon()
// ───────────────────────────────────────────────────────────────────────────

/**
 * The per-tenant favorite-icon branding token (spec §2 / G5). Projected to
 * the DOM as `<html data-token-favorite-icon="…">`; default `heart`.
 */
export type FavoriteIconStyle = "heart" | "bookmark";

export const FAVORITE_ICON_DEFAULT: FavoriteIconStyle = "heart";

/** Data-attribute the branding pipeline emits on `<html>` for the token. */
export const FAVORITE_ICON_DATA_ATTR = "data-token-favorite-icon";

// ───────────────────────────────────────────────────────────────────────────
// <TalentCardActions>
// ───────────────────────────────────────────────────────────────────────────

/**
 * Visual density.
 *   - `card`    — overlay/stacked controls sized for a grid card.
 *   - `compact` — inline icon row for dense lists / drawers.
 *   - `pill`    — auto-width accent pill (gold-outlined) used as a
 *     hover-revealed inquiry affordance over a directory card photo.
 */
export type TalentCardActionsVariant = "card" | "compact" | "pill";

/**
 * The one component every talent/profile card embeds. Renders the favorite
 * toggle (icon from the tenant `favoriteIcon` token) + the inquiry-cart
 * toggle, wired to the canonical stores. Works guest + auth. Carries
 * inquiry source attribution via `sourcePage`.
 *
 * Renders `null` when no `PublicDiscoveryState` provider is mounted (the
 * stores are unreachable) — adopting lanes must ensure the provider wraps
 * the surface.
 */
export interface TalentCardActionsProps {
  /** `talent_profiles.id` — canonical key for both stores. */
  talentProfileId: string;
  /** Public profile code (`/t/[code]`). */
  profileCode: string;
  /** Display name — composer metadata + a11y labels. Optional. */
  displayName?: string;
  /** Surface this card renders on — flows into inquiry source attribution. */
  sourcePage: string;
  /** Visual density. Defaults to `card`. */
  variant?: TalentCardActionsVariant;
  /** Hide the favorite toggle (e.g. inquiry-only surfaces). */
  hideFavorite?: boolean;
  /** Hide the inquiry toggle. */
  hideInquiry?: boolean;
  /** Extra class names merged onto the root wrapper. */
  className?: string;
  /**
   * Portrait URL for this talent (the card thumbnail). When provided, adding to
   * the inquiry cart registers it for the launcher avatar rail and supplies the
   * face-focus photo the card→pill fly clone uses. Optional — falls back to
   * initials when absent.
   */
  portraitUrl?: string | null;
  /**
   * Returns the on-screen photo rect (viewport coords) for the card→pill fly
   * animation. The card supplies this so the flight starts from the exact photo
   * the visitor clicked. When omitted, no flight is requested (rail still
   * updates). Reduced-motion is handled downstream in useFlyToRail.
   */
  getInquiryPhotoRect?: () => DOMRect | null;
}
