/**
 * AvailabilityWidget — renders an availability pill + 14-day dot strip.
 * Renders nothing when no availability data is available.
 *
 * Server component — pure presentational, no interactivity.
 */

type AvailabilityWidgetProps = {
  availableDaysInNext30: number | null;
  availabilityDots14d: string | null;
  nextAvailableDate: string | null;
};

export function AvailabilityWidget({
  availableDaysInNext30,
  availabilityDots14d,
  nextAvailableDate,
}: AvailabilityWidgetProps) {
  if (
    availableDaysInNext30 === null &&
    availabilityDots14d === null &&
    nextAvailableDate === null
  ) {
    return null;
  }

  const dots =
    typeof availabilityDots14d === "string" && availabilityDots14d.length > 0
      ? availabilityDots14d.slice(0, 14).split("")
      : null;

  return (
    <div className="space-y-2">
      {/* Availability pill */}
      {availableDaysInNext30 !== null && (
        <div className="inline-flex items-center gap-1.5 rounded-full border border-[#ECECEC] bg-[#FAFAF8] px-3 py-1">
          <span
            className="size-2 shrink-0 rounded-full"
            style={{
              backgroundColor:
                availableDaysInNext30 > 15
                  ? "#22C55E"
                  : availableDaysInNext30 > 5
                  ? "#F59E0B"
                  : "#EF4444",
            }}
          />
          <span className="text-[11px] font-medium text-[#1A1A1A]">
            Available{" "}
            <span className="font-semibold">{availableDaysInNext30}</span>
            {" "}of next 30 days
          </span>
        </div>
      )}

      {/* 14-day dot strip */}
      {dots && dots.length > 0 && (
        <div className="flex items-center gap-[3px]" aria-label="14-day availability strip">
          {dots.map((dot, i) => {
            // '·' = free, '×' = blocked; anything else = unknown
            const isFree = dot === "·" || dot === "·";
            const isBlocked = dot === "×" || dot === "×";
            return (
              <span
                key={i}
                className="block h-2 w-2 rounded-sm"
                style={{
                  backgroundColor: isFree
                    ? "#22C55E"
                    : isBlocked
                    ? "#D1D5DB"
                    : "#E5E7EB",
                  opacity: isFree ? 0.8 : 0.5,
                }}
                aria-hidden="true"
              />
            );
          })}
          <span className="ml-1 text-[10px] uppercase tracking-[0.12em] text-[#6B6B6B]">
            14 days
          </span>
        </div>
      )}

      {/* Next available date */}
      {nextAvailableDate && !availableDaysInNext30 && (
        <p className="text-[11px] text-[#6B6B6B]">
          Next available:{" "}
          <span className="font-medium text-[#1A1A1A]">
            {new Date(nextAvailableDate).toLocaleDateString("en-US", {
              month: "short",
              day: "numeric",
            })}
          </span>
        </p>
      )}
    </div>
  );
}
