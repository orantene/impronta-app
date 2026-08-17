"use client";

/**
 * Local look-and-feel for the Redirects surface.
 *
 * Same palette + inline-style idiom as its sibling route (`website/forms`):
 * these standalone workspace pages deliberately don't reach for the `admin-*`
 * Tailwind token scope, which is scoped to the prototype shell's own tree.
 */

export const C = {
  ink: "#0B0B0D",
  inkMuted: "rgba(11,11,13,0.55)",
  inkDim: "rgba(11,11,13,0.35)",
  border: "rgba(24,24,27,0.10)",
  borderSoft: "rgba(24,24,27,0.06)",
  surface: "rgba(11,11,13,0.02)",
  accent: "#0F4F3E",
  amber: "#B45309",
  amberSoft: "rgba(180,83,9,0.10)",
  green: "#2E7D5B",
  greenSoft: "rgba(46,125,91,0.10)",
  red: "#9B1C1C",
  redSoft: "rgba(155,28,28,0.08)",
} as const;

export const FONT = '"Inter", system-ui, sans-serif';
export const MONO = '"JetBrains Mono", "SF Mono", ui-monospace, monospace';

export const fieldStyle: React.CSSProperties = {
  padding: "8px 10px",
  border: `1px solid ${C.border}`,
  borderRadius: 8,
  fontSize: 12.5,
  color: C.ink,
  background: "#fff",
  outline: "none",
};

export function Btn({
  children,
  onClick,
  disabled,
  variant = "secondary",
  type = "button",
}: {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  variant?: "primary" | "secondary" | "danger";
  type?: "button" | "submit";
}) {
  const palette =
    variant === "primary"
      ? { bg: C.ink, fg: "#fff", border: C.ink }
      : variant === "danger"
        ? { bg: "#fff", fg: C.red, border: "rgba(155,28,28,0.35)" }
        : { bg: "#fff", fg: C.ink, border: C.border };
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      style={{
        padding: "7px 13px",
        borderRadius: 8,
        fontSize: 12.5,
        fontWeight: 600,
        fontFamily: FONT,
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.45 : 1,
        background: palette.bg,
        color: palette.fg,
        border: `1px solid ${palette.border}`,
        whiteSpace: "nowrap",
      }}
    >
      {children}
    </button>
  );
}

/** Two-or-more mutually exclusive choices, rendered as one joined control. */
export function Segmented({
  value,
  options,
  onChange,
}: {
  value: string;
  options: ReadonlyArray<{ value: string; label: string }>;
  onChange: (next: string) => void;
}) {
  return (
    <div
      role="radiogroup"
      style={{
        display: "inline-flex",
        border: `1px solid ${C.border}`,
        borderRadius: 8,
        overflow: "hidden",
        background: "#fff",
      }}
    >
      {options.map((opt) => {
        const on = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onChange(opt.value)}
            style={{
              padding: "7px 13px",
              fontSize: 12,
              fontWeight: on ? 700 : 500,
              fontFamily: FONT,
              border: "none",
              cursor: "pointer",
              background: on ? C.ink : "transparent",
              color: on ? "#fff" : C.inkMuted,
            }}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
