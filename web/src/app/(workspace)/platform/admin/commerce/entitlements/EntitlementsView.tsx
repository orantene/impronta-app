import type { EntitlementMatrix } from "@/lib/access/entitlement-matrix";
import { HQ, F, FD } from "../_tokens";

/**
 * EntitlementsView — the packaging decisions, read from `plan_capabilities`.
 *
 * This is deliberately NOT titled "what each plan includes". The table records
 * decisions, and a missing row means GRANTED, so it can never enumerate a
 * plan's contents — only what somebody chose. Six rows exist across three
 * capabilities; the other 98 registry keys are granted everywhere by default
 * and appear nowhere, which is the honest picture rather than a flattering one.
 *
 * Read-only for now. Editing is the next slice and belongs behind an audited
 * write path, since every cell here changes what a customer can do.
 */

const STATE_STYLE: Record<string, { label: string; color: string; bg: string }> = {
  withheld: { label: "withheld", color: "#F85149", bg: "rgba(248,81,73,0.10)" },
  granted: { label: "granted", color: "#3FB950", bg: "rgba(63,185,80,0.10)" },
  default: { label: "default", color: "rgba(245,242,235,0.45)", bg: "transparent" },
};

export function EntitlementsView({ matrix }: { matrix: EntitlementMatrix | null }) {
  if (!matrix) {
    return (
      <div style={{ fontFamily: F, color: HQ.ink, maxWidth: 900 }}>
        <p style={{ color: "#F85149", fontSize: 13 }}>
          The entitlement table could not be read. This is not the same as
          &ldquo;nothing is packaged&rdquo; &mdash; the decisions may exist and
          be unreadable, so nothing is shown rather than an empty grid that
          would imply an answer.
        </p>
      </div>
    );
  }

  return (
    <div style={{ fontFamily: F, color: HQ.ink, maxWidth: 1000 }}>
      <h2 style={{ fontFamily: FD, fontSize: 18, fontWeight: 600, margin: 0 }}>
        Packaging decisions
      </h2>
      <p style={{ color: HQ.inkDim, fontSize: 13, lineHeight: 1.6, margin: "8px 0 20px", maxWidth: "68ch" }}>
        Every row stored in <code>plan_capabilities</code>, and nothing else.{" "}
        <strong>A capability with no row is granted to every plan</strong>, so
        this lists what has been decided, not what a plan contains. {matrix.rowCount}{" "}
        row{matrix.rowCount === 1 ? "" : "s"} across {matrix.groups.length}{" "}
        capabilit{matrix.groups.length === 1 ? "y" : "ies"}.
      </p>

      {matrix.groups.length === 0 ? (
        <p style={{ color: HQ.inkDim, fontSize: 13 }}>
          Nothing has been packaged yet. Every capability is granted to every
          plan by default, which is the state this table shipped in.
        </p>
      ) : (
        <div style={{ overflowX: "auto", border: `1px solid ${HQ.border}`, borderRadius: 10 }}>
          <table style={{ borderCollapse: "collapse", width: "100%", fontSize: 13, minWidth: 640 }}>
            <thead>
              <tr>
                <th style={th}>Capability</th>
                {matrix.plans.map((p) => (
                  <th key={p.planKey} style={{ ...th, textAlign: "center" }}>
                    {p.planName}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {matrix.groups.map((g) => (
                <tr key={g.capabilityKey}>
                  <td style={{ ...td, fontFamily: "ui-monospace, monospace", fontSize: 12 }}>
                    {g.capabilityKey}
                  </td>
                  {g.cells.map((c) => {
                    const s = STATE_STYLE[c.state];
                    return (
                      <td key={c.planKey} style={{ ...td, textAlign: "center" }}>
                        <span
                          title={c.note ?? undefined}
                          style={{
                            fontFamily: "ui-monospace, monospace",
                            fontSize: 10.5,
                            letterSpacing: ".06em",
                            textTransform: "uppercase",
                            color: s.color,
                            background: s.bg,
                            padding: "2px 7px",
                            borderRadius: 3,
                          }}
                        >
                          {s.label}
                        </span>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p style={{ color: HQ.inkDim, fontSize: 12, lineHeight: 1.6, marginTop: 16, maxWidth: "68ch" }}>
        <strong>default</strong> means no row exists and the capability is
        granted by fail-open. It is not the same as <strong>granted</strong>,
        which is a decision somebody recorded. Read-only: editing a cell changes
        what a customer can do, so it belongs behind an audited write path.
      </p>
    </div>
  );
}

const th: React.CSSProperties = {
  textAlign: "left",
  fontFamily: "ui-monospace, monospace",
  fontWeight: 500,
  fontSize: 10.5,
  letterSpacing: ".1em",
  textTransform: "uppercase",
  color: HQ.inkDim,
  padding: "10px 14px",
  borderBottom: `1px solid ${HQ.border}`,
  whiteSpace: "nowrap",
};

const td: React.CSSProperties = {
  padding: "9px 14px",
  borderBottom: `1px solid ${HQ.border}`,
  verticalAlign: "middle",
};
