/**
 * ServicesBlock — "Services / What I offer" section.
 * Renders package teasers (if any), service areas, and a "starting from"
 * rate hint. All optional; renders nothing when all are empty. --plt tokens.
 */

import type { TalentServiceAreaRow } from "../page";
import { LightSectionLabel } from "./section-label";
import { pickLocale } from "@/lib/i18n/pick-locale";

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
          <p
            className="plt-mono text-[0.625rem] font-medium uppercase tracking-[0.18em]"
            style={{ color: "var(--plt-muted-soft)" }}
          >
            {packagesLabel}
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            {packageTeasers.map((pkg, i) => (
              <div
                key={i}
                className="rounded-[var(--plt-radius-md)] border p-4"
                style={{
                  borderColor: "var(--plt-hairline)",
                  background: "var(--plt-bg-raised)",
                }}
              >
                <p className="font-medium" style={{ color: "var(--plt-ink)" }}>
                  {pkg.label}
                </p>
                {pkg.detail ? (
                  <p className="mt-1 text-sm" style={{ color: "var(--plt-muted)" }}>
                    {pkg.detail}
                  </p>
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
              area.locations?.display_name_i18n?.[
                pickLocale(locale, { en: "en", es: "es" })
              ] ?? null;
            const kindLabel =
              area.service_kind === "home_base"
                ? "Based in"
                : area.service_kind === "remote_only"
                ? "Remote"
                : "Travels to";
            const label = locationName ? `${kindLabel}: ${locationName}` : kindLabel;
            return (
              <span
                key={area.id}
                className="inline-flex items-center rounded-full border px-3 py-1 text-sm"
                style={{
                  borderColor: "var(--plt-hairline-strong)",
                  background: "var(--plt-bg-raised)",
                  color: "var(--plt-ink-soft)",
                }}
              >
                {label}
                {area.travel_fee_required ? (
                  <span
                    className="plt-mono ml-1.5 text-[0.625rem] uppercase tracking-[0.1em]"
                    style={{ color: "var(--plt-muted-soft)" }}
                  >
                    · fee
                  </span>
                ) : null}
              </span>
            );
          })}
        </div>
      ) : null}

      {/* Starting from + booking note */}
      {hasStartingFrom || hasBookingNote ? (
        <div className="mt-5 space-y-2">
          {hasStartingFrom ? (
            <p className="text-sm" style={{ color: "var(--plt-ink-soft)" }}>
              <span className="font-medium" style={{ color: "var(--plt-ink)" }}>
                Starting from:
              </span>{" "}
              {startingFrom}
            </p>
          ) : null}
          {hasBookingNote ? (
            <p className="text-sm" style={{ color: "var(--plt-ink-soft)" }}>
              <span
                className="plt-mono text-[0.6875rem] uppercase tracking-[0.14em]"
                style={{ color: "var(--plt-muted-soft)" }}
              >
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
