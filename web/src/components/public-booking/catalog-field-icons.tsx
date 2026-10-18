/**
 * TUL-924: small decorative icons for the booking sheet's labels (calendar, clock, map pin).
 * Always aria-hidden: they never change a label's text or its accessible name.
 */
const SVG = {
  width: 14,
  height: 14,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round",
  strokeLinejoin: "round",
  "aria-hidden": true,
  focusable: false,
  style: { flexShrink: 0, opacity: 0.7 },
} as const;

export function CatalogCalendarIcon() {
  return (
    <svg {...SVG}>
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M16 3v4M8 3v4M3 10h18" />
    </svg>
  );
}

export function CatalogClockIcon() {
  return (
    <svg {...SVG}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </svg>
  );
}

export function CatalogPinIcon() {
  return (
    <svg {...SVG}>
      <path d="M12 21s-7-5.2-7-11a7 7 0 0 1 14 0c0 5.8-7 11-7 11z" />
      <circle cx="12" cy="10" r="2.5" />
    </svg>
  );
}
