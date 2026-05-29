import Link from "next/link";
import type { DiscoverTalentListItem } from "./shared";
import { agencyLine, locationLine, FOCUS_RING } from "./shared";
import { TalentAvatar, TrustBadge, AvailabilityLine } from "./DirectoryAtoms";

/**
 * Grid card for the public directory. Browse-only: the whole card is a link
 * to the canonical talent profile `/t/<code>`. No pricing, no cart/favorite,
 * no "hire" — discovery only.
 */
export function DirectoryTalentCard({ talent }: { talent: DiscoverTalentListItem }) {
  const loc = locationLine(talent.homeCity, talent.homeCountry);
  const typeAndLoc = [talent.primaryTypeLabel, loc].filter(Boolean).join(" · ");
  const href = talent.profileCode ? `/t/${talent.profileCode}` : null;

  const inner = (
    <>
      <div className="relative aspect-[4/5] overflow-hidden" style={{ background: "var(--plt-bg-deep)" }}>
        <TalentAvatar name={talent.displayName} src={talent.headshotUrl} rounded="rounded-none" />
        <div className="pointer-events-none absolute left-3 top-3 flex">
          <TrustBadge tier={talent.trustTier} />
        </div>
        <span
          aria-hidden
          className="pointer-events-none absolute inset-x-0 bottom-0 h-16 opacity-0 transition-opacity duration-300 group-hover:opacity-100"
          style={{ background: "linear-gradient(to top, color-mix(in srgb, var(--plt-forest-deep) 22%, transparent), transparent)" }}
        />
      </div>

      <div className="flex flex-1 flex-col gap-1.5 p-4">
        <h3
          className="plt-display truncate text-[1.0625rem] font-semibold leading-tight tracking-[-0.01em]"
          style={{ color: "var(--plt-ink)" }}
          title={talent.displayName}
        >
          {talent.displayName}
        </h3>
        {typeAndLoc ? (
          <p className="truncate text-[0.8125rem] leading-snug" style={{ color: "var(--plt-muted)" }}>
            {typeAndLoc}
          </p>
        ) : null}
        <p
          className="truncate text-[0.75rem] leading-snug"
          style={{ color: "var(--plt-muted-soft)" }}
          title={agencyLine(talent.agencyName, talent.isExclusive)}
        >
          {agencyLine(talent.agencyName, talent.isExclusive)}
        </p>
        <div className="mt-1.5 pt-1.5" style={{ borderTop: "1px solid var(--plt-hairline)" }}>
          <AvailabilityLine availableDaysInNext30={talent.availableDaysInNext30} />
        </div>
      </div>
    </>
  );

  // Base shadow lives in a class (not inline) so the hover + focus shadows can
  // win — an inline box-shadow would beat any `hover:`/`focus-visible:` class.
  const surfaceClass =
    "group flex h-full flex-col overflow-hidden rounded-[22px] shadow-[0_1px_2px_rgba(15,23,20,0.04)] transition-[transform,border-color,box-shadow] duration-200";
  const surfaceStyle: React.CSSProperties = {
    background: "var(--plt-bg-raised)",
    border: "1px solid var(--plt-hairline)",
  };

  if (!href) {
    return (
      <article className={surfaceClass} style={surfaceStyle}>
        {inner}
      </article>
    );
  }

  return (
    <Link
      href={href}
      className={`${surfaceClass} ${FOCUS_RING} hover:-translate-y-[2px] hover:shadow-[0_18px_36px_-20px_rgba(31,74,58,0.4)]`}
      style={surfaceStyle}
      data-directory-card
    >
      {inner}
    </Link>
  );
}
