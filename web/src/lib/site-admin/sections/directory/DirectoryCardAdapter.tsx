"use client";

import { usePathname } from "next/navigation";

import { TalentCardActions } from "@/components/talent-cards/talent-card-actions";
import { clientLocaleHref } from "@/i18n/client-directory-href";
import type { DirectoryCardDTO } from "@/lib/directory/types";

import { DirectoryCard } from "./DirectoryCard";
import {
  AVAILABILITY_UNKNOWN,
  type DirectoryCardAttribute,
  type DirectoryCardData,
  type DirectoryCardFitLabel,
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
 * The two affordance bars are gated on the section's `showSave` /
 * `showAddToInquiry` knobs (P4 — previously always-on). The trait row
 * (fit chips + catalog lines) is projected from the DTO and trimmed by
 * `cardFieldKeys` / `maxFieldLines`.
 */
export function DirectoryCardAdapter({
  card,
  cardStyle,
  cardAspect,
  show,
  nameFallback,
  showSave,
  showAddToInquiry,
  cardFieldKeys,
  maxFieldLines,
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
  /** Render the favorite (save) affordance overlay. */
  showSave: boolean;
  /** Render the "Inquire / Added" cart bar below the card. */
  showAddToInquiry: boolean;
  /** Catalog-field allow-list + order; empty = catalog default order. */
  cardFieldKeys: DirectoryV1["cardFieldKeys"];
  /** Cap on the catalog trait lines under the chips. */
  maxFieldLines: DirectoryV1["maxFieldLines"];
  priority?: boolean;
  index?: number;
}) {
  const pathname = usePathname();

  const data = mapDtoToCardData(card, pathname);

  const style: "portrait" | "editorial" =
    cardStyle === "editorial" ? "editorial" : "portrait";

  const fitChips = pickFitLabels(data.fitLabels);
  const traitLines = pickAttributeLines(
    data.cardAttributes,
    cardFieldKeys,
    maxFieldLines,
  );

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
        {/* Favorite affordance overlay — canonical <TalentCardActions>.
            Heart/bookmark glyph follows the per-tenant favoriteIcon token.
            Gated on the section's `showSave` knob. */}
        {showSave ? (
          <TalentCardActions
            talentProfileId={card.id}
            profileCode={card.profileCode ?? ""}
            displayName={card.displayName}
            sourcePage={pathname}
            variant="compact"
            hideInquiry
            className="absolute right-2.5 top-2.5 z-[2]"
          />
        ) : null}
      </div>

      {/* Restrained editorial trait row: a couple of fit chips + a couple of
          catalog lines. Tagged with `data-card-chip` so a card kit can
          restyle it. Renders nothing when the DTO carries no trait data. */}
      {fitChips.length > 0 || traitLines.length > 0 ? (
        <div className="mt-2 flex flex-col gap-1.5" data-card-traits="">
          {fitChips.length > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              {fitChips.map((chip) => (
                <span
                  key={chip.slug}
                  data-card-chip
                  className="inline-flex max-w-full items-center truncate rounded-full border border-border px-2 py-0.5 text-[10px] font-medium tracking-wide text-[var(--token-card-muted,var(--token-color-muted,#6b7280))]"
                >
                  {chip.label}
                </span>
              ))}
            </div>
          ) : null}
          {traitLines.length > 0 ? (
            <dl className="flex flex-col gap-0.5">
              {traitLines.map((trait) => (
                <div
                  key={trait.key}
                  data-card-trait-line=""
                  className="flex items-baseline gap-1.5 text-[11px] leading-snug"
                >
                  <dt className="shrink-0 uppercase tracking-[0.12em] text-[var(--token-card-muted,var(--token-color-muted,#6b7280))]">
                    {trait.label}
                  </dt>
                  <dd className="min-w-0 truncate text-foreground/80">
                    {trait.value}
                  </dd>
                </div>
              ))}
            </dl>
          ) : null}
        </div>
      ) : null}

      {/* INQUIRE / ADDED ✓ bar below the card — cart membership.
          Gated on the section's `showAddToInquiry` knob. */}
      {showAddToInquiry ? (
        <TalentCardActions
          talentProfileId={card.id}
          profileCode={card.profileCode ?? ""}
          displayName={card.displayName}
          sourcePage={pathname}
          hideFavorite
          className="mt-2"
        />
      ) : null}
    </div>
  );
}

/** At most two fit chips — a restrained, editorial trait row. */
function pickFitLabels(
  fitLabels: readonly DirectoryCardFitLabel[] | undefined,
): DirectoryCardFitLabel[] {
  if (!fitLabels || fitLabels.length === 0) return [];
  return fitLabels.filter((f) => f.label.trim().length > 0).slice(0, 2);
}

/**
 * At most two catalog trait lines, ordered + filtered by the section's
 * `cardFieldKeys` allow-list when set, else the DTO's catalog order. The
 * 2-line ceiling is intersected with the operator's `maxFieldLines` knob.
 */
function pickAttributeLines(
  attributes: readonly DirectoryCardAttribute[] | undefined,
  cardFieldKeys: DirectoryV1["cardFieldKeys"],
  maxFieldLines: DirectoryV1["maxFieldLines"],
): DirectoryCardAttribute[] {
  if (!attributes || attributes.length === 0) return [];
  const usable = attributes.filter((a) => a.value.trim().length > 0);

  let ordered: DirectoryCardAttribute[];
  if (cardFieldKeys.length > 0) {
    const byKey = new Map(usable.map((a) => [a.key, a] as const));
    ordered = cardFieldKeys
      .map((key) => byKey.get(key))
      .filter((a): a is DirectoryCardAttribute => Boolean(a));
  } else {
    ordered = usable;
  }

  // Keep the row restrained (<=2 lines) but never exceed the operator's cap.
  const cap = Math.max(0, Math.min(2, maxFieldLines));
  return ordered.slice(0, cap);
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
    fitLabels: card.fitLabels,
    cardAttributes: card.cardAttributes,
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
