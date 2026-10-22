"use client";

/**
 * TalentCancelBlock (TUL-832) - cancel / resume for a paid talent plan.
 *
 * Shows, inside TalentPlanCard:
 *   - while cancel_at_period_end: a banner "Your plan ends on <date>" with a
 *     Resume button;
 *   - otherwise a small "Cancel plan" link opening a short flow: reason, an
 *     honest "you keep your page on Free" offer when price is the reason, then
 *     confirm.
 *
 * It only calls the cancel / resume actions. It never writes plan state: the
 * webhook single writer does that, so the banner flips from the action result
 * (local state) and is re-confirmed by the next summary load.
 */

import { useState, useTransition } from "react";
import { cancelTalentPlan, resumeTalentPlan } from "./stripe-talent-actions";
import {
  TALENT_CANCEL_COPY as T,
  TALENT_CANCEL_REASONS,
  fillDate,
  pickCopy,
  resolveEndingState,
  type TalentCancelReason,
} from "@/lib/billing/talent-cancel";

const INK = "rgba(11,11,13,1)";
const MUTED = "rgba(11,11,13,0.72)";
const BORDER = "rgba(24,24,27,0.16)";
const ACCENT = "rgba(15,79,62,1)";
const DANGER = "rgba(163,58,58,1)";
const FONT = '"Inter", system-ui, sans-serif';

function formatDate(iso: string | null, es: boolean): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString(es ? "es-MX" : "en-US", { year: "numeric", month: "long", day: "numeric" });
}

const btn = (primary: boolean, destructive = false): React.CSSProperties => ({
  padding: "8px 12px",
  borderRadius: 9,
  fontFamily: FONT,
  fontSize: 12.5,
  fontWeight: 600,
  cursor: "pointer",
  border: primary ? "none" : `1px solid ${BORDER}`,
  background: primary ? (destructive ? DANGER : INK) : "rgba(24,24,27,0.03)",
  color: primary ? "rgba(255,255,255,1)" : INK,
});

type Step = "closed" | "reason" | "offer" | "confirm";

export function TalentCancelBlock({
  es,
  cancelAtPeriodEnd,
  currentPeriodEnd,
  onCompare,
  onChanged,
}: {
  es: boolean;
  cancelAtPeriodEnd: boolean;
  currentPeriodEnd: string | null;
  onCompare: () => void;
  /** Called after a successful cancel / resume so the card can reload. */
  onChanged: () => void;
}) {
  const [step, setStep] = useState<Step>("closed");
  const [reason, setReason] = useState<TalentCancelReason | null>(null);
  const [feedback, setFeedback] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [endsAt, setEndsAt] = useState<string | null>(null);
  const [local, setLocal] = useState<{ ending: boolean; summaryWas: boolean } | null>(null);
  const [pending, startTransition] = useTransition();

  const dateLabel = formatDate(endsAt ?? currentPeriodEnd, es);

  const resume = () =>
    startTransition(async () => {
      setError(null);
      const r = await resumeTalentPlan();
      // Server messages are English; the card speaks the page's language.
      if (!r.ok) return setError(pickCopy(T.actionFailed, es));
      setEndsAt(null);
      setLocal({ ending: false, summaryWas: cancelAtPeriodEnd });
      onChanged();
    });

  const submitCancel = () => {
    if (!reason) return;
    startTransition(async () => {
      setError(null);
      const r = await cancelTalentPlan({ reason, feedback: feedback.trim() || null });
      if (!r.ok) return setError(pickCopy(T.actionFailed, es));
      setEndsAt(r.effectiveAt ?? currentPeriodEnd ?? new Date().toISOString());
      setLocal({ ending: true, summaryWas: cancelAtPeriodEnd });
      setStep("closed");
      onChanged();
    });
  };

  const errorEl = error ? (
    <div role="alert" style={{ marginTop: 8, fontSize: 12, color: DANGER, fontFamily: FONT }}>{error}</div>
  ) : null;

  const ending = resolveEndingState(cancelAtPeriodEnd, local) || (local === null && endsAt !== null);
  if (ending) {
    return (
      <div data-testid="talent-plan-ends-banner" style={{ marginTop: 12, padding: "11px 13px", borderRadius: 10, background: "rgba(82,96,109,0.10)", fontFamily: FONT }}>
        <div style={{ fontSize: 12.5, fontWeight: 600, color: INK, lineHeight: 1.45 }}>
          {dateLabel ? fillDate(pickCopy(T.endsBanner, es), dateLabel) : pickCopy(T.endsBannerNoDate, es)}
        </div>
        <button type="button" onClick={resume} disabled={pending} style={{ ...btn(true), marginTop: 9, width: "100%", opacity: pending ? 0.6 : 1 }}>
          {pending ? pickCopy(T.resuming, es) : pickCopy(T.resumeCta, es)}
        </button>
        {errorEl}
      </div>
    );
  }

  if (step === "closed") {
    return (
      <div style={{ marginTop: 10 }}>
        <button
          type="button"
          onClick={() => { setStep("reason"); setError(null); }}
          style={{ background: "none", border: "none", padding: 0, fontFamily: FONT, fontSize: 12, color: MUTED, textDecoration: "underline", cursor: "pointer" }}
        >
          {pickCopy(T.cancelCta, es)}
        </button>
      </div>
    );
  }

  return (
    <div data-testid="talent-cancel-flow" style={{ marginTop: 12, padding: "13px", border: `1px solid ${BORDER}`, borderRadius: 10, fontFamily: FONT, color: INK }}>
      {step === "reason" && (
        <>
          <div style={{ fontSize: 14, fontWeight: 600 }}>{pickCopy(T.reasonTitle, es)}</div>
          <div style={{ fontSize: 12, color: MUTED, margin: "3px 0 8px" }}>{pickCopy(T.reasonIntro, es)}</div>
          <div role="radiogroup" style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {TALENT_CANCEL_REASONS.map((r) => (
              <label key={r} style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 12.5, cursor: "pointer" }}>
                <input type="radio" name="talent-cancel-reason" checked={reason === r} onChange={() => setReason(r)} />
                {pickCopy(T.reasons[r], es)}
              </label>
            ))}
          </div>
          <textarea
            value={feedback}
            onChange={(e) => setFeedback(e.target.value)}
            maxLength={500}
            placeholder={pickCopy(T.feedbackPlaceholder, es)}
            style={{ marginTop: 10, width: "100%", minHeight: 54, fontFamily: FONT, fontSize: 12.5, border: `1px solid ${BORDER}`, borderRadius: 8, padding: 8 }}
          />
          {errorEl}
          <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
            <button type="button" style={btn(false)} onClick={() => setStep("closed")}>{pickCopy(T.neverMind, es)}</button>
            <button
              type="button"
              style={btn(true)}
              onClick={() => {
                if (!reason) return setError(pickCopy(T.pickReason, es));
                setError(null);
                setStep(reason === "too_expensive" ? "offer" : "confirm");
              }}
            >
              {pickCopy(T.continue, es)}
            </button>
          </div>
        </>
      )}

      {step === "offer" && (
        <>
          <div style={{ fontSize: 14, fontWeight: 600 }}>{pickCopy(T.offerTitle, es)}</div>
          <p style={{ fontSize: 12.5, color: MUTED, lineHeight: 1.5, margin: "4px 0 0" }}>{pickCopy(T.offerBody, es)}</p>
          <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
            <button type="button" style={btn(false)} onClick={() => setStep("reason")}>{pickCopy(T.back, es)}</button>
            <button type="button" style={{ ...btn(false), color: ACCENT }} onClick={onCompare}>{pickCopy(T.comparePlans, es)}</button>
            <button type="button" style={btn(true)} onClick={() => setStep("confirm")}>{pickCopy(T.cancelAnyway, es)}</button>
          </div>
        </>
      )}

      {step === "confirm" && (
        <>
          <div style={{ fontSize: 14, fontWeight: 600 }}>{pickCopy(T.confirmTitle, es)}</div>
          <p style={{ fontSize: 12.5, color: MUTED, lineHeight: 1.5, margin: "4px 0 0" }}>
            {dateLabel ? fillDate(pickCopy(T.confirmBody, es), dateLabel) : pickCopy(T.confirmBodyNoDate, es)}
          </p>
          {errorEl}
          <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
            <button type="button" style={btn(false)} onClick={() => setStep("reason")}>{pickCopy(T.back, es)}</button>
            <button type="button" style={{ ...btn(true, true), opacity: pending ? 0.6 : 1 }} disabled={pending} onClick={submitCancel}>
              {pending ? pickCopy(T.cancelling, es) : pickCopy(T.confirmCta, es)}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
