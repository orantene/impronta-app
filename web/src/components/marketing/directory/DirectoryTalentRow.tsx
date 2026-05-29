import Link from "next/link";
import type { DiscoverTalentListItem } from "./shared";
import { agencyLine, locationLine } from "./shared";
import { TalentAvatar, TrustBadge, AvailabilityLine } from "./DirectoryAtoms";

/**
 * Compact list row for the directory's list view. Same browse-only contract
 * as the card — links to `/t/<code>`, no buyer affordances.
 */
export function DirectoryTalentRow({ talent }: { talent: DiscoverTalentListItem }) {
  const loc = locationLine(talent.homeCity, talent.homeCountry);
  const href = talent.profileCode ? `/t/${talent.profileCode}` : null;

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
      className={`${rowClass} hover:border-[var(--plt-forest-soft)] hover:bg-[var(--plt-bg-elevated)]`}
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
