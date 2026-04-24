"use client";

/**
 * CategoryIconGlyph — renders the same icon enum the category_grid schema
 * accepts, as a clean SVG glyph.
 *
 * The category_grid Component today uses CSS `content:` tricks to render
 * icons — that's fine for the public page, but useless inside the inspector
 * where we need to show the icon in a chip, a tile thumb, and a picker.
 * This component gives every surface a single source of truth for what
 * each icon actually looks like. If the public CSS ever drifts, this is
 * the first place to reconcile.
 */

type IconKey =
  | "brush"
  | "scissors"
  | "camera"
  | "film"
  | "clipboard"
  | "floral"
  | "sparkle"
  | "music"
  | "ring"
  | "pin"
  | "calendar"
  | "plane"
  | "star"
  | "circle"
  | "square"
  | "diamond";

export const CATEGORY_ICON_KEYS: ReadonlyArray<IconKey> = [
  "brush",
  "scissors",
  "camera",
  "film",
  "clipboard",
  "floral",
  "sparkle",
  "music",
  "ring",
  "pin",
  "calendar",
  "plane",
  "star",
  "circle",
  "square",
  "diamond",
];

export const CATEGORY_ICON_LABEL: Record<IconKey, string> = {
  brush: "Brush",
  scissors: "Scissors",
  camera: "Camera",
  film: "Film",
  clipboard: "Clipboard",
  floral: "Floral",
  sparkle: "Sparkle",
  music: "Music",
  ring: "Ring",
  pin: "Pin",
  calendar: "Calendar",
  plane: "Plane",
  star: "Star",
  circle: "Circle",
  square: "Square",
  diamond: "Diamond",
};

interface CategoryIconGlyphProps {
  icon: IconKey;
  size?: number;
  className?: string;
}

export function CategoryIconGlyph({
  icon,
  size = 18,
  className = "text-zinc-700",
}: CategoryIconGlyphProps) {
  const s = { width: size, height: size };
  const common = {
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.6,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
    className,
    ...s,
  };
  switch (icon) {
    case "brush":
      return (
        <svg {...common}>
          <path d="M4 20c0-2 2-4 4-4 1.7 0 3 1.3 3 3s-1.3 3-3 3a5 5 0 0 1-4-2z" />
          <path d="M14.5 4.5l5 5-6.5 6.5-5-5 6.5-6.5z" />
        </svg>
      );
    case "scissors":
      return (
        <svg {...common}>
          <circle cx="6" cy="6" r="3" />
          <circle cx="6" cy="18" r="3" />
          <path d="M20 4L8.12 16.88" />
          <path d="M14 12l6 6" />
        </svg>
      );
    case "camera":
      return (
        <svg {...common}>
          <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
          <circle cx="12" cy="13" r="4" />
        </svg>
      );
    case "film":
      return (
        <svg {...common}>
          <rect x="2" y="2" width="20" height="20" rx="2.18" />
          <line x1="7" y1="2" x2="7" y2="22" />
          <line x1="17" y1="2" x2="17" y2="22" />
          <line x1="2" y1="12" x2="22" y2="12" />
          <line x1="2" y1="7" x2="7" y2="7" />
          <line x1="2" y1="17" x2="7" y2="17" />
          <line x1="17" y1="17" x2="22" y2="17" />
          <line x1="17" y1="7" x2="22" y2="7" />
        </svg>
      );
    case "clipboard":
      return (
        <svg {...common}>
          <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
          <rect x="8" y="2" width="8" height="4" rx="1" />
        </svg>
      );
    case "floral":
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="2.4" />
          <path d="M12 2c2 3 2 5 0 7-2-2-2-4 0-7z" />
          <path d="M12 22c2-3 2-5 0-7-2 2-2 4 0 7z" />
          <path d="M2 12c3-2 5-2 7 0-2 2-4 2-7 0z" />
          <path d="M22 12c-3-2-5-2-7 0 2 2 4 2 7 0z" />
        </svg>
      );
    case "sparkle":
      return (
        <svg {...common}>
          <path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3z" />
          <path d="M19 19l.7 2 2 .7-2 .7-.7 2-.7-2-2-.7 2-.7z" />
        </svg>
      );
    case "music":
      return (
        <svg {...common}>
          <path d="M9 18V5l12-2v13" />
          <circle cx="6" cy="18" r="3" />
          <circle cx="18" cy="16" r="3" />
        </svg>
      );
    case "ring":
      return (
        <svg {...common}>
          <circle cx="12" cy="15" r="6" />
          <path d="M9 9l1-5h4l1 5" />
        </svg>
      );
    case "pin":
      return (
        <svg {...common}>
          <path d="M12 22s7-7 7-12a7 7 0 1 0-14 0c0 5 7 12 7 12z" />
          <circle cx="12" cy="10" r="2.5" />
        </svg>
      );
    case "calendar":
      return (
        <svg {...common}>
          <rect x="3" y="4" width="18" height="18" rx="2" />
          <line x1="16" y1="2" x2="16" y2="6" />
          <line x1="8" y1="2" x2="8" y2="6" />
          <line x1="3" y1="10" x2="21" y2="10" />
        </svg>
      );
    case "plane":
      return (
        <svg {...common}>
          <path d="M22 16l-10-4-8 4 2 2 6-2 4 4-2 4 2 2 6-10z" />
        </svg>
      );
    case "star":
      return (
        <svg {...common}>
          <path d="M12 2l3.1 6.3 7 1-5 4.9 1.2 7L12 17.8 5.7 21l1.2-7-5-4.9 7-1L12 2z" />
        </svg>
      );
    case "circle":
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="9" />
        </svg>
      );
    case "square":
      return (
        <svg {...common}>
          <rect x="4" y="4" width="16" height="16" rx="2" />
        </svg>
      );
    case "diamond":
      return (
        <svg {...common}>
          <path d="M12 2l10 10-10 10L2 12 12 2z" />
        </svg>
      );
  }
}
