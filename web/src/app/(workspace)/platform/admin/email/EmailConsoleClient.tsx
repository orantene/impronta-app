"use client";

import { Fragment, useMemo, useState, useTransition, type ReactNode } from "react";
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
  addSuppression,
  removeSuppression,
  sendTestEmail,
  setEventOverlay,
  addSendingDomain,
  verifySendingDomain,
  removeSendingDomain,
} from "./actions";
import {
  HQ,
  FONT_BODY,
  FONT_DISPLAY,
  MONO,
  PLATFORM_BARS_H,
  STICKY_THEAD_TOP,
  label,
  input,
  btn,
  relTime,
} from "./email-console-theme";
import {
  Alert,
  StatusBadge,
  CountBadge,
  EmptyState,
  SearchBox,
  RateStat,
} from "./email-console-widgets";
import { SendLogTable, TemplateEditor } from "./email-console-sections";

type ConsoleTab = "overview" | "log" | "events" | "templates" | "domains" | "suppressions";
const CONSOLE_TABS: { key: ConsoleTab; label: string }[] = [
  { key: "overview", label: "Overview" },
  { key: "log", label: "Send log" },
  { key: "events", label: "Events" },
  { key: "templates", label: "Templates" },
  { key: "domains", label: "Domains" },
  { key: "suppressions", label: "Suppressions" },
];

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
  const [isPending, startTransition] = useTransition();
  const [tab, setTab] = useState<ConsoleTab>("overview");
  const refresh = () => startTransition(() => router.refresh());

  const unverified = sendingDomains.filter((d) => d.verificationStatus !== "verified").length;
  const customized = templates.filter((t) =>
    (["en", "es"] as const).some((l) => t.byLocale[l]?.hasOverride),
  ).length;
  const badge: Record<ConsoleTab, ReactNode> = {
    overview: null,
    log: metrics.byStatus.failed ? <CountBadge n={metrics.byStatus.failed} tone="red" /> : null,
    events: null,
    templates: customized ? <CountBadge n={customized} tone="blue" /> : null,
    domains: unverified ? <CountBadge n={unverified} tone="amber" /> : null,
    suppressions: suppressions.length ? <CountBadge n={suppressions.length} tone="muted" /> : null,
  };

  return (
    <div style={{ fontFamily: FONT_BODY, color: HQ.ink, paddingBottom: 60 }}>
      <div style={{ marginBottom: 12 }}>
        <h1 style={{ fontFamily: FONT_DISPLAY, fontSize: 26, fontWeight: 600, letterSpacing: -0.5, margin: "0 0 4px" }}>
          Email
        </h1>
        <p style={{ color: HQ.inkMuted, margin: 0, fontSize: 13 }}>
          Deliverability, send log, suppressions, and diagnostics for the platform email pipeline.
        </p>
      </div>

      {/* Sticky tab bar — sits beneath the two platform layout bars. */}
      <div
        style={{
          position: "sticky",
          top: PLATFORM_BARS_H,
          zIndex: 20,
          background: HQ.bg,
          borderBottom: `1px solid ${HQ.border}`,
          marginBottom: 18,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          flexWrap: "wrap",
        }}
      >
        <div style={{ display: "flex", gap: 2, flexWrap: "wrap" }}>
          {CONSOLE_TABS.map((t) => {
            const active = tab === t.key;
            return (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                style={{
                  appearance: "none",
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  padding: "12px 14px",
                  fontSize: 13,
                  fontWeight: 600,
                  fontFamily: FONT_BODY,
                  color: active ? HQ.ink : HQ.inkMuted,
                  borderBottom: `2px solid ${active ? HQ.green : "transparent"}`,
                  marginBottom: -1,
                }}
              >
                {t.label}
                {badge[t.key]}
              </button>
            );
          })}
        </div>
        {isPending && (
          <span style={{ fontSize: 12, color: HQ.inkMuted, paddingRight: 4 }}>Refreshing…</span>
        )}
      </div>

      {tab === "overview" && (
        <>
          <HealthBanner domain={domain} metrics={metrics} />
          <MetricsStrip metrics={metrics} />
          <TestSend adminEmail={adminEmail} onDone={refresh} />
        </>
      )}
      {tab === "log" && <SendLogTable rows={sendLog} nowMs={nowMs} onChanged={refresh} />}
      {tab === "events" && <EventToggles entries={catalog} onChanged={refresh} />}
      {tab === "templates" && <TemplateEditor entries={templates} onChanged={refresh} />}
      {tab === "domains" && <SendingDomains entries={sendingDomains} onChanged={refresh} />}
      {tab === "suppressions" && <SuppressionPanel rows={suppressions} onChanged={refresh} />}
    </div>
  );
}

// ─── Event toggles (P3b) ─────────────────────────────────────────────────────
function EventToggles({ entries, onChanged }: { entries: CatalogEntryState[]; onChanged: () => void }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [q, setQ] = useState("");

  const byCategory = useMemo(() => {
    const s = q.toLowerCase();
    const matched = q ? entries.filter((e) => e.id.toLowerCase().includes(s) || e.category.toLowerCase().includes(s)) : entries;
    const m = new Map<string, CatalogEntryState[]>();
    for (const e of matched) {
      const arr = m.get(e.category) ?? [];
      arr.push(e);
      m.set(e.category, arr);
    }
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [entries, q]);
  const shown = byCategory.reduce((n, [, list]) => n + list.length, 0);

  async function toggle(e: CatalogEntryState, channel: "email" | "in_app", next: boolean) {
    const k = `${e.id}:${channel}`;
    setBusy(k);
    await setEventOverlay({ catalogEntryId: e.id, channel, enabled: next });
    setBusy(null);
    onChanged();
  }

  function Switch({ e, channel, on, has }: { e: CatalogEntryState; channel: "email" | "in_app"; on: boolean; has: boolean }) {
    if (!has) return <StatusBadge label="n/a" tone="muted" title="Channel not available for this event" />;
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
        {locked ? "🔒 ON" : on ? "ON" : "OFF"}
      </button>
    );
  }

  const th = {
    padding: "10px 12px",
    textAlign: "center" as const,
    fontSize: 11,
    color: HQ.inkMuted,
    textTransform: "uppercase" as const,
    letterSpacing: 0.5,
    position: "sticky" as const,
    top: STICKY_THEAD_TOP,
    background: HQ.card,
    zIndex: 2,
    boxShadow: `inset 0 -1px 0 ${HQ.borderSoft}`,
  };

  return (
    <div style={{ marginBottom: 24 }}>
      <div style={{ fontSize: 16, fontWeight: 600, fontFamily: FONT_DISPLAY, marginBottom: 6 }}>Events</div>
      <p style={{ color: HQ.inkMuted, fontSize: 13, margin: "0 0 12px" }}>
        Enable/disable each notification per channel. 🔒 Required (transactional) events can&apos;t be turned off.
      </p>
      <div style={{ marginBottom: 12 }}><SearchBox value={q} onChange={setQ} placeholder="Search events…" /></div>
      <div style={{ border: `1px solid ${HQ.borderSoft}`, borderRadius: 8, overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr>
              <th style={{ ...th, textAlign: "left" }}>Event</th>
              <th style={{ ...th, width: 90 }}>Email</th>
              <th style={{ ...th, width: 90 }}>In-app</th>
            </tr>
          </thead>
          <tbody>
            {shown === 0 && (
              <tr><td colSpan={3}><EmptyState>No events match “{q}”.</EmptyState></td></tr>
            )}
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
      <div style={{ marginTop: 10, color: HQ.inkMuted, fontSize: 12 }}>Showing {shown} of {entries.length} catalog events.</div>
    </div>
  );
}

// ─── Health banner ───────────────────────────────────────────────────────────
function HealthBanner({ domain, metrics }: { domain: EmailDomainStatus; metrics: EmailMetrics }) {
  const ok = domain.status === "configured";
  const trackingDark = metrics.funnel.opened === 0 && metrics.funnel.clicked === 0 && metrics.funnel.sent > 0;
  const [dismissed, setDismissed] = useState(false);
  return (
    <div style={{ display: "grid", gap: 12, marginBottom: 18 }}>
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
        <StatusBadge
          tone={ok ? "green" : "amber"}
          label={ok ? "Configured ✓" : domain.status === "env_fallback" ? "Env fallback" : "Unset — code default"}
        />
      </div>
      {metrics.byStatus.failed > 0 && (
        <Alert tone="red" title={`${metrics.byStatus.failed} send${metrics.byStatus.failed === 1 ? "" : "s"} failed`}>
          Open the <strong>Send log</strong> tab and use “Retry all failed” to re-send.
        </Alert>
      )}
      {trackingDark && !dismissed && (
        <Alert
          tone="amber"
          title="Open/click tracking is dark"
          actionLabel="Open Resend dashboard"
          actionHref="https://resend.com/settings"
          onDismiss={() => setDismissed(true)}
        >
          No opens or clicks recorded across all sends. Enable Open + Click tracking for the sending
          domain in Resend, and confirm the webhook subscribes to opened / clicked events.
        </Alert>
      )}
    </div>
  );
}

// ─── Metrics strip ───────────────────────────────────────────────────────────
function MetricCard({ label: l, value, color }: { label: string; value: number | string; color?: string }) {
  return (
    <div style={{ background: HQ.card, border: `1px solid ${HQ.borderSoft}`, borderRadius: 10, padding: "12px 14px" }}>
      <div style={{ fontSize: 11, color: HQ.inkMuted, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6 }}>{l}</div>
      <div style={{ fontSize: 22, fontWeight: 700, color: color ?? HQ.ink }}>{value}</div>
    </div>
  );
}

function MetricsStrip({ metrics }: { metrics: EmailMetrics }) {
  const f = metrics.funnel;
  const pct = (n: number, d: number) => (d > 0 ? Math.round((n / d) * 100) : null);
  const deliveryPct = pct(f.delivered, f.sent);
  const openPct = pct(f.opened, f.delivered);
  const bouncePct = pct(f.bounced, f.sent);
  const sectionLabel = { fontSize: 11, color: HQ.inkDim, textTransform: "uppercase" as const, letterSpacing: 0.5, margin: "0 0 8px" };

  return (
    <div style={{ marginBottom: 20 }}>
      <div style={sectionLabel}>Deliverability</div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 12, marginBottom: 16 }}>
        <RateStat label="Delivery rate" pct={deliveryPct} caption={`${f.delivered}/${f.sent} delivered`} tone="green" />
        <RateStat label="Open rate" pct={openPct} caption={`${f.opened}/${f.delivered} opened`} tone="blue" />
        <RateStat label="Bounce rate" pct={bouncePct} caption={`${f.bounced}/${f.sent} bounced`} tone={bouncePct && bouncePct > 5 ? "red" : "muted"} />
      </div>

      <div style={sectionLabel}>Status counts</div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(110px,1fr))", gap: 12, marginBottom: 12 }}>
        <MetricCard label="Sent" value={metrics.byStatus.sent} color={HQ.green} />
        <MetricCard label="Failed" value={metrics.byStatus.failed} color={metrics.byStatus.failed ? HQ.red : HQ.ink} />
        <MetricCard label="Suppressed" value={metrics.byStatus.suppressed} color={HQ.amber} />
        <MetricCard label="Queued" value={metrics.byStatus.queued} color={metrics.byStatus.queued ? HQ.amber : HQ.ink} />
        <MetricCard label="Skipped" value={metrics.byStatus.skipped} color={HQ.inkDim} />
        <MetricCard label="Failed · 30d" value={metrics.last30d.failed} color={metrics.last30d.failed ? HQ.red : HQ.ink} />
      </div>

      {metrics.topFailingEvents.length > 0 && (
        <div style={{ background: HQ.card, border: `1px solid ${HQ.borderSoft}`, borderRadius: 10, padding: "12px 16px" }}>
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

  const valid = to.includes("@");
  return (
    <div style={{ background: HQ.card, border: `1px solid ${HQ.borderSoft}`, borderRadius: 10, padding: 16, marginBottom: 24 }}>
      <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>Send a test email</div>
      <p style={{ color: HQ.inkDim, fontSize: 12, margin: "0 0 12px" }}>
        Fires a real diagnostic email through the production send path. Leave tenant blank for the platform sender, or enter a tenant id to exercise its white-label resolution.
      </p>
      <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr auto", gap: 12, alignItems: "end" }}>
        <div>
          <label style={label}>Recipient</label>
          <input style={input} value={to} onChange={(e) => setTo(e.target.value)} placeholder="you@example.com" />
        </div>
        <div>
          <label style={label}>Tenant id (optional)</label>
          <input style={input} value={tenantId} onChange={(e) => setTenantId(e.target.value)} placeholder="platform default" />
        </div>
        <button style={{ ...btn(HQ.green, "#06281C"), opacity: busy || !valid ? 0.5 : 1 }} disabled={busy || !valid} onClick={fire}>
          {busy ? "Sending…" : "Send test"}
        </button>
      </div>
      {result && (
        <div style={{ marginTop: 10, fontSize: 12, fontFamily: MONO, color: ok ? HQ.green : HQ.red }}>{result}</div>
      )}
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
  const tone = (s: string): "green" | "red" | "amber" => (s === "verified" ? "green" : s === "failed" ? "red" : "amber");
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
        <EmptyState>No white-label domains yet — every tenant uses the platform sender.</EmptyState>
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
                  <StatusBadge tone={tone(d.verificationStatus)} label={`${d.verificationStatus}${d.connected ? " · live" : ""}`} />
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
  const [q, setQ] = useState("");

  const filtered = useMemo(() => {
    if (!q) return rows;
    const s = q.toLowerCase();
    return rows.filter((r) => `${r.email ?? ""} ${r.reason ?? ""} ${r.source ?? ""} ${r.notes ?? ""}`.toLowerCase().includes(s));
  }, [rows, q]);

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
    <div style={{ background: HQ.card, border: `1px solid ${HQ.borderSoft}`, borderRadius: 10, padding: 16, marginBottom: 24 }}>
      <div style={{ fontSize: 16, fontWeight: 600, fontFamily: FONT_DISPLAY, marginBottom: 12 }}>Suppressions ({rows.length})</div>
      <div style={{ display: "grid", gridTemplateColumns: "2fr 2fr auto", gap: 12, alignItems: "end", marginBottom: 12 }}>
        <div><label style={label}>Email to suppress</label><input style={input} value={email} onChange={(e) => setEmail(e.target.value)} placeholder="bounced@example.com" /></div>
        <div><label style={label}>Notes</label><input style={input} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="reason (optional)" /></div>
        <button style={{ ...btn(HQ.amber, "#2A2206"), opacity: busy ? 0.6 : 1 }} disabled={busy} onClick={add}>Suppress</button>
      </div>
      {err && <div style={{ color: HQ.red, fontSize: 12, marginBottom: 10 }}>{err}</div>}
      {rows.length > 0 && <div style={{ marginBottom: 12 }}><SearchBox value={q} onChange={setQ} placeholder="Search suppressions…" /></div>}
      {rows.length === 0 ? (
        <EmptyState>No suppressed addresses.</EmptyState>
      ) : filtered.length === 0 ? (
        <EmptyState>No suppressions match “{q}”.</EmptyState>
      ) : (
        <div style={{ display: "grid", gap: 6 }}>
          {filtered.map((s) => (
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
