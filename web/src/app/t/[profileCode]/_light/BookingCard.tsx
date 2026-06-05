/**
 * BookingCard — sticky sidebar card with:
 *   - agency/represented-by line
 *   - "Request to book" CTA (passed as slot)
 *   - availability widget
 *   - reassurance line
 *   - share row (passed as slot)
 * --plt tokens only.
 */

import { AvailabilityWidget } from "./AvailabilityWidget";
import { Shield } from "lucide-react";

type BookingCardProps = {
  agencyName: string | null;
  /** Slot: TalentProfileInquireButton */
  inquireButton: React.ReactNode;
  /** Slot: ShareProfileMenu */
  shareMenu: React.ReactNode;
  /** Slot: ProfileDiscoveryCta */
  discoveryCta: React.ReactNode;
  availableDaysInNext30: number | null;
  availabilityDots14d: string | null;
  nextAvailableDate: string | null;
};

export function BookingCard({
  agencyName,
  inquireButton,
  shareMenu,
  discoveryCta,
  availableDaysInNext30,
  availabilityDots14d,
  nextAvailableDate,
}: BookingCardProps) {
  return (
    <div
      className="rounded-[var(--plt-radius-lg)] border p-6"
      style={{
        borderColor: "var(--plt-hairline-strong)",
        background: "var(--plt-bg-elevated)",
        boxShadow: "var(--plt-shadow-md)",
      }}
    >
      {/* Represented by */}
      {agencyName ? (
        <div className="mb-4 border-b pb-4" style={{ borderColor: "var(--plt-hairline)" }}>
          <p
            className="plt-mono text-[0.625rem] font-semibold uppercase tracking-[0.2em]"
            style={{ color: "var(--plt-muted-soft)" }}
          >
            Represented by
          </p>
          <p className="mt-1 text-sm font-medium" style={{ color: "var(--plt-ink)" }}>
            {agencyName}
          </p>
        </div>
      ) : null}

      {/* Primary CTA */}
      <div className="flex flex-col gap-2">
        {inquireButton}
        {discoveryCta}
      </div>

      {/* Availability */}
      {availableDaysInNext30 !== null ||
      availabilityDots14d !== null ||
      nextAvailableDate !== null ? (
        <div className="mt-5 border-t pt-4" style={{ borderColor: "var(--plt-hairline)" }}>
          <AvailabilityWidget
            availableDaysInNext30={availableDaysInNext30}
            availabilityDots14d={availabilityDots14d}
            nextAvailableDate={nextAvailableDate}
          />
        </div>
      ) : null}

      {/* Reassurance */}
      <div
        className="mt-5 flex items-start gap-2 border-t pt-4"
        style={{ borderColor: "var(--plt-hairline)" }}
      >
        <Shield className="mt-0.5 size-3.5 shrink-0" style={{ color: "var(--plt-forest)" }} />
        <p className="text-[0.6875rem] leading-relaxed" style={{ color: "var(--plt-muted)" }}>
          All inquiries are handled securely through Tulala
        </p>
      </div>

      {/* Share */}
      <div className="mt-4 border-t pt-4" style={{ borderColor: "var(--plt-hairline)" }}>
        {shareMenu}
      </div>
    </div>
  );
}
