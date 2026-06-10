// Shared presentational primitives for the Profile Fields hub.
// Server module (no "use client") — these are pure render helpers extracted
// from catalog/page.tsx so the tab modules can reuse identical styling.
// The one client-capable primitive (CopyableId) lives in its own file and is
// re-exported here for a single import site.

export const HQ = {
  card: "#16161A",
  cardSoft: "rgba(255,255,255,0.04)",
  border: "rgba(255,255,255,0.10)",
  borderSoft: "rgba(255,255,255,0.06)",
  ink: "#F5F2EB",
  inkMuted: "rgba(245,242,235,0.62)",
  inkDim: "rgba(245,242,235,0.38)",
  green: "#5DD3A0",
  amber: "#9BA8B7",
  red: "#F36772",
  violet: "#A99BE6",
} as const;

export const F = '"Inter", system-ui, sans-serif';
export const FD = 'var(--font-geist-sans), "Inter", -apple-system, system-ui, sans-serif';

export function HqCard({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <section
      style={{
        background: HQ.card,
        border: `1px solid ${HQ.borderSoft}`,
        borderRadius: 12,
        padding: 16,
        fontFamily: F,
        marginBottom: 16,
      }}
    >
      <div style={{ marginBottom: 12 }}>
        <div style={{ fontFamily: FD, fontSize: 15, fontWeight: 600, color: HQ.ink }}>
          {title}
        </div>
        {subtitle && (
          <div style={{ fontSize: 12, color: HQ.inkMuted, marginTop: 2 }}>
            {subtitle}
          </div>
        )}
      </div>
      {children}
    </section>
  );
}

// Collapsible card — native <details>, no client JS. The disclosure marker and
// chevron rotation are driven by the one <style> block rendered on the page.
export function HqAccordion({
  title,
  meta,
  badge,
  defaultOpen,
  children,
}: {
  title: string;
  meta?: string;
  badge?: { text: string; tone: string };
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  return (
    <details
      className="hq-acc"
      open={defaultOpen ? true : undefined}
      style={{
        background: HQ.card,
        border: `1px solid ${HQ.borderSoft}`,
        borderRadius: 12,
        fontFamily: F,
        marginBottom: 10,
      }}
    >
      <summary
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "13px 16px",
          cursor: "pointer",
          userSelect: "none",
        }}
      >
        <span
          className="hq-chev"
          aria-hidden
          style={{ fontSize: 11, color: HQ.inkDim, transition: "transform .15s", display: "inline-block" }}
        >
          ▶
        </span>
        <span style={{ fontFamily: FD, fontSize: 14.5, fontWeight: 600, color: HQ.ink }}>
          {title}
        </span>
        {badge && (
          <span
            style={{
              fontSize: 10,
              fontWeight: 700,
              color: badge.tone,
              border: `1px solid ${badge.tone}44`,
              background: `${badge.tone}1a`,
              borderRadius: 999,
              padding: "1px 8px",
            }}
          >
            {badge.text}
          </span>
        )}
        {meta && (
          <span style={{ fontSize: 11.5, color: HQ.inkMuted, marginLeft: "auto" }}>{meta}</span>
        )}
      </summary>
      <div style={{ padding: "0 16px 14px" }}>{children}</div>
    </details>
  );
}

export function Stat({ label, value, tone }: { label: string; value: string | number; tone?: string }) {
  return (
    <div
      style={{
        background: HQ.cardSoft,
        border: `1px solid ${HQ.borderSoft}`,
        borderRadius: 10,
        padding: "10px 14px",
        minWidth: 110,
      }}
    >
      <div style={{ fontSize: 11, color: HQ.inkMuted, letterSpacing: 0.3 }}>{label}</div>
      <div
        style={{
          fontFamily: FD,
          fontSize: 22,
          fontWeight: 600,
          color: tone ?? HQ.ink,
          marginTop: 2,
        }}
      >
        {value}
      </div>
    </div>
  );
}

export { CopyableId } from "./copyable-id";
