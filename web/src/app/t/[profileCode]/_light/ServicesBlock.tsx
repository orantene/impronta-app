/**
 * ServicesBlock — "Services / What I offer" section.
 * Renders package teasers (if any), service areas, and a "starting from"
 * rate hint. All optional; renders nothing when all are empty.
 */

import type { TalentServiceAreaRow } from "../page";

type PackageTeaser = { label: string; detail: string | null };

type ServicesBlockProps = {
  packageTeasers: PackageTeaser[];
  serviceAreas: TalentServiceAreaRow[];
  startingFrom: string | null;
  bookingNote: string | null;
  locale: string;
  heading: string;
  packagesLabel: string;
  bookingDetailsLabel: string;
};

export function ServicesBlock({
  packageTeasers,
  serviceAreas,
  startingFrom,
  bookingNote,
  locale,
  heading,
  packagesLabel,
  bookingDetailsLabel,
}: ServicesBlockProps) {
  const hasPackages = packageTeasers.length > 0;
  const hasServiceAreas = serviceAreas.length > 0;
  const hasStartingFrom = Boolean(startingFrom?.trim());
  const hasBookingNote = Boolean(bookingNote?.trim());

  if (!hasPackages && !hasServiceAreas && !hasStartingFrom && !hasBookingNote) {
    return null;
  }

  return (
    <section aria-labelledby="services-heading" data-profile-section="services">
      <LightSectionLabel id="services-heading">{heading}</LightSectionLabel>

      {/* Package teasers */}
      {hasPackages ? (
        <div className="mt-5 space-y-3">
          <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-[#9CA3AF]">
            {packagesLabel}
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            {packageTeasers.map((pkg, i) => (
              <div
                key={i}
                className="rounded-2xl border border-[#ECECEC] bg-[#FAFAF8] p-4"
              >
                <p className="font-medium text-[#1A1A1A]">{pkg.label}</p>
                {pkg.detail ? (
                  <p className="mt-1 text-sm text-[#6B6B6B]">{pkg.detail}</p>
                ) : null}
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {/* Service areas */}
      {hasServiceAreas ? (
        <div className="mt-5 flex flex-wrap gap-2">
          {serviceAreas.map((area) => {
            const locationName =
              area.locations?.[
                locale === "es" ? "display_name_es" : "display_name_en"
              ] ?? null;
            const kindLabel =
              area.service_kind === "home_base"
                ? "Based in"
                : area.service_kind === "remote_only"
                ? "Remote"
                : "Travels to";
            const label = locationName
              ? `${kindLabel}: ${locationName}`
              : kindLabel;
            return (
              <span
                key={area.id}
                className="inline-flex items-center rounded-full border border-[#ECECEC] bg-white px-3 py-1 text-sm text-[#6B6B6B]"
              >
                {label}
                {area.travel_fee_required ? (
                  <span className="ml-1.5 text-[10px] uppercase tracking-[0.1em] text-[#9CA3AF]">
                    · fee
                  </span>
                ) : null}
              </span>
            );
          })}
        </div>
      ) : null}

      {/* Starting from + booking note */}
      {(hasStartingFrom || hasBookingNote) ? (
        <div className="mt-5 space-y-2">
          {hasStartingFrom ? (
            <p className="text-sm text-[#6B6B6B]">
              <span className="font-medium text-[#1A1A1A]">Starting from:</span>{" "}
              {startingFrom}
            </p>
          ) : null}
          {hasBookingNote ? (
            <p className="text-sm text-[#6B6B6B]">
              <span className="text-[11px] uppercase tracking-[0.14em] text-[#9CA3AF]">
                {bookingDetailsLabel}:{" "}
              </span>
              {bookingNote}
            </p>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

// Local section label (light theme)
function LightSectionLabel({
  id,
  children,
}: {
  id?: string;
  children: React.ReactNode;
}) {
  return (
    <h2
      id={id}
      className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[#9CA3AF]"
    >
      {children}
    </h2>
  );
}
