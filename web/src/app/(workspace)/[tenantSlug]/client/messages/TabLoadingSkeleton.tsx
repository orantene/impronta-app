"use client";

/**
 * TabLoadingSkeleton — shared async-loading placeholder for the panel-style
 * thread tabs (Lineup / Files / Offer / Details) in the client Messages
 * shell.
 *
 * The Chat tab has its own bubble-shaped `ChatLoadingSkeleton`; this is its
 * panel-shaped sibling so every tab body resolves through the same visual
 * system instead of a bare italic "Loading…" line. It reuses the same pulse
 * animation + light-surface tones as `ChatLoadingSkeleton` so the async
 * states read as one system.
 *
 * `label` is an already-resolved (translated) string used only for the
 * accessible status label — callers pass their existing per-tab loading copy
 * so no new catalog key is introduced.
 */

const SKEL_BG = "rgba(11,11,13,0.05)";

/** A single shimmering placeholder line. */
function SkelLine({ width, height = 12 }: { width: string; height?: number }) {
  return (
    <div
      aria-hidden
      style={{
        width,
        height,
        borderRadius: 6,
        background: SKEL_BG,
        animation: "client-msg-skel-pulse 1.4s ease-in-out infinite",
      }}
    />
  );
}

export function TabLoadingSkeleton({ label }: { label: string }) {
  return (
    <div
      role="status"
      aria-label={label}
      style={{
        padding: "16px 20px 28px",
        display: "flex",
        flexDirection: "column",
        gap: 14,
      }}
    >
      {/* Eyebrow + intro block — mirrors the header every panel tab renders. */}
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <SkelLine width="38%" height={10} />
        <SkelLine width="72%" />
      </div>
      {/* Two content cards. */}
      {[0, 1].map((i) => (
        <div
          key={i}
          aria-hidden
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 10,
            padding: "14px 16px",
            borderRadius: 10,
            background: "rgba(11,11,13,0.02)",
            border: "1px solid rgba(24,24,27,0.06)",
          }}
        >
          <SkelLine width={i === 0 ? "55%" : "48%"} />
          <SkelLine width="86%" />
          <SkelLine width="64%" />
        </div>
      ))}
      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes client-msg-skel-pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.55; }
        }
      `}} />
    </div>
  );
}
