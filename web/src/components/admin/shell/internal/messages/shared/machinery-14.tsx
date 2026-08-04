"use client";

import React, { useState, useEffect, useTransition, useRef } from "react";
import { useRouter } from "next/navigation";
import { useT } from "@/i18n/use-t";
import { interpolate } from "@/i18n/interpolate";
import { uploadInquiryAttachmentSigned } from "@/lib/client/signed-upload";
import { loadInquiryAttachments, deleteInquiryAttachment, uploadInquiryAttachment, duplicateInquiryBooking, type InquiryAttachment } from "@/app/(workspace)/[tenantSlug]/admin/_pipeline-actions";
import { useAdminShell, FONTS, COLORS, RICH_INQUIRIES } from "../../state";
import { type Conversation } from "../../talent";
import { BreakdownRow } from "../client-1";
import { currentTalentId } from "../messages-shared";
import { UNIT_TYPE_LABEL, UNIT_TYPE_LABEL_KEYS, fmtMoney } from "./machinery-10";
import { PanelSkeleton, ghostBtn, primaryBtn } from "./machinery-13";
import { FilesTab } from "./machinery-15";
import type { Offer, UnitType } from "./machinery-9";

// ── SubmitRateSheet ──
// Real submit-rate flow that ties to the inquiry's pricing. Replaces
// the prior `toast("Submit your rate…")` stub. Shows:
//   • Inquiry context (client + brief + dates)
//   • Client budget banner (the cap they posted) — drives unit-type
//     default so the talent's quote lines up cleanly with the cap
//   • Unit-type picker (hour / day / contract / event)
//   • Units count + rate input — live take-home preview underneath
//     deducts the agency fee + 5% platform fee from the gross
//   • Notes field for any conditions ("usage clearance", "travel covered")
//   • Submit → toasts the result + closes; in production this writes
//     to offer.rows[mine] + emits a timeline event + flips offer.stage
//     to talent_submitted (or coordinator_review when last to submit).
//
// Mode: "submit" (first time) | "edit" (already submitted, change rate
// before client sees). Visual difference: "edit" pre-fills the existing
// numbers and labels the CTA "Update rate".
export function SubmitRateSheet({
  open, onClose, conv, offer, mode = "submit", onSubmit,
}: {
  open: boolean;
  onClose: () => void;
  conv: Conversation;
  offer: Offer;
  mode?: "submit" | "edit";
  /** Called after the user hits Submit. Caller writes the rate into
   *  its local override state so the row appears as "submitted" in
   *  the offer tab (instead of staying "pending" forever). */
  onSubmit?: (data: { unitType: UnitType; units: number; amount: number; notes: string }) => void;
}) {
  const { toast } = useAdminShell();
  const t = useT();
  const myTalentId = currentTalentId();
  const myRow = offer.rows.find(r => r.talentId === myTalentId);
  const budget = offer.clientBudget;
  const currency = budget?.currency ?? "USD";

  // Default unit type — match the client's budget unit so the talent's
  // number lines up with the cap (€/day vs €/day, not €/day vs €/hour).
  // If editing, keep what the row already has. If submitting fresh, use
  // the budget's unit type. Falls back to "day" — the most common.
  const initialUnit: UnitType = (myRow?.costRate && mode === "edit"
    ? myRow.unitType
    : budget?.unitType) ?? "day";
  const initialUnits = myRow?.units ?? 1;
  // Default amount — for fresh submits, suggest the budget cap × 0.85
  // (an "I'll quote slightly under the cap to leave room for usage").
  // For edits, pre-fill the talent's existing rate.
  const suggestedAmount = mode === "edit" && myRow?.costRate
    ? myRow.costRate
    : budget
      ? Math.round(budget.amount * 0.85 / 50) * 50
      : 0;

  const [unitType, setUnitType] = useState<UnitType>(initialUnit);
  const [units, setUnits] = useState<number>(initialUnits);
  const [amount, setAmount] = useState<number>(suggestedAmount);
  const [notes, setNotes] = useState<string>(myRow?.notes ?? "");

  // Reset form when sheet (re)opens — handles closing + reopening for
  // a different conv without leaking state across submissions.
  useEffect(() => {
    if (open) {
      setUnitType(initialUnit);
      setUnits(initialUnits);
      setAmount(suggestedAmount);
      setNotes(myRow?.notes ?? "");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional: reset form when sheet opens for same or different conv; initialUnit/initialUnits/suggestedAmount/myRow are stable initial values for this open cycle
  }, [open, conv.id]);

  // Live take-home preview. Mirrors the math the talent shell uses
  // elsewhere: gross × (1 − 0.15 agency commission − 0.05 platform).
  // Agency commission rate is a workspace setting in production —
  // hardcoded 15% here to match the breakdown shown in the header
  // take-home pill (single source of truth for the demo).
  const gross = (amount || 0) * (units || 0);
  const agencyFee = gross * 0.15;
  const platformFee = gross * 0.05;
  const takeHome = gross - agencyFee - platformFee;

  // Compare the gross against the client cap. When the talent quotes
  // above the cap we surface a soft warning so they know they're
  // entering negotiation territory.
  const overBudget = budget && budget.amount > 0 && amount > budget.amount;

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t("dashboard.adminTabs.rateSheet.ariaSubmit")}
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, zIndex: 200,
        background: "rgba(11,11,13,0.45)",
        display: "flex", alignItems: "flex-end", justifyContent: "center",
        animation: "tulala-rate-fade .18s cubic-bezier(.4,0,.2,1)",
      }}
    >
      <style dangerouslySetInnerHTML={{ __html:
        "@keyframes tulala-rate-fade{from{opacity:0}to{opacity:1}}"
        + "@keyframes tulala-rate-up{from{transform:translateY(20px);opacity:0}to{transform:translateY(0);opacity:1}}"
        + "@media (min-width: 720px){.tulala-rate-sheet{margin-bottom:auto!important;margin-top:auto!important;border-radius:14px!important;max-width:480px!important;}}"
      }} />
      <div
        className="tulala-rate-sheet"
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "#fff",
          width: "100%",
          maxWidth: 540,
          maxHeight: "92vh",
          borderRadius: "16px 16px 0 0",
          padding: "16px 18px 20px",
          display: "flex", flexDirection: "column", gap: 14,
          fontFamily: FONTS.body,
          overflowY: "auto",
          marginBottom: 0,
          animation: "tulala-rate-up .24s cubic-bezier(.32,.72,0,1)",
          boxShadow: "0 -10px 40px rgba(11,11,13,0.18)",
        }}
      >
        {/* Header — title + close */}
        <div className="flex items-center gap-3">
          <div className="flex-1">
            <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: 0.5, textTransform: "uppercase" }} className="text-admin-ink-muted">
              {mode === "edit" ? t("dashboard.adminTabs.rateSheet.editEyebrow") : t("dashboard.adminTabs.rateSheet.submitEyebrow")}
            </div>
            <div style={{ fontSize: 16, fontWeight: 700, marginTop: 2, lineHeight: 1.25 }} className="text-admin-ink">
              {conv.client} · {conv.brief}
            </div>
            <div style={{ fontSize: 11.5, marginTop: 2 }} className="text-admin-ink-muted">
              {[conv.date, conv.location?.split(" · ")[0]].filter(Boolean).join(" · ")}
            </div>
          </div>
          <button
            type="button" onClick={onClose} aria-label={t("dashboard.adminTabs.rateSheet.close")}
            style={{
              flexShrink: 0,
              width: 32, height: 32, borderRadius: "50%",
              border: "none", background: "rgba(11,11,13,0.05)",
              color: COLORS.inkMuted, cursor: "pointer",
              display: "inline-flex", alignItems: "center", justifyContent: "center",
            }}
          >
            <svg width="13" height="13" viewBox="0 0 14 14" fill="none">
              <path d="M3.5 3.5l7 7M10.5 3.5l-7 7" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"/>
            </svg>
          </button>
        </div>

        {/* Client budget banner — the cap they posted, shown so the
            talent quotes against a known reference. Includes the
            client's note if they left one ("negotiable on usage", etc.). */}
        {budget && (
          <div style={{ padding: "10px 12px", borderRadius: 10, border: `1px solid rgba(91,107,160,0.18)` }} className="bg-admin-indigo-soft">
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 0.4, textTransform: "uppercase" }} className="text-admin-indigo-deep">
              {t("dashboard.adminTabs.rateSheet.budgetCap")}
            </div>
            <div style={{ fontSize: 16, fontWeight: 700, marginTop: 2, fontVariantNumeric: "tabular-nums" }} className="text-admin-ink">
              {fmtMoney(budget.amount, currency)}{" "}
              <span className="text-admin-ink-muted text-xs font-medium">
                {t(UNIT_TYPE_LABEL_KEYS[budget.unitType])}
              </span>
            </div>
            {budget.note && (
              <div style={{ fontSize: 11.5, marginTop: 4, fontStyle: "italic" }} className="text-admin-ink-muted">
                &quot;{budget.note}&quot;
              </div>
            )}
          </div>
        )}

        {/* Role — read-only, set by the coordinator on the lineup row */}
        {myRow?.role && (
          <div>
            <FieldLabel>{t("dashboard.adminTabs.rateSheet.yourRole")}</FieldLabel>
            <div style={{ padding: "9px 11px", borderRadius: 8, fontSize: 13, fontWeight: 500 }} className="bg-admin-surface-alt text-admin-ink">
              {myRow.role}
            </div>
          </div>
        )}

        {/* Unit-type picker — defaults to client's. Talent can switch
            (e.g. quote in days when client's cap was per-hour) but the
            mismatch shows in the comparison label. */}
        <div>
          <FieldLabel>{t("dashboard.adminTabs.rateSheet.unitType")}</FieldLabel>
          <div style={{
            display: "grid", gap: 6,
            gridTemplateColumns: "repeat(4, 1fr)",
          }}>
            {(["hour", "day", "contract", "event"] as UnitType[]).map(u => {
              const active = unitType === u;
              const matchesBudget = budget?.unitType === u;
              // Discriminant->label: switch on the raw UnitType union; resolve
              // the picker label via t(). Keeps enum logic stable.
              const pickerKey: Record<UnitType, string> = {
                hour: "dashboard.adminTabs.rateSheet.pickerHour",
                day: "dashboard.adminTabs.rateSheet.pickerDay",
                contract: "dashboard.adminTabs.rateSheet.pickerContract",
                event: "dashboard.adminTabs.rateSheet.pickerEvent",
              };
              return (
                <button
                  key={u}
                  type="button"
                  onClick={() => setUnitType(u)}
                  style={{
                    padding: "8px 6px", borderRadius: 8,
                    border: `1.5px solid ${active ? COLORS.accent : COLORS.borderSoft}`,
                    background: active ? COLORS.accentSoft : "#fff",
                    color: active ? COLORS.accentDeep : COLORS.ink,
                    fontFamily: FONTS.body, fontSize: 12, fontWeight: 600,
                    cursor: "pointer", textAlign: "center",
                    textTransform: "capitalize",
                    position: "relative",
                  }}
                >
                  {t(pickerKey[u])}
                  {matchesBudget && (
                    <span style={{
                      position: "absolute", top: 3, right: 4,
                      width: 5, height: 5, borderRadius: "50%",
                      background: COLORS.indigoDeep,
                    }} title={t("dashboard.adminTabs.rateSheet.matchesBudget")} />
                  )}
                </button>
              );
            })}
          </div>
          {budget && unitType !== budget.unitType && (
            <div style={{ fontSize: 11, color: COLORS.amber, marginTop: 6 }}>
              ⚠ {interpolate(t("dashboard.adminTabs.rateSheet.unitMismatch"), { unit: t(UNIT_TYPE_LABEL_KEYS[budget.unitType]) })}
            </div>
          )}
        </div>

        {/* Units count + rate amount — side-by-side */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1.4fr", gap: 10 }}>
          <div>
            <FieldLabel>{unitType === "contract" ? t("dashboard.adminTabs.rateSheet.length") : t("dashboard.adminTabs.rateSheet.quantity")}</FieldLabel>
            <div style={{
              display: "flex", alignItems: "center", gap: 0,
              border: `1.5px solid ${COLORS.border}`, borderRadius: 10,
              background: "#fff", overflow: "hidden",
            }}>
              <button
                type="button"
                onClick={() => setUnits(Math.max(1, units - 1))}
                aria-label={t("dashboard.adminTabs.rateSheet.decrease")}
                style={{
                  width: 36, height: 38, border: "none", background: "transparent",
                  color: COLORS.inkMuted, cursor: "pointer",
                  fontSize: 16, fontWeight: 600,
                }}
              >−</button>
              <input
                type="number" min={1} value={units}
                onChange={(e) => setUnits(Math.max(1, parseInt(e.target.value || "1", 10)))}
                style={{
                  flex: 1, minWidth: 0, height: 38,
                  border: "none", outline: "none", background: "transparent",
                  textAlign: "center", fontSize: 14, fontWeight: 700, color: COLORS.ink,
                  fontFamily: FONTS.body, fontVariantNumeric: "tabular-nums",
                }}
              />
              <button
                type="button"
                onClick={() => setUnits(units + 1)}
                aria-label={t("dashboard.adminTabs.rateSheet.increase")}
                style={{
                  width: 36, height: 38, border: "none", background: "transparent",
                  color: COLORS.inkMuted, cursor: "pointer",
                  fontSize: 16, fontWeight: 600,
                }}
              >+</button>
            </div>
            <div style={{ fontSize: 10.5, marginTop: 4, textAlign: "center" }} className="text-admin-ink-dim">
              {interpolate(t("dashboard.adminTabs.rateSheet.unitTimes"), { unit: t(UNIT_TYPE_LABEL_KEYS[unitType]) })}
            </div>
          </div>
          <div>
            <FieldLabel>{interpolate(t("dashboard.adminTabs.rateSheet.yourRate"), { symbol: currency === "EUR" ? "€" : currency === "USD" ? "$" : "£" })}</FieldLabel>
            <div style={{
              display: "flex", alignItems: "center", gap: 0,
              border: `1.5px solid ${overBudget ? COLORS.amber : COLORS.border}`, borderRadius: 10,
              background: "#fff", paddingLeft: 12,
              transition: "border-color .12s",
            }}>
              <span className="text-admin-ink-muted text-sm font-semibold">
                {currency === "EUR" ? "€" : currency === "USD" ? "$" : "£"}
              </span>
              <input
                type="number" min={0} step={50} value={amount}
                onChange={(e) => setAmount(Math.max(0, parseInt(e.target.value || "0", 10)))}
                placeholder="0"
                style={{
                  flex: 1, minWidth: 0, height: 38,
                  border: "none", outline: "none", background: "transparent",
                  paddingLeft: 6,
                  fontSize: 18, fontWeight: 700, color: COLORS.ink,
                  fontFamily: FONTS.body, fontVariantNumeric: "tabular-nums",
                }}
              />
            </div>
            {overBudget && budget && (
              <div style={{ fontSize: 10.5, marginTop: 4, fontWeight: 600 }} className="text-admin-amber">
                ⚠ {interpolate(t("dashboard.adminTabs.rateSheet.overCap"), { amount: fmtMoney(amount - budget.amount, currency) })}
              </div>
            )}
          </div>
        </div>

        {/* Notes — optional usage / conditions */}
        <div>
          <FieldLabel>{t("dashboard.adminTabs.rateSheet.conditions")} <span style={{ fontWeight: 400 }} className="text-admin-ink-muted">{t("dashboard.adminTabs.rateSheet.optional")}</span></FieldLabel>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder={t("dashboard.adminTabs.rateSheet.conditionsPlaceholder")}
            rows={2}
            style={{
              width: "100%", minHeight: 56, padding: 10,
              border: `1.5px solid ${COLORS.border}`, borderRadius: 10,
              background: "#fff", outline: "none", resize: "vertical",
              fontFamily: FONTS.body, fontSize: 12.5, color: COLORS.ink,
              boxSizing: "border-box",
            }}
          />
        </div>

        {/* Live take-home breakdown — gross → fees → net. Always
            visible so the talent sees what they'll actually take home
            BEFORE they submit. */}
        <div style={{ padding: "12px 14px", borderRadius: 10, border: `1px solid ${COLORS.borderSoft}` }} className="bg-admin-surface-alt">
          <BreakdownRow label={interpolate(t("dashboard.adminTabs.rateSheet.grossLine"), { units, unit: t(UNIT_TYPE_LABEL_KEYS[unitType]) })} value={fmtMoney(gross, currency)} muted />
          <BreakdownRow label={t("dashboard.adminTabs.rateSheet.agencyCommission")} value={`-${fmtMoney(agencyFee, currency)}`} muted />
          <BreakdownRow label={t("dashboard.adminTabs.rateSheet.platformFee")} value={`-${fmtMoney(platformFee, currency)}`} muted />
          <div style={{ height: 1, background: COLORS.borderSoft, margin: "6px 0" }} />
          <BreakdownRow label={t("dashboard.adminTabs.rateSheet.yourTakeHome")} value={fmtMoney(takeHome, currency)} bold />
          <div style={{ fontSize: 10.5, marginTop: 6 }} className="text-admin-ink-muted">
            {t("dashboard.adminTabs.rateSheet.releasedAfterWrap")}
          </div>
        </div>

        {/* Submit + cancel */}
        <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
          <button
            type="button" onClick={onClose}
            style={{
              padding: "10px 16px", borderRadius: 999,
              background: "transparent", border: `1px solid ${COLORS.border}`,
              color: COLORS.ink, cursor: "pointer",
              fontFamily: FONTS.body, fontSize: 13, fontWeight: 600,
            }}
          >{t("dashboard.adminTabs.rateSheet.cancel")}</button>
          <button
            type="button"
            disabled={amount <= 0}
            onClick={() => {
              // Hand the form data back to the caller so the local
              // override store can flip the row to "submitted" with
              // these numbers — without onSubmit it's just a toast,
              // but with onSubmit the offer tab updates immediately.
              onSubmit?.({ unitType, units, amount, notes });
              toast(mode === "edit"
                ? interpolate(t("dashboard.adminTabs.rateSheet.rateUpdatedToast"), { amount: fmtMoney(gross, currency), unit: t(UNIT_TYPE_LABEL_KEYS[unitType]) })
                : interpolate(t("dashboard.adminTabs.rateSheet.rateSubmittedToast"), { amount: fmtMoney(gross, currency), unit: t(UNIT_TYPE_LABEL_KEYS[unitType]) }));
              onClose();
            }}
            style={{
              flex: 1,
              padding: "10px 16px", borderRadius: 999,
              background: amount > 0 ? COLORS.accent : "rgba(11,11,13,0.10)",
              border: "none",
              color: amount > 0 ? "#fff" : COLORS.inkDim,
              cursor: amount > 0 ? "pointer" : "default",
              fontFamily: FONTS.body, fontSize: 13, fontWeight: 700,
            }}
          >
            {mode === "edit" ? t("dashboard.adminTabs.rateSheet.updateRate") : t("dashboard.adminTabs.rateSheet.submitToCoordinator")}
          </button>
        </div>
      </div>
    </div>
  );
}

export function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: 0.4, textTransform: "uppercase", marginBottom: 6 }} className="text-admin-ink-muted">
      {children}
    </div>
  );
}

export function RateField({ label, value, editable }: { label: string; value: string; editable?: boolean }) {
  return (
    <div>
      <div style={{ fontSize: 10, fontWeight: 600, marginBottom: 3 }} className="text-admin-ink-dim">
        {label}
      </div>
      <div style={{
        padding: "6px 10px", borderRadius: 7,
        border: `1px solid ${editable ? COLORS.border : "transparent"}`,
        background: editable ? "#fff" : "rgba(11,11,13,0.03)",
        fontSize: 12.5, fontWeight: 600, color: editable ? COLORS.ink : COLORS.inkMuted,
      }}>{value}</div>
    </div>
  );
}

// RI-XXX ↔ cN — admin shell uses RICH_INQUIRIES (RI ids) but the talent
// shell + file fixtures key off Conversation ids (c1-c10). Same job,
// two id schemes during the prototype era. This resolver gives every
// lookup a fallback so admin sees the same files the talent does.
export const RI_TO_CONV_ALIAS: Record<string, string> = {
  "RI-201": "c1",   // Mango
  "RI-202": "c3",   // Vogue Italia (RI-202.client = Vogue Italia)
  "RI-203": "c2",   // Bvlgari
};
export function resolveFileKey(id: string): string {
  return RI_TO_CONV_ALIAS[id] ?? id;
}

/**
 * Live files panel — lists real `inquiry_attachments` rows from DB at the
 * top of FilesTab when an inquiry has any. Soft-delete via the bin button.
 * Renders nothing when there are no real attachments (mock list still shows).
 */
export function LiveFilesPanel({ inquiryId }: { inquiryId: string }) {
  const { toast, effectiveTenant } = useAdminShell();
  const t = useT();
  // Latest-`t` ref so the reload callback resolves the current-locale
  // translator without listing `t` (fresh each render) as an effect dep.
  const tRef = useRef(t);
  useEffect(() => { tRef.current = t; }, [t]);
  const [files, setFiles] = useState<InquiryAttachment[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [pending, startTransition] = useTransition();
  // Step 14 — kind selector for staff uploads so mood boards / contracts /
  // references / other get a tag at upload time. Default "mood_board"
  // matches the common case of a new inquiry landing with reference
  // imagery from the client.
  const [selectedKind, setSelectedKind] = useState<
    "mood_board" | "contract" | "reference" | "other"
  >("mood_board");
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(inquiryId);

  const reload = React.useCallback(() => {
    if (!isUuid) { setLoading(false); return; }
    setLoading(true);
    loadInquiryAttachments(effectiveTenant.slug, inquiryId)
      .then((r) => {
        if (r.ok) setFiles(r.data ?? []);
        else toast(interpolate(tRef.current("dashboard.adminTabs.files.loadFailed"), { error: r.error }));
      })
      .finally(() => setLoading(false));
  }, [inquiryId, isUuid, effectiveTenant.slug, toast]);

  useEffect(() => { reload(); }, [reload]);

  if (!isUuid) return null;
  // C9 — loading skeleton on files panel hydrate.
  if (loading || !files) {
    return (
      <div data-live-files-loading style={{ padding: 14, fontFamily: FONTS.body }}>
        <PanelSkeleton lines={2} />
      </div>
    );
  }
  // Even with zero files, render so the upload affordance is reachable.

  const remove = (id: string, name: string) => {
    if (!confirm(interpolate(t("dashboard.adminTabs.files.deleteConfirm"), { name }))) return;
    startTransition(async () => {
      const r = await deleteInquiryAttachment(effectiveTenant.slug, id);
      if (!r.ok) toast(interpolate(t("dashboard.adminTabs.files.deleteFailed"), { error: r.error }));
      else { toast(t("dashboard.adminTabs.files.fileDeleted")); reload(); }
    });
  };

  const onPickFile = (file: File) => {
    if (file.size > 100 * 1024 * 1024) { toast(t("dashboard.adminTabs.files.fileOver100")); return; }
    startTransition(async () => {
      // try/catch is load-bearing: a thrown action (e.g. the 4 MB Server
      // Action body cap on the legacy path) would otherwise escape the
      // transition with no toast at all.
      try {
        // Signed PUT direct to storage first — the legacy FormData action
        // rejects anything over 4 MB before it even runs.
        const fast = await uploadInquiryAttachmentSigned({
          inquiryId,
          file,
          attachmentKind: selectedKind,
        });
        if (fast.ok) { toast(t("dashboard.adminTabs.files.fileUploaded")); reload(); return; }
        if (!fast.fallbackToLegacy) {
          toast(interpolate(t("dashboard.adminTabs.files.uploadFailed"), { error: fast.error }));
          return;
        }
        const fd = new FormData();
        fd.set("inquiryId", inquiryId);
        fd.set("file", file);
        fd.set("attachmentKind", selectedKind);
        const r = await uploadInquiryAttachment(fd);
        if (!r.ok) toast(interpolate(t("dashboard.adminTabs.files.uploadFailed"), { error: r.error }));
        else { toast(t("dashboard.adminTabs.files.fileUploaded")); reload(); }
      } catch (err) {
        toast(interpolate(t("dashboard.adminTabs.files.uploadFailed"), {
          error: err instanceof Error ? err.message : String(err),
        }));
      }
    });
  };

  return (
    <div style={{ border: `1px solid ${COLORS.borderSoft}`, padding: 12, marginBottom: 12, fontFamily: FONTS.body, fontSize: 12 }} className="bg-admin-surface-alt rounded-admin-md">
      <div className="flex items-center gap-2 mb-2">
        <span style={{ fontWeight: 700 }} className="text-admin-ink">
          {interpolate(t("dashboard.adminTabs.files.liveDbBacked"), { count: files.length })}
        </span>
        <span className="text-admin-ink-muted text-admin-11">
          inquiry_attachments
        </span>
        <span style={{ flex: 1 }} />
        {/* Step 14 — kind selector. Picks the role of the file BEFORE
            the file picker opens so admins don't lose context. */}
        <select
          value={selectedKind}
          onChange={(e) =>
            setSelectedKind(
              e.target.value as
                | "mood_board"
                | "contract"
                | "reference"
                | "other",
            )
          }
          aria-label={t("dashboard.adminTabs.files.attachmentKind")}
          style={{
            border: `1px solid ${COLORS.borderSoft}`,
            borderRadius: 6,
            padding: "4px 6px",
            fontSize: 11.5,
            color: COLORS.ink,
            background: "#fff",
          }}
        >
          <option value="mood_board">{t("dashboard.adminTabs.files.kindMoodBoard")}</option>
          <option value="reference">{t("dashboard.adminTabs.files.kindReference")}</option>
          <option value="contract">{t("dashboard.adminTabs.files.kindContract")}</option>
          <option value="other">{t("dashboard.adminTabs.files.kindOther")}</option>
        </select>
        <input
          ref={fileInputRef}
          type="file"
          style={{ display: "none" }}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onPickFile(f);
            e.target.value = "";
          }}
        />
        <button
          type="button"
          disabled={pending}
          onClick={() => fileInputRef.current?.click()}
          style={primaryBtn(COLORS.accent)}
        >
          {pending ? t("dashboard.adminTabs.files.uploading") : t("dashboard.adminTabs.files.uploadFile")}
        </button>
      </div>
      <div className="flex flex-col gap-1.5">
        {files.length === 0 && (
          <div style={{ fontSize: 11, padding: "4px 0" }} className="text-admin-ink-muted">
            {t("dashboard.adminTabs.files.noFilesYet")}
          </div>
        )}
        {files.map((f) => (
          <div key={f.id} style={{
            display: "flex", alignItems: "center", gap: 10,
            padding: "8px 10px", background: "#fff",
            border: `1px solid ${COLORS.borderSoft}`, borderRadius: 8,
          }}>
            <div className="flex-1 min-w-0">
              <div style={{ display: "flex", alignItems: "center", gap: 6, whiteSpace: "nowrap", overflow: "hidden" }}>
                <span style={{ fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", minWidth: 0 }} className="text-admin-ink">
                  {f.filename}
                </span>
                {/* Step 14 — attachment kind chip when the row has a tag. */}
                {f.attachmentKind && (
                  <span style={{ flexShrink: 0, fontSize: 9.5, fontWeight: 700, padding: "1px 6px", borderRadius: 999, letterSpacing: 0.3, textTransform: "uppercase" }} className="bg-admin-indigo-soft text-admin-indigo-deep">
                    {f.attachmentKind === "mood_board" ? t("dashboard.adminTabs.files.chipMood") :
                     f.attachmentKind === "reference" ? t("dashboard.adminTabs.files.chipRef") :
                     f.attachmentKind === "contract" ? t("dashboard.adminTabs.files.chipContract") :
                     t("dashboard.adminTabs.files.chipOther")}
                  </span>
                )}
              </div>
              <div className="text-admin-ink-muted text-admin-11">
                {f.byteSize != null ? `${Math.round(f.byteSize / 1024)} KB · ` : ""}
                {f.visibility}
                {f.description ? ` · ${f.description}` : ""}
              </div>
            </div>
            <button
              type="button"
              disabled={pending}
              onClick={() => remove(f.id, f.filename)}
              style={{
                padding: "5px 10px", borderRadius: 6,
                background: "transparent", border: `1px solid ${COLORS.border}`,
                color: COLORS.coralDeep, cursor: pending ? "wait" : "pointer",
                fontSize: 11, fontWeight: 600,
              }}
            >{t("dashboard.adminTabs.files.delete")}</button>
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * LiveBookingActions — bookings-related real DB actions exposed in the
 * Booking/Project tab. Currently: Duplicate booking. Renders nothing for
 * synthetic mock inquiry ids, or for inquiries that have not yet been
 * converted to a booking — duplicating a not-yet-booked inquiry would
 * create a confusing ghost row.
 *
 * 2026-05-12 fix S0.6: gated behind inquiry stage. Booking-only actions
 * must not surface before a booking exists.
 */
export function LiveBookingActions({
  inquiryId,
  inquiryStage,
}: {
  inquiryId: string;
  inquiryStage: string;
}) {
  const { toast, effectiveTenant } = useAdminShell();
  const t = useT();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(inquiryId);
  if (!isUuid) return null;
  // Booking actions are only meaningful once an inquiry has been converted
  // (status: booked / converted) or after it wrapped — never on submitted /
  // coordination / offer_pending / approved.
  const stage = (inquiryStage ?? "").toLowerCase();
  const hasBooking = stage === "booked" || stage === "converted" || stage === "wrapped";
  if (!hasBooking) return null;

  const dup = () => {
    if (!confirm(t("dashboard.adminTabs.bookingActions.duplicateConfirm"))) return;
    startTransition(async () => {
      const r = await duplicateInquiryBooking(effectiveTenant.slug, inquiryId);
      if (!r.ok) toast(interpolate(t("dashboard.adminTabs.bookingActions.duplicateFailed"), { error: r.error }));
      else { toast(t("dashboard.adminTabs.bookingActions.duplicated")); router.refresh(); }
    });
  };

  return (
    <div style={{ border: `1px solid ${COLORS.borderSoft}`, padding: 10, marginTop: 12, display: "flex", alignItems: "center", gap: 10, fontFamily: FONTS.body, fontSize: 12 }} className="bg-admin-surface-alt rounded-admin-md">
      <span style={{ fontWeight: 700 }} className="text-admin-ink">{t("dashboard.adminTabs.bookingActions.title")}</span>
      <span style={{ flex: 1 }} />
      <button
        type="button"
        disabled={pending}
        onClick={dup}
        style={ghostBtn()}
      >
        {pending ? t("dashboard.adminTabs.bookingActions.duplicating") : t("dashboard.adminTabs.bookingActions.duplicate")}
      </button>
    </div>
  );
}
