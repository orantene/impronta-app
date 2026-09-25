"use client";

import { useState, useTransition } from "react";
import { TALENT_AGENDA_VARS } from "./primitives";
import { convertOwnTalentHold } from "@/lib/talent-agenda/convert-hold";
import { releaseOwnTalentHold } from "@/lib/talent-agenda/attention-actions";

/**
 * T8.3 / G0.2–G0.3 Hold flows — convert to confirmed booking or release.
 */
export function AgendaHoldFlows({
  holdId,
  title,
  onClose,
  onConverted,
  onReleased,
}: {
  holdId: string;
  title: string;
  onClose: () => void;
  onConverted?: () => void;
  onReleased?: () => void;
}) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<"convert" | "release" | null>(null);

  function handleConvert() {
    start(async () => {
      const res = await convertOwnTalentHold(holdId);
      if (res.ok) {
        setMsg("Hold converted to a confirmed booking.");
        onConverted?.();
      } else {
        setMsg(res.message ?? `Could not convert: ${res.reason}`);
      }
    });
  }

  function handleRelease() {
    start(async () => {
      const res = await releaseOwnTalentHold(holdId);
      if (res.ok) {
        setMsg("Hold released.");
        onReleased?.();
      } else {
        setMsg(`Release failed: ${res.reason}`);
      }
    });
  }

  return (
    <div style={TALENT_AGENDA_VARS} className="mx-auto max-w-[480px] space-y-4">
      <button
        type="button"
        onClick={onClose}
        aria-label="Close hold flows"
        className="min-h-[44px] px-1 text-[13px] text-[var(--tc-accent)]"
      >
        ← Back
      </button>
      <h1 className="text-[22px] font-semibold text-[var(--tc-primary)]">Hold: {title}</h1>

      <section className="space-y-3 rounded-2xl border border-black/8 bg-white p-4 text-[14px]">
        <p className="text-[#5F6368]">
          Convert to a confirmed booking (if the client pays) or release the hold to free
          the slot for others.
        </p>

        {confirming === null ? (
          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={() => setConfirming("convert")}
              aria-label="Convert hold to booking"
              className="min-h-[44px] flex-1 rounded-xl bg-[var(--tc-primary)] text-[13px] font-semibold text-white"
            >
              Convert to booking
            </button>
            <button
              type="button"
              onClick={() => setConfirming("release")}
              aria-label="Release this hold"
              className="min-h-[44px] flex-1 rounded-xl border border-[#B42318] text-[13px] font-semibold text-[#B42318]"
            >
              Release hold
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="font-medium text-[var(--tc-primary)]">
              {confirming === "convert"
                ? "Confirm: convert this hold to a booking?"
                : "Confirm: release this hold?"}
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setConfirming(null)}
                className="min-h-[44px] flex-1 rounded-xl border border-black/10 text-[13px]"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={pending}
                onClick={confirming === "convert" ? handleConvert : handleRelease}
                aria-label={confirming === "convert" ? "Confirm convert" : "Confirm release"}
                className={`min-h-[44px] flex-1 rounded-xl text-[13px] font-semibold text-white disabled:opacity-40 ${
                  confirming === "release" ? "bg-[#B42318]" : "bg-[var(--tc-primary)]"
                }`}
              >
                {pending ? "Working…" : "Confirm"}
              </button>
            </div>
          </div>
        )}
      </section>

      {msg && (
        <p aria-live="polite" className="text-center text-[13px] text-[#5F6368]">{msg}</p>
      )}
    </div>
  );
}
