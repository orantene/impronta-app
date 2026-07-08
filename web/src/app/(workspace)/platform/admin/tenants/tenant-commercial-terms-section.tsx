"use client";

/**
 * Platform Admin — per-tenant commercial-terms override section.
 *
 * Shown inside the tenant management drawer + full page. Lets a platform admin
 * set a workspace's commercial booking terms (deposit %, refund-policy preset,
 * instant-book) which override the platform defaults for that workspace.
 *
 * CONFIGURATION LAYER ONLY — this edits *settings* (agencies.settings.commercial-
 * Terms). It charges nothing and runs no refunds; that is a later wave.
 */

import { useState, useTransition } from "react";
import { HQ, Chip } from "./hq-kit";
import {
  Accordion,
  Btn,
  Feedback,
  inputStyle,
  type SectionProps,
} from "./tenant-section-kit";
import { updateTenantCommercialTermsAsPlatform } from "./commercial-terms-actions";
import {
  REFUND_POLICY_LABEL_KEYS,
  REFUND_POLICY_DESCRIPTION_KEYS,
  type RefundPolicyKey,
  type TenantCommercialTerms,
} from "@/lib/billing/commercial-terms-types";
import { useT } from "@/i18n/use-t";

const POLICY_KEYS: RefundPolicyKey[] = ["tiered", "flexible", "strict", "manual"];

export function CommercialTermsSection({ detail, onChanged, defaultOpen }: SectionProps) {
  const t = useT();
  const terms = detail.commercialTerms;
  const hasOverride =
    terms.depositPct !== null || terms.refundPolicy !== null || terms.instantBookEnabled;

  // null deposit → empty string (= inherit); null policy → "" (= inherit)
  const [depositPct, setDepositPct] = useState(
    terms.depositPct === null ? "" : String(terms.depositPct),
  );
  const [refundPolicy, setRefundPolicy] = useState<"" | RefundPolicyKey>(
    terms.refundPolicy ?? "",
  );
  const [instantBook, setInstantBook] = useState(terms.instantBookEnabled);

  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ tone: "ok" | "err"; text: string } | null>(null);

  function save() {
    setMsg(null);
    let depositValue: number | null = null;
    if (depositPct.trim() !== "") {
      const pct = parseFloat(depositPct);
      if (!isFinite(pct) || pct < 0 || pct > 100) {
        setMsg({ tone: "err", text: t("dashboard.platform.tenants.depositRangeError") });
        return;
      }
      depositValue = pct;
    }
    const payload: TenantCommercialTerms = {
      depositPct: depositValue,
      refundPolicy: refundPolicy === "" ? null : refundPolicy,
      instantBookEnabled: instantBook,
    };
    start(async () => {
      const res = await updateTenantCommercialTermsAsPlatform(detail.id, payload);
      if (res.ok) {
        setMsg({ tone: "ok", text: t("dashboard.platform.tenants.commercialTermsSaved") });
        await onChanged();
      } else {
        setMsg({ tone: "err", text: res.error ?? t("dashboard.platform.tenants.couldNotSave") });
      }
    });
  }

  function clearAll() {
    setMsg(null);
    setDepositPct("");
    setRefundPolicy("");
    setInstantBook(false);
    start(async () => {
      const res = await updateTenantCommercialTermsAsPlatform(detail.id, {
        depositPct: null,
        refundPolicy: null,
        instantBookEnabled: false,
      });
      if (res.ok) {
        setMsg({ tone: "ok", text: t("dashboard.platform.tenants.commercialTermsCleared") });
        await onChanged();
      } else {
        setMsg({ tone: "err", text: res.error ?? t("dashboard.platform.tenants.couldNotClear") });
      }
    });
  }

  return (
    <Accordion
      title={t("dashboard.platform.tenants.sectionCommercialTerms")}
      trailing={
        hasOverride ? (
          <Chip bg={HQ.amberSoft} color={HQ.amber}>
            {t("dashboard.platform.tenants.overrideActiveChip")}
          </Chip>
        ) : (
          <Chip bg="rgba(155,168,183,0.15)" color={HQ.inkMuted}>
            {t("dashboard.platform.tenants.platformDefault")}
          </Chip>
        )
      }
      defaultOpen={defaultOpen ?? false}
    >
      <div style={{ paddingTop: 8, display: "flex", flexDirection: "column", gap: 10 }}>
        <p style={{ fontSize: 11, color: HQ.inkMuted, margin: 0, lineHeight: 1.5 }}>
          {t("dashboard.platform.tenants.commercialTermsIntro")}
        </p>

        <div
          style={{
            padding: "10px 12px",
            background: HQ.cardSofter,
            border: `1px solid ${HQ.borderSoft}`,
            borderRadius: 10,
            display: "flex",
            flexDirection: "column",
            gap: 10,
          }}
        >
          <label style={{ fontSize: 11, color: HQ.inkMuted }}>
            {t("dashboard.platform.tenants.depositField")}
            <input
              type="number"
              min={0}
              max={100}
              step={1}
              value={depositPct}
              disabled={pending}
              placeholder={t("dashboard.platform.tenants.depositInherit")}
              onChange={(e) => setDepositPct(e.target.value)}
              style={{ ...inputStyle, marginTop: 3 }}
            />
          </label>

          <label style={{ fontSize: 11, color: HQ.inkMuted }}>
            {t("dashboard.platform.tenants.refundPolicyField")}
            <select
              value={refundPolicy}
              disabled={pending}
              onChange={(e) => setRefundPolicy(e.target.value as "" | RefundPolicyKey)}
              style={{ ...inputStyle, marginTop: 3 }}
            >
              <option value="">{t("dashboard.platform.tenants.inheritPlatformDefault")}</option>
              {POLICY_KEYS.map((k) => (
                <option key={k} value={k}>
                  {t(REFUND_POLICY_LABEL_KEYS[k])}
                </option>
              ))}
            </select>
            {refundPolicy !== "" && (
              <span
                style={{
                  display: "block",
                  marginTop: 4,
                  fontSize: 10.5,
                  color: HQ.inkDim,
                  lineHeight: 1.45,
                }}
              >
                {t(REFUND_POLICY_DESCRIPTION_KEYS[refundPolicy])}
              </span>
            )}
          </label>

          <label
            style={{
              display: "flex",
              alignItems: "flex-start",
              gap: 8,
              fontSize: 11.5,
              color: HQ.ink,
              cursor: pending ? "not-allowed" : "pointer",
            }}
          >
            <input
              type="checkbox"
              checked={instantBook}
              disabled={pending}
              onChange={(e) => setInstantBook(e.target.checked)}
              style={{ marginTop: 2 }}
            />
            <span>
              <span style={{ fontWeight: 600 }}>{t("dashboard.platform.tenants.enableInstantBooking")}</span>
              <span style={{ display: "block", color: HQ.inkMuted, marginTop: 2 }}>
                {t("dashboard.platform.tenants.instantBookingDesc")}
              </span>
            </span>
          </label>

          <div style={{ display: "flex", gap: 8, marginTop: 2 }}>
            <Btn tone="primary" onClick={save} disabled={pending}>
              {pending ? t("dashboard.platform.tenants.saving") : t("dashboard.platform.tenants.saveTerms")}
            </Btn>
            {hasOverride && (
              <Btn tone="danger" onClick={clearAll} disabled={pending}>
                {t("dashboard.platform.tenants.clearOverride")}
              </Btn>
            )}
          </div>
        </div>

        <Feedback msg={msg} />
      </div>
    </Accordion>
  );
}
