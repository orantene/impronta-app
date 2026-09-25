"use client";

import { useState, useTransition } from "react";
import { TaskShell } from "./primitives/TaskShell";
import { proposeReschedule } from "@/lib/talent-agenda";
import { useAgendaCopy } from "./use-agenda-copy";

/** T8.4 / G3.4 Reschedule sheet in TaskShell. */
export function AgendaRescheduleSheet({
  bookingId,
  currentStartsAt,
  currentEndsAt,
  onClose,
  onProposed,
}: {
  bookingId: string;
  currentStartsAt?: string;
  currentEndsAt?: string;
  onClose: () => void;
  onProposed?: () => void;
}) {
  const copy = useAgendaCopy();
  const [date, setDate] = useState(
    currentStartsAt ? new Date(currentStartsAt).toISOString().slice(0, 10) : "",
  );
  const [startTime, setStartTime] = useState(
    currentStartsAt ? new Date(currentStartsAt).toTimeString().slice(0, 5) : "",
  );
  const [endTime, setEndTime] = useState(
    currentEndsAt ? new Date(currentEndsAt).toTimeString().slice(0, 5) : "",
  );
  const [fee, setFee] = useState("");
  const [pending, start] = useTransition();
  const [result, setResult] = useState<string | null>(null);

  const canSend = Boolean(date && startTime && endTime);

  function buildIso(d: string, t: string): string {
    return new Date(`${d}T${t}:00`).toISOString();
  }

  function handlePropose() {
    if (!canSend) return;
    start(async () => {
      const res = await proposeReschedule({
        bookingId,
        newStartsAt: buildIso(date, startTime),
        newEndsAt: buildIso(date, endTime),
        feeCents: Math.round(parseFloat(fee || "0") * 100),
      });
      if (res.ok) {
        setResult(copy.t("Reschedule request sent ✓"));
        onProposed?.();
      } else {
        setResult(`${copy.t("Failed")}: ${res.reason}`);
      }
    });
  }

  return (
    <TaskShell
      open
      onClose={onClose}
      title={copy.t("Propose reschedule")}
      primaryActionLabel={pending ? copy.t("Sending…") : copy.t("Send proposal")}
      onPrimaryAction={canSend ? handlePropose : undefined}
      secondaryActionLabel={copy.t("Back")}
    >
      <div className="space-y-4">
        <section className="space-y-3 rounded-2xl border border-black/8 bg-white p-4">
          <p className="text-[13px] text-[#5F6368]">
            {copy.t("The client will be notified and must accept before the booking moves.")}
          </p>

          <label className="block text-[13px]">
            <span className="mb-1 block font-medium">{copy.t("New date")}</span>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full rounded-xl border border-black/10 px-3 py-2"
            />
          </label>

          <div className="grid grid-cols-2 gap-2">
            <label className="block text-[13px]">
              <span className="mb-1 block font-medium">{copy.t("Start")}</span>
              <input
                type="time"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                className="w-full rounded-xl border border-black/10 px-3 py-2"
              />
            </label>
            <label className="block text-[13px]">
              <span className="mb-1 block font-medium">{copy.t("End")}</span>
              <input
                type="time"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
                className="w-full rounded-xl border border-black/10 px-3 py-2"
              />
            </label>
          </div>

          <label className="block text-[13px]">
            <span className="mb-1 block font-medium">{copy.t("Reschedule fee (optional)")}</span>
            <input
              type="number"
              min="0"
              step="0.01"
              placeholder="0.00"
              value={fee}
              onChange={(e) => setFee(e.target.value)}
              aria-label={copy.t("Reschedule fee (optional)")}
              className="w-full rounded-xl border border-black/10 px-3 py-2"
            />
            <span className="mt-1 block text-[12px] text-[#5F6368]">
              {copy.t("Leave at 0 to reschedule at no extra charge.")}
            </span>
          </label>
        </section>

        {result ? (
          <p
            aria-live="polite"
            className={`text-center text-[13px] ${result.includes("✓") ? "text-[#1F7A4C]" : "text-[#B42318]"}`}
          >
            {result}
          </p>
        ) : null}
      </div>
    </TaskShell>
  );
}
