"use client";

/**
 * Platform Admin — per-tenant commission override section.
 *
 * Shown inside the tenant management drawer + full page. Lets a platform
 * admin set/clear a per-tenant commission rate override and review any open
 * rate-change requests the workspace has submitted.
 */

import { useState, useTransition } from "react";
import { HQ, Chip } from "./hq-kit";
import {
  Accordion,
  Btn,
  ConfirmModal,
  Feedback,
  inputStyle,
  type SectionProps,
} from "./tenant-section-kit";
import {
  actionSetTenantCommissionOverride,
  actionClearTenantCommissionOverride,
  actionReviewCommissionRequest,
} from "./commission-actions";
import { useT } from "@/i18n/use-t";
import { interpolate } from "@/i18n/interpolate";

function bpsToDisplay(bps: number | null): string {
  if (bps === null) return "—";
  return `${(bps / 100).toFixed(2).replace(/\.?0+$/, "")}%`;
}

export function CommissionSection({ detail, onChanged, defaultOpen }: SectionProps) {
  const t = useT();
  const { commission } = detail;
  const { override, openRequest } = commission;

  const [takePct, setTakePct] = useState("");
  const [floorCents, setFloorCents] = useState("0");
  const [note, setNote] = useState("");
  const [reviewNote, setReviewNote] = useState("");
  const [showForm, setShowForm] = useState(!override);
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ tone: "ok" | "err"; text: string } | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);

  function run(fn: () => Promise<{ ok: boolean; error?: string }>, successText: string) {
    setMsg(null);
    start(async () => {
      const res = await fn();
      if (res.ok) {
        setMsg({ tone: "ok", text: successText });
        setReviewNote("");
        setNote("");
        await onChanged();
      } else {
        setMsg({ tone: "err", text: res.error ?? t("dashboard.platform.tenants.actionFailed") });
      }
    });
  }

  function handleSet() {
    const pct = parseFloat(takePct);
    if (!isFinite(pct) || pct < 0 || pct > 50) {
      setMsg({ tone: "err", text: t("dashboard.platform.tenants.takeRangeError") });
      return;
    }
    const floor = parseFloat(floorCents);
    if (!isFinite(floor) || floor < 0) {
      setMsg({ tone: "err", text: t("dashboard.platform.tenants.floorError") });
      return;
    }
    run(
      () =>
        actionSetTenantCommissionOverride({
          tenantId: detail.id,
          platformTakeBps: Math.round(pct * 100),
          platformTakeFloorCents: Math.round(floor),
          note: note.trim() || undefined,
        }),
      t("dashboard.platform.tenants.commissionSaved"),
    );
  }

  return (
    <Accordion
      title={t("dashboard.platform.tenants.sectionCommission")}
      trailing={
        override ? (
          <Chip bg={HQ.amberSoft} color={HQ.amber}>{t("dashboard.platform.tenants.overrideActiveChip")}</Chip>
        ) : openRequest ? (
          <Chip bg="rgba(155,168,183,0.15)" color={HQ.inkMuted}>{t("dashboard.platform.tenants.requestPending")}</Chip>
        ) : null
      }
      defaultOpen={defaultOpen ?? Boolean(override || openRequest)}
    >
      <div style={{ paddingTop: 8, display: "flex", flexDirection: "column", gap: 10 }}>
        {/* Safety warning */}
        <div
          style={{
            background: "rgba(240,180,97,0.07)",
            border: "1px solid rgba(240,180,97,0.22)",
            borderRadius: 9,
            padding: "8px 10px",
            fontSize: 11.5,
            color: HQ.amber,
          }}
        >
          ⚠ {t("dashboard.platform.tenants.commissionWarning")}
        </div>

        {/* Active override card */}
        {override && (
          <div
            style={{
              background: HQ.amberSoft,
              border: "1px solid rgba(240,180,97,0.25)",
              borderRadius: 10,
              padding: "10px 12px",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 12.5, color: HQ.ink, fontWeight: 600 }}>
                {interpolate(t("dashboard.platform.tenants.platformTake"), { value: bpsToDisplay(override.platformTakeBps) })}
              </span>
              {override.platformTakeFloorCents != null && override.platformTakeFloorCents > 0 && (
                <Chip outline>{interpolate(t("dashboard.platform.tenants.floor"), { value: `$${(override.platformTakeFloorCents / 100).toFixed(2)}` })}</Chip>
              )}
            </div>
            {override.overrideNote && (
              <div style={{ marginTop: 4, fontSize: 11.5, color: HQ.inkMuted }}>
                {override.overrideNote}
              </div>
            )}
            <div style={{ marginTop: 4, fontSize: 10.5, color: HQ.inkDim }}>
              {interpolate(t("dashboard.platform.tenants.setOn"), { date: override.setAt ? new Date(override.setAt).toLocaleDateString() : "—" })}
            </div>
            <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
              <Btn tone="danger" onClick={() => setConfirmClear(true)} disabled={pending}>
                {t("dashboard.platform.tenants.clearOverride")}
              </Btn>
              <Btn onClick={() => setShowForm((v) => !v)} disabled={pending}>
                {showForm ? t("dashboard.platform.tenants.cancel") : t("dashboard.platform.tenants.replace")}
              </Btn>
            </div>
          </div>
        )}

        {/* Set / replace form */}
        {showForm && (
          <div
            style={{
              padding: "10px 12px",
              background: HQ.cardSofter,
              border: `1px solid ${HQ.borderSoft}`,
              borderRadius: 10,
              display: "flex",
              flexDirection: "column",
              gap: 8,
            }}
          >
            <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: 0.6, textTransform: "uppercase", color: HQ.inkDim }}>
              {override ? t("dashboard.platform.tenants.replaceOverride") : t("dashboard.platform.tenants.setCommissionOverride")}
            </div>
            <label style={{ fontSize: 11, color: HQ.inkMuted }}>
              {t("dashboard.platform.tenants.platformTakePct")}
              <input type="number" min={0} max={50} step={0.01} value={takePct} disabled={pending}
                placeholder={t("dashboard.platform.tenants.platformTakePlaceholder")} onChange={(e) => setTakePct(e.target.value)}
                style={{ ...inputStyle, marginTop: 3 }} />
            </label>
            <label style={{ fontSize: 11, color: HQ.inkMuted }}>
              {t("dashboard.platform.tenants.floorCents")}
              <input type="number" min={0} step={1} value={floorCents} disabled={pending}
                onChange={(e) => setFloorCents(e.target.value)}
                style={{ ...inputStyle, marginTop: 3 }} />
            </label>
            <label style={{ fontSize: 11, color: HQ.inkMuted }}>
              {t("dashboard.platform.tenants.internalNoteOptional")}
              <input type="text" value={note} disabled={pending}
                onChange={(e) => setNote(e.target.value)}
                style={{ ...inputStyle, marginTop: 3 }} />
            </label>
            <Btn tone="primary" onClick={handleSet} disabled={pending}>
              {pending ? t("dashboard.platform.tenants.saving") : t("dashboard.platform.tenants.saveOverride")}
            </Btn>
            <p style={{ fontSize: 10.5, color: HQ.inkDim, margin: 0 }}>
              {t("dashboard.platform.tenants.commissionResolverNote")}
            </p>
          </div>
        )}

        {/* Open request review */}
        {openRequest && (
          <div
            style={{
              padding: "10px 12px",
              background: HQ.cardSofter,
              border: `1px solid ${HQ.borderSoft}`,
              borderRadius: 10,
              display: "flex",
              flexDirection: "column",
              gap: 8,
            }}
          >
            <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: 0.6, textTransform: "uppercase", color: HQ.amber }}>
              {t("dashboard.platform.tenants.openRateRequest")}
            </div>
            <div style={{ fontSize: 12.5, color: HQ.ink }}>
              {interpolate(t("dashboard.platform.tenants.requestingRate"), { value: bpsToDisplay(openRequest.requestedPlatformTakeBps) })}
            </div>
            {openRequest.requestedNote && (
              <div style={{ fontSize: 11.5, color: HQ.inkMuted }}>
                &ldquo;{openRequest.requestedNote}&rdquo;
              </div>
            )}
            {openRequest.requestedAt && (
              <div style={{ fontSize: 10.5, color: HQ.inkDim }}>
                {interpolate(t("dashboard.platform.tenants.submittedOn"), { date: new Date(openRequest.requestedAt).toLocaleDateString() })}
              </div>
            )}
            <label style={{ fontSize: 11, color: HQ.inkMuted }}>
              {t("dashboard.platform.tenants.reviewNoteOptional")}
              <input type="text" value={reviewNote} disabled={pending}
                placeholder={t("dashboard.platform.tenants.reviewNotePlaceholder")}
                onChange={(e) => setReviewNote(e.target.value)}
                style={{ ...inputStyle, marginTop: 3 }} />
            </label>
            <div style={{ display: "flex", gap: 8 }}>
              <Btn tone="primary" disabled={pending}
                onClick={() => run(
                  () => actionReviewCommissionRequest({
                    tenantId: detail.id,
                    decision: "approve",
                    platformTakeBps: openRequest.requestedPlatformTakeBps ?? undefined,
                    reviewNote,
                  }),
                  t("dashboard.platform.tenants.requestApproved"),
                )}
              >
                {t("dashboard.platform.tenants.approve")}
              </Btn>
              <Btn tone="danger" disabled={pending}
                onClick={() => run(
                  () => actionReviewCommissionRequest({ tenantId: detail.id, decision: "deny", reviewNote }),
                  t("dashboard.platform.tenants.requestDenied"),
                )}
              >
                {t("dashboard.platform.tenants.deny")}
              </Btn>
            </div>
          </div>
        )}

        {!override && !openRequest && !showForm && (
          <div style={{ fontSize: 12.5, color: HQ.inkMuted }}>
            {t("dashboard.platform.tenants.noOverrideDefault")}
            <div style={{ marginTop: 8 }}>
              <Btn onClick={() => setShowForm(true)}>{t("dashboard.platform.tenants.setOverride")}</Btn>
            </div>
          </div>
        )}

        <Feedback msg={msg} />
      </div>

      <ConfirmModal
        open={confirmClear}
        title={t("dashboard.platform.tenants.clearCommissionTitle")}
        body={interpolate(t("dashboard.platform.tenants.clearCommissionBody"), { workspace: detail.name })}
        confirmLabel={t("dashboard.platform.tenants.clearOverride")}
        pending={pending}
        onCancel={() => setConfirmClear(false)}
        onConfirm={() => {
          setConfirmClear(false);
          run(() => actionClearTenantCommissionOverride({ tenantId: detail.id }), t("dashboard.platform.tenants.overrideCleared"));
        }}
      />
    </Accordion>
  );
}
