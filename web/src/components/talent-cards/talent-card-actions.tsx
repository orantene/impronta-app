"use client";

/**
 * Lane G / G4 — `<TalentCardActions>`, the one shared affordance layer.
 *
 * Drops into ANY talent/profile card site-wide. Renders two controls wired
 * to the canonical stores:
 *
 *   - Favorite toggle  → `useFavorites()` → `client_favorites` (auth) /
 *     guest localStorage. Icon shape comes from the per-tenant
 *     `favoriteIcon` branding token (heart | bookmark), resolved via CSS.
 *   - Inquiry toggle   → `useInquiryCart()` → `saved_talent` cart, with
 *     `sourcePage` carried for inquiry source attribution.
 *
 * Renders `null` when no `PublicDiscoveryState` provider is mounted — the
 * stores are unreachable on that surface, so adopting lanes must wrap the
 * surface in the provider.
 *
 * Layout-agnostic: an inline flex row. Hosts position it (overlay, footer,
 * inline) by wrapping or passing `className`.
 */

import type { MouseEvent } from "react";
import { useSyncExternalStore } from "react";
import { Bookmark, Check, Heart, Send } from "lucide-react";

import type { TalentCardActionsProps } from "@/lib/talent-cards/contracts";
import { useFavorites } from "@/lib/talent-cards/use-favorites";
import { useInquiryCart } from "@/lib/talent-cards/use-inquiry-cart";
import { useOptionalDirectoryInquiryModal } from "@/components/directory/directory-inquiry-modal-context";
import { registerCartTalent } from "@/app/t/[profileCode]/_chat/cart-talent-registry";
import { cn } from "@/lib/utils";

import "./talent-card-actions.css";

function subscribeNoop(): () => void {
  return () => undefined;
}

/** False during SSR + hydration, true after — avoids aria-pressed drift. */
function useClientMounted(): boolean {
  return useSyncExternalStore(subscribeNoop, () => true, () => false);
}

export function TalentCardActions({
  talentProfileId,
  profileCode,
  displayName,
  sourcePage,
  variant = "card",
  hideFavorite = false,
  hideInquiry = false,
  className,
  portraitUrl = null,
  getInquiryPhotoRect,
}: TalentCardActionsProps) {
  const mounted = useClientMounted();
  const favorites = useFavorites();
  const cart = useInquiryCart();
  const inquiryModal = useOptionalDirectoryInquiryModal();

  // No PublicDiscoveryState provider on this surface → favorites + inquiry
  // stores are unreachable. Render nothing rather than dead controls.
  if (!favorites.isReady || !mounted) return null;

  const favorited = favorites.isFavorited(talentProfileId);
  const favPending = favorites.isPending(talentProfileId);
  const inCart = cart.isInCart(talentProfileId);
  const cartPending = cart.isPending(talentProfileId);
  const compact = variant === "compact";
  const isPill = variant === "pill";
  const nameSuffix = displayName ? ` ${displayName}` : "";

  const handleFavorite = (event: MouseEvent) => {
    // Cards are usually wrapped in a <Link> — keep the toggle local.
    event.preventDefault();
    event.stopPropagation();
    favorites.toggleFavorite(talentProfileId);
  };

  const handleInquiry = (event: MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    const willAdd = !inCart;
    // On ADD only: record the portrait/name for the launcher rail (single
    // source stays cartIds; this only supplies presentation data) and request
    // the card→pill fly animation from the photo rect. Removal stays a plain
    // cart toggle. Reduced-motion is handled inside useFlyToRail downstream.
    if (willAdd) {
      registerCartTalent(talentProfileId, { displayName, portraitUrl });
      const rect = getInquiryPhotoRect?.() ?? null;
      if (rect && inquiryModal) {
        inquiryModal.animateAdd({ fromRect: rect, portraitUrl, talentProfileId });
      }
    }
    cart.toggleInCart({ talentProfileId, profileCode, displayName }, sourcePage);
  };

  const glyphSize = compact ? "size-3.5" : "size-4";

  return (
    <div
      className={cn(
        "talent-card-actions flex items-center gap-2",
        compact && "talent-card-actions--compact",
        className,
      )}
      data-talent-card-actions=""
      data-source-page={sourcePage}
    >
      {!hideFavorite ? (
        <button
          type="button"
          onClick={handleFavorite}
          disabled={favPending}
          aria-pressed={favorited}
          aria-label={
            favorited
              ? `Remove${nameSuffix} from favorites`
              : `Save${nameSuffix} to favorites`
          }
          className={cn(
            // Lane E — the circle is CONSTANT in both states; only the
            // glyph changes (hollow + muted → solid + accent colour, see
            // talent-card-actions.css `[data-favorited="true"]`). The old
            // design inverted the whole button, which read as neither.
            "talent-card-actions__favorite inline-flex shrink-0 items-center justify-center rounded-full border border-border bg-background/80 text-foreground/70 backdrop-blur-sm outline-none transition-colors duration-200 hover:border-foreground/40 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:opacity-60",
            compact ? "size-8" : "size-9",
          )}
          data-card-favorite-toggle=""
          data-favorited={favorited ? "true" : "false"}
        >
          {/* Both glyphs render; CSS shows the one the tenant token picks. */}
          <Heart
            data-favorite-glyph="heart"
            className={glyphSize}
            fill={favorited ? "currentColor" : "none"}
            aria-hidden
          />
          <Bookmark
            data-favorite-glyph="bookmark"
            className={glyphSize}
            fill={favorited ? "currentColor" : "none"}
            aria-hidden
          />
        </button>
      ) : null}

      {!hideInquiry ? (
        <button
          type="button"
          onClick={handleInquiry}
          disabled={cartPending}
          aria-pressed={inCart}
          aria-label={
            inCart
              ? `Remove${nameSuffix} from your inquiry list`
              : `Add${nameSuffix} to your inquiry list`
          }
          className={cn(
            "talent-card-actions__inquiry inline-flex items-center justify-center gap-1.5 border font-semibold uppercase outline-none transition-colors duration-200 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:opacity-60",
            isPill
              ? // Gold-outlined accent pill (colours in talent-card-actions.css,
                // keyed off data-in-cart). Hover-revealed over the card photo.
                "talent-card-actions__inquiry-pill h-8 rounded-full px-3 text-[10px] tracking-[0.16em] backdrop-blur-md"
              : cn(
                  "rounded-md",
                  compact
                    ? "size-8 shrink-0"
                    : "h-9 flex-1 px-4 text-[11px] tracking-[0.18em]",
                  inCart
                    ? "border-foreground bg-foreground/10 text-foreground"
                    : "border-border bg-transparent text-foreground/80 hover:border-foreground/40 hover:text-foreground",
                ),
          )}
          data-card-inquiry-toggle=""
          data-in-cart={inCart ? "true" : "false"}
        >
          {inCart ? (
            <Check className={glyphSize} aria-hidden />
          ) : (
            <Send className={glyphSize} aria-hidden />
          )}
          {!compact ? <span>{inCart ? "Added" : "Inquire"}</span> : null}
        </button>
      ) : null}
    </div>
  );
}
