"use client";

import { usePathname } from "next/navigation";

import { clientLocaleHref } from "@/i18n/client-directory-href";
import type { DirectoryCardDTO } from "@/lib/directory/types";

import { DirectoryCard } from "./DirectoryCard";
import {
  AVAILABILITY_UNKNOWN,
  type DirectoryCardData,
} from "./card-data";
import type { DirectoryV1 } from "./schema";

/**
 * B3 — Adapter that maps the legacy public `DirectoryCardDTO` (engine
 * payload, what `/api/directory` + `/api/ai/search` return) onto the
 * canonical `DirectoryCardData` shape the premium `<DirectoryCard>`
 * expects.
 *
 * The premium card is PURE & PROP-DRIVEN (RP-1 / T2 reuse): it doesn't
 * use any router hook itself. The adapter is the one allowed thin
 * client wrapper that derives the locale-aware profile href from the
 * current pathname, then hands the card a fully-prepared `data` object.
 *
 * Trust/agency/availability ride along on the Lane 5 enriched DTO when
 * present; missing fields fall back to honest defaults — `Independent`
 * for ownership when no `agencyName`, `AVAILABILITY_UNKNOWN` line when
 * no signal. Never invent data.
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

  const data = mapDtoToCardData(card, pathname);

  // v1 of `<DirectoryCard>` only supports `portrait` and `editorial`. Any
  // other section enum (portfolio / profile / stat / service / minimal)
  // falls back to portrait — the schema comment marks these as future
  // variations; rendering portrait keeps the public surface honest.
  const style: "portrait" | "editorial" =
    cardStyle === "editorial" ? "editorial" : "portrait";

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
