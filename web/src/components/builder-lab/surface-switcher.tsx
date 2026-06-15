"use client";

/**
 * SurfaceSwitcher — the shared Agency | Talent pill toggle used across the
 * Builder Lab's per-surface views (Site Defaults, Connected, Site Starter Kit)
 * so they all switch surfaces with the SAME control. One surface is shown at a
 * time; the active pill is the light chip.
 */

const T = {
  cardSoft: "rgba(255,255,255,0.04)",
  ink: "#F5F2EB",
  inkMuted: "rgba(245,242,235,0.62)",
};

export function SurfaceSwitcher<K extends string>({
  options,
  value,
  onChange,
  ariaLabel,
}: {
  options: ReadonlyArray<{ key: K; label: string }>;
  value: K;
  onChange: (key: K) => void;
  ariaLabel?: string;
}) {
  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      style={{
        display: "inline-flex",
        background: T.cardSoft,
        borderRadius: 999,
        padding: 3,
        alignSelf: "flex-start",
      }}
    >
      {options.map((o) => {
        const on = value === o.key;
        return (
          <button
            key={o.key}
            type="button"
            role="tab"
            aria-selected={on}
            onClick={() => onChange(o.key)}
            className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#5DD3A0]/60"
            style={{
              background: on ? T.ink : "transparent",
              color: on ? "#0F0F11" : T.inkMuted,
              border: "none",
              fontSize: 12.5,
              fontWeight: 600,
              padding: "7px 16px",
              borderRadius: 999,
              cursor: "pointer",
            }}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
