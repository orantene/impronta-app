/**
 * BookingCard — sticky sidebar card with:
 *   - agency/represented-by line
 *   - "Request to book" CTA (passed as slot)
 *   - availability widget
 *   - reassurance line
 *   - share button (passed as slot)
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
    <div className="rounded-2xl border border-[#ECECEC] bg-white p-6 shadow-sm">
      {/* Represented by */}
      {agencyName ? (
        <div className="mb-4 pb-4 border-b border-[#F0F0EE]">
          <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#C4C4C4]">
            Represented by
          </p>
          <p className="mt-1 text-sm font-medium text-[#1A1A1A]">{agencyName}</p>
        </div>
      ) : null}

      {/* Primary CTA */}
      <div className="flex flex-col gap-2">
        {inquireButton}
        {discoveryCta}
      </div>

      {/* Availability */}
      {(availableDaysInNext30 !== null ||
        availabilityDots14d !== null ||
        nextAvailableDate !== null) ? (
        <div className="mt-5 border-t border-[#F0F0EE] pt-4">
          <AvailabilityWidget
            availableDaysInNext30={availableDaysInNext30}
            availabilityDots14d={availabilityDots14d}
            nextAvailableDate={nextAvailableDate}
          />
        </div>
      ) : null}

      {/* Reassurance */}
      <div className="mt-5 flex items-start gap-2 border-t border-[#F0F0EE] pt-4">
        <Shield className="mt-0.5 size-3.5 shrink-0 text-[#9CA3AF]" />
        <p className="text-[11px] leading-relaxed text-[#9CA3AF]">
          All inquiries are handled securely through Tulala
        </p>
      </div>

      {/* Share */}
      <div className="mt-4 border-t border-[#F0F0EE] pt-4">
        {shareMenu}
      </div>
    </div>
  );
}
