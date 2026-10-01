/**
 * Nail Designer artwork: the sticker / charm SVGs and the toolbar icons, copied
 * from the owner's Nail Studio design (Main.dc.html) path for path.
 */
import type { ReactNode } from "react";

const ICON = { width: 18, height: 18, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", "aria-hidden": true } as const;
const ICON_STYLE = { strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round" } as const;

export function UndoIcon() {
  return (
    <svg {...ICON} style={ICON_STYLE}>
      <path d="M9 14 4 9l5-5" />
      <path d="M4 9h11a5 5 0 0 1 0 10h-3" />
    </svg>
  );
}
export function ResetIcon() {
  return (
    <svg {...ICON} style={ICON_STYLE}>
      <path d="M3 12a9 9 0 1 0 3-6.7L3 8" />
      <path d="M3 3v5h5" />
    </svg>
  );
}
export function ShuffleIcon() {
  return (
    <svg {...ICON} style={ICON_STYLE}>
      <path d="M16 3h5v5" />
      <path d="M4 20 21 3" />
      <path d="M21 16v5h-5" />
      <path d="M15 15l6 6" />
      <path d="M4 4l5 5" />
    </svg>
  );
}
export function PlusIcon() {
  return (
    <svg {...ICON} style={ICON_STYLE}>
      <path d="M12 5v14" />
      <path d="M5 12h14" />
    </svg>
  );
}

const FULL = { viewBox: "0 0 24 24", width: "100%", height: "100%", "aria-hidden": true } as const;

/** The charm for a sticker id, or the "none" glyph when `withNone` is set. */
export function Sticker({ id, withNone = false }: { id: string; withNone?: boolean }): ReactNode {
  switch (id) {
    case "none":
      return withNone ? (
        <svg {...FULL} fill="none" stroke="#6E5F5B" style={{ strokeWidth: 1.6 }}>
          <circle cx="12" cy="12" r="8" />
          <line x1="6.5" y1="17.5" x2="17.5" y2="6.5" />
        </svg>
      ) : null;
    case "gem":
      return (
        <svg {...FULL}>
          <polygon points="12,2 20,9 12,22 4,9" fill="#E6F4FF" stroke="#8DB6D1" />
          <polygon points="12,2 15.5,9 12,22 8.5,9" fill="#FFFFFF" />
          <polyline points="4,9 20,9" fill="none" stroke="#8DB6D1" />
        </svg>
      );
    case "star":
      return (
        <svg {...FULL}>
          <polygon points="12,2 14.9,8.6 22,9.3 16.6,14 18.2,21 12,17.3 5.8,21 7.4,14 2,9.3 9.1,8.6" fill="#EBC75E" stroke="#B48A26" />
        </svg>
      );
    case "heart":
      return (
        <svg {...FULL}>
          <path
            d="M12 21 C5 16.5 2 12.8 2 8.8 C2 5.6 4.5 3.5 7.2 3.5 C9.3 3.5 11 4.8 12 6.6 C13 4.8 14.7 3.5 16.8 3.5 C19.5 3.5 22 5.6 22 8.8 C22 12.8 19 16.5 12 21 Z"
            fill="#FFF6F4"
            stroke="#C9A7A0"
          />
        </svg>
      );
    case "flower":
      return (
        <svg {...FULL}>
          <circle cx="12" cy="6.5" r="4" fill="#FFFFFF" stroke="#E2D6D0" />
          <circle cx="17.2" cy="10.3" r="4" fill="#FFFFFF" stroke="#E2D6D0" />
          <circle cx="15.2" cy="16.4" r="4" fill="#FFFFFF" stroke="#E2D6D0" />
          <circle cx="8.8" cy="16.4" r="4" fill="#FFFFFF" stroke="#E2D6D0" />
          <circle cx="6.8" cy="10.3" r="4" fill="#FFFFFF" stroke="#E2D6D0" />
          <circle cx="12" cy="12" r="2.8" fill="#F2C14E" />
        </svg>
      );
    case "pearls":
      return (
        <svg {...FULL}>
          <circle cx="7.5" cy="6" r="3.6" fill="#FBF7EE" stroke="#D2C4AE" />
          <circle cx="12" cy="12.2" r="3.2" fill="#FBF7EE" stroke="#D2C4AE" />
          <circle cx="16.5" cy="18.2" r="2.8" fill="#FBF7EE" stroke="#D2C4AE" />
        </svg>
      );
    default:
      return null;
  }
}
