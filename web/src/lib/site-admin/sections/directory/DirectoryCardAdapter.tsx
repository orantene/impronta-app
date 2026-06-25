"use client";

import { useRef } from "react";
import { usePathname } from "next/navigation";

import { TalentCardActions } from "@/components/talent-cards/talent-card-actions";
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
 * wraps the card in a relative container that layers the shared
 * `<TalentCardActions>` affordances (favorite bookmark + inquiry-cart
 * toggle) over the card photo.
 *
 * The `<DirectoryCard>` itself stays pure / prop-driven (RP-1 / T2 reuse);
 * all interactivity lives in this adapter wrapper via `<TalentCardActions>`.
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
  const mediaRef = useRef<HTMLDivElement>(null);

  const data = mapDtoToCardData(card, pathname);

  const style: "portrait" | "editorial" =
    cardStyle === "editorial" ? "editorial" : "portrait";

  return (
    <div className="group/cardwrap relative flex flex-col">
      <div className="relative" ref={mediaRef}>
        <DirectoryCard
          data={data}
          style={style}
          show={show}
          nameFallback={nameFallback}
          aspect={cardAspect}
          priority={priority}
          index={index}
        />
        {/* Favorite affordance overlay — canonical <TalentCardActions>.
            Heart/bookmark glyph follows the per-tenant favoriteIcon token. */}
        <TalentCardActions
          talentProfileId={card.id}
          profileCode={card.profileCode ?? ""}
          displayName={card.displayName}
          sourcePage="/directory"
          variant="compact"
          hideInquiry
          className="absolute right-2.5 top-2.5 z-[2]"
        />
      </div>
      {/* INQUIRE / ADDED ✓ bar below the card — cart membership. Carries the
          portrait + photo rect so adding flies a face-focus avatar to the
          "Message {agency}" launcher pill (plan §4.A.5). */}
      <TalentCardActions
        talentProfileId={card.id}
        profileCode={card.profileCode ?? ""}
        displayName={card.displayName}
        sourcePage="/directory"
        hideFavorite
        className="mt-2"
        portraitUrl={card.thumbnail?.url ?? null}
        getInquiryPhotoRect={() =>
          mediaRef.current?.querySelector("img")?.getBoundingClientRect() ?? null
        }
      />
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
