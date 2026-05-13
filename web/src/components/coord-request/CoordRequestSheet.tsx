"use client";

/**
 * Coordinator-request sheet — talent → coord upgrade flow.
 *
 * Messages Consolidation Plan v2 — Slice G.
 *
 * Talent taps the locked Client sub-toggle in the Chat tab; this
 * sheet opens with a short pitch input. On submit, calls
 * requestCoordinatorJoin. Shows the existing pending state if one
 * already exists.
 */

import { useState, useTransition } from "react";
import { requestCoordinatorJoin, cancelCoordinatorJoin } from "@/lib/server-actions/coord-request-actions";

type Props = {
  inquiryId: string;
  /** When provided, shows the "you already have a pending request"
   *  state with a cancel button. */
  existingPendingRequestId?: string | null;
  /** Called when the sheet should be dismissed (success or cancel). */
  onClose: () => void;
};

export function CoordRequestSheet({ inquiryId, existingPendingRequestId, onClose }: Props) {
  const [pitch, setPitch] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState<boolean>(!!existingPendingRequestId);
  const [pending, startTransition] = useTransition();

  const submit = () => {
    setError(null);
    startTransition(async () => {
      const r = await requestCoordinatorJoin(inquiryId, pitch);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setSubmitted(true);
    });
  };

  const cancel = () => {
    if (!existingPendingRequestId) {
      onClose();
      return;
    }
    setError(null);
    startTransition(async () => {
      const r = await cancelCoordinatorJoin(existingPendingRequestId);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      onClose();
    });
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="coord-request-title"
      style={{
        position: "fixed", inset: 0, zIndex: 100,
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: 16,
        background: "rgba(11,11,13,0.5)",
        fontFamily: '"Inter", system-ui, sans-serif',
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        style={{
          width: "100%", maxWidth: 460,
          background: "#fff",
          borderRadius: 14,
          padding: 20,
          boxShadow: "0 20px 50px rgba(11,11,13,0.25)",
        }}
      >
        <h2
          id="coord-request-title"
          style={{
            margin: 0, marginBottom: 6,
            fontSize: 17, fontWeight: 700,
            color: "#0B0B0D",
            letterSpacing: -0.2,
          }}
        >
          {submitted ? "Request sent" : "Request to join as coordinator"}
        </h2>
        <p
          style={{
            margin: 0, marginBottom: 14,
            fontSize: 12.5, lineHeight: 1.5,
            color: "rgba(11,11,13,0.55)",
          }}
        >
          {submitted
            ? "Your request is pending. An existing coordinator, the workspace admin, or the client can approve. You'll see the Client thread unlock the moment one of them says yes."
            : "Coordinators talk to the client, run the lineup, and earn commission on the booking. A coordinator does not have to attend the event — they can manage and take their share regardless."}
        </p>

        {!submitted && (
          <>
            <label
              htmlFor="coord-request-pitch"
              style={{
                display: "block",
                fontSize: 11.5, fontWeight: 600,
                color: "rgba(11,11,13,0.55)",
                marginBottom: 4,
                textTransform: "uppercase",
                letterSpacing: 0.4,
              }}
            >
              Short pitch (optional)
            </label>
            <textarea
              id="coord-request-pitch"
              value={pitch}
              onChange={(e) => setPitch(e.target.value)}
              placeholder="e.g. I know this client / I can co-run with Sara / I'm closest to the venue"
              rows={4}
              style={{
                width: "100%",
                padding: "10px 12px",
                borderRadius: 10,
                border: "1px solid rgba(24,24,27,0.10)",
                fontFamily: '"Inter", system-ui, sans-serif',
                fontSize: 13, lineHeight: 1.5,
                color: "#0B0B0D",
                resize: "vertical",
                boxSizing: "border-box",
                outline: "none",
              }}
            />
          </>
        )}

        {error && (
          <div
            role="alert"
            style={{
              marginTop: 12, padding: "8px 12px",
              background: "rgba(214,89,89,0.10)",
              color: "#A33A3A",
              borderRadius: 8,
              fontSize: 12,
            }}
          >
            {error}
          </div>
        )}

        <div style={{
          marginTop: 18,
          display: "flex", gap: 8, justifyContent: "flex-end",
        }}>
          {submitted ? (
            <>
              <button
                type="button"
                onClick={cancel}
                disabled={pending}
                style={{
                  padding: "9px 16px", borderRadius: 9,
                  border: "1px solid rgba(24,24,27,0.12)",
                  background: "#fff", color: "#0B0B0D",
                  fontSize: 13, fontWeight: 600,
                  cursor: pending ? "wait" : "pointer",
                  fontFamily: '"Inter", system-ui, sans-serif',
                }}
              >
                {pending ? "Cancelling…" : "Cancel request"}
              </button>
              <button
                type="button"
                onClick={onClose}
                style={{
                  padding: "9px 16px", borderRadius: 9,
                  border: "none",
                  background: "#0F4F3E", color: "#fff",
                  fontSize: 13, fontWeight: 600,
                  cursor: "pointer",
                  fontFamily: '"Inter", system-ui, sans-serif',
                }}
              >
                Close
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={onClose}
                style={{
                  padding: "9px 16px", borderRadius: 9,
                  border: "1px solid rgba(24,24,27,0.12)",
                  background: "#fff", color: "#0B0B0D",
                  fontSize: 13, fontWeight: 600,
                  cursor: "pointer",
                  fontFamily: '"Inter", system-ui, sans-serif',
                }}
              >
                Not now
              </button>
              <button
                type="button"
                onClick={submit}
                disabled={pending}
                style={{
                  padding: "9px 16px", borderRadius: 9,
                  border: "none",
                  background: pending ? "rgba(15,79,62,0.6)" : "#0F4F3E",
                  color: "#fff",
                  fontSize: 13, fontWeight: 600,
                  cursor: pending ? "wait" : "pointer",
                  fontFamily: '"Inter", system-ui, sans-serif',
                }}
              >
                {pending ? "Sending…" : "Send request"}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
