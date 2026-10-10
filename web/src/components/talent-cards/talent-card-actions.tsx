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
import { resolveInquiryCta } from "@/lib/inquiry/inquiry-context-resolver";
import { useOptionalDirectoryInquiryModal } from "@/components/directory/directory-inquiry-modal-context";
import { registerCartTalent } from "@/app/t/[profileCode]/_chat/cart-talent-registry";
import { createTranslator } from "@/i18n/messages";
import { withInterpolation } from "@/i18n/interpolate";
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
  locale = "en",
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

  // Phase 3 / GRK-054 — card Inquire opens the inquiry surface. It must not
  // silently toggle the shortlist/cart and leave the user on the directory.
  // Labels stay resolver-driven for lineup state; the tap always routes to chat
  // (or the sheet fallback) instead of a quiet cart flip.
  const ctaState = resolveInquiryCta({
    talentProfileId,
    isInLineup: inCart,
    lineupCount: cart.cartCount,
    lineupTalentIds: [...cart.cartIds],
    contactPromoted: false,
    hasActiveDraft: false,
    draftInquiryId: null,
    activePhase: null,
    activeStatus: null,
    otherOpenInquiries: [],
    identity: "guest",
    lastActivityAt: null,
    coordinatorId: null,
    lastMessageRole: null,
  });
  const inLineupState = ctaState.kind === "in_lineup";
  const copy = withInterpolation(createTranslator(locale));
  const fallbackName = displayName?.trim() || copy("public.directory.fallbackPrimaryTalentType");
  const inquiryLabel = inLineupState
    ? copy("public.directory.card.inLineup")
    : copy("public.directory.card.inquire");
  const inquiryAria = inLineupState
    ? copy("public.directory.card.inLineupAria", { name: fallbackName })
    : copy("public.directory.card.inquireAria", { name: fallbackName });

  const handleFavorite = (event: MouseEvent) => {
    // Cards are usually wrapped in a <Link> — keep the toggle local.
    event.preventDefault();
    event.stopPropagation();
    favorites.toggleFavorite(talentProfileId);
  };

  const handleInquiry = (event: MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    // GRK-054 — Inquire opens a conversation about this talent. It must not
    // silently toggle `saved_talent` (the shortlist) and leave the user on the
    // directory. Portrait is registered for the rail; membership for a separate
    // draft is owned by the chat launcher's separate-inquiry path.
    registerCartTalent(talentProfileId, { displayName, portraitUrl });
    if (inquiryModal) {
      inquiryModal.requestSeparateInquiry({
        talentProfileId,
        profileCode,
        displayName,
        portraitUrl,
      });
      return;
    }
    cart.openInquiry({ sourcePage });
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
            // The circle stays 32px because the card design depends on it;
            // only the touch target grows, via a transparent inset ring that
            // costs no layout. 32px was a near-miss for a fingertip on every
            // card in the roster.
            compact ? "size-8 touch-target" : "size-9",
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
          aria-label={inquiryAria}
          className={cn(
            "talent-card-actions__inquiry inline-flex items-center justify-center gap-1.5 border font-semibold uppercase outline-none transition-colors duration-200 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:opacity-60",
            isPill
              ? // Gold-outlined accent pill (colours in talent-card-actions.css,
                // keyed off data-in-cart). Hover-revealed over the card photo.
                "talent-card-actions__inquiry-pill h-10 rounded-full px-3.5 text-[11px] tracking-[0.16em] backdrop-blur-md sm:h-8 sm:px-3 sm:text-[10px]"
              : cn(
                  // COMPACT sits beside the favorite control on a card photo,
                  // so it has to be the same object: a round translucent
                  // token, not a square transparent one. It used to be
                  // rounded-md + bg-transparent, which read as a different
                  // control from a different design — and over a bright photo
                  // the glyph had nothing behind it at all.
                  compact
                    ? "size-8 touch-target shrink-0 rounded-full backdrop-blur-sm"
                    : "h-9 flex-1 rounded-md px-4 text-[11px] tracking-[0.18em]",
                  inCart
                    ? "border-foreground bg-foreground/10 text-foreground"
                    : compact
                      ? "border-border bg-background/80 text-foreground/70 hover:border-foreground/40 hover:text-foreground"
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
          {!compact ? <span>{inquiryLabel}</span> : null}
        </button>
      ) : null}
    </div>
  );
}
