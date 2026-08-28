"use client";

import { useState, type CSSProperties } from "react";
import { useT } from "@/i18n/use-t";
import { Icon } from "@/components/admin/shell/internal/primitives";
import { COLORS, FONTS, RADIUS } from "./support-tokens";
import { ReplayConsent } from "./ReplayConsent";
import { SupportAttachButton } from "./SupportAttachButton";
import { getDiagnosticsSnapshot } from "@/lib/support/diagnostics/collector";
import type { SupportContract } from "./support-contract";

export function NewTicketForm({
  contract,
  onCreated,
  replayEnabled,
  attachReplay,
  setAttachReplay,
}: {
  contract: SupportContract;
  onCreated: (id: string, ticketNumber: number, subject: string, body: string) => void;
  replayEnabled: boolean;
  attachReplay: boolean;
  setAttachReplay: (v: boolean) => void;
}) {
  const t = useT();
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [phone, setPhone] = useState("");
  const [category, setCategory] = useState("General");
  const [pref, setPref] = useState<"anytime" | "morning" | "afternoon" | "evening">("anytime");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <form
      style={{ padding: 16, display: "flex", flexDirection: "column", gap: 12 }}
      onSubmit={(e) => {
        e.preventDefault();
        if (!body.trim() || busy) return;
        setBusy(true);
        setError(null);
        void contract
          .createTicket({
            tenantSlug: contract.tenantSlug,
            surface: contract.surface,
            body: body.trim(),
            subject: subject.trim() || undefined,
            category,
            originSlug: contract.originSlug ?? undefined,
            contactPhone: phone.trim() || undefined,
            callbackRequested: Boolean(phone.trim()),
            callbackPref: phone.trim() ? pref : undefined,
            diagnostics: getDiagnosticsSnapshot(),
          })
          .then((r) => {
            setBusy(false);
            if (r.ok) {
              onCreated(
                r.ticketId,
                r.ticketNumber ?? 0,
                subject.trim() || body.trim().slice(0, 80),
                body.trim(),
              );
            } else {
              // The form keeps everything typed; only surface the failure.
              setError(t("dashboard.adminSupport.sendFailed"));
            }
          });
      }}
    >
      <label style={fieldLabel}>
        {t("dashboard.adminSupport.fieldCategory")}
        <select value={category} onChange={(e) => setCategory(e.target.value)} style={fieldInput}>
          <option value="General">{t("dashboard.adminSupport.catGeneral")}</option>
          <option value="Bookings & inquiries">{t("dashboard.adminSupport.catBookings")}</option>
          <option value="Billing">{t("dashboard.adminSupport.catBilling")}</option>
          <option value="Account & access">{t("dashboard.adminSupport.catAccount")}</option>
          <option value="Public site & domains">{t("dashboard.adminSupport.catSite")}</option>
          <option value="Developer & API">{t("dashboard.adminSupport.catDeveloper")}</option>
          <option value="Trust & Safety">{t("dashboard.adminSupport.catTrust")}</option>
        </select>
      </label>
      <label style={fieldLabel}>
        {t("dashboard.adminSupport.fieldSubject")}
        <input value={subject} onChange={(e) => setSubject(e.target.value)} style={fieldInput} />
      </label>
      <label style={fieldLabel}>
        {t("dashboard.adminSupport.fieldDescription")}
        <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={5} required style={fieldInput} />
      </label>
      <label style={fieldLabel}>
        {t("dashboard.adminSupport.fieldPhone")}
        <input value={phone} onChange={(e) => setPhone(e.target.value)} style={fieldInput} />
      </label>
      <div style={{ fontSize: 12, color: COLORS.inkMuted }}>{t("dashboard.adminSupport.whatsappHint")}</div>
      {phone.trim() ? (
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {(["anytime", "morning", "afternoon", "evening"] as const).map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setPref(p)}
              style={{
                border: `1px solid ${pref === p ? COLORS.fill : COLORS.border}`,
                background: pref === p ? COLORS.fill : COLORS.card,
                color: pref === p ? "#fff" : COLORS.ink,
                borderRadius: 999,
                padding: "5px 10px",
                fontSize: 12,
                cursor: "pointer",
              }}
            >
              {p === "anytime"
                ? t("dashboard.adminSupport.prefAnytime")
                : p === "morning"
                  ? t("dashboard.adminSupport.prefMorning")
                  : p === "afternoon"
                    ? t("dashboard.adminSupport.prefAfternoon")
                    : t("dashboard.adminSupport.prefEvening")}
            </button>
          ))}
        </div>
      ) : null}
      {replayEnabled ? (
        <ReplayConsent checked={attachReplay} onChange={setAttachReplay} />
      ) : null}
      {error ? (
        <div role="alert" style={{ fontSize: 12, color: COLORS.critical }}>
          {error}
        </div>
      ) : null}
      <button
        type="submit"
        disabled={busy || !body.trim()}
        style={{
          border: "none",
          background: COLORS.fill,
          color: "#fff",
          borderRadius: 10,
          padding: "13px 14px",
          fontSize: 13,
          fontWeight: 600,
          cursor: "pointer",
        }}
      >
        {t("dashboard.adminSupport.createTicket")}
      </button>
      <div style={{ fontSize: 12, color: COLORS.inkDim, display: "flex", alignItems: "center", gap: 6 }}>
        <Icon name="sparkle" size={12} color={COLORS.royal} />
        {t("dashboard.adminSupport.aiMicrocopy")}
      </div>
    </form>
  );
}

export function Composer({
  disabled,
  onSend,
  ticketId = null,
}: {
  disabled: boolean;
  /** Resolves true on success; false keeps the text in the box. */
  onSend: (body: string) => Promise<boolean>;
  ticketId?: string | null;
}) {
  const t = useT();
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const send = async () => {
    const text = body.trim();
    if (!text || busy) return;
    setBusy(true);
    setFailed(false);
    const ok = await onSend(text);
    setBusy(false);
    if (ok) {
      // Clear only AFTER a confirmed send — a failure must never eat the text.
      setBody("");
    } else {
      setFailed(true);
    }
  };
  return (
    <div
      data-tulala-support-composer=""
      style={{
        borderTop: `1px solid ${COLORS.borderSoft}`,
        padding: "10px 12px",
      }}
    >
      {failed ? (
        <div role="alert" style={{ fontSize: 12, color: COLORS.critical, paddingBottom: 6 }}>
          {t("dashboard.adminSupport.sendFailed")}
        </div>
      ) : null}
      <div style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
        <SupportAttachButton ticketId={ticketId ?? null} disabled={disabled || busy} />
        <textarea
          value={body}
          disabled={disabled || busy}
          onChange={(e) => setBody(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void send();
            }
          }}
          placeholder={t("dashboard.adminSupport.composerPlaceholder")}
          rows={1}
          style={{
            flex: 1,
            resize: "none",
            border: `1px solid ${COLORS.border}`,
            borderRadius: 12,
            padding: "12px 12px",
            fontSize: 13,
            fontFamily: FONTS.body,
            outline: "none",
          }}
        />
        <button
          type="button"
          disabled={disabled || busy || !body.trim()}
          onClick={() => void send()}
          aria-label={t("dashboard.adminSupport.send")}
          style={{
            width: 44,
            height: 44,
            borderRadius: "50%",
            border: "none",
            background: body.trim() ? COLORS.fill : COLORS.surfaceAlt,
            cursor: body.trim() ? "pointer" : "default",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
          }}
        >
          <Icon name="send" size={15} color={body.trim() ? "#fff" : COLORS.inkDim} />
        </button>
      </div>
    </div>
  );
}

const fieldLabel: CSSProperties = { display: "flex", flexDirection: "column", gap: 6, fontSize: 12, fontWeight: 600, color: COLORS.inkMuted };
const fieldInput: CSSProperties = {
  border: `1px solid ${COLORS.border}`,
  borderRadius: RADIUS.md,
  padding: "8px 10px",
  fontSize: 13,
  fontFamily: FONTS.body,
  color: COLORS.ink,
};
