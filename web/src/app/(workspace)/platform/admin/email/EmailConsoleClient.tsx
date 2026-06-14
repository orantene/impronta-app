"use client";

import { Fragment, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import type {
  EmailLogRow,
  EmailMetrics,
  SuppressionRow,
  EmailDomainStatus,
  CatalogEntryState,
  TemplateOverrideState,
  SendingDomainState,
} from "./email-data";
import {
  retryEmailRow,
  addSuppression,
  removeSuppression,
  sendTestEmail,
  setEventOverlay,
  setTemplateOverride,
  clearTemplateOverride,
  addSendingDomain,
  verifySendingDomain,
  removeSendingDomain,
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
  catalog: CatalogEntryState[];
  templates: TemplateOverrideState[];
  sendingDomains: SendingDomainState[];
  adminEmail: string;
  /** Request time (ms), computed server-side — keeps the client render pure. */
  nowMs: number;
}) {
  const { sendLog, metrics, suppressions, domain, catalog, templates, sendingDomains, adminEmail, nowMs } = props;
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
      <EventToggles entries={catalog} onChanged={() => startTransition(() => router.refresh())} />
      <TemplateEditor entries={templates} onChanged={() => startTransition(() => router.refresh())} />
      <SendingDomains entries={sendingDomains} onChanged={() => startTransition(() => router.refresh())} />
      <SuppressionPanel rows={suppressions} onChanged={() => startTransition(() => router.refresh())} />
    </div>
  );
}

// ─── Event toggles (P3b) ─────────────────────────────────────────────────────
function EventToggles({ entries, onChanged }: { entries: CatalogEntryState[]; onChanged: () => void }) {
  const [busy, setBusy] = useState<string | null>(null);
  const byCategory = useMemo(() => {
    const m = new Map<string, CatalogEntryState[]>();
    for (const e of entries) {
      const arr = m.get(e.category) ?? [];
      arr.push(e);
      m.set(e.category, arr);
    }
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [entries]);

  async function toggle(e: CatalogEntryState, channel: "email" | "in_app", next: boolean) {
    const k = `${e.id}:${channel}`;
    setBusy(k);
    await setEventOverlay({ catalogEntryId: e.id, channel, enabled: next });
    setBusy(null);
    onChanged();
  }

  function Switch({ e, channel, on, has }: { e: CatalogEntryState; channel: "email" | "in_app"; on: boolean; has: boolean }) {
    if (!has) return <span style={{ color: HQ.inkDim, fontSize: 12 }}>—</span>;
    const locked = e.required;
    const k = `${e.id}:${channel}`;
    return (
      <button
        disabled={locked || busy === k}
        onClick={() => toggle(e, channel, !on)}
        title={locked ? "Required — can't be disabled" : on ? "Click to disable" : "Click to enable"}
        style={{
          cursor: locked ? "not-allowed" : "pointer",
          padding: "3px 9px",
          borderRadius: 999,
          fontSize: 11,
          fontWeight: 700,
          border: "none",
          opacity: busy === k ? 0.5 : 1,
          background: on ? "rgba(93,211,160,0.15)" : "rgba(255,255,255,0.06)",
          color: on ? HQ.green : HQ.inkDim,
        }}
      >
        {on ? "ON" : "OFF"}{locked ? " ·req" : ""}
      </button>
    );
  }

  return (
    <div style={{ marginTop: 24, marginBottom: 24 }}>
      <div style={{ fontSize: 16, fontWeight: 600, fontFamily: FONT_DISPLAY, marginBottom: 6 }}>Events</div>
      <p style={{ color: HQ.inkMuted, fontSize: 13, margin: "0 0 14px" }}>
        Enable/disable each notification per channel. Required (transactional) events can&apos;t be turned off.
      </p>
      <div style={{ border: `1px solid ${HQ.borderSoft}`, borderRadius: 8, overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr style={{ background: HQ.card, borderBottom: `1px solid ${HQ.borderSoft}` }}>
              <th style={{ padding: "10px 12px", textAlign: "left", fontSize: 11, color: HQ.inkMuted, textTransform: "uppercase", letterSpacing: 0.5 }}>Event</th>
              <th style={{ padding: "10px 12px", textAlign: "center", fontSize: 11, color: HQ.inkMuted, textTransform: "uppercase", letterSpacing: 0.5, width: 90 }}>Email</th>
              <th style={{ padding: "10px 12px", textAlign: "center", fontSize: 11, color: HQ.inkMuted, textTransform: "uppercase", letterSpacing: 0.5, width: 90 }}>In-app</th>
            </tr>
          </thead>
          <tbody>
            {byCategory.map(([cat, list]) => (
              <Fragment key={cat}>
                <tr style={{ background: "rgba(255,255,255,0.02)" }}>
                  <td colSpan={3} style={{ padding: "6px 12px", fontSize: 11, color: HQ.inkMuted, textTransform: "uppercase", letterSpacing: 0.5, fontWeight: 600 }}>{cat}</td>
                </tr>
                {list.map((e) => (
                  <tr key={e.id} style={{ borderBottom: `1px solid ${HQ.borderSoft}` }}>
                    <td style={{ padding: "8px 12px", fontFamily: MONO, fontSize: 12 }}>{e.id}</td>
                    <td style={{ padding: "8px 12px", textAlign: "center" }}><Switch e={e} channel="email" on={e.emailEnabled} has={e.hasEmail} /></td>
                    <td style={{ padding: "8px 12px", textAlign: "center" }}><Switch e={e} channel="in_app" on={e.inAppEnabled} has={e.hasInApp} /></td>
                  </tr>
                ))}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
      <div style={{ marginTop: 10, color: HQ.inkMuted, fontSize: 12 }}>{entries.length} catalog events.</div>
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
                      {r.attempts > 1 && (
                        <span title={`${r.attempts} send attempts`} style={{ marginLeft: 6, fontSize: 11, color: HQ.amber }}>×{r.attempts}</span>
                      )}
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
                        <Detail k="attempts" v={String(r.attempts)} />
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

// ─── Template editor (P3b) ───────────────────────────────────────────────────
const TEMPLATE_LOCALES = ["en", "es"] as const;

function TemplateEditor({ entries, onChanged }: { entries: TemplateOverrideState[]; onChanged: () => void }) {
  const [openId, setOpenId] = useState<string | null>(null);
  const [locale, setLocale] = useState<string>("en");
  const [draft, setDraft] = useState<{ subject: string; body: string; enabled: boolean }>({
    subject: "",
    body: "",
    enabled: true,
  });
  const [busy, setBusy] = useState(false);

  function loadDraft(e: TemplateOverrideState, loc: string) {
    const o = e.byLocale[loc];
    setDraft({ subject: o?.subject ?? "", body: o?.body ?? "", enabled: o?.hasOverride ? o.enabled : true });
  }
  function open(e: TemplateOverrideState) {
    if (openId === e.id) {
      setOpenId(null);
      return;
    }
    setOpenId(e.id);
    setLocale("en");
    loadDraft(e, "en");
  }
  function switchLocale(e: TemplateOverrideState, loc: string) {
    setLocale(loc);
    loadDraft(e, loc);
  }
  async function save(e: TemplateOverrideState) {
    setBusy(true);
    await setTemplateOverride({
      catalogEntryId: e.id,
      locale,
      subject: draft.subject,
      body: draft.body,
      enabled: draft.enabled,
    });
    setBusy(false);
    setOpenId(null);
    onChanged();
  }
  async function reset(e: TemplateOverrideState) {
    setBusy(true);
    await clearTemplateOverride({ catalogEntryId: e.id, locale });
    setBusy(false);
    setOpenId(null);
    onChanged();
  }

  return (
    <div style={{ marginBottom: 24 }}>
      <div style={{ fontSize: 16, fontWeight: 600, fontFamily: FONT_DISPLAY, marginBottom: 6 }}>Templates</div>
      <p style={{ color: HQ.inkMuted, fontSize: 13, margin: "0 0 14px" }}>
        Override an email&apos;s subject + body per locale, without a deploy. Blank fields keep the
        code default. Placeholders: <code style={{ fontFamily: MONO }}>{"{{name}}"}</code>,{" "}
        <code style={{ fontFamily: MONO }}>{"{{brand}}"}</code>. The tenant&apos;s default_locale
        picks which override renders (en fallback); a bad override always falls back to the code template.
      </p>
      <div style={{ border: `1px solid ${HQ.borderSoft}`, borderRadius: 8, overflow: "hidden" }}>
        {entries.map((e) => {
          const activeLocales = TEMPLATE_LOCALES.filter((l) => e.byLocale[l]?.hasOverride && e.byLocale[l]?.enabled);
          return (
            <div key={e.id} style={{ borderBottom: `1px solid ${HQ.borderSoft}` }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "8px 12px" }}>
                <span style={{ fontFamily: MONO, fontSize: 12 }}>{e.id}</span>
                <span style={{ display: "flex", gap: 10, alignItems: "center" }}>
                  {activeLocales.map((l) => (
                    <span key={l} style={{ fontSize: 11, fontWeight: 700, color: HQ.green, textTransform: "uppercase" }}>{l}</span>
                  ))}
                  <button style={{ ...btn("transparent", HQ.blue), padding: "4px 10px", fontSize: 12 }} onClick={() => open(e)}>
                    {openId === e.id ? "Close" : "Edit"}
                  </button>
                </span>
              </div>
              {openId === e.id && (
                <div style={{ padding: 12, background: HQ.card, display: "grid", gap: 10 }}>
                  <div>
                    <label style={label}>Locale</label>
                    <select style={{ ...input, width: 120 }} value={locale} onChange={(ev) => switchLocale(e, ev.target.value)}>
                      {TEMPLATE_LOCALES.map((l) => (
                        <option key={l} value={l}>{l}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label style={label}>Subject (blank = code default)</label>
                    <input style={input} value={draft.subject} onChange={(ev) => setDraft({ ...draft, subject: ev.target.value })} placeholder="custom subject…" />
                  </div>
                  <div>
                    <label style={label}>Body (blank = code body)</label>
                    <textarea
                      style={{ ...input, minHeight: 120, fontFamily: MONO, lineHeight: 1.5, resize: "vertical" }}
                      value={draft.body}
                      onChange={(ev) => setDraft({ ...draft, body: ev.target.value })}
                      placeholder={"Hi {{name}},\n\nYour message…"}
                    />
                  </div>
                  <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: HQ.inkMuted }}>
                    <input type="checkbox" checked={draft.enabled} onChange={(ev) => setDraft({ ...draft, enabled: ev.target.checked })} /> Override active
                  </label>
                  <div style={{ display: "flex", gap: 10 }}>
                    <button style={{ ...btn(HQ.green, "#06281C"), opacity: busy ? 0.6 : 1 }} disabled={busy} onClick={() => save(e)}>Save</button>
                    {e.byLocale[locale]?.hasOverride && (
                      <button style={{ ...btn("transparent", HQ.red), border: `1px solid rgba(243,103,114,0.3)`, opacity: busy ? 0.6 : 1 }} disabled={busy} onClick={() => reset(e)}>
                        Reset {locale} to code default
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
      <div style={{ marginTop: 10, color: HQ.inkMuted, fontSize: 12 }}>{entries.length} email templates · {TEMPLATE_LOCALES.join(" / ")}.</div>
    </div>
  );
}

// ─── Sending domains (white-label, Resend Domains API) ───────────────────────
function SendingDomains({ entries, onChanged }: { entries: SendingDomainState[]; onChanged: () => void }) {
  const [tenantId, setTenantId] = useState("");
  const [domain, setDomain] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [busyTenant, setBusyTenant] = useState<string | null>(null);

  async function add() {
    setBusy(true);
    setErr(null);
    const r = await addSendingDomain({ tenantId, domain });
    if (r.ok) {
      setTenantId("");
      setDomain("");
      onChanged();
    } else setErr(r.error);
    setBusy(false);
  }
  async function verify(t: string) {
    setBusyTenant(t);
    await verifySendingDomain({ tenantId: t });
    setBusyTenant(null);
    onChanged();
  }
  async function remove(t: string) {
    setBusyTenant(t);
    await removeSendingDomain({ tenantId: t });
    setBusyTenant(null);
    onChanged();
  }
  const statusColor = (s: string) => (s === "verified" ? HQ.green : s === "failed" ? HQ.red : HQ.amber);
  const th = { padding: "6px 10px", textAlign: "left" as const, color: HQ.inkMuted, fontSize: 10, textTransform: "uppercase" as const };

  return (
    <div style={{ marginBottom: 24 }}>
      <div style={{ fontSize: 16, fontWeight: 600, fontFamily: FONT_DISPLAY, marginBottom: 6 }}>Sending domains (white-label)</div>
      <p style={{ color: HQ.inkMuted, fontSize: 13, margin: "0 0 14px" }}>
        Register an agency&apos;s own sending domain via Resend. Add it, give the tenant the DNS records,
        then Verify. Once verified (and the tenant has the white-label entitlement) their email sends
        from their domain instead of the platform default.
      </p>
      <div style={{ background: HQ.card, border: `1px solid ${HQ.borderSoft}`, borderRadius: 10, padding: 16, marginBottom: 14 }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr auto", gap: 12, alignItems: "end" }}>
          <div><label style={label}>Tenant id</label><input style={input} value={tenantId} onChange={(e) => setTenantId(e.target.value)} placeholder="agency tenant UUID" /></div>
          <div><label style={label}>Domain</label><input style={input} value={domain} onChange={(e) => setDomain(e.target.value)} placeholder="mail.agency.com" /></div>
          <button style={{ ...btn(HQ.green, "#06281C"), opacity: busy ? 0.6 : 1 }} disabled={busy} onClick={add}>{busy ? "Adding…" : "Add domain"}</button>
        </div>
        {err && <div style={{ color: HQ.red, fontSize: 12, marginTop: 10 }}>{err}</div>}
      </div>
      {entries.length === 0 ? (
        <div style={{ color: HQ.inkMuted, fontSize: 13 }}>No white-label domains yet — every tenant uses the platform sender.</div>
      ) : (
        <div style={{ display: "grid", gap: 12 }}>
          {entries.map((d) => (
            <div key={d.tenantId} style={{ border: `1px solid ${HQ.borderSoft}`, borderRadius: 8, padding: 12 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, marginBottom: d.records.length && d.verificationStatus !== "verified" ? 10 : 0 }}>
                <div>
                  <div style={{ fontFamily: MONO, fontSize: 13 }}>{d.domain}</div>
                  <div style={{ fontSize: 12, color: HQ.inkDim }}>{d.agencyName ?? d.tenantId}</div>
                </div>
                <span style={{ display: "flex", gap: 10, alignItems: "center" }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: statusColor(d.verificationStatus), textTransform: "uppercase" }}>{d.verificationStatus}{d.connected ? " · live" : ""}</span>
                  <button style={{ ...btn("rgba(106,166,243,0.15)", HQ.blue), padding: "4px 10px", fontSize: 12, opacity: busyTenant === d.tenantId ? 0.5 : 1 }} disabled={busyTenant === d.tenantId} onClick={() => verify(d.tenantId)}>{busyTenant === d.tenantId ? "…" : "Verify"}</button>
                  <button style={{ ...btn("transparent", HQ.red), padding: "4px 10px", fontSize: 12, border: `1px solid rgba(243,103,114,0.3)` }} disabled={busyTenant === d.tenantId} onClick={() => remove(d.tenantId)}>Remove</button>
                </span>
              </div>
              {d.records.length > 0 && d.verificationStatus !== "verified" && (
                <div style={{ border: `1px solid ${HQ.borderSoft}`, borderRadius: 6, overflow: "hidden" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                    <thead>
                      <tr style={{ background: "rgba(255,255,255,0.03)" }}>
                        <th style={th}>Type</th>
                        <th style={th}>Name</th>
                        <th style={th}>Value</th>
                      </tr>
                    </thead>
                    <tbody>
                      {d.records.map((rec, i) => (
                        <tr key={i} style={{ borderTop: `1px solid ${HQ.borderSoft}` }}>
                          <td style={{ padding: "6px 10px", fontFamily: MONO, color: HQ.inkMuted }}>{rec.type ?? rec.record}</td>
                          <td style={{ padding: "6px 10px", fontFamily: MONO, color: HQ.inkMuted, wordBreak: "break-all" }}>{rec.name}</td>
                          <td style={{ padding: "6px 10px", fontFamily: MONO, color: HQ.inkMuted, wordBreak: "break-all" }}>{rec.value}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
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
