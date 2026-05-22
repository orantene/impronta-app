"use client";

/**
 * TalentCardActions — canonical favorite + inquiry affordances for any
 * talent-profile card, anywhere on the site.
 *
 * Design contract (from talent-card-affordances-execution-plan-2026-05-22.md):
 *
 *   - Favorites  → `client_favorites` (auth) / `impronta.public.favorite-ids`
 *                  localStorage (guest). Persists cross-session via
 *                  MergeGuestFavorites bridge in (public)/layout.tsx.
 *   - Inquiry    → `saved_talent` (inquiry cart). Guest path via
 *                  `guest_add_saved_talent` RPC. Transient, cleared on submit.
 *
 * Both lists are independent. A talent can be in favorites but not the cart,
 * in the cart but not favorites, both, or neither.
 *
 * Safe to drop into any card. It wraps in a SilentBoundary so builder
 * previews (no PublicDiscoveryStateProvider) get null instead of a crash.
 *
 * TODO G5: read `favoriteIcon` tenant branding token here and swap
 * Bookmark ↔ Heart when that token is implemented by Lane A.
 */

import { Component, useTransition, type ReactNode } from "react";
import { Bookmark, Plus, Check } from "lucide-react";

import { setTalentFavorited, setTalentSaved } from "@/app/(public)/directory/actions";
import {
  usePublicDiscoveryStateOptional,
} from "@/components/directory/public-discovery-state";
import { useOptionalDirectoryInquiryModal } from "@/components/directory/directory-inquiry-modal-context";
import { cn } from "@/lib/utils";

// ── Silent error boundary ─────────────────────────────────────────────────────
// Keeps the component inert when rendered outside the provider (builder editor
// preview, talent-dash "how my card looks" preview, etc.).

class SilentBoundary extends Component<
  { children: ReactNode },
  { failed: boolean }
> {
  override state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  override render() {
    if (this.state.failed) return null;
    return this.props.children;
  }
}

// ── Types ─────────────────────────────────────────────────────────────────────

export type TalentCardActionsProps = {
  talentId: string;
  /** For analytics and inquiry attribution. Defaults to current page. */
  sourcePage?: string;
  /** Show the favorite (bookmark/heart) toggle. Default: true */
  showFavorite?: boolean;
  /** Show the inquiry-cart toggle. Default: true */
  showCart?: boolean;
  /**
   * Layout variant:
   *   - "overlay"  → absolute-positioned column in the top-right of the
   *                  card's image area (use with position:relative wrapper).
   *   - "bar"      → horizontal flex row suitable for the card's action footer.
   */
  variant?: "overlay" | "bar";
  className?: string;
};

// ── Inner component (needs provider) ─────────────────────────────────────────

function TalentCardActionsInner({
  talentId,
  sourcePage = "/directory",
  showFavorite = true,
  showCart = true,
  variant = "overlay",
  className,
}: TalentCardActionsProps) {
  const discovery = usePublicDiscoveryStateOptional();
  const inquiryModal = useOptionalDirectoryInquiryModal();
  const [favPending, startFavTransition] = useTransition();
  const [cartPending, startCartTransition] = useTransition();

  // No provider (builder editor, non-public layout) → render nothing.
  if (!discovery) return null;

  const favorited = discovery.isFavorited(talentId);
  const inCart = discovery.isSaved(talentId);

  const toggleFavorite = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const next = !favorited;
    discovery.setFavoriteState(talentId, next);
    startFavTransition(async () => {
      const res = await setTalentFavorited(talentId, next);
      if (!res.ok) {
        discovery.setFavoriteState(talentId, !next);
        discovery.setFlash({
          tone: "error",
          title: "Could not update favorites",
          message: res.error,
        });
      }
    });
  };

  const toggleCart = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const next = !inCart;
    discovery.setSavedState(talentId, next);
    startCartTransition(async () => {
      const res = await setTalentSaved(talentId, next);
      if (!res.ok) {
        discovery.setSavedState(talentId, !next);
        discovery.setFlash({
          tone: "error",
          title: "Could not update inquiry",
          message: res.error,
        });
        return;
      }
      if (next && inquiryModal) {
        inquiryModal.bumpSaveCue();
      }
    });
  };

  if (variant === "overlay") {
    return (
      <div
        className={cn(
          "absolute right-2.5 top-2.5 z-[2] flex flex-col gap-1.5",
          className,
        )}
        data-source-page={sourcePage}
        // Prevent card link/button from firing when clicking affordances
        onClick={(e) => e.stopPropagation()}
      >
        {showFavorite ? (
          <button
            type="button"
            onClick={toggleFavorite}
            disabled={favPending}
            aria-pressed={favorited}
            aria-label={favorited ? "Remove from favorites" : "Save to favorites"}
            data-card-favorite-toggle
            data-favorited={favorited ? "true" : "false"}
            className={cn(
              "inline-flex size-9 items-center justify-center rounded-full backdrop-blur-md outline-none transition-all duration-200",
              "focus-visible:ring-2 focus-visible:ring-white/40 focus-visible:ring-offset-2 focus-visible:ring-offset-background",
              "disabled:opacity-60",
              favorited
                ? "border border-[var(--impronta-gold-border)] bg-[var(--impronta-gold)] text-black hover:bg-[var(--impronta-gold-bright)]"
                : "border border-white/25 bg-black/35 text-white hover:bg-black/55",
            )}
          >
            <Bookmark
              className="size-4"
              fill={favorited ? "currentColor" : "none"}
              strokeWidth={1.75}
            />
          </button>
        ) : null}

        {showCart ? (
          <button
            type="button"
            onClick={toggleCart}
            disabled={cartPending}
            aria-pressed={inCart}
            aria-label={inCart ? "Remove from inquiry" : "Add to inquiry"}
            data-card-inquiry-toggle
            data-in-cart={inCart ? "true" : "false"}
            className={cn(
              "inline-flex size-9 items-center justify-center rounded-full backdrop-blur-md outline-none transition-all duration-200",
              "focus-visible:ring-2 focus-visible:ring-white/40 focus-visible:ring-offset-2 focus-visible:ring-offset-background",
              "disabled:opacity-60",
              inCart
                ? "border border-[var(--impronta-gold-border)] bg-[var(--impronta-gold)]/10 text-[var(--impronta-gold)] hover:bg-[var(--impronta-gold)]/20"
                : "border border-white/20 bg-black/35 text-white/80 hover:border-white/40 hover:bg-black/55 hover:text-white",
            )}
          >
            {inCart ? (
              <Check className="size-4" strokeWidth={2} />
            ) : (
              <Plus className="size-4" strokeWidth={2} />
            )}
          </button>
        ) : null}
      </div>
    );
  }

  // variant === "bar"
  return (
    <div
      className={cn("flex items-center gap-2", className)}
      data-source-page={sourcePage}
      onClick={(e) => e.stopPropagation()}
    >
      {showFavorite ? (
        <button
          type="button"
          onClick={toggleFavorite}
          disabled={favPending}
          aria-pressed={favorited}
          aria-label={favorited ? "Remove from favorites" : "Save to favorites"}
          data-card-favorite-toggle
          data-favorited={favorited ? "true" : "false"}
          className={cn(
            "inline-flex size-9 shrink-0 items-center justify-center rounded-lg border outline-none transition-colors duration-200",
            "focus-visible:ring-2 focus-visible:ring-white/30 focus-visible:ring-offset-2 focus-visible:ring-offset-background",
            "disabled:opacity-60",
            favorited
              ? "border-[var(--impronta-gold-border)] bg-[var(--impronta-gold)]/10 text-[var(--impronta-gold)] hover:bg-[var(--impronta-gold)]/20"
              : "border-white/20 bg-transparent text-white/70 hover:border-white/40 hover:text-white",
          )}
        >
          <Bookmark
            className="size-4"
            fill={favorited ? "currentColor" : "none"}
            strokeWidth={1.75}
          />
        </button>
      ) : null}

      {showCart ? (
        <button
          type="button"
          onClick={toggleCart}
          disabled={cartPending}
          aria-pressed={inCart}
          data-card-inquiry-toggle
          data-in-cart={inCart ? "true" : "false"}
          className={cn(
            "inline-flex h-9 flex-1 items-center justify-center rounded-lg border px-4",
            "text-[11px] font-semibold uppercase tracking-[0.18em]",
            "outline-none transition-colors duration-200",
            "focus-visible:ring-2 focus-visible:ring-white/30 focus-visible:ring-offset-2 focus-visible:ring-offset-background",
            "disabled:opacity-60",
            inCart
              ? "border-[var(--impronta-gold-border)] bg-[var(--impronta-gold)]/10 text-[var(--impronta-gold)] hover:bg-[var(--impronta-gold)]/20"
              : "border-white/20 bg-transparent text-white/80 hover:border-white/40 hover:text-white",
          )}
        >
          {inCart ? "Added ✓" : "Inquire"}
        </button>
      ) : null}
    </div>
  );
}

// ── Public export (error-boundary wrapped) ────────────────────────────────────

export function TalentCardActions(props: TalentCardActionsProps) {
  return (
    <SilentBoundary>
      <TalentCardActionsInner {...props} />
    </SilentBoundary>
  );
}
