// Shared design tokens + small helpers for the platform Email console UI.
// Extracted from EmailConsoleClient.tsx to keep that file under the line cap.

// ─── HQ design tokens (match the platform admin dark theme) ──────────────────
export const HQ = {
  bg: "#0F0F11",
  card: "#16161A",
  border: "rgba(255,255,255,0.10)",
  borderSoft: "rgba(255,255,255,0.06)",
  ink: "#F5F2EB",
  inkMuted: "rgba(245,242,235,0.62)",
  inkDim: "rgba(245,242,235,0.38)",
  green: "#5DD3A0",
  amber: "#E3B341",
  red: "#F36772",
  blue: "#6AA6F3",
} as const;

export const FONT_BODY = '"Inter", system-ui, sans-serif';
export const FONT_DISPLAY = 'var(--font-geist-sans), "Inter", -apple-system, system-ui, sans-serif';
export const MONO = '"SF Mono", Monaco, monospace';

export function relTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  const h = Math.floor(diff / 3600000);
  const d = Math.floor(diff / 86400000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  if (h < 24) return `${h}h ago`;
  if (d < 7) return `${d}d ago`;
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export const STATUS_COLOR: Record<string, string> = {
  sent: HQ.green,
  failed: HQ.red,
  suppressed: HQ.amber,
  queued: HQ.inkMuted,
  skipped: HQ.inkDim,
};

export const label = {
  display: "block",
  fontSize: 11,
  fontWeight: 600,
  color: HQ.inkMuted,
  marginBottom: 6,
  textTransform: "uppercase",
  letterSpacing: 0.5,
} as const;

export const input = {
  width: "100%",
  padding: "8px 12px",
  fontSize: 13,
  fontFamily: FONT_BODY,
  background: HQ.card,
  border: `1px solid ${HQ.border}`,
  borderRadius: 6,
  color: HQ.ink,
  boxSizing: "border-box" as const,
};

export const btn = (bg: string, fg: string) => ({
  padding: "8px 14px",
  fontSize: 13,
  fontWeight: 600,
  fontFamily: FONT_BODY,
  background: bg,
  color: fg,
  border: "none",
  borderRadius: 6,
  cursor: "pointer",
});
