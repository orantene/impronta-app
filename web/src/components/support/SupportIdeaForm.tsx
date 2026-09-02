"use client";

import { useState, type CSSProperties } from "react";
import { useT } from "@/i18n/use-t";
import { interpolate } from "@/i18n/interpolate";
import { SUPPORT_AGENT_VARS } from "@/lib/support/support-persona";
import { Icon } from "@/components/admin/shell/internal/primitives";
import { COLORS, FONTS, RADIUS } from "./support-tokens";
import { submitFeatureRequestAction } from "@/lib/support/feature-request-actions";
import type { SupportContract } from "./support-contract";

const AREAS = [
  "general",
  "builder",
  "roster",
  "bookings",
  "billing",
  "media",
  "reporting",
] as const;

/**
 * "Tell us what you need" — the idea intake. Deliberately shorter than the
 * ticket form: a title, the why, an optional area and phone. Everything the
 * owner needs to follow up lives on the row it creates.
 */
export function SupportIdeaForm({
  contract,
  onSubmitted,
}: {
  contract: SupportContract;
  onSubmitted: (requestNumber: number) => void;
}) {
  const t = useT();
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [area, setArea] = useState<(typeof AREAS)[number]>("general");
  const [phone, setPhone] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <form
      style={{ padding: 16, display: "flex", flexDirection: "column", gap: 12 }}
      onSubmit={(e) => {
        e.preventDefault();
        if (!title.trim() || busy) return;
        setBusy(true);
        setError(null);
        void submitFeatureRequestAction({
          tenantSlug: contract.tenantSlug,
          surface: contract.surface,
          title: title.trim(),
          body: body.trim() || undefined,
          area,
          contactPhone: phone.trim() || undefined,
        }).then((r) => {
          setBusy(false);
          if (r.ok) onSubmitted(r.requestNumber);
          else setError(r.error);
        });
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <Icon name="sparkle" size={15} color={COLORS.royal} />
        <div style={{ fontFamily: FONTS.display, fontSize: 15, fontWeight: 600, color: COLORS.ink }}>
          {t("dashboard.adminSupport.ideaHeading")}
        </div>
      </div>
      <div style={{ fontSize: 12.5, color: COLORS.inkMuted, lineHeight: 1.45, marginTop: -4 }}>
        {interpolate(t("dashboard.adminSupport.ideaBlurb"), SUPPORT_AGENT_VARS)}
      </div>

      <label style={fieldLabel}>
        {t("dashboard.adminSupport.ideaTitleLabel")}
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={120}
          required
          placeholder={t("dashboard.adminSupport.ideaTitlePlaceholder")}
          style={fieldInput}
        />
      </label>
      <label style={fieldLabel}>
        {t("dashboard.adminSupport.ideaBodyLabel")}
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          maxLength={4000}
          rows={4}
          placeholder={t("dashboard.adminSupport.ideaBodyPlaceholder")}
          style={{ ...fieldInput, resize: "vertical" }}
        />
      </label>
      <label style={fieldLabel}>
        {t("dashboard.adminSupport.ideaAreaLabel")}
        <select
          value={area}
          onChange={(e) => setArea(e.target.value as (typeof AREAS)[number])}
          style={fieldInput}
        >
          {AREAS.map((a) => (
            <option key={a} value={a}>
              {t(`dashboard.adminSupport.ideaArea_${a}`)}
            </option>
          ))}
        </select>
      </label>
      <label style={fieldLabel}>
        {t("dashboard.adminSupport.ideaPhoneLabel")}
        <input
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          maxLength={40}
          placeholder={t("dashboard.adminSupport.ideaPhonePlaceholder")}
          style={fieldInput}
        />
      </label>

      {error ? (
        <div role="alert" style={{ fontSize: 12, color: COLORS.critical }}>
          {error}
        </div>
      ) : null}

      <button
        type="submit"
        disabled={busy || !title.trim()}
        style={{
          border: "none",
          background: COLORS.fill,
          color: "#fff",
          borderRadius: 10,
          padding: "13px 14px",
          fontSize: 13,
          fontWeight: 600,
          cursor: busy || !title.trim() ? "default" : "pointer",
          opacity: busy ? 0.7 : 1,
        }}
      >
        {busy ? t("dashboard.adminSupport.ideaSending") : t("dashboard.adminSupport.ideaSubmit")}
      </button>
      <div style={{ fontSize: 11.5, color: COLORS.inkDim, textAlign: "center" }}>
        {t("dashboard.adminSupport.ideaFootnote")}
      </div>
    </form>
  );
}

const fieldLabel: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 6,
  fontSize: 12,
  fontWeight: 600,
  color: COLORS.inkMuted,
};
const fieldInput: CSSProperties = {
  border: `1px solid ${COLORS.border}`,
  borderRadius: RADIUS.md,
  padding: "10px 10px",
  fontSize: 13,
  fontFamily: FONTS.body,
  color: COLORS.ink,
  background: COLORS.card,
};
