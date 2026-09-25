"use client";

import { useState, useTransition } from "react";
import { TaskShell } from "./primitives/TaskShell";
import { convertOwnTalentHold } from "@/lib/talent-agenda/convert-hold";
import { releaseOwnTalentHold } from "@/lib/talent-agenda/attention-actions";
import { useAgendaCopy } from "./use-agenda-copy";

/**
 * T8.3 / G0.2–G0.3 / G3.4 Hold flows in TaskShell.
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
  const copy = useAgendaCopy();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<"convert" | "release" | null>(null);

  function handleConvert() {
    start(async () => {
      const res = await convertOwnTalentHold(holdId);
      if (res.ok) {
        setMsg(copy.t("Hold converted to a confirmed booking."));
        onConverted?.();
      } else {
        setMsg(res.message ?? `${copy.t("Could not convert")}: ${res.reason}`);
      }
    });
  }

  function handleRelease() {
    start(async () => {
      const res = await releaseOwnTalentHold(holdId);
      if (res.ok) {
        setMsg(copy.t("Hold released."));
        onReleased?.();
      } else {
        setMsg(`${copy.t("Release failed")}: ${res.reason}`);
      }
    });
  }

  return (
    <TaskShell
      open
      onClose={onClose}
      title={`${copy.t("Hold")}: ${title}`}
      secondaryActionLabel={copy.t("Back")}
    >
      <div className="space-y-4">
        <section className="space-y-3 rounded-2xl border border-black/8 bg-white p-4 text-[14px]">
          <p className="text-[#5F6368]">
            {copy.t("Convert to a confirmed booking or release the hold to free the slot.")}
          </p>

          {confirming === null ? (
            <div className="flex gap-2 pt-1">
              <button
                type="button"
                onClick={() => setConfirming("convert")}
                className="min-h-[44px] flex-1 rounded-xl bg-[var(--tc-primary)] text-[13px] font-semibold text-white"
              >
                {copy.t("Convert to booking")}
              </button>
              <button
                type="button"
                onClick={() => setConfirming("release")}
                className="min-h-[44px] flex-1 rounded-xl border border-[#B42318] text-[13px] font-semibold text-[#B42318]"
              >
                {copy.t("Release hold")}
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="font-medium text-[var(--tc-primary)]">
                {confirming === "convert"
                  ? copy.t("Confirm: convert this hold to a booking?")
                  : copy.t("Confirm: release this hold?")}
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setConfirming(null)}
                  className="min-h-[44px] flex-1 rounded-xl border border-black/10 text-[13px]"
                >
                  {copy.t("Cancel")}
                </button>
                <button
                  type="button"
                  disabled={pending}
                  onClick={confirming === "convert" ? handleConvert : handleRelease}
                  className={`min-h-[44px] flex-1 rounded-xl text-[13px] font-semibold text-white disabled:opacity-40 ${
                    confirming === "release" ? "bg-[#B42318]" : "bg-[var(--tc-primary)]"
                  }`}
                >
                  {pending ? copy.t("Working…") : copy.t("Confirm")}
                </button>
              </div>
            </div>
          )}
        </section>

        {msg ? (
          <p aria-live="polite" className="text-center text-[13px] text-[#5F6368]">{msg}</p>
        ) : null}
      </div>
    </TaskShell>
  );
}
