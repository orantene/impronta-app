import Image from "next/image";
import Link from "next/link";

import type { DirectoryCardData } from "./card-data";
import type { DirectoryV1 } from "./schema";

/**
 * Canonical directory card — Portrait + Editorial (Phase 1).
 *
 * PURE & PROP-DRIVEN by design (acceptance RP-1 / T2 reuse): no router
 * hooks, no discovery-state context, no module state. Renders fully from
 * a single talent object + display flags, so the same component powers
 * the talent-dash "how my card looks" preview. Cool-not-warm only — zero
 * warm/gold brand tokens (cool surface, hairline border, neutral text).
 */

export type DirectoryCardProps = {
  data: DirectoryCardData;
  style: DirectoryV1["cardStyle"];
  show: Pick<
    DirectoryV1,
    | "showName"
    | "showTalentType"
    | "showLocation"
    | "showAvailability"
    | "showBadges"
  >;
  nameFallback: DirectoryV1["nameFallback"];
  aspect: DirectoryV1["cardAspect"];
  /** First grid row → LCP priority. */
  priority?: boolean;
  index?: number;
};

const ASPECT: Record<DirectoryV1["cardAspect"], string> = {
  "4:5": "4 / 5",
  "1:1": "1 / 1",
  "3:4": "3 / 4",
  "16:9": "16 / 9",
};

function resolveName(
  name: string,
  show: boolean,
  fallback: DirectoryCardProps["nameFallback"],
): string | null {
  if (show) return name;
  if (fallback === "hidden") return null;
  if (fallback === "first_name") return name.split(/\s+/)[0] || null;
  return name; // code/role unavailable on card data → safe to show name
}

function OwnershipBadge({ data }: { data: DirectoryCardData }) {
  const label =
    data.isExclusive && data.agencyName
      ? `${data.agencyName} · exclusive`
      : data.agencyName
        ? data.agencyName
        : "Independent";
  return (
    <span
      data-card-ownership
      className="pointer-events-none inline-flex max-w-full items-center truncate rounded-full border border-border bg-background/85 px-2 py-0.5 text-[10px] font-medium tracking-wide text-foreground backdrop-blur-sm"
    >
      {label}
    </span>
  );
}

function AvailabilityLine({ data }: { data: DirectoryCardData }) {
  return (
    <span
      data-card-availability
      className="inline-flex items-center gap-1.5 text-[11px] text-[var(--impronta-muted)]"
    >
      <span
        aria-hidden
        className={`size-1.5 rounded-full ${
          data.availabilityKnown
            ? "bg-foreground/60"
            : "bg-[var(--impronta-muted)]/50"
        }`}
      />
      {data.availabilityLabel}
    </span>
  );
}

function Photo({
  data,
  aspectRatio,
  priority,
  rounded,
}: {
  data: DirectoryCardData;
  aspectRatio: string;
  priority?: boolean;
  rounded: string;
}) {
  return (
    <div
      className={`relative w-full overflow-hidden ${rounded} bg-[var(--impronta-surface)]/50`}
      style={{ aspectRatio }}
      data-card-media
    >
      {data.photoUrl ? (
        <Image
          src={data.photoUrl}
          alt={data.name}
          fill
          className="object-cover transition-transform duration-500 group-hover/card:scale-[1.03]"
          sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
          priority={priority}
        />
      ) : (
        <div
          aria-hidden
          className="flex h-full items-center justify-center px-4 text-center font-display text-sm tracking-[0.18em] text-[var(--impronta-muted)]"
        >
          {data.name}
        </div>
      )}
    </div>
  );
}

export function DirectoryCard({
  data,
  style,
  show,
  nameFallback,
  aspect,
  priority,
  index,
}: DirectoryCardProps) {
  const displayName = resolveName(data.name, show.showName, nameFallback);
  const href = data.profileHref || "#";
  const aspectRatio = ASPECT[aspect];

  if (style === "editorial") {
    return (
      <Link
        href={href}
        className="group/card flex flex-col gap-3 outline-none focus-visible:ring-2 focus-visible:ring-foreground/30"
        data-card-style="editorial"
      >
        <Photo
          data={data}
          aspectRatio={aspectRatio}
          priority={priority}
          rounded="rounded-xl"
        />
        <div className="flex flex-col gap-1 border-t border-border pt-3">
          <div className="flex items-baseline gap-3">
            {typeof index === "number" ? (
              <span className="font-display text-xs tabular-nums text-[var(--impronta-muted)]">
                {String(index + 1).padStart(2, "0")}
              </span>
            ) : null}
            {displayName ? (
              <h3 className="font-display text-lg font-medium leading-tight tracking-wide text-foreground">
                {displayName}
              </h3>
            ) : null}
          </div>
          {show.showTalentType && data.primaryType ? (
            <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-[var(--impronta-muted)]">
              {data.primaryType}
              {show.showLocation && data.location ? (
                <span className="normal-case tracking-normal">
                  {"  ·  "}
                  {data.location}
                </span>
              ) : null}
            </p>
          ) : show.showLocation && data.location ? (
            <p className="text-xs text-[var(--impronta-muted)]">
              {data.location}
            </p>
          ) : null}
          <div className="mt-1 flex flex-wrap items-center justify-between gap-2">
            {show.showBadges ? <OwnershipBadge data={data} /> : <span />}
            {show.showAvailability ? <AvailabilityLine data={data} /> : null}
          </div>
        </div>
      </Link>
    );
  }

  // Portrait (default / canonical)
  return (
    <Link
      href={href}
      className="group/card relative block overflow-hidden rounded-2xl border border-border outline-none transition-shadow duration-200 hover:shadow-md focus-visible:ring-2 focus-visible:ring-foreground/30"
      data-card-style="portrait"
    >
      <Photo
        data={data}
        aspectRatio={aspectRatio}
        priority={priority}
        rounded="rounded-none"
      />

      {/* Legibility scrim — raw overlay on imagery, not a brand token. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/55 via-black/10 to-transparent"
      />

      {show.showBadges ? (
        <div className="absolute left-2.5 top-2.5 z-[1] flex flex-wrap gap-1.5">
          <OwnershipBadge data={data} />
        </div>
      ) : null}

      <div className="absolute inset-x-0 bottom-0 z-[1] flex flex-col gap-1 px-3.5 pb-3.5">
        {displayName ? (
          <h3
            data-card-name
            className="font-display text-base font-medium leading-tight tracking-wide text-white drop-shadow-sm sm:text-lg"
          >
            {displayName}
          </h3>
        ) : null}
        {(show.showTalentType && data.primaryType) ||
        (show.showLocation && data.location) ? (
          <p className="truncate text-xs text-white/80">
            {show.showTalentType ? data.primaryType : null}
            {show.showTalentType &&
            data.primaryType &&
            show.showLocation &&
            data.location
              ? "  ·  "
              : null}
            {show.showLocation ? data.location : null}
          </p>
        ) : null}
        {show.showAvailability ? (
          <span
            data-card-availability
            className="mt-0.5 inline-flex items-center gap-1.5 text-[11px] text-white/75"
          >
            <span
              aria-hidden
              className={`size-1.5 rounded-full ${
                data.availabilityKnown ? "bg-white/80" : "bg-white/40"
              }`}
            />
            {data.availabilityLabel}
          </span>
        ) : null}
      </div>
    </Link>
  );
}
