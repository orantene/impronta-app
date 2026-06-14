"use client";

import { Fragment, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import type {
  EmailLogRow,
  EmailMetrics,
  SuppressionRow,
  EmailDomainStatus,
} from "./email-data";
import {
  retryEmailRow,
  addSuppression,
  removeSuppression,
  sendTestEmail,
} from "./actions";

// ─── HQ design tokens (match the platform admin dark theme) ──────────────────
const HQ = {
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
const FONT_BODY = '"Inter", system-ui, sans-serif';
const FONT_DISPLAY = 'var(--font-geist-sans), "Inter", -apple-system, system-ui, sans-serif';
const MONO = '"SF Mono", Monaco, monospace';

function relTime(iso: string): string {
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

const STATUS_COLOR: Record<string, string> = {
  sent: HQ.green,
  failed: HQ.red,
  suppressed: HQ.amber,
  queued: HQ.inkMuted,
  skipped: HQ.inkDim,
};

const label = {
  display: "block",
  fontSize: 11,
  fontWeight: 600,
  color: HQ.inkMuted,
  marginBottom: 6,
  textTransform: "uppercase",
  letterSpacing: 0.5,
} as const;
const input = {
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
const btn = (bg: string, fg: string) => ({
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

type DateKey = "all" | "24h" | "7d" | "30d";

export function EmailConsoleClient(props: {
  sendLog: EmailLogRow[];
  metrics: EmailMetrics;
  suppressions: SuppressionRow[];
  domain: EmailDomainStatus;
  adminEmail: string;
  /** Request time (ms), computed server-side — keeps the client render pure. */
  nowMs: number;
}) {
  const { sendLog, metrics, suppressions, domain, adminEmail, nowMs } = props;
  const router = useRouter();
  const [, startTransition] = useTransition();

  return (
    <div style={{ fontFamily: FONT_BODY, color: HQ.ink, paddingBottom: 60 }}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontFamily: FONT_DISPLAY, fontSize: 28, fontWeight: 600, letterSpacing: -0.5, margin: "0 0 6px" }}>
          Email
        </h1>
        <p style={{ color: HQ.inkMuted, margin: 0, fontSize: 14 }}>
          Deliverability, send log, suppressions, and diagnostics for the platform email pipeline.
        </p>
      </div>

      <HealthBanner domain={domain} metrics={metrics} />
      <MetricsStrip metrics={metrics} />
      <TestSend adminEmail={adminEmail} onDone={() => startTransition(() => router.refresh())} />
      <SendLogTable rows={sendLog} nowMs={nowMs} onChanged={() => startTransition(() => router.refresh())} />
      <SuppressionPanel rows={suppressions} onChanged={() => startTransition(() => router.refresh())} />
    </div>
  );
}

// ─── Health banner ───────────────────────────────────────────────────────────
function HealthBanner({ domain, metrics }: { domain: EmailDomainStatus; metrics: EmailMetrics }) {
  const ok = domain.status === "configured";
  const trackingDark = metrics.funnel.opened === 0 && metrics.funnel.clicked === 0 && metrics.funnel.sent > 0;
  return (
    <div style={{ display: "grid", gap: 12, marginBottom: 20 }}>
      <div
        style={{
          background: HQ.card,
          border: `1px solid ${ok ? "rgba(93,211,160,0.4)" : "rgba(227,179,65,0.4)"}`,
          borderRadius: 10,
          padding: "16px 18px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 16,
        }}
      >
        <div>
          <div style={{ fontSize: 12, color: HQ.inkMuted, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4 }}>
            Platform sender
          </div>
          <div style={{ fontSize: 16, fontWeight: 600, fontFamily: MONO }}>{domain.effectiveFrom}</div>
        </div>
        <span
          style={{
            padding: "5px 12px",
            borderRadius: 999,
            fontSize: 12,
            fontWeight: 700,
            background: ok ? "rgba(93,211,160,0.15)" : "rgba(227,179,65,0.15)",
            color: ok ? HQ.green : HQ.amber,
          }}
        >
          {ok ? "Configured ✓" : domain.status === "env_fallback" ? "Env fallback" : "Unset — using code default"}
        </span>
      </div>
      {trackingDark && (
        <div style={{ background: "rgba(227,179,65,0.08)", border: `1px solid rgba(227,179,65,0.3)`, borderRadius: 10, padding: "12px 16px", fontSize: 13, color: HQ.amber }}>
          ⚠ Open/click tracking shows zero across all sends. Enable Open + Click tracking for the sending domain in the Resend dashboard, and confirm the webhook subscribes to email.delivered / opened / clicked.
        </div>
      )}
    </div>
  );
}

// ─── Metrics strip ───────────────────────────────────────────────────────────
function MetricCard({ label: l, value, color }: { label: string; value: number | string; color?: string }) {
  return (
    <div style={{ background: HQ.card, border: `1px solid ${HQ.borderSoft}`, borderRadius: 10, padding: "14px 16px" }}>
      <div style={{ fontSize: 11, color: HQ.inkMuted, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6 }}>{l}</div>
      <div style={{ fontSize: 24, fontWeight: 700, color: color ?? HQ.ink }}>{value}</div>
    </div>
  );
}

function MetricsStrip({ metrics }: { metrics: EmailMetrics }) {
  const f = metrics.funnel;
  return (
    <div style={{ marginBottom: 24 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(120px,1fr))", gap: 12, marginBottom: 12 }}>
        <MetricCard label="Sent" value={metrics.byStatus.sent} color={HQ.green} />
        <MetricCard label="Failed" value={metrics.byStatus.failed} color={metrics.byStatus.failed ? HQ.red : HQ.ink} />
        <MetricCard label="Suppressed" value={metrics.byStatus.suppressed} color={HQ.amber} />
        <MetricCard label="Queued" value={metrics.byStatus.queued} color={metrics.byStatus.queued ? HQ.amber : HQ.ink} />
        <MetricCard label="Sent · 30d" value={metrics.last30d.sent} />
        <MetricCard label="Failed · 30d" value={metrics.last30d.failed} color={metrics.last30d.failed ? HQ.red : HQ.ink} />
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(120px,1fr))", gap: 12 }}>
        <MetricCard label="Delivered" value={f.delivered} color={HQ.blue} />
        <MetricCard label="Opened" value={f.opened} color={f.opened ? HQ.blue : HQ.inkDim} />
        <MetricCard label="Clicked" value={f.clicked} color={f.clicked ? HQ.blue : HQ.inkDim} />
        <MetricCard label="Bounced" value={f.bounced} color={f.bounced ? HQ.red : HQ.ink} />
      </div>
      {metrics.topFailingEvents.length > 0 && (
        <div style={{ marginTop: 14, background: HQ.card, border: `1px solid ${HQ.borderSoft}`, borderRadius: 10, padding: "12px 16px" }}>
          <div style={{ fontSize: 11, color: HQ.inkMuted, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8 }}>Top failing events</div>
          {metrics.topFailingEvents.map((e) => (
            <div key={e.eventKind} style={{ display: "flex", justifyContent: "space-between", gap: 12, padding: "4px 0", fontSize: 13, borderBottom: `1px solid ${HQ.borderSoft}` }}>
              <span style={{ fontFamily: MONO }}>{e.eventKind}</span>
              <span style={{ color: HQ.red, flexShrink: 0 }}>{e.failed}× <span style={{ color: HQ.inkDim }}>{e.lastError?.slice(0, 60)}</span></span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Test send ───────────────────────────────────────────────────────────────
function TestSend({ adminEmail, onDone }: { adminEmail: string; onDone: () => void }) {
  const [to, setTo] = useState(adminEmail);
  const [tenantId, setTenantId] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [ok, setOk] = useState(true);

  async function fire() {
    setBusy(true);
    setResult(null);
    const r = await sendTestEmail({ to, tenantId: tenantId || null });
    setOk(r.ok);
    if (r.ok) {
      setResult(`Sent (${r.status}) from ${r.from}${r.id ? ` · id ${r.id}` : " · no Resend id (no API key in this runtime)"}`);
      onDone();
    } else {
      setResult(`Failed: ${r.error}${r.from ? ` (resolved from ${r.from})` : ""}`);
    }
    setBusy(false);
  }

  return (
    <div style={{ background: HQ.card, border: `1px solid ${HQ.borderSoft}`, borderRadius: 10, padding: 16, marginBottom: 24 }}>
      <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 12 }}>Send a test email</div>
      <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr auto", gap: 12, alignItems: "end" }}>
        <div>
          <label style={label}>Recipient</label>
          <input style={input} value={to} onChange={(e) => setTo(e.target.value)} placeholder="you@example.com" />
        </div>
        <div>
          <label style={label}>Tenant id (optional)</label>
          <input style={input} value={tenantId} onChange={(e) => setTenantId(e.target.value)} placeholder="platform default" />
        </div>
        <button style={{ ...btn(HQ.green, "#06281C"), opacity: busy ? 0.6 : 1 }} disabled={busy} onClick={fire}>
          {busy ? "Sending…" : "Send test"}
        </button>
      </div>
      {result && (
        <div style={{ marginTop: 10, fontSize: 12, fontFamily: MONO, color: ok ? HQ.green : HQ.red }}>{result}</div>
      )}
    </div>
  );
}

// ─── Send-log table ──────────────────────────────────────────────────────────
function SendLogTable({ rows, nowMs, onChanged }: { rows: EmailLogRow[]; nowMs: number; onChanged: () => void }) {
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("all");
  const [eventKind, setEventKind] = useState("all");
  const [dateKey, setDateKey] = useState<DateKey>("all");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const eventKinds = useMemo(
    () => Array.from(new Set(rows.map((r) => r.eventKind))).sort(),
    [rows],
  );

  const filtered = useMemo(() => {
    const dayLimit = dateKey === "24h" ? 1 : dateKey === "7d" ? 7 : dateKey === "30d" ? 30 : null;
    return rows.filter((r) => {
      if (dayLimit && nowMs - new Date(r.createdAtIso).getTime() > dayLimit * 86400000) return false;
      if (status !== "all" && r.status !== status) return false;
      if (eventKind !== "all" && r.eventKind !== eventKind) return false;
      if (q) {
        const s = `${r.recipientEmail ?? ""} ${r.eventKind} ${r.catalogEntryId ?? ""} ${r.errorMessage ?? ""}`.toLowerCase();
        if (!s.includes(q.toLowerCase())) return false;
      }
      return true;
    });
  }, [rows, q, status, eventKind, dateKey, nowMs]);

  async function doRetry(id: string) {
    setBusyId(id);
    await retryEmailRow(id);
    setBusyId(null);
    onChanged();
  }

  const th = { padding: "10px 12px", textAlign: "left" as const, fontWeight: 600, color: HQ.inkMuted, textTransform: "uppercase" as const, fontSize: 11, letterSpacing: 0.5 };
  const td = { padding: "10px 12px", verticalAlign: "top" as const };

  return (
    <div style={{ marginBottom: 24 }}>
      <div style={{ fontSize: 16, fontWeight: 600, fontFamily: FONT_DISPLAY, marginBottom: 12 }}>Send log</div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))", gap: 12, marginBottom: 14 }}>
        <div><label style={label}>Search</label><input style={input} value={q} onChange={(e) => setQ(e.target.value)} placeholder="recipient, event, error…" /></div>
        <div>
          <label style={label}>Status</label>
          <select style={input} value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="all">All</option>
            <option value="sent">sent</option>
            <option value="failed">failed</option>
            <option value="suppressed">suppressed</option>
            <option value="queued">queued</option>
            <option value="skipped">skipped</option>
          </select>
        </div>
        <div>
          <label style={label}>Event</label>
          <select style={input} value={eventKind} onChange={(e) => setEventKind(e.target.value)}>
            <option value="all">All</option>
            {eventKinds.map((k) => <option key={k} value={k}>{k}</option>)}
          </select>
        </div>
        <div>
          <label style={label}>Date</label>
          <select style={input} value={dateKey} onChange={(e) => setDateKey(e.target.value as DateKey)}>
            <option value="all">All time</option>
            <option value="24h">Last 24h</option>
            <option value="7d">Last 7d</option>
            <option value="30d">Last 30d</option>
          </select>
        </div>
      </div>

      <div style={{ border: `1px solid ${HQ.borderSoft}`, borderRadius: 8, overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr style={{ background: HQ.card, borderBottom: `1px solid ${HQ.borderSoft}` }}>
              <th style={th}>When</th>
              <th style={th}>Event</th>
              <th style={th}>Recipient</th>
              <th style={th}>Status</th>
              <th style={th}>Delivery</th>
              <th style={th}></th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr><td colSpan={6} style={{ ...td, textAlign: "center", color: HQ.inkMuted, padding: 32 }}>No rows.</td></tr>
            )}
            {filtered.map((r) => {
              const isOpen = expanded === r.id;
              const canRetry = r.status === "failed" || r.status === "suppressed";
              const deliv = [
                r.deliveredAtIso ? "D" : null,
                r.openedAtIso ? "O" : null,
                r.clickedAtIso ? "C" : null,
                r.bouncedAtIso ? "B" : null,
                r.complaintAtIso ? "✗" : null,
              ].filter(Boolean).join(" ");
              return (
                <Fragment key={r.id}>
                  <tr style={{ borderBottom: `1px solid ${HQ.borderSoft}`, background: isOpen ? "rgba(93,211,160,0.04)" : "transparent" }}>
                    <td style={{ ...td, color: HQ.inkMuted, whiteSpace: "nowrap" }}>{relTime(r.createdAtIso)}</td>
                    <td style={{ ...td, fontFamily: MONO, fontSize: 12 }}>{r.catalogEntryId ?? r.eventKind}</td>
                    <td style={{ ...td, color: HQ.inkMuted, fontFamily: MONO, fontSize: 12 }}>{r.recipientEmail ?? "—"}</td>
                    <td style={td}>
                      <span style={{ padding: "3px 8px", borderRadius: 4, fontSize: 11, fontWeight: 600, background: "rgba(255,255,255,0.06)", color: STATUS_COLOR[r.status] ?? HQ.ink }}>{r.status}</span>
                    </td>
                    <td style={{ ...td, fontFamily: MONO, fontSize: 12, color: r.bouncedAtIso ? HQ.red : HQ.inkMuted }}>{deliv || "—"}</td>
                    <td style={{ ...td, textAlign: "right", whiteSpace: "nowrap" }}>
                      {canRetry && (
                        <button style={{ ...btn("rgba(106,166,243,0.15)", HQ.blue), padding: "4px 10px", fontSize: 12, opacity: busyId === r.id ? 0.5 : 1 }} disabled={busyId === r.id} onClick={() => doRetry(r.id)}>
                          {busyId === r.id ? "…" : "Retry"}
                        </button>
                      )}
                      <button onClick={() => setExpanded(isOpen ? null : r.id)} style={{ ...btn("transparent", HQ.green), padding: "4px 8px" }}>{isOpen ? "−" : "+"}</button>
                    </td>
                  </tr>
                  {isOpen && (
                    <tr>
                      <td colSpan={6} style={{ padding: 16, background: HQ.card, borderBottom: `1px solid ${HQ.borderSoft}` }}>
                        <Detail k="error" v={r.errorMessage} red />
                        <Detail k="provider_reference" v={r.providerReference} />
                        <Detail k="template_id" v={r.templateId} />
                        <Detail k="tenant_id" v={r.tenantId} />
                        <Detail k="sent_at" v={r.sentAtIso} />
                        <Detail k="delivered_at" v={r.deliveredAtIso} />
                        <Detail k="opened_at" v={r.openedAtIso} />
                        <Detail k="bounced_at" v={r.bouncedAtIso} />
                        {r.payload && (
                          <pre style={{ marginTop: 8, padding: 8, background: "rgba(0,0,0,0.25)", border: `1px solid ${HQ.borderSoft}`, borderRadius: 4, fontSize: 11, color: HQ.inkMuted, fontFamily: MONO, overflowX: "auto", maxHeight: 180 }}>{JSON.stringify(r.payload, null, 2)}</pre>
                        )}
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
      <div style={{ marginTop: 10, color: HQ.inkMuted, fontSize: 12 }}>Showing {filtered.length} of {rows.length} logged sends.</div>
    </div>
  );
}

function Detail({ k, v, red }: { k: string; v: string | null; red?: boolean }) {
  if (!v) return null;
  return (
    <div style={{ display: "flex", gap: 12, padding: "2px 0", fontSize: 12 }}>
      <span style={{ color: HQ.inkDim, minWidth: 130, fontFamily: MONO }}>{k}</span>
      <span style={{ color: red ? HQ.red : HQ.inkMuted, fontFamily: MONO, wordBreak: "break-all" }}>{v}</span>
    </div>
  );
}

// ─── Suppression panel ───────────────────────────────────────────────────────
function SuppressionPanel({ rows, onChanged }: { rows: SuppressionRow[]; onChanged: () => void }) {
  const [email, setEmail] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function add() {
    setBusy(true);
    setErr(null);
    const r = await addSuppression({ email, notes });
    if (r.ok) { setEmail(""); setNotes(""); onChanged(); } else setErr(r.error);
    setBusy(false);
  }
  async function remove(addr: string) {
    setBusy(true);
    await removeSuppression(addr);
    onChanged();
    setBusy(false);
  }

  return (
    <div style={{ background: HQ.card, border: `1px solid ${HQ.borderSoft}`, borderRadius: 10, padding: 16 }}>
      <div style={{ fontSize: 16, fontWeight: 600, fontFamily: FONT_DISPLAY, marginBottom: 12 }}>Suppressions ({rows.length})</div>
      <div style={{ display: "grid", gridTemplateColumns: "2fr 2fr auto", gap: 12, alignItems: "end", marginBottom: 14 }}>
        <div><label style={label}>Email to suppress</label><input style={input} value={email} onChange={(e) => setEmail(e.target.value)} placeholder="bounced@example.com" /></div>
        <div><label style={label}>Notes</label><input style={input} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="reason (optional)" /></div>
        <button style={{ ...btn(HQ.amber, "#2A2206"), opacity: busy ? 0.6 : 1 }} disabled={busy} onClick={add}>Suppress</button>
      </div>
      {err && <div style={{ color: HQ.red, fontSize: 12, marginBottom: 10 }}>{err}</div>}
      {rows.length === 0 ? (
        <div style={{ color: HQ.inkMuted, fontSize: 13 }}>No suppressed addresses.</div>
      ) : (
        <div style={{ display: "grid", gap: 6 }}>
          {rows.map((s) => (
            <div key={s.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, padding: "8px 10px", border: `1px solid ${HQ.borderSoft}`, borderRadius: 6, fontSize: 13 }}>
              <span style={{ fontFamily: MONO }}>{s.email}</span>
              <span style={{ color: HQ.inkDim, fontSize: 12, flex: 1 }}>{s.reason}{s.source ? ` · ${s.source}` : ""}{s.notes ? ` · ${s.notes}` : ""} · {relTime(s.createdAtIso)}</span>
              <button style={{ ...btn("transparent", HQ.red), padding: "4px 10px", fontSize: 12, border: `1px solid rgba(243,103,114,0.3)` }} onClick={() => s.email && remove(s.email)}>Remove</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
