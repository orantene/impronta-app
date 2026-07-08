import type { FieldDetailAuditEntry } from "../../../catalog-field-detail-data";
import { interpolate } from "@/i18n/interpolate";

type Translate = (key: string) => string;
const K = "dashboard.platform.catalog";

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
  const d = new Date(value);
  const sameYear = d.getFullYear() === new Date().getFullYear();
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    ...(sameYear ? {} : { year: "numeric" }),
    hour: "2-digit",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(d);
}

// enum → catalog key; render label via t(), switch on the raw severity string.
// Unknown severities fall back to the raw persisted value (flagged).
const SEVERITY_LABEL_KEYS: Record<string, string> = {
  info: "auditSeverityInfo",
  warn: "auditSeverityWarn",
  emergency: "auditSeverityEmergency",
};

export function AuditHistory({ audit, t }: { audit: FieldDetailAuditEntry[]; t: Translate }) {
  return (
    <section style={{ background: HQ.card, border: `1px solid ${HQ.borderSoft}`, borderRadius: 12, padding: 16, fontFamily: F, marginBottom: 16 }}>
      <div style={{ marginBottom: 12 }}>
        <div style={{ fontFamily: FD, fontSize: 15, fontWeight: 600, color: HQ.ink }}>{t(`${K}.auditTitle`)}</div>
        <div style={{ fontSize: 12, color: HQ.inkMuted, marginTop: 2 }}>
          {t(`${K}.auditSubtitle`)}
        </div>
      </div>
      {audit.length === 0 ? (
        <div style={{ fontSize: 12, color: HQ.inkDim }}>
          {t(`${K}.auditEmpty`)}
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {audit.map((entry) => (
            <div
              key={entry.id}
              style={{
                display: "grid",
                gridTemplateColumns: "136px minmax(0, 1fr) 88px",
                gap: 10,
                alignItems: "start",
                padding: "8px 10px",
                borderRadius: 9,
                background: HQ.cardSoft,
                border: `1px solid ${HQ.borderSoft}`,
              }}
            >
              <time
                dateTime={entry.created_at}
                title={entry.created_at}
                style={{ fontSize: 11, color: HQ.inkMuted }}
              >
                {formatAuditTime(entry.created_at)}
              </time>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: HQ.ink }}>
                  {entry.action}
                </div>
                <div style={{ fontSize: 10.5, color: HQ.inkDim, marginTop: 2 }}>
                  {entry.target_type ?? t(`${K}.auditEngineRow`)}
                  {entry.actor_role ? ` · ${interpolate(t(`${K}.auditByActor`), { role: entry.actor_role })}` : ""}
                  {entry.changed_keys.length > 0
                    ? ` · ${interpolate(t(`${K}.auditFieldsList`), { keys: entry.changed_keys.join(", ") })}`
                    : ""}
                </div>
                {entry.changes.length > 0 && (
                  <details style={{ marginTop: 6 }}>
                    <summary style={{ cursor: "pointer", fontSize: 10.5, color: HQ.green }}>
                      {interpolate(t(`${K}.${entry.changes.length === 1 ? "auditChangedOne" : "auditChangedMany"}`), { count: entry.changes.length })}
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
                  title={entry.severity}
                >
                  {SEVERITY_LABEL_KEYS[entry.severity]
                    ? t(`${K}.${SEVERITY_LABEL_KEYS[entry.severity]}`)
                    : entry.severity}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
