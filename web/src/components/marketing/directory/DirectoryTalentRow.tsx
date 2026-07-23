import Link from "next/link";
import type { DirectoryCardRow } from "./shared";
import { agencyLine, locationLine, FOCUS_RING } from "./shared";
import { TalentAvatar, TrustBadge, AvailabilityLine } from "./DirectoryAtoms";
import { meetsCredibilityFloor } from "@/lib/reviews/craft-standing";

/**
 * Compact list row for the directory's list view. Same browse-only contract
 * as the card — links to `/t/<code>`, no buyer affordances. Takes the shared
 * `DirectoryCardRow` (the exact field set the row reads) so the grid + list
 * views feed off one row shape.
 */
export function DirectoryTalentRow({ talent }: { talent: DirectoryCardRow }) {
  const loc = locationLine(talent.homeCity, talent.homeCountry);
  const href = talent.profileCode ? `/t/${talent.profileCode}` : null;
  // STANDING chip — verified review aggregate off the discover matview, shown
  // only past the credibility floor (>= 3 verified reviews) so a thin record is
  // never oversold. Absence is neutral (no chip).
  const showStanding =
    talent.ratingAvg != null && meetsCredibilityFloor(talent.ratingCount);

  const inner = (
    <>
      <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-[14px]">
        <TalentAvatar name={talent.displayName} src={talent.headshotUrl} rounded="rounded-none" />
      </div>

      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <div className="flex items-center gap-2">
          <h3
            className="plt-display truncate text-[1rem] font-semibold leading-tight tracking-[-0.01em]"
            style={{ color: "var(--plt-ink)" }}
            title={talent.displayName}
          >
            {talent.displayName}
          </h3>
          <TrustBadge tier={talent.trustTier} />
          {showStanding ? (
            <span
              data-directory-standing
              className="inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[0.6875rem] font-semibold leading-none"
              style={{
                background: "var(--plt-bg-elevated)",
                border: "1px solid var(--plt-hairline)",
                color: "var(--plt-ink-soft)",
              }}
              title={`Verified standing from ${talent.ratingCount} completed bookings`}
            >
              <span aria-hidden style={{ color: "var(--plt-forest, #4a6b52)" }}>
                ★
              </span>
              <span className="tabular-nums">{talent.ratingAvg!.toFixed(1)}</span>
              <span className="opacity-60">·</span>
              <span className="tabular-nums">{talent.ratingCount}</span>
            </span>
          ) : null}
        </div>
        <p className="truncate text-[0.8125rem] leading-snug" style={{ color: "var(--plt-muted)" }}>
          {[talent.primaryTypeLabel, loc].filter(Boolean).join(" · ") || "—"}
        </p>
      </div>

      <div className="hidden min-w-0 shrink-0 sm:flex sm:w-48 sm:flex-col sm:items-end sm:gap-0.5 sm:text-right">
        <span
          className="truncate text-[0.8125rem]"
          style={{ color: "var(--plt-ink-soft)" }}
          title={agencyLine(talent.agencyName, talent.isExclusive)}
        >
          {agencyLine(talent.agencyName, talent.isExclusive)}
        </span>
        <AvailabilityLine availableDaysInNext30={talent.availableDaysInNext30} />
      </div>

      <ArrowGlyph />
    </>
  );

  const rowClass =
    "group flex items-center gap-4 rounded-[18px] px-4 py-3 transition-[background,border-color,transform] duration-200";
  const rowStyle: React.CSSProperties = {
    background: "var(--plt-bg-raised)",
    border: "1px solid var(--plt-hairline)",
  };

  if (!href) {
    return (
      <article className={rowClass} style={rowStyle}>
        {inner}
      </article>
    );
  }

  return (
    <Link
      href={href}
      className={`${rowClass} ${FOCUS_RING} hover:border-[var(--plt-forest-soft)] hover:bg-[var(--plt-bg-elevated)]`}
      style={rowStyle}
      data-directory-row
    >
      {inner}
    </Link>
  );
}

function ArrowGlyph() {
  return (
    <svg
      aria-hidden
      width="14"
      height="10"
      viewBox="0 0 14 10"
      fill="none"
      className="shrink-0 transition-transform duration-200 group-hover:translate-x-0.5"
      style={{ color: "var(--plt-muted)" }}
    >
      <path
        d="M1 5H13M13 5L9 1M13 5L9 9"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
