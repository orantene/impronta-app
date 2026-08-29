"use client";

// ─── Inline icons (kept tiny + neutral) ──────────────────────────────
//
// Extracted from primitives.tsx — Phase 1f decomposition.
// Icon + AdminShellIconName are part of the byte-stable public surface
// of primitives.tsx; the barrel re-exports them so external importers
// (`from "./primitives"`) continue to work unchanged.

export type AdminShellIconName =
  | "arrow-right"
  | "chevron-right"
  | "chevron-down"
  | "x"
  | "lock"
  | "check"
  | "plus"
  | "sparkle"
  | "external"
  | "search"
  | "filter"
  | "info"
  | "user"
  | "team"
  | "globe"
  | "palette"
  | "credit"
  | "settings"
  | "calendar"
  | "mail"
  | "bolt"
  | "circle"
  | "alert"
  | "star"
  | "bell"
  | "moon"
  | "map-pin"
  | "archive"
  | "pencil"
  | "home"
  | "send"
  | "layers"
  | "camera"
  | "image"
  | "briefcase"
  | "chart"
  | "life-buoy";

export function Icon({
  name,
  size = 14,
  stroke = 1.6,
  color = "currentColor",
}: {
  name: AdminShellIconName;
  size?: number;
  stroke?: number;
  color?: string;
}) {
  const common = {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: color,
    strokeWidth: stroke,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };
  switch (name) {
    case "arrow-right":
      return (
        <svg {...common}>
          <path d="M5 12h14M13 6l6 6-6 6" />
        </svg>
      );
    case "chevron-right":
      return (
        <svg {...common}>
          <path d="M9 6l6 6-6 6" />
        </svg>
      );
    case "chevron-down":
      return (
        <svg {...common}>
          <path d="M6 9l6 6 6-6" />
        </svg>
      );
    case "x":
      return (
        <svg {...common}>
          <path d="M6 6l12 12M18 6l-12 12" />
        </svg>
      );
    case "lock":
      return (
        <svg {...common}>
          <rect x="5" y="11" width="14" height="9" rx="2" />
          <path d="M8 11V8a4 4 0 1 1 8 0v3" />
        </svg>
      );
    case "check":
      return (
        <svg {...common}>
          <path d="M5 12l5 5 9-11" />
        </svg>
      );
    case "plus":
      return (
        <svg {...common}>
          <path d="M12 5v14M5 12h14" />
        </svg>
      );
    case "sparkle":
      return (
        <svg {...common}>
          <path d="M12 3v6M12 15v6M3 12h6M15 12h6" />
        </svg>
      );
    case "external":
      return (
        <svg {...common}>
          <path d="M14 4h6v6M20 4l-9 9M19 13v5a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h5" />
        </svg>
      );
    case "search":
      return (
        <svg {...common}>
          <circle cx="11" cy="11" r="7" />
          <path d="M20 20l-4-4" />
        </svg>
      );
    case "filter":
      return (
        <svg {...common}>
          <path d="M4 5h16M7 12h10M10 19h4" />
        </svg>
      );
    case "info":
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="9" />
          <path d="M12 8v.01M12 12v4" />
        </svg>
      );
    case "user":
      return (
        <svg {...common}>
          <circle cx="12" cy="9" r="4" />
          <path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6" />
        </svg>
      );
    case "team":
      return (
        <svg {...common}>
          <circle cx="9" cy="9" r="3.5" />
          <circle cx="17" cy="10" r="2.5" />
          <path d="M3 19c1-3 3.5-4.5 6-4.5s5 1.5 6 4.5" />
          <path d="M15 19c0.6-2 2-3 3.5-3" />
        </svg>
      );
    case "globe":
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="9" />
          <path d="M3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18" />
        </svg>
      );
    case "palette":
      return (
        <svg {...common}>
          <path d="M12 3a9 9 0 1 0 0 18c1.5 0 2-1 2-2 0-1-0.5-1.5 0-2 0.5-0.5 1.5-0.5 2.5-0.5h1A3.5 3.5 0 0 0 21 13c0-5-4-10-9-10z" />
          <circle cx="7.5" cy="11" r="1" fill={color} stroke="none" />
          <circle cx="10" cy="7.5" r="1" fill={color} stroke="none" />
          <circle cx="15" cy="7.5" r="1" fill={color} stroke="none" />
        </svg>
      );
    case "credit":
      return (
        <svg {...common}>
          <rect x="3" y="6" width="18" height="13" rx="2" />
          <path d="M3 10h18M7 15h3" />
        </svg>
      );
    case "settings":
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="3" />
          <path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.5 5.5l1.5 1.5M17 17l1.5 1.5M5.5 18.5l1.5-1.5M17 7l1.5-1.5" />
        </svg>
      );
    case "calendar":
      return (
        <svg {...common}>
          <rect x="3" y="5" width="18" height="16" rx="2" />
          <path d="M3 10h18M8 3v4M16 3v4" />
        </svg>
      );
    case "mail":
      return (
        <svg {...common}>
          <rect x="3" y="5" width="18" height="14" rx="2" />
          <path d="M3 7l9 7 9-7" />
        </svg>
      );
    case "bolt":
      return (
        <svg {...common}>
          <path d="M13 2L4 14h7l-1 8 9-12h-7l1-8z" />
        </svg>
      );
    case "circle":
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="9" />
        </svg>
      );
    case "map-pin":
      return (
        <svg {...common}>
          <path d="M12 22s7-7.58 7-12a7 7 0 1 0-14 0c0 4.42 7 12 7 12z" />
          <circle cx="12" cy="10" r="2.5" />
        </svg>
      );
    case "alert":
      return (
        <svg {...common}>
          <path d="M12 3l10 17H2L12 3z" />
          <path d="M12 10v4M12 17v.01" />
        </svg>
      );
    case "star":
      return (
        <svg {...common}>
          <path d="M12 3l2.6 5.3 5.9.9-4.3 4.1 1 5.9L12 16.5 6.8 19.2l1-5.9L3.5 9.2l5.9-.9L12 3z" />
        </svg>
      );
    case "bell":
      return (
        <svg {...common}>
          <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
          <path d="M10 21a2 2 0 0 0 4 0" />
        </svg>
      );
    case "moon":
      return (
        <svg {...common}>
          <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
        </svg>
      );
    case "archive":
      return (
        <svg {...common}>
          <path d="M3 6h18M5 6v13a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V6M9 11h6" />
          <rect x="3" y="3" width="18" height="4" rx="1" />
        </svg>
      );
    case "pencil":
      return (
        <svg {...common}>
          <path d="M16 3l5 5L8 21H3v-5L16 3z" />
        </svg>
      );
    case "home":
      return (
        <svg {...common}>
          <path d="M3 10.5L12 3l9 7.5" />
          <path d="M5.5 9.5V21h13V9.5" />
          <path d="M10 21v-5.5h4V21" />
        </svg>
      );
    case "send":
      return (
        <svg {...common}>
          <path d="M22 2L11 13" />
          <path d="M22 2l-7 20-4-9-9-4 20-7z" />
        </svg>
      );
    case "layers":
      return (
        <svg {...common}>
          <path d="M12 2l10 5.5L12 13 2 7.5 12 2z" />
          <path d="M2 12.5L12 18l10-5.5" />
          <path d="M2 17.5L12 23l10-5.5" />
        </svg>
      );
    case "camera":
      return (
        <svg {...common}>
          <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2v11z" />
          <circle cx="12" cy="13" r="4" />
        </svg>
      );
    case "image":
      return (
        <svg {...common}>
          <rect x="3" y="3" width="18" height="18" rx="2" />
          <circle cx="8.5" cy="8.5" r="1.5" />
          <path d="M21 15l-5-5L5 21" />
        </svg>
      );
    case "briefcase":
      return (
        <svg {...common}>
          <rect x="2" y="7" width="20" height="14" rx="2" />
          <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
        </svg>
      );
    case "chart":
      return (
        <svg {...common}>
          <path d="M3 3v18h18" />
          <path d="M7 15l4-5 3 3 5-7" />
        </svg>
      );
    // Support: a speech bubble with a tail. Was a life-ring (two circles +
    // four spokes) which collapsed into a ship's-wheel smudge below ~24px.
    case "life-buoy":
      return (
        <svg {...common}>
          <path d="M8.6 16.5H6.5A3.5 3.5 0 013 13V8.5A3.5 3.5 0 016.5 5h11A3.5 3.5 0 0121 8.5V13a3.5 3.5 0 01-3.5 3.5h-4.7l-3.5 3a.7.7 0 01-1.2-.5v-2.5z" />
        </svg>
      );
  }
}
