/**
 * AvailabilityWidget — renders an availability pill + 14-day dot strip.
 * Renders nothing when no availability data is available.
 * --plt tokens only. Status colors stay semantic (green/amber/red).
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
    <div className="space-y-2.5">
      {/* Availability pill */}
      {availableDaysInNext30 !== null && (
        <div
          className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1"
          style={{
            borderColor: "var(--plt-hairline-strong)",
            background: "var(--plt-bg-raised)",
          }}
        >
          <span
            className="size-2 shrink-0 rounded-full"
            style={{
              backgroundColor:
                availableDaysInNext30 > 15
                  ? "var(--plt-forest-bright)"
                  : availableDaysInNext30 > 5
                  ? "#F59E0B"
                  : "#EF4444",
            }}
          />
          <span className="text-[0.6875rem] font-medium" style={{ color: "var(--plt-ink)" }}>
            Available{" "}
            <span className="font-semibold">{availableDaysInNext30}</span> of next 30 days
          </span>
        </div>
      )}

      {/* 14-day dot strip */}
      {dots && dots.length > 0 && (
        <div className="flex items-center gap-[3px]" aria-label="14-day availability strip">
          {dots.map((dot, i) => {
            const isFree = dot === "·";
            const isBlocked = dot === "×";
            return (
              <span
                key={i}
                className="block h-2 w-2 rounded-sm"
                style={{
                  backgroundColor: isFree
                    ? "var(--plt-forest-bright)"
                    : isBlocked
                    ? "var(--plt-hairline-strong)"
                    : "var(--plt-hairline)",
                  opacity: isFree ? 0.85 : 0.6,
                }}
                aria-hidden="true"
              />
            );
          })}
          <span
            className="plt-mono ml-1 text-[0.625rem] uppercase tracking-[0.12em]"
            style={{ color: "var(--plt-muted)" }}
          >
            14 days
          </span>
        </div>
      )}

      {/* Next available date */}
      {nextAvailableDate && !availableDaysInNext30 && (
        <p className="text-[0.6875rem]" style={{ color: "var(--plt-muted)" }}>
          Next available:{" "}
          <span className="font-medium" style={{ color: "var(--plt-ink)" }}>
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
