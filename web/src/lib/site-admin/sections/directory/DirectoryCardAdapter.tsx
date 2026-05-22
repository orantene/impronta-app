"use client";

import { Bookmark, Heart } from "lucide-react";
import { usePathname } from "next/navigation";
import { useTransition } from "react";

import { setTalentFavorited, setTalentSaved } from "@/app/(public)/directory/actions";
import { useOptionalDirectoryInquiryModal } from "@/components/directory/directory-inquiry-modal-context";
import { usePublicDiscoveryStateOptional } from "@/components/directory/public-discovery-state";
import { clientLocaleHref } from "@/i18n/client-directory-href";
import type { DirectoryCardDTO } from "@/lib/directory/types";

import { DirectoryCard } from "./DirectoryCard";
import {
  AVAILABILITY_UNKNOWN,
  type DirectoryCardData,
} from "./card-data";
import type { DirectoryV1 } from "./schema";

/**
 * Maps the legacy public `DirectoryCardDTO` (engine payload, what
 * `/api/directory` + `/api/ai/search` return) onto the canonical
 * `DirectoryCardData` shape the premium `<DirectoryCard>` expects, AND
 * wraps the card in a relative container that surfaces two affordances:
 *
 *   1. A **bookmark icon** (top-right of the photo) that toggles the
 *      talent's membership in the personal **favorites** list
 *      (`client_favorites` for authed, localStorage for guest). Gold
 *      filled when saved.
 *   2. An **INQUIRE / ADDED ✓ button** (below the photo) that toggles
 *      the talent's membership in the **inquiry cart** (`saved_talent`).
 *      Reflects in the header's plane icon which opens the inquiry sheet.
 *
 * Two independent lists, matching the prototype shown by the user. The
 * `<DirectoryCard>` itself stays pure / prop-driven (RP-1 / T2 reuse);
 * all interactivity lives in this adapter wrapper.
 */
export function DirectoryCardAdapter({
  card,
  cardStyle,
  cardAspect,
  show,
  nameFallback,
  priority,
  index,
}: {
  card: DirectoryCardDTO;
  cardStyle: DirectoryV1["cardStyle"];
  cardAspect: DirectoryV1["cardAspect"];
  show: Pick<
    DirectoryV1,
    | "showName"
    | "showTalentType"
    | "showLocation"
    | "showAvailability"
    | "showBadges"
  >;
  nameFallback: DirectoryV1["nameFallback"];
  priority?: boolean;
  index?: number;
}) {
  const pathname = usePathname();
  const discovery = usePublicDiscoveryStateOptional();
  const inquiryModal = useOptionalDirectoryInquiryModal();
  const [favPending, startFavTransition] = useTransition();
  const [cartPending, startCartTransition] = useTransition();

  const data = mapDtoToCardData(card, pathname);

  const style: "portrait" | "editorial" =
    cardStyle === "editorial" ? "editorial" : "portrait";

  // No state context (e.g. rendered outside the public layout) → fall
  // back to the original pure card render with no affordances.
  if (!discovery) {
    return (
      <DirectoryCard
        data={data}
        style={style}
        show={show}
        nameFallback={nameFallback}
        aspect={cardAspect}
        priority={priority}
        index={index}
      />
    );
  }

  const favorited = discovery.isFavorited(card.id);
  const inCart = discovery.isSaved(card.id);

  const toggleFavorite = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const next = !favorited;
    discovery.setFavoriteState(card.id, next);
    startFavTransition(async () => {
      const res = await setTalentFavorited(card.id, next);
      if (!res.ok) {
        // Revert optimistic state on failure.
        discovery.setFavoriteState(card.id, !next);
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
    discovery.setSavedState(card.id, next);
    startCartTransition(async () => {
      const res = await setTalentSaved(card.id, next);
      if (!res.ok) {
        discovery.setSavedState(card.id, !next);
        discovery.setFlash({
          tone: "error",
          title: "Could not update inquiry",
          message: res.error,
        });
        return;
      }
      // Cue the header plane icon (existing animation hook).
      if (next && inquiryModal) {
        inquiryModal.bumpSaveCue();
      }
    });
  };

  return (
    <div className="group/cardwrap relative flex flex-col">
      <div className="relative">
        <DirectoryCard
          data={data}
          style={style}
          show={show}
          nameFallback={nameFallback}
          aspect={cardAspect}
          priority={priority}
          index={index}
        />
        {/* Favorite icon overlay — toggles personal favorite (♥/🔖). Icon
            shape is configured per-tenant via agency_branding.favorite_icon. */}
        <button
          type="button"
          onClick={toggleFavorite}
          disabled={favPending}
          aria-pressed={favorited}
          aria-label={favorited ? "Remove from favorites" : "Save to favorites"}
          className={
            "absolute right-2.5 top-2.5 z-[2] inline-flex size-9 items-center justify-center rounded-full backdrop-blur-md outline-none transition-all duration-200 focus-visible:ring-2 focus-visible:ring-white/40 focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:opacity-60 " +
            (favorited
              ? "border border-[var(--impronta-gold-border)] bg-[var(--impronta-gold)] text-black hover:bg-[var(--impronta-gold-bright)]"
              : "border border-white/25 bg-black/35 text-white hover:bg-black/55")
          }
          data-card-favorite-toggle
          data-favorited={favorited ? "true" : "false"}
        >
          {discovery.favoriteIcon === "heart" ? (
            <Heart className="size-4" fill={favorited ? "currentColor" : "none"} />
          ) : (
            <Bookmark className="size-4" fill={favorited ? "currentColor" : "none"} />
          )}
        </button>
      </div>
      {/* INQUIRE / ADDED ✓ — toggles inquiry cart membership. */}
      <button
        type="button"
        onClick={toggleCart}
        disabled={cartPending}
        aria-pressed={inCart}
        className={
          "mt-2 inline-flex h-9 items-center justify-center rounded-md border px-4 text-[11px] font-semibold uppercase tracking-[0.18em] outline-none transition-colors duration-200 focus-visible:ring-2 focus-visible:ring-white/30 focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:opacity-60 " +
          (inCart
            ? "border-[var(--impronta-gold-border)] bg-[var(--impronta-gold)]/10 text-[var(--impronta-gold)] hover:bg-[var(--impronta-gold)]/20"
            : "border-white/20 bg-transparent text-white/80 hover:border-white/40 hover:text-white")
        }
        data-card-inquiry-toggle
        data-in-cart={inCart ? "true" : "false"}
      >
        {inCart ? "Added ✓" : "Inquire"}
      </button>
    </div>
  );
}

function mapDtoToCardData(
  card: DirectoryCardDTO,
  pathname: string,
): DirectoryCardData {
  const profileHref = card.profileCode
    ? clientLocaleHref(pathname, `/t/${encodeURIComponent(card.profileCode)}`)
    : "";

  const availability = formatAvailability(card);

  return {
    id: card.id,
    name: card.displayName,
    profileCode: card.profileCode || null,
    profileHref,
    primaryType: card.primaryTalentTypeLabel || null,
    location: card.locationLabel || null,
    photoUrl: card.thumbnail?.url ?? null,
    agencyName: card.agencyName ?? null,
    isExclusive: Boolean(card.isExclusive),
    availabilityLabel: availability.label,
    availabilityKnown: availability.known,
    availableDaysInNext30: card.availableDaysInNext30 ?? null,
  };
}

function formatAvailability(card: DirectoryCardDTO): {
  label: string;
  known: boolean;
} {
  if (card.nextAvailableDate) {
    const d = new Date(`${card.nextAvailableDate}T00:00:00`);
    if (!Number.isNaN(d.getTime())) {
      const when = d.toLocaleDateString("en", {
        month: "short",
        day: "numeric",
      });
      return { label: `Available from ${when}`, known: true };
    }
  }
  if (
    typeof card.availableDaysInNext30 === "number" &&
    card.availableDaysInNext30 > 0
  ) {
    return {
      label: `Available ${card.availableDaysInNext30} days in next 30`,
      known: true,
    };
  }
  return { label: AVAILABILITY_UNKNOWN, known: false };
}
