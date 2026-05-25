import type { FieldDetailAuditEntry } from "../../../catalog-field-detail-data";

const HQ = {
  card: "#16161A",
  cardSoft: "rgba(255,255,255,0.04)",
  borderSoft: "rgba(255,255,255,0.06)",
  ink: "#F5F2EB",
  inkMuted: "rgba(245,242,235,0.62)",
  inkDim: "rgba(245,242,235,0.38)",
  green: "#5DD3A0",
  amber: "#9BA8B7",
  red: "#F36772",
} as const;

const F = '"Inter", system-ui, sans-serif';
const FD = 'var(--font-geist-sans), "Inter", -apple-system, system-ui, sans-serif';

function formatAuditTime(value: string): string {
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

export function AuditHistory({ audit }: { audit: FieldDetailAuditEntry[] }) {
  return (
    <section style={{ background: HQ.card, border: `1px solid ${HQ.borderSoft}`, borderRadius: 12, padding: 16, fontFamily: F, marginBottom: 16 }}>
      <div style={{ marginBottom: 12 }}>
        <div style={{ fontFamily: FD, fontSize: 15, fontWeight: 600, color: HQ.ink }}>Audit history</div>
        <div style={{ fontSize: 12, color: HQ.inkMuted, marginTop: 2 }}>
          Recent platform-level changes for this field and its current taxonomy mappings.
        </div>
      </div>
      {audit.length === 0 ? (
        <div style={{ fontSize: 12, color: HQ.inkDim }}>
          No platform audit rows found yet. New saves from this studio will appear here.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {audit.map((entry) => (
            <div
              key={entry.id}
              style={{
                display: "grid",
                gridTemplateColumns: "108px minmax(0, 1fr) 88px",
                gap: 10,
                alignItems: "start",
                padding: "8px 10px",
                borderRadius: 9,
                background: HQ.cardSoft,
                border: `1px solid ${HQ.borderSoft}`,
              }}
            >
              <div style={{ fontSize: 11, color: HQ.inkMuted }}>
                {formatAuditTime(entry.created_at)}
              </div>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: HQ.ink }}>
                  {entry.action}
                </div>
                <div style={{ fontSize: 10.5, color: HQ.inkDim, marginTop: 2 }}>
                  {entry.target_type ?? "engine row"}
                  {entry.actor_role ? ` · ${entry.actor_role}` : ""}
                  {entry.changed_keys.length > 0
                    ? ` · changed ${entry.changed_keys.join(", ")}`
                    : " · before/after snapshot recorded"}
                </div>
                {entry.changes.length > 0 && (
                  <details style={{ marginTop: 6 }}>
                    <summary style={{ cursor: "pointer", fontSize: 10.5, color: HQ.green }}>
                      View before/after
                    </summary>
                    <div style={{ display: "grid", gap: 4, marginTop: 6 }}>
                      {entry.changes.map((change) => (
                        <div
                          key={change.key}
                          style={{
                            display: "grid",
                            gridTemplateColumns: "128px minmax(0, 1fr)",
                            gap: 8,
                            fontSize: 10.5,
                            color: HQ.inkMuted,
                            padding: "4px 0",
                            borderTop: `1px solid ${HQ.borderSoft}`,
                          }}
                        >
                          <span style={{ color: HQ.ink, fontFamily: "ui-monospace, monospace" }}>
                            {change.key}
                          </span>
                          <span>
                            <span style={{ color: HQ.inkDim }}>{change.before}</span>
                            <span style={{ color: HQ.green }}> → </span>
                            <span>{change.after}</span>
                          </span>
                        </div>
                      ))}
                    </div>
                  </details>
                )}
              </div>
              <div style={{ textAlign: "right" }}>
                <span
                  style={{
                    fontSize: 9.5,
                    fontWeight: 700,
                    letterSpacing: 0.4,
                    textTransform: "uppercase",
                    color:
                      entry.severity === "warn"
                        ? HQ.amber
                        : entry.severity === "emergency"
                          ? HQ.red
                          : HQ.inkMuted,
                  }}
                >
                  {entry.severity}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
