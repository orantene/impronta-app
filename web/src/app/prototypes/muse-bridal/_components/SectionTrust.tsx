import { Reveal } from "./Reveal";

/**
 * Positioning strip — small value props across a thin band.
 *
 * CMS → Trust Strip Section:
 *   - variant: `icon-row` (this one) | `metrics-row` | `logo-row`
 *   - items[]: { label, detail?, icon_key? }
 *   - divider_style: `vertical-lines` | `dots` | `none`
 */

export type TrustItem = { label: string; detail: string };

export function SectionTrust({ items }: { items: TrustItem[] }) {
  return (
    <section className="muse-section--compact" style={{ padding: "56px 0", borderBottom: "1px solid var(--muse-line-soft)", borderTop: "1px solid var(--muse-line-soft)" }}>
      <div className="muse-shell">
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
            gap: 28,
            alignItems: "flex-start",
          }}
        >
          {items.map((item, i) => (
            <Reveal
              key={item.label}
              delay={(i % 4) as 0 | 1 | 2 | 3}
              style={{ display: "flex", flexDirection: "column", gap: 10 }}
            >
              <span
                style={{
                  fontFamily: "var(--muse-font-display)",
                  fontStyle: "italic",
                  fontWeight: 300,
                  fontSize: 28,
                  lineHeight: 1,
                  color: "var(--muse-blush)",
                }}
              >
                {String(i + 1).padStart(2, "0")}
              </span>
              <h4
                style={{
                  fontSize: 19,
                  letterSpacing: "-0.005em",
                  fontWeight: 500,
                  color: "var(--muse-espresso-deep)",
                  fontFamily: "var(--muse-font-body)",
                }}
              >
                {item.label}
              </h4>
              <p style={{ fontSize: 14, color: "var(--muse-muted)", maxWidth: 260 }}>
                {item.detail}
              </p>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
