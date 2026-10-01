/** Shared look for the inquiry drawer and its extracted pieces. */
export const FONT = '"Inter", system-ui, sans-serif';
export const FONT_DISPLAY =
  'var(--font-geist-sans), "Inter", -apple-system, system-ui, sans-serif';

export const C = {
  ink: "#0B0B0D",
  inkMuted: "rgba(11,11,13,0.55)",
  inkDim: "rgba(11,11,13,0.35)",
  border: "rgba(24,24,27,0.10)",
  borderSoft: "rgba(24,24,27,0.06)",
  surface: "#FAFAF7",
  surfaceAlt: "#F7F7F2",
  card: "#FFFFFF",
  accent: "#1D4ED8",
  accentSoft: "rgba(29,78,216,0.08)",
  success: "#0F5132",
  successSoft: "rgba(15,81,50,0.08)",
  amber: "#92400E",
  amberSoft: "rgba(146,64,14,0.08)",
} as const;

// ─── Talent picker option ────────────────────────────────────────────────────
export type RosterLiteItem = {
  id: string;
  name: string;
  primaryTypeLabel?: string;
  city?: string;
  /** Public card-thumbnail URL — renders the talent's face in the picker. */
  photoUrl?: string | null;
};
