"use client";

import { useState } from "react";
import { useT } from "@/i18n/use-t";

import type { NotificationCopyRow } from "./email-data";
import {
  addNotificationCopy,
  removeNotificationCopy,
  sendNotificationCopyTest,
  updateNotificationCopy,
} from "./copies-actions";
import { HQ, FONT_DISPLAY, MONO, label, input, btn } from "./email-console-theme";
import { EmptyState, StatusBadge } from "./email-console-widgets";
import { COPY_KINDS, type CopyKind } from "@/lib/notifications/email-copies/kinds";

const KIND_LABEL_KEYS: Record<CopyKind, string> = {
  support_new: "dashboard.platform.email.copiesKindSupportNew",
  support_urgent: "dashboard.platform.email.copiesKindSupportUrgent",
  support_inbound: "dashboard.platform.email.copiesKindSupportInbound",
  leads: "dashboard.platform.email.copiesKindLeads",
  payment_issues: "dashboard.platform.email.copiesKindPaymentIssues",
};

function KindChecks({
  value,
  onToggle,
  disabled,
}: {
  value: readonly string[];
  onToggle: (kind: CopyKind, on: boolean) => void;
  disabled?: boolean;
}) {
  const t = useT();
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: "6px 14px" }}>
      {COPY_KINDS.map((k) => (
        <label key={k} style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, color: HQ.ink, cursor: "pointer" }}>
          <input
            type="checkbox"
            checked={value.includes(k)}
            disabled={disabled}
            onChange={(e) => onToggle(k, e.target.checked)}
          />
          {t(KIND_LABEL_KEYS[k])}
        </label>
      ))}
    </div>
  );
}

export function NotificationCopiesPanel({ rows, onChanged }: { rows: NotificationCopyRow[]; onChanged: () => void }) {
  const t = useT();
  const [email, setEmail] = useState("");
  const [copyLabel, setCopyLabel] = useState("");
  const [kinds, setKinds] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  async function run(fn: () => Promise<{ ok: true } | { ok: false; error: string }>, okNote?: string) {
    setBusy(true);
    setErr(null);
    setNote(null);
    const r = await fn();
    if (r.ok) {
      if (okNote) setNote(okNote);
      onChanged();
    } else setErr(r.error);
    setBusy(false);
    return r.ok;
  }

  async function add() {
    const ok = await run(() => addNotificationCopy({ email, label: copyLabel, kinds }));
    if (ok) { setEmail(""); setCopyLabel(""); setKinds([]); }
  }

  function toggleRowKind(row: NotificationCopyRow, kind: CopyKind, on: boolean) {
    const next = on ? [...row.kinds, kind] : row.kinds.filter((k) => k !== kind);
    void run(() => updateNotificationCopy({ id: row.id, kinds: next }));
  }

  const smallBtn = { padding: "4px 10px", fontSize: 12 };

  return (
    <div style={{ background: HQ.card, border: `1px solid ${HQ.borderSoft}`, borderRadius: 10, padding: 16, marginBottom: 24 }}>
      <div style={{ fontSize: 16, fontWeight: 600, fontFamily: FONT_DISPLAY, marginBottom: 4 }}>{t("dashboard.platform.email.copiesTitle")}</div>
      <p style={{ color: HQ.inkMuted, margin: "0 0 14px", fontSize: 13 }}>{t("dashboard.platform.email.copiesIntro")}</p>

      <div style={{ display: "grid", gridTemplateColumns: "2fr 2fr auto", gap: 12, alignItems: "end", marginBottom: 10 }}>
        <div><label style={label}>{t("dashboard.platform.email.copiesEmail")}</label><input style={input} type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></div>
        <div><label style={label}>{t("dashboard.platform.email.copiesLabel")}</label><input style={input} value={copyLabel} onChange={(e) => setCopyLabel(e.target.value)} placeholder={t("dashboard.platform.email.copiesLabelPlaceholder")} /></div>
        <button style={{ ...btn("transparent", HQ.green), border: `1px solid ${HQ.green}`, opacity: busy ? 0.6 : 1 }} disabled={busy || !email.trim()} onClick={add}>{t("dashboard.platform.email.copiesAdd")}</button>
      </div>
      <div style={{ marginBottom: 14 }}>
        <KindChecks
          value={kinds}
          disabled={busy}
          onToggle={(k, on) => setKinds((prev) => (on ? [...prev, k] : prev.filter((x) => x !== k)))}
        />
      </div>
      {err && <div style={{ color: HQ.red, fontSize: 12, marginBottom: 10 }}>{err}</div>}
      {note && <div style={{ color: HQ.green, fontSize: 12, marginBottom: 10 }}>{note}</div>}

      {rows.length === 0 ? (
        <EmptyState>{t("dashboard.platform.email.copiesEmpty")}</EmptyState>
      ) : (
        <div style={{ display: "grid", gap: 8 }}>
          {rows.map((r) => (
            <div key={r.id} style={{ padding: "10px 12px", border: `1px solid ${HQ.borderSoft}`, borderRadius: 6, opacity: r.paused ? 0.65 : 1 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 8 }}>
                <span style={{ fontFamily: MONO, fontSize: 13 }}>{r.email}</span>
                {r.label && <span style={{ color: HQ.inkDim, fontSize: 12 }}>{r.label}</span>}
                {r.paused && <StatusBadge label={t("dashboard.platform.email.copiesPaused")} tone="amber" />}
                <span style={{ flex: 1 }} />
                <button style={{ ...btn("transparent", HQ.ink), ...smallBtn, border: `1px solid ${HQ.border}` }} disabled={busy} onClick={() => run(() => sendNotificationCopyTest(r.id), t("dashboard.platform.email.copiesTestSent"))}>{t("dashboard.platform.email.copiesSendTest")}</button>
                <button style={{ ...btn("transparent", HQ.ink), ...smallBtn, border: `1px solid ${HQ.border}` }} disabled={busy} onClick={() => run(() => updateNotificationCopy({ id: r.id, paused: !r.paused }))}>{r.paused ? t("dashboard.platform.email.copiesResume") : t("dashboard.platform.email.copiesPause")}</button>
                <button style={{ ...btn("transparent", HQ.red), ...smallBtn, border: `1px solid rgba(243,103,114,0.3)` }} disabled={busy} onClick={() => run(() => removeNotificationCopy(r.id))}>{t("dashboard.platform.email.remove")}</button>
              </div>
              <KindChecks value={r.kinds} disabled={busy} onToggle={(k, on) => toggleRowKind(r, k, on)} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
