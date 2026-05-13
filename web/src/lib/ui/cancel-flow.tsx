"use client";

import { useState } from "react";
import {
  cancelSubscription,
  pauseSubscription,
  type CancelReason,
} from "@/lib/server-actions/cancel-subscription";

/**
 * F.6 — Cancel / downgrade flow component.
 *
 * Three-step UI:
 *   1. Reason picker — radio list of categorical reasons
 *   2. Win-back — "Pause for 1 month instead?" CTA when reason ∈
 *      {paused_business, too_expensive}
 *   3. Confirmation — irreversible action, shows what'll change
 *
 * Drop-in usage from settings → Plan section:
 *
 *   <CancelFlow currentPlan="agency" onComplete={() => closeDrawer()} />
 */

const REASONS: { value: CancelReason; label: string; sub?: string }[] = [
  { value: "too_expensive",     label: "Too expensive",            sub: "We're between budgets right now" },
  { value: "not_using",         label: "Not using it enough",      sub: "Activity dropped off" },
  { value: "missing_feature",   label: "Missing a feature I need", sub: "Tell us what's missing below" },
  { value: "found_alternative", label: "Found another tool",       sub: "We'd like to hear which" },
  { value: "paused_business",   label: "Pausing my business",      sub: "Coming back later? Try pause first" },
  { value: "technical_issue",   label: "Technical issue",          sub: "Something keeps breaking" },
  { value: "other",             label: "Other",                    sub: "Tell us in your own words" },
];

const C = {
  ink: "#0B0B0D",
  inkMuted: "rgba(11,11,13,0.55)",
  inkDim: "rgba(11,11,13,0.38)",
  border: "rgba(24,24,27,0.10)",
  surface: "rgba(11,11,13,0.025)",
  accent: "#0F4F3E",
  danger: "#A33A3A",
  warning: "#92400E",
  warningBg: "rgba(146,64,14,0.08)",
};

const FONT = '"Inter", system-ui, sans-serif';

export type CancelFlowProps = {
  currentPlan: "free" | "studio" | "agency" | "network" | string;
  /** Called after a successful submission. */
  onComplete?: (result: { kind: "cancelled" | "paused"; toPlan?: string }) => void;
  /** Called when the user backs out. */
  onCancel?: () => void;
};

type Step = "reason" | "winback" | "confirm";

export function CancelFlow({ currentPlan, onComplete, onCancel }: CancelFlowProps) {
  const [step, setStep] = useState<Step>("reason");
  const [reason, setReason] = useState<CancelReason | null>(null);
  const [feedback, setFeedback] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const winbackEligible = reason === "paused_business" || reason === "too_expensive";

  const proceedFromReason = () => {
    if (!reason) {
      setError("Pick a reason so we can improve.");
      return;
    }
    setError(null);
    setStep(winbackEligible ? "winback" : "confirm");
  };

  const submitCancel = async () => {
    if (!reason) return;
    setSubmitting(true);
    setError(null);
    const r = await cancelSubscription({
      reason,
      feedback: feedback.trim() || null,
      toPlan: "free",
    });
    setSubmitting(false);
    if (!r.ok) {
      setError(r.error);
      return;
    }
    onComplete?.({ kind: "cancelled", toPlan: r.data.toPlan });
  };

  const submitPause = async () => {
    setSubmitting(true);
    setError(null);
    const pauseUntil = new Date(Date.now() + 30 * 86_400_000).toISOString();
    const r = await pauseSubscription(pauseUntil);
    setSubmitting(false);
    if (!r.ok) {
      setError(r.error);
      return;
    }
    onComplete?.({ kind: "paused" });
  };

  return (
    <div style={{ fontFamily: FONT, color: C.ink }}>
      {error ? (
        <div
          role="alert"
          style={{
            padding: "8px 12px",
            background: "rgba(163,58,58,0.08)",
            border: `1px solid rgba(163,58,58,0.25)`,
            borderRadius: 8,
            color: C.danger,
            fontSize: 12.5,
            marginBottom: 12,
          }}
        >
          {error}
        </div>
      ) : null}

      {step === "reason" && (
        <>
          <h3 style={{ fontSize: 18, fontWeight: 600, margin: "0 0 4px", letterSpacing: -0.2 }}>
            What&apos;s making you leave?
          </h3>
          <p style={{ fontSize: 13, color: C.inkMuted, lineHeight: 1.5, marginTop: 0 }}>
            We use this to improve the product. Pick the closest match — you can add detail below.
          </p>

          <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 16 }}>
            {REASONS.map((r) => {
              const checked = reason === r.value;
              return (
                <label
                  key={r.value}
                  style={{
                    display: "flex",
                    alignItems: "flex-start",
                    gap: 10,
                    padding: 12,
                    border: `1px solid ${checked ? C.accent : C.border}`,
                    background: checked ? "rgba(15,79,62,0.04)" : "#fff",
                    borderRadius: 10,
                    cursor: "pointer",
                  }}
                >
                  <input
                    type="radio"
                    name="cancel-reason"
                    value={r.value}
                    checked={checked}
                    onChange={() => setReason(r.value)}
                    style={{ marginTop: 2 }}
                  />
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600 }}>{r.label}</div>
                    {r.sub ? (
                      <div style={{ fontSize: 12, color: C.inkMuted, marginTop: 2 }}>{r.sub}</div>
                    ) : null}
                  </div>
                </label>
              );
            })}
          </div>

          <label
            style={{ display: "block", marginTop: 18, fontSize: 12.5, color: C.inkMuted, fontWeight: 500 }}
          >
            Anything else? (optional)
            <textarea
              value={feedback}
              onChange={(e) => setFeedback(e.currentTarget.value)}
              rows={3}
              placeholder="Tell us what'd make Tulala better"
              style={{
                width: "100%",
                marginTop: 6,
                padding: "9px 12px",
                fontSize: 13,
                fontFamily: FONT,
                border: `1px solid ${C.border}`,
                borderRadius: 8,
                background: "#fff",
                color: C.ink,
                resize: "vertical",
                minHeight: 76,
              }}
            />
          </label>

          <FlowButtons
            onCancel={onCancel}
            primaryLabel="Continue"
            onPrimary={proceedFromReason}
            primaryDisabled={!reason}
            destructive={false}
          />
        </>
      )}

      {step === "winback" && (
        <>
          <h3 style={{ fontSize: 18, fontWeight: 600, margin: "0 0 4px", letterSpacing: -0.2 }}>
            Try pausing for 30 days first?
          </h3>
          <p style={{ fontSize: 13, color: C.inkMuted, lineHeight: 1.6, marginTop: 0 }}>
            Your data stays put. Roster, inquiries, bookings, branding — all of it. Billing pauses for 30 days; auto-resume after that
            unless you cancel.
          </p>
          <div
            style={{
              marginTop: 16,
              padding: 14,
              background: C.warningBg,
              border: `1px solid ${C.warning}22`,
              borderRadius: 12,
            }}
          >
            <div style={{ fontSize: 13, fontWeight: 600, color: C.warning, marginBottom: 4 }}>
              Pause vs cancel
            </div>
            <ul style={{ fontSize: 12.5, color: C.ink, lineHeight: 1.6, marginTop: 4, paddingLeft: 16 }}>
              <li>Pause: data intact, billing stops 30 days, auto-resume</li>
              <li>Cancel: drop to Free, public site goes offline, custom domain disconnects</li>
            </ul>
          </div>
          <FlowButtons
            onCancel={() => setStep("reason")}
            cancelLabel="Back"
            primaryLabel={submitting ? "Pausing…" : "Pause 30 days"}
            onPrimary={submitPause}
            primaryDisabled={submitting}
            secondaryLabel="Cancel anyway"
            onSecondary={() => setStep("confirm")}
            destructive={false}
          />
        </>
      )}

      {step === "confirm" && (
        <>
          <h3 style={{ fontSize: 18, fontWeight: 600, margin: "0 0 4px", letterSpacing: -0.2 }}>
            Confirm cancellation
          </h3>
          <p style={{ fontSize: 13, color: C.inkMuted, lineHeight: 1.6, marginTop: 0 }}>
            You&apos;re moving from <strong style={{ color: C.ink, textTransform: "capitalize" }}>{currentPlan}</strong> to{" "}
            <strong style={{ color: C.ink }}>Free</strong>. Here&apos;s what changes:
          </p>
          <ul
            style={{
              fontSize: 13,
              color: C.ink,
              lineHeight: 1.6,
              marginTop: 12,
              paddingLeft: 20,
              listStyle: "disc",
            }}
          >
            <li>Custom domain disconnects (Tulala-managed subdomain still works)</li>
            <li>Public site pages stop publishing (drafts kept)</li>
            <li>Team seats cap drops to 5</li>
            <li>Brand kit + advanced analytics turn off</li>
            <li>Roster + inquiry history kept — nothing is deleted</li>
          </ul>
          <p style={{ fontSize: 12.5, color: C.inkMuted, marginTop: 14 }}>
            You can upgrade again any time and your data picks up where it left off.
          </p>
          <FlowButtons
            onCancel={() => setStep("reason")}
            cancelLabel="Back"
            primaryLabel={submitting ? "Cancelling…" : "Cancel my subscription"}
            onPrimary={submitCancel}
            primaryDisabled={submitting}
            destructive
          />
        </>
      )}
    </div>
  );
}

function FlowButtons({
  onCancel,
  cancelLabel = "Never mind",
  primaryLabel,
  onPrimary,
  primaryDisabled,
  destructive,
  secondaryLabel,
  onSecondary,
}: {
  onCancel?: () => void;
  cancelLabel?: string;
  primaryLabel: string;
  onPrimary: () => void;
  primaryDisabled?: boolean;
  destructive?: boolean;
  secondaryLabel?: string;
  onSecondary?: () => void;
}) {
  return (
    <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 22, flexWrap: "wrap" }}>
      {onCancel ? (
        <button
          type="button"
          onClick={onCancel}
          style={{
            padding: "9px 16px",
            fontFamily: FONT,
            fontSize: 13,
            fontWeight: 500,
            border: `1px solid ${C.border}`,
            background: "transparent",
            color: C.ink,
            borderRadius: 8,
            cursor: "pointer",
          }}
        >
          {cancelLabel}
        </button>
      ) : null}
      {secondaryLabel && onSecondary ? (
        <button
          type="button"
          onClick={onSecondary}
          style={{
            padding: "9px 16px",
            fontFamily: FONT,
            fontSize: 13,
            fontWeight: 500,
            border: `1px solid ${C.danger}33`,
            background: "transparent",
            color: C.danger,
            borderRadius: 8,
            cursor: "pointer",
          }}
        >
          {secondaryLabel}
        </button>
      ) : null}
      <button
        type="button"
        onClick={onPrimary}
        disabled={primaryDisabled}
        style={{
          padding: "9px 18px",
          fontFamily: FONT,
          fontSize: 13,
          fontWeight: 600,
          border: "none",
          background: destructive ? C.danger : C.accent,
          color: "#fff",
          borderRadius: 8,
          cursor: primaryDisabled ? "not-allowed" : "pointer",
          opacity: primaryDisabled ? 0.6 : 1,
        }}
      >
        {primaryLabel}
      </button>
    </div>
  );
}
