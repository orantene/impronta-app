"use client";

import { Fragment, useMemo, useState } from "react";
import { useT } from "@/i18n/use-t";
import { interpolate } from "@/i18n/interpolate";
import type { EmailLogRow, TemplateOverrideState } from "./email-data";
import { retryEmailRow, setTemplateOverride, clearTemplateOverride } from "./actions";
import { HQ, FONT_DISPLAY, MONO, STICKY_THEAD_TOP, label, input, btn, relTime } from "./email-console-theme";
import { StatusBadge, EmptyState, SearchBox } from "./email-console-widgets";

type DateKey = "all" | "24h" | "7d" | "30d";

const STATUS_TONE: Record<string, "green" | "red" | "amber" | "blue" | "muted"> = {
  sent: "green",
  failed: "red",
  suppressed: "amber",
  queued: "amber",
  skipped: "muted",
};

// enum → catalog key; render label via t(), keep the raw union as the value.
const STATUS_LABEL_KEY: Record<string, string> = {
  sent: "dashboard.platform.email.statusSent",
  failed: "dashboard.platform.email.statusFailed",
  suppressed: "dashboard.platform.email.statusSuppressed",
  queued: "dashboard.platform.email.statusQueued",
  skipped: "dashboard.platform.email.statusSkipped",
};

// ─── Send-log table ──────────────────────────────────────────────────────────
export function SendLogTable({
  rows,
  nowMs,
  onChanged,
}: {
  rows: EmailLogRow[];
  nowMs: number;
  onChanged: () => void;
}) {
  const t = useT();
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("all");
  const [eventKind, setEventKind] = useState("all");
  const [dateKey, setDateKey] = useState<DateKey>("all");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [bulk, setBulk] = useState<string | null>(null);

  const eventKinds = useMemo(() => Array.from(new Set(rows.map((r) => r.eventKind))).sort(), [rows]);

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

  const retryable = filtered.filter((r) => r.status === "failed" || r.status === "suppressed");

  async function doRetry(id: string) {
    setBusyId(id);
    await retryEmailRow(id);
    setBusyId(null);
    onChanged();
  }
  async function retryAll() {
    if (!retryable.length) return;
    for (let i = 0; i < retryable.length; i++) {
      setBulk(interpolate(t("dashboard.platform.email.retrying"), { index: i + 1, total: retryable.length }));
      await retryEmailRow(retryable[i].id);
    }
    setBulk(null);
    onChanged();
  }

  const th = {
    padding: "8px 12px",
    textAlign: "left" as const,
    fontWeight: 600,
    color: HQ.inkMuted,
    textTransform: "uppercase" as const,
    fontSize: 11,
    letterSpacing: 0.5,
    position: "sticky" as const,
    top: STICKY_THEAD_TOP,
    background: HQ.card,
    zIndex: 2,
    boxShadow: `inset 0 -1px 0 ${HQ.borderSoft}`,
  };
  const td = { padding: "8px 12px", verticalAlign: "top" as const };

  return (
    <div style={{ marginBottom: 24 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 12 }}>
        <div style={{ fontSize: 16, fontWeight: 600, fontFamily: FONT_DISPLAY }}>{t("dashboard.platform.email.sendLog")}</div>
        {retryable.length > 0 && (
          <button
            style={{ ...btn("rgba(106,166,243,0.15)", HQ.blue), fontSize: 12, opacity: bulk ? 0.6 : 1 }}
            disabled={!!bulk}
            onClick={retryAll}
          >
            {bulk ?? interpolate(t("dashboard.platform.email.retryAllFailed"), { count: retryable.length })}
          </button>
        )}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))", gap: 12, marginBottom: 14 }}>
        <div><label style={label}>{t("dashboard.platform.email.search")}</label><input style={input} value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("dashboard.platform.email.searchLogPlaceholder")} /></div>
        <div>
          <label style={label}>{t("dashboard.platform.email.status")}</label>
          <select style={input} value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="all">{t("dashboard.platform.email.all")}</option>
            <option value="sent">{t("dashboard.platform.email.statusSent")}</option>
            <option value="failed">{t("dashboard.platform.email.statusFailed")}</option>
            <option value="suppressed">{t("dashboard.platform.email.statusSuppressed")}</option>
            <option value="queued">{t("dashboard.platform.email.statusQueued")}</option>
            <option value="skipped">{t("dashboard.platform.email.statusSkipped")}</option>
          </select>
        </div>
        <div>
          <label style={label}>{t("dashboard.platform.email.event")}</label>
          <select style={input} value={eventKind} onChange={(e) => setEventKind(e.target.value)}>
            <option value="all">{t("dashboard.platform.email.all")}</option>
            {eventKinds.map((k) => <option key={k} value={k}>{k}</option>)}
          </select>
        </div>
        <div>
          <label style={label}>{t("dashboard.platform.email.date")}</label>
          <select style={input} value={dateKey} onChange={(e) => setDateKey(e.target.value as DateKey)}>
            <option value="all">{t("dashboard.platform.email.dateAll")}</option>
            <option value="24h">{t("dashboard.platform.email.date24h")}</option>
            <option value="7d">{t("dashboard.platform.email.date7d")}</option>
            <option value="30d">{t("dashboard.platform.email.date30d")}</option>
          </select>
        </div>
      </div>

      <div style={{ border: `1px solid ${HQ.borderSoft}`, borderRadius: 8, overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr>
              <th style={th}>{t("dashboard.platform.email.colWhen")}</th>
              <th style={th}>{t("dashboard.platform.email.colEvent")}</th>
              <th style={th}>{t("dashboard.platform.email.colRecipient")}</th>
              <th style={th}>{t("dashboard.platform.email.colStatus")}</th>
              <th style={th}>{t("dashboard.platform.email.colDelivery")}</th>
              <th style={th}></th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr><td colSpan={6}><EmptyState>{rows.length === 0 ? t("dashboard.platform.email.logEmpty") : t("dashboard.platform.email.logNoMatch")}</EmptyState></td></tr>
            )}
            {filtered.map((r, i) => {
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
                  <tr style={{ borderBottom: `1px solid ${HQ.borderSoft}`, background: isOpen ? "rgba(93,211,160,0.04)" : i % 2 ? "rgba(255,255,255,0.015)" : "transparent" }}>
                    <td style={{ ...td, color: HQ.inkMuted, whiteSpace: "nowrap" }}>{relTime(r.createdAtIso, t)}</td>
                    <td style={{ ...td, fontFamily: MONO, fontSize: 12 }}>{r.catalogEntryId ?? r.eventKind}</td>
                    <td style={{ ...td, color: HQ.inkMuted, fontFamily: MONO, fontSize: 12 }}>{r.recipientEmail ?? "—"}</td>
                    <td style={td}>
                      <StatusBadge label={STATUS_LABEL_KEY[r.status] ? t(STATUS_LABEL_KEY[r.status]) : r.status} tone={STATUS_TONE[r.status] ?? "muted"} />
                      {r.attempts > 1 && (
                        <span title={interpolate(t("dashboard.platform.email.attemptsTitle"), { count: r.attempts })} style={{ marginLeft: 6, fontSize: 11, color: HQ.amber }}>×{r.attempts}</span>
                      )}
                    </td>
                    <td style={{ ...td, fontFamily: MONO, fontSize: 12, color: r.bouncedAtIso ? HQ.red : HQ.inkMuted }}>{deliv || "—"}</td>
                    <td style={{ ...td, textAlign: "right", whiteSpace: "nowrap" }}>
                      {canRetry && (
                        <button style={{ ...btn("rgba(106,166,243,0.15)", HQ.blue), padding: "4px 10px", fontSize: 12, opacity: busyId === r.id ? 0.5 : 1 }} disabled={busyId === r.id || !!bulk} onClick={() => doRetry(r.id)}>
                          {busyId === r.id ? "…" : t("dashboard.platform.email.retry")}
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
      <div style={{ marginTop: 10, color: HQ.inkMuted, fontSize: 12 }}>{interpolate(t("dashboard.platform.email.showingLog"), { shown: filtered.length, total: rows.length })}</div>
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

export function TemplateEditor({
  entries,
  onChanged,
  adminLocales = ["en", "es"],
}: {
  entries: TemplateOverrideState[];
  onChanged: () => void;
  /**
   * Platform admin-enabled locales from the `app_locales` registry.
   * Determines which locale tabs appear in the template editor. Falls back
   * to `["en", "es"]` when not provided.
   */
  adminLocales?: readonly string[];
}) {
  const t = useT();
  const [openId, setOpenId] = useState<string | null>(null);
  const [locale, setLocale] = useState<string>(adminLocales[0] ?? "en");
  const [q, setQ] = useState("");
  const [draft, setDraft] = useState<{ subject: string; body: string; enabled: boolean }>({ subject: "", body: "", enabled: true });
  const [busy, setBusy] = useState(false);

  const filtered = useMemo(() => {
    if (!q) return entries;
    const s = q.toLowerCase();
    return entries.filter((e) => e.id.toLowerCase().includes(s));
  }, [entries, q]);
  const customizedCount = entries.filter((e) => adminLocales.some((l) => e.byLocale[l]?.hasOverride)).length;

  function loadDraft(e: TemplateOverrideState, loc: string) {
    const o = e.byLocale[loc];
    setDraft({ subject: o?.subject ?? "", body: o?.body ?? "", enabled: o?.hasOverride ? o.enabled : true });
  }
  function open(e: TemplateOverrideState) {
    if (openId === e.id) { setOpenId(null); return; }
    const defaultLoc = adminLocales[0] ?? "en";
    setOpenId(e.id);
    setLocale(defaultLoc);
    loadDraft(e, defaultLoc);
  }
  function switchLocale(e: TemplateOverrideState, loc: string) {
    setLocale(loc);
    loadDraft(e, loc);
  }
  async function save(e: TemplateOverrideState) {
    setBusy(true);
    await setTemplateOverride({ catalogEntryId: e.id, locale, subject: draft.subject, body: draft.body, enabled: draft.enabled });
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
      <div style={{ fontSize: 16, fontWeight: 600, fontFamily: FONT_DISPLAY, marginBottom: 6 }}>{t("dashboard.platform.email.templates")}</div>
      <p style={{ color: HQ.inkMuted, fontSize: 13, margin: "0 0 12px" }}>
        {t("dashboard.platform.email.templatesIntroPre")} <code style={{ fontFamily: MONO }}>{"{{name}}"}</code>,{" "}
        <code style={{ fontFamily: MONO }}>{"{{brand}}"}</code>{t("dashboard.platform.email.templatesIntroPost")}
      </p>
      <div style={{ marginBottom: 12 }}><SearchBox value={q} onChange={setQ} placeholder={t("dashboard.platform.email.searchTemplates")} /></div>
      <div style={{ border: `1px solid ${HQ.borderSoft}`, borderRadius: 8, overflow: "hidden" }}>
        {filtered.length === 0 && <EmptyState>{interpolate(t("dashboard.platform.email.templatesNoMatch"), { query: q })}</EmptyState>}
        {filtered.map((e) => {
          return (
            <div key={e.id} style={{ borderBottom: `1px solid ${HQ.borderSoft}` }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "8px 12px" }}>
                <span style={{ fontFamily: MONO, fontSize: 12 }}>{e.id}</span>
                <span style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  {adminLocales.map((l) => {
                    const o = e.byLocale[l];
                    if (!o?.hasOverride) return null;
                    const paused = !o.enabled;
                    return (
                      <span
                        key={l}
                        title={paused ? t("dashboard.platform.email.overridePausedTitle") : t("dashboard.platform.email.overrideActiveTitle")}
                        style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", color: paused ? HQ.inkDim : HQ.green, textDecoration: paused ? "line-through" : "none" }}
                      >
                        {l}
                      </span>
                    );
                  })}
                  <button style={{ ...btn("transparent", HQ.blue), padding: "4px 10px", fontSize: 12 }} onClick={() => open(e)}>
                    {openId === e.id ? t("dashboard.platform.email.close") : t("dashboard.platform.email.edit")}
                  </button>
                </span>
              </div>
              {openId === e.id && (
                <div style={{ padding: 12, background: HQ.card, display: "grid", gap: 10 }}>
                  <div>
                    <label style={label}>{t("dashboard.platform.email.locale")}</label>
                    <select style={{ ...input, width: 120 }} value={locale} onChange={(ev) => switchLocale(e, ev.target.value)}>
                      {adminLocales.map((l) => <option key={l} value={l}>{l}</option>)}
                    </select>
                  </div>
                  <div>
                    <label style={label}>{t("dashboard.platform.email.subjectLabel")}</label>
                    <input style={input} value={draft.subject} onChange={(ev) => setDraft({ ...draft, subject: ev.target.value })} placeholder={t("dashboard.platform.email.subjectPlaceholder")} />
                  </div>
                  <div>
                    <label style={label}>{t("dashboard.platform.email.bodyLabel")}</label>
                    <textarea
                      style={{ ...input, minHeight: 120, fontFamily: MONO, lineHeight: 1.5, resize: "vertical" }}
                      value={draft.body}
                      onChange={(ev) => setDraft({ ...draft, body: ev.target.value })}
                      placeholder={"Hi {{name}},\n\nYour message…"}
                    />
                  </div>
                  <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: HQ.inkMuted }}>
                    <input type="checkbox" checked={draft.enabled} onChange={(ev) => setDraft({ ...draft, enabled: ev.target.checked })} /> {t("dashboard.platform.email.overrideActive")}
                  </label>
                  <div style={{ display: "flex", gap: 10 }}>
                    <button style={{ ...btn(HQ.green, "#06281C"), opacity: busy ? 0.6 : 1 }} disabled={busy} onClick={() => save(e)}>{t("dashboard.platform.email.save")}</button>
                    {e.byLocale[locale]?.hasOverride && (
                      <button style={{ ...btn("transparent", HQ.red), border: `1px solid rgba(243,103,114,0.3)`, opacity: busy ? 0.6 : 1 }} disabled={busy} onClick={() => reset(e)}>
                        {interpolate(t("dashboard.platform.email.resetToDefault"), { locale })}
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
      <div style={{ marginTop: 10, color: HQ.inkMuted, fontSize: 12 }}>
        {interpolate(t("dashboard.platform.email.templatesCustomized"), {
          customized: customizedCount,
          total: entries.length,
          locales: adminLocales.join(" / "),
        })}
      </div>
    </div>
  );
}
