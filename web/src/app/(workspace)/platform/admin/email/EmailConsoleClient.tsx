"use client";

import { Fragment, useMemo, useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useT } from "@/i18n/use-t";
import { interpolate } from "@/i18n/interpolate";

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
const CONSOLE_TABS: { key: ConsoleTab; labelKey: string }[] = [
  { key: "overview", labelKey: "dashboard.platform.email.tabOverview" },
  { key: "log", labelKey: "dashboard.platform.email.tabLog" },
  { key: "events", labelKey: "dashboard.platform.email.tabEvents" },
  { key: "templates", labelKey: "dashboard.platform.email.tabTemplates" },
  { key: "domains", labelKey: "dashboard.platform.email.tabDomains" },
  { key: "suppressions", labelKey: "dashboard.platform.email.tabSuppressions" },
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
  /**
   * Platform admin-enabled locales from the `app_locales` registry.
   * Used to render the template-editor locale tabs and count customised
   * templates. Falls back to `["en", "es"]` when not provided.
   */
  adminLocales?: readonly string[];
}) {
  const { sendLog, metrics, suppressions, domain, catalog, templates, sendingDomains, adminEmail, nowMs, adminLocales = ["en", "es"] } = props;
  const t = useT();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [tab, setTab] = useState<ConsoleTab>("overview");
  const refresh = () => startTransition(() => router.refresh());

  const unverified = sendingDomains.filter((d) => d.verificationStatus !== "verified").length;
  const customized = templates.filter((tpl) =>
    adminLocales.some((l) => tpl.byLocale[l]?.hasOverride),
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
          {t("dashboard.platform.email.title")}
        </h1>
        <p style={{ color: HQ.inkMuted, margin: 0, fontSize: 13 }}>
          {t("dashboard.platform.email.subtitle")}
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
          {CONSOLE_TABS.map((tabDef) => {
            const active = tab === tabDef.key;
            return (
              <button
                key={tabDef.key}
                onClick={() => setTab(tabDef.key)}
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
                {t(tabDef.labelKey)}
                {badge[tabDef.key]}
              </button>
            );
          })}
        </div>
        {isPending && (
          <span style={{ fontSize: 12, color: HQ.inkMuted, paddingRight: 4 }}>{t("dashboard.platform.email.refreshing")}</span>
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
      {tab === "templates" && <TemplateEditor entries={templates} onChanged={refresh} adminLocales={adminLocales} />}
      {tab === "domains" && <SendingDomains entries={sendingDomains} onChanged={refresh} />}
      {tab === "suppressions" && <SuppressionPanel rows={suppressions} onChanged={refresh} />}
    </div>
  );
}

// ─── Event toggles (P3b) ─────────────────────────────────────────────────────
function EventToggles({ entries, onChanged }: { entries: CatalogEntryState[]; onChanged: () => void }) {
  const t = useT();
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
    if (!has) return <StatusBadge label={t("dashboard.platform.email.switchNa")} tone="muted" title={t("dashboard.platform.email.switchNaTitle")} />;
    const locked = e.required;
    const k = `${e.id}:${channel}`;
    return (
      <button
        disabled={locked || busy === k}
        onClick={() => toggle(e, channel, !on)}
        title={locked ? t("dashboard.platform.email.switchLockedTitle") : on ? t("dashboard.platform.email.switchDisableTitle") : t("dashboard.platform.email.switchEnableTitle")}
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
        {locked ? t("dashboard.platform.email.switchLockedOn") : on ? t("dashboard.platform.email.switchOn") : t("dashboard.platform.email.switchOff")}
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
      <div style={{ fontSize: 16, fontWeight: 600, fontFamily: FONT_DISPLAY, marginBottom: 6 }}>{t("dashboard.platform.email.events")}</div>
      <p style={{ color: HQ.inkMuted, fontSize: 13, margin: "0 0 12px" }}>
        {t("dashboard.platform.email.eventsIntro")}
      </p>
      <div style={{ marginBottom: 12 }}><SearchBox value={q} onChange={setQ} placeholder={t("dashboard.platform.email.searchEvents")} /></div>
      <div style={{ border: `1px solid ${HQ.borderSoft}`, borderRadius: 8, overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr>
              <th style={{ ...th, textAlign: "left" }}>{t("dashboard.platform.email.colEvent")}</th>
              <th style={{ ...th, width: 90 }}>{t("dashboard.platform.email.colEmail")}</th>
              <th style={{ ...th, width: 90 }}>{t("dashboard.platform.email.colInApp")}</th>
            </tr>
          </thead>
          <tbody>
            {shown === 0 && (
              <tr><td colSpan={3}><EmptyState>{interpolate(t("dashboard.platform.email.eventsNoMatch"), { query: q })}</EmptyState></td></tr>
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
      <div style={{ marginTop: 10, color: HQ.inkMuted, fontSize: 12 }}>{interpolate(t("dashboard.platform.email.showingEvents"), { shown, total: entries.length })}</div>
    </div>
  );
}

// ─── Health banner ───────────────────────────────────────────────────────────
function HealthBanner({ domain, metrics }: { domain: EmailDomainStatus; metrics: EmailMetrics }) {
  const t = useT();
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
            {t("dashboard.platform.email.platformSender")}
          </div>
          <div style={{ fontSize: 16, fontWeight: 600, fontFamily: MONO }}>{domain.effectiveFrom}</div>
        </div>
        <StatusBadge
          tone={ok ? "green" : "amber"}
          label={ok ? t("dashboard.platform.email.statusConfigured") : domain.status === "env_fallback" ? t("dashboard.platform.email.statusEnvFallback") : t("dashboard.platform.email.statusUnset")}
        />
      </div>
      {metrics.byStatus.failed > 0 && (
        <Alert tone="red" title={interpolate(metrics.byStatus.failed === 1 ? t("dashboard.platform.email.sendsFailedOne") : t("dashboard.platform.email.sendsFailedMany"), { count: metrics.byStatus.failed })}>
          {t("dashboard.platform.email.sendsFailedBodyPre")} <strong>{t("dashboard.platform.email.sendsFailedBodyTab")}</strong> {t("dashboard.platform.email.sendsFailedBodyPost")}
        </Alert>
      )}
      {trackingDark && !dismissed && (
        <Alert
          tone="amber"
          title={t("dashboard.platform.email.trackingDarkTitle")}
          actionLabel={t("dashboard.platform.email.trackingDarkAction")}
          actionHref="https://resend.com/settings"
          onDismiss={() => setDismissed(true)}
        >
          {t("dashboard.platform.email.trackingDarkBody")}
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
  const t = useT();
  const f = metrics.funnel;
  const pct = (n: number, d: number) => (d > 0 ? Math.round((n / d) * 100) : null);
  const deliveryPct = pct(f.delivered, f.sent);
  const openPct = pct(f.opened, f.delivered);
  const bouncePct = pct(f.bounced, f.sent);
  const sectionLabel = { fontSize: 11, color: HQ.inkDim, textTransform: "uppercase" as const, letterSpacing: 0.5, margin: "0 0 8px" };

  return (
    <div style={{ marginBottom: 20 }}>
      <div style={sectionLabel}>{t("dashboard.platform.email.deliverability")}</div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 12, marginBottom: 16 }}>
        <RateStat label={t("dashboard.platform.email.deliveryRate")} pct={deliveryPct} caption={interpolate(t("dashboard.platform.email.deliveredCaption"), { delivered: f.delivered, sent: f.sent })} tone="green" />
        <RateStat label={t("dashboard.platform.email.openRate")} pct={openPct} caption={interpolate(t("dashboard.platform.email.openedCaption"), { opened: f.opened, delivered: f.delivered })} tone="blue" />
        <RateStat label={t("dashboard.platform.email.bounceRate")} pct={bouncePct} caption={interpolate(t("dashboard.platform.email.bouncedCaption"), { bounced: f.bounced, sent: f.sent })} tone={bouncePct && bouncePct > 5 ? "red" : "muted"} />
      </div>

      <div style={sectionLabel}>{t("dashboard.platform.email.statusCounts")}</div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(110px,1fr))", gap: 12, marginBottom: 12 }}>
        <MetricCard label={t("dashboard.platform.email.metricSent")} value={metrics.byStatus.sent} color={HQ.green} />
        <MetricCard label={t("dashboard.platform.email.metricFailed")} value={metrics.byStatus.failed} color={metrics.byStatus.failed ? HQ.red : HQ.ink} />
        <MetricCard label={t("dashboard.platform.email.metricSuppressed")} value={metrics.byStatus.suppressed} color={HQ.amber} />
        <MetricCard label={t("dashboard.platform.email.metricQueued")} value={metrics.byStatus.queued} color={metrics.byStatus.queued ? HQ.amber : HQ.ink} />
        <MetricCard label={t("dashboard.platform.email.metricSkipped")} value={metrics.byStatus.skipped} color={HQ.inkDim} />
        <MetricCard label={t("dashboard.platform.email.metricFailed30d")} value={metrics.last30d.failed} color={metrics.last30d.failed ? HQ.red : HQ.ink} />
      </div>

      {metrics.topFailingEvents.length > 0 && (
        <div style={{ background: HQ.card, border: `1px solid ${HQ.borderSoft}`, borderRadius: 10, padding: "12px 16px" }}>
          <div style={{ fontSize: 11, color: HQ.inkMuted, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8 }}>{t("dashboard.platform.email.topFailing")}</div>
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
  const t = useT();
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
      const idSuffix = r.id
        ? interpolate(t("dashboard.platform.email.testSentIdSuffix"), { id: r.id })
        : ` · ${t("dashboard.platform.email.testSentNoId")}`;
      setResult(interpolate(t("dashboard.platform.email.testSent"), { status: r.status, from: r.from }) + idSuffix);
      onDone();
    } else {
      const resolved = r.from ? interpolate(t("dashboard.platform.email.testResolvedFrom"), { from: r.from }) : "";
      setResult(interpolate(t("dashboard.platform.email.testFailed"), { error: r.error }) + resolved);
    }
    setBusy(false);
  }

  const valid = to.includes("@");
  return (
    <div style={{ background: HQ.card, border: `1px solid ${HQ.borderSoft}`, borderRadius: 10, padding: 16, marginBottom: 24 }}>
      <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>{t("dashboard.platform.email.testSendTitle")}</div>
      <p style={{ color: HQ.inkDim, fontSize: 12, margin: "0 0 12px" }}>
        {t("dashboard.platform.email.testSendIntro")}
      </p>
      <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr auto", gap: 12, alignItems: "end" }}>
        <div>
          <label style={label}>{t("dashboard.platform.email.recipient")}</label>
          <input style={input} value={to} onChange={(e) => setTo(e.target.value)} placeholder={t("dashboard.platform.email.recipientPlaceholder")} />
        </div>
        <div>
          <label style={label}>{t("dashboard.platform.email.tenantIdOptional")}</label>
          <input style={input} value={tenantId} onChange={(e) => setTenantId(e.target.value)} placeholder={t("dashboard.platform.email.tenantIdPlaceholder")} />
        </div>
        <button style={{ ...btn(HQ.green, "#06281C"), opacity: busy || !valid ? 0.5 : 1 }} disabled={busy || !valid} onClick={fire}>
          {busy ? t("dashboard.platform.email.sending") : t("dashboard.platform.email.sendTest")}
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
  const t = useT();
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
      <div style={{ fontSize: 16, fontWeight: 600, fontFamily: FONT_DISPLAY, marginBottom: 6 }}>{t("dashboard.platform.email.sendingDomainsTitle")}</div>
      <p style={{ color: HQ.inkMuted, fontSize: 13, margin: "0 0 14px" }}>
        {t("dashboard.platform.email.sendingDomainsIntro")}
      </p>
      <div style={{ background: HQ.card, border: `1px solid ${HQ.borderSoft}`, borderRadius: 10, padding: 16, marginBottom: 14 }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr auto", gap: 12, alignItems: "end" }}>
          <div><label style={label}>{t("dashboard.platform.email.tenantId")}</label><input style={input} value={tenantId} onChange={(e) => setTenantId(e.target.value)} placeholder={t("dashboard.platform.email.tenantIdUuidPlaceholder")} /></div>
          <div><label style={label}>{t("dashboard.platform.email.domain")}</label><input style={input} value={domain} onChange={(e) => setDomain(e.target.value)} placeholder={t("dashboard.platform.email.domainPlaceholder")} /></div>
          <button style={{ ...btn(HQ.green, "#06281C"), opacity: busy ? 0.6 : 1 }} disabled={busy} onClick={add}>{busy ? t("dashboard.platform.email.adding") : t("dashboard.platform.email.addDomain")}</button>
        </div>
        {err && <div style={{ color: HQ.red, fontSize: 12, marginTop: 10 }}>{err}</div>}
      </div>
      {entries.length === 0 ? (
        <EmptyState>{t("dashboard.platform.email.domainsEmpty")}</EmptyState>
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
                  <StatusBadge tone={tone(d.verificationStatus)} label={`${d.verificationStatus}${d.connected ? ` · ${t("dashboard.platform.email.live")}` : ""}`} />
                  <button style={{ ...btn("rgba(106,166,243,0.15)", HQ.blue), padding: "4px 10px", fontSize: 12, opacity: busyTenant === d.tenantId ? 0.5 : 1 }} disabled={busyTenant === d.tenantId} onClick={() => verify(d.tenantId)}>{busyTenant === d.tenantId ? "…" : t("dashboard.platform.email.verify")}</button>
                  <button style={{ ...btn("transparent", HQ.red), padding: "4px 10px", fontSize: 12, border: `1px solid rgba(243,103,114,0.3)` }} disabled={busyTenant === d.tenantId} onClick={() => remove(d.tenantId)}>{t("dashboard.platform.email.remove")}</button>
                </span>
              </div>
              {d.records.length > 0 && d.verificationStatus !== "verified" && (
                <div style={{ border: `1px solid ${HQ.borderSoft}`, borderRadius: 6, overflow: "hidden" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                    <thead>
                      <tr style={{ background: "rgba(255,255,255,0.03)" }}>
                        <th style={th}>{t("dashboard.platform.email.dnsType")}</th>
                        <th style={th}>{t("dashboard.platform.email.dnsName")}</th>
                        <th style={th}>{t("dashboard.platform.email.dnsValue")}</th>
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
  const t = useT();
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
      <div style={{ fontSize: 16, fontWeight: 600, fontFamily: FONT_DISPLAY, marginBottom: 12 }}>{interpolate(t("dashboard.platform.email.suppressionsTitle"), { count: rows.length })}</div>
      <div style={{ display: "grid", gridTemplateColumns: "2fr 2fr auto", gap: 12, alignItems: "end", marginBottom: 12 }}>
        <div><label style={label}>{t("dashboard.platform.email.emailToSuppress")}</label><input style={input} value={email} onChange={(e) => setEmail(e.target.value)} placeholder={t("dashboard.platform.email.emailToSuppressPlaceholder")} /></div>
        <div><label style={label}>{t("dashboard.platform.email.notes")}</label><input style={input} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder={t("dashboard.platform.email.notesPlaceholder")} /></div>
        <button style={{ ...btn(HQ.amber, "#2A2206"), opacity: busy ? 0.6 : 1 }} disabled={busy} onClick={add}>{t("dashboard.platform.email.suppress")}</button>
      </div>
      {err && <div style={{ color: HQ.red, fontSize: 12, marginBottom: 10 }}>{err}</div>}
      {rows.length > 0 && <div style={{ marginBottom: 12 }}><SearchBox value={q} onChange={setQ} placeholder={t("dashboard.platform.email.searchSuppressions")} /></div>}
      {rows.length === 0 ? (
        <EmptyState>{t("dashboard.platform.email.suppressionsEmpty")}</EmptyState>
      ) : filtered.length === 0 ? (
        <EmptyState>{interpolate(t("dashboard.platform.email.suppressionsNoMatch"), { query: q })}</EmptyState>
      ) : (
        <div style={{ display: "grid", gap: 6 }}>
          {filtered.map((s) => (
            <div key={s.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, padding: "8px 10px", border: `1px solid ${HQ.borderSoft}`, borderRadius: 6, fontSize: 13 }}>
              <span style={{ fontFamily: MONO }}>{s.email}</span>
              <span style={{ color: HQ.inkDim, fontSize: 12, flex: 1 }}>{s.reason}{s.source ? ` · ${s.source}` : ""}{s.notes ? ` · ${s.notes}` : ""} · {relTime(s.createdAtIso, t)}</span>
              <button style={{ ...btn("transparent", HQ.red), padding: "4px 10px", fontSize: 12, border: `1px solid rgba(243,103,114,0.3)` }} onClick={() => s.email && remove(s.email)}>{t("dashboard.platform.email.remove")}</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
