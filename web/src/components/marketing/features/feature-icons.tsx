import type { FeatureKey } from "@/lib/marketing/features";

/**
 * One monoline family for the twenty one plates.
 *
 * Version one of the hub ships with no screenshots, so these carry the whole
 * visual identity. Rules that keep them a family rather than a collection:
 * a 24 unit square, a single 1.5 stroke, round caps and joins, no fills, and
 * `currentColor` throughout so a plate can tint the icon by changing text
 * colour alone. Each mark is drawn from its own subject rather than reaching
 * for the nearest generic symbol, which is why messaging is two overlapping
 * rules instead of a speech bubble and support is a person rather than a
 * headset.
 */

const PATHS: Record<FeatureKey, React.ReactNode> = {
  // A browser frame divided into a layout you are arranging.
  "website-builder": (
    <>
      <rect x="2.75" y="4.25" width="18.5" height="15.5" rx="2" />
      <path d="M2.75 8.5h18.5" />
      <path d="M9.5 8.5v11.25" />
      <path d="M9.5 14h11.75" />
    </>
  ),
  // A portrait plate: the frame matters as much as the figure.
  "talent-profiles": (
    <>
      <rect x="4.25" y="2.75" width="15.5" height="18.5" rx="2" />
      <circle cx="12" cy="10" r="2.75" />
      <path d="M7.25 18.25c.9-2.4 2.66-3.6 4.75-3.6s3.85 1.2 4.75 3.6" />
    </>
  ),
  // A list where every line carries a price.
  "services-storefront": (
    <>
      <path d="M3.75 6.5h10.5M3.75 12h10.5M3.75 17.5h10.5" />
      <path d="M17.75 6.5h2.5M17.75 12h2.5M17.75 17.5h2.5" />
    </>
  ),
  // Stacked frames, the top one holding an image.
  "media-library": (
    <>
      <rect x="7.25" y="3.25" width="14" height="13" rx="1.75" />
      <circle cx="11.75" cy="7.75" r="1.25" />
      <path d="M21.25 12.75l-3.9-3.4-5.6 5" />
      <path d="M16.75 20.75H4.5a1.75 1.75 0 0 1-1.75-1.75V7.25" />
    </>
  ),
  // A search sweep across a field of listings.
  directory: (
    <>
      <path d="M3.25 5.5h7M3.25 10h7M3.25 14.5h4" />
      <circle cx="15.5" cy="13.5" r="4.75" />
      <path d="M18.9 16.9l2.85 2.85" />
    </>
  ),
  // The corner of a code, not a whole one: it reads at small sizes.
  "qr-engine": (
    <>
      <rect x="3.25" y="3.25" width="7" height="7" rx="1.25" />
      <rect x="13.75" y="3.25" width="7" height="7" rx="1.25" />
      <rect x="3.25" y="13.75" width="7" height="7" rx="1.25" />
      <path d="M13.75 13.75h3.25v3.25M20.75 17v3.75h-3.5" />
    </>
  ),
  // A seal. Trust is something granted and worn.
  "reviews-and-trust": (
    <>
      <path d="M12 2.75l2.6 1.9 3.2-.15 1 3.05 2.6 1.9-1.25 2.95 1.25 2.95-2.6 1.9-1 3.05-3.2-.15L12 21.25l-2.6-1.9-3.2.15-1-3.05-2.6-1.9 1.25-2.95L2.6 9.45l2.6-1.9 1-3.05 3.2.15z" />
      <path d="M9.25 12.2l1.9 1.9 3.6-3.85" />
    </>
  ),
  // A funnel: many ways in, one way through.
  "inquiry-engine": (
    <>
      <path d="M3.25 4.75h17.5l-6.6 7.6v6.6l-4.3 2.3v-8.9z" />
    </>
  ),
  // Two overlapping rules: a conversation is two records meeting.
  messenger: (
    <>
      <path d="M3.25 6.25h12.5v8.5H8.5l-4 3.25v-3.25h-1.25z" />
      <path d="M18.5 9.5h2.25v8.5h-1.25v3l-3.5-3h-3.25" />
    </>
  ),
  // A time grid with one slot taken. The whole product in one mark.
  appointments: (
    <>
      <rect x="3.25" y="4.75" width="17.5" height="16" rx="2" />
      <path d="M3.25 9.5h17.5" />
      <path d="M7.75 2.75v4M16.25 2.75v4" />
      <rect x="6.5" y="12.25" width="5" height="3.25" rx="0.75" fill="currentColor" stroke="none" />
    </>
  ),
  // A round top seen from above, with covers around it.
  "tables-and-seating": (
    <>
      <circle cx="12" cy="12" r="4.75" />
      <path d="M12 2.75v2.75M12 18.5v2.75M2.75 12h2.75M18.5 12h2.75" />
      <path d="M5.45 5.45l1.95 1.95M16.6 16.6l1.95 1.95M18.55 5.45L16.6 7.4M7.4 16.6l-1.95 1.95" />
    </>
  ),
  // A document with terms and a signature line.
  "bookings-and-offers": (
    <>
      <path d="M5.25 2.75h9l5 5v13.5h-14z" />
      <path d="M14.25 2.75v5h5" />
      <path d="M8.25 12.25h7.5M8.25 15.5h7.5" />
      <path d="M8.25 18.5c1.5-1.1 2.5-1.1 3.75 0s2.25 1.1 3.75 0" />
    </>
  ),
  // A card with a chip. Money that moves without a plugin.
  payments: (
    <>
      <rect x="2.75" y="5.25" width="18.5" height="13.5" rx="2" />
      <path d="M2.75 9.75h18.5" />
      <rect x="6" y="13" width="4" height="2.75" rx="0.5" />
    </>
  ),
  // A ticket: the perforation is what makes it read.
  ticketing: (
    <>
      <path d="M2.75 7.25a2 2 0 0 1 2-2h14.5a2 2 0 0 1 2 2v2.25a2.5 2.5 0 0 0 0 5v2.25a2 2 0 0 1-2 2H4.75a2 2 0 0 1-2-2v-2.25a2.5 2.5 0 0 0 0-5z" />
      <path d="M12.75 6.75v1.75M12.75 11.25v1.75M12.75 15.75v1.75" />
    </>
  ),
  // A tag carrying a percentage.
  "discounts-and-campaigns": (
    <>
      <path d="M11.25 2.75h7a3 3 0 0 1 3 3v7L11.5 22.5 2 13z" />
      <circle cx="17" cy="7" r="1.25" />
      <path d="M8 12l4.75 4.75" />
      <circle cx="8.4" cy="12.4" r="0.15" fill="currentColor" />
    </>
  ),
  // One line arriving, three shares leaving.
  "commission-engine": (
    <>
      <path d="M2.75 12h6.5" />
      <path d="M9.25 12c3 0 3-7 6-7h5.75" />
      <path d="M9.25 12h11.75" />
      <path d="M9.25 12c3 0 3 7 6 7h5.75" />
      <circle cx="9.25" cy="12" r="1.5" />
    </>
  ),
  // Three figures, one slightly forward: a roster has a lead.
  "roster-and-team": (
    <>
      <circle cx="12" cy="7.5" r="2.75" />
      <path d="M6.75 20c.75-3 2.7-4.5 5.25-4.5s4.5 1.5 5.25 4.5" />
      <path d="M5.5 12.75A2.25 2.25 0 1 0 5.5 8.5" />
      <path d="M18.5 12.75a2.25 2.25 0 1 1 0-4.25" />
    </>
  ),
  // A record card with a person on it: the history, not just the face.
  "client-management": (
    <>
      <rect x="2.75" y="4.75" width="18.5" height="15" rx="2" />
      <circle cx="8.75" cy="10.75" r="2.25" />
      <path d="M5.25 16.5c.6-1.75 1.9-2.6 3.5-2.6s2.9.85 3.5 2.6" />
      <path d="M15 9.75h3.75M15 13h3.75" />
    </>
  ),
  // An axis with a rising line and the point that matters marked.
  analytics: (
    <>
      <path d="M3.75 3.5v17h17" />
      <path d="M7.5 15.75l3.75-4.5 3 2.5 4.75-6" />
      <circle cx="19" cy="7.75" r="1.4" fill="currentColor" stroke="none" />
    </>
  ),
  // A loop that closes itself.
  automations: (
    <>
      <path d="M4 9.25A8.25 8.25 0 0 1 19.5 7.5" />
      <path d="M20 14.75A8.25 8.25 0 0 1 4.5 16.5" />
      <path d="M19.75 3.5v4h-4M4.25 20.5v-4h4" />
    </>
  ),
  // A person, present. Not a headset, not a robot.
  "premium-support": (
    <>
      <circle cx="12" cy="8.25" r="3.25" />
      <path d="M5.75 20.25c1.05-3.4 3.35-5.1 6.25-5.1s5.2 1.7 6.25 5.1" />
      <circle cx="18.75" cy="5.25" r="1.6" fill="currentColor" stroke="none" />
    </>
  ),
};

export function FeatureIcon({
  featureKey,
  size = 28,
  strokeWidth = 1.5,
  className,
}: {
  featureKey: FeatureKey;
  size?: number;
  /** Bumped slightly at large sizes so the line keeps its weight. */
  strokeWidth?: number;
  className?: string;
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      focusable="false"
    >
      {PATHS[featureKey]}
    </svg>
  );
}
