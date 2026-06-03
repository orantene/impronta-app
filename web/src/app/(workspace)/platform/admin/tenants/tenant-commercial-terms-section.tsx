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
  REFUND_POLICY_LABELS,
  REFUND_POLICY_DESCRIPTIONS,
  type RefundPolicyKey,
  type TenantCommercialTerms,
} from "@/lib/billing/commercial-terms-types";

const POLICY_KEYS: RefundPolicyKey[] = ["tiered", "flexible", "strict", "manual"];

export function CommercialTermsSection({ detail, onChanged, defaultOpen }: SectionProps) {
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
        setMsg({ tone: "err", text: "Deposit must be between 0 and 100%." });
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
        setMsg({ tone: "ok", text: "Commercial terms saved." });
        await onChanged();
      } else {
        setMsg({ tone: "err", text: res.error ?? "Could not save." });
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
        setMsg({ tone: "ok", text: "Override cleared — back to platform defaults." });
        await onChanged();
      } else {
        setMsg({ tone: "err", text: res.error ?? "Could not clear." });
      }
    });
  }

  return (
    <Accordion
      title="Commercial terms"
      trailing={
        hasOverride ? (
          <Chip bg={HQ.amberSoft} color={HQ.amber}>
            Override active
          </Chip>
        ) : (
          <Chip bg="rgba(155,168,183,0.15)" color={HQ.inkMuted}>
            Platform default
          </Chip>
        )
      }
      defaultOpen={defaultOpen ?? false}
    >
      <div style={{ paddingTop: 8, display: "flex", flexDirection: "column", gap: 10 }}>
        <p style={{ fontSize: 11, color: HQ.inkMuted, margin: 0, lineHeight: 1.5 }}>
          Override this workspace&apos;s booking terms. Leave deposit and refund
          blank to inherit the platform defaults. Resolver precedence: talent
          preference &gt; tenant override &gt; platform default.
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
            Deposit (%, blank = inherit)
            <input
              type="number"
              min={0}
              max={100}
              step={1}
              value={depositPct}
              disabled={pending}
              placeholder="inherit"
              onChange={(e) => setDepositPct(e.target.value)}
              style={{ ...inputStyle, marginTop: 3 }}
            />
          </label>

          <label style={{ fontSize: 11, color: HQ.inkMuted }}>
            Refund policy (blank = inherit)
            <select
              value={refundPolicy}
              disabled={pending}
              onChange={(e) => setRefundPolicy(e.target.value as "" | RefundPolicyKey)}
              style={{ ...inputStyle, marginTop: 3 }}
            >
              <option value="">Inherit platform default</option>
              {POLICY_KEYS.map((k) => (
                <option key={k} value={k}>
                  {REFUND_POLICY_LABELS[k]}
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
                {REFUND_POLICY_DESCRIPTIONS[refundPolicy]}
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
              <span style={{ fontWeight: 600 }}>Enable instant booking</span>
              <span style={{ display: "block", color: HQ.inkMuted, marginTop: 2 }}>
                Allow this workspace&apos;s talents to be booked without an
                approval step (config only — no booking flow changes this wave).
              </span>
            </span>
          </label>

          <div style={{ display: "flex", gap: 8, marginTop: 2 }}>
            <Btn tone="primary" onClick={save} disabled={pending}>
              {pending ? "Saving…" : "Save terms"}
            </Btn>
            {hasOverride && (
              <Btn tone="danger" onClick={clearAll} disabled={pending}>
                Clear override
              </Btn>
            )}
          </div>
        </div>

        <Feedback msg={msg} />
      </div>
    </Accordion>
  );
}
