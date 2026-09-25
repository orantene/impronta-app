"use client";

import { useState, useTransition } from "react";
import { TALENT_AGENDA_VARS } from "./primitives";
import { proposeReschedule } from "@/lib/talent-agenda";

/**
 * T8.4 Reschedule sheet — talent proposes a new time slot.
 * Writes a `booking_reschedule_requests` row via proposeReschedule.
 */
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

  const canSend = date && startTime && endTime;

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
        setResult("Reschedule request sent ✓");
        onProposed?.();
      } else {
        setResult(`Failed: ${res.reason}`);
      }
    });
  }

  return (
    <div style={TALENT_AGENDA_VARS} className="mx-auto max-w-[480px] space-y-4">
      <button
        type="button"
        onClick={onClose}
        aria-label="Close reschedule sheet"
        className="min-h-[44px] px-1 text-[13px] text-[var(--tc-accent)]"
      >
        ← Back
      </button>
      <h1 className="text-[22px] font-semibold text-[var(--tc-primary)]">Propose reschedule</h1>

      <section className="space-y-3 rounded-2xl border border-black/8 bg-white p-4">
        <p className="text-[13px] text-[#5F6368]">
          The client will be notified and must accept before the booking moves.
        </p>

        <label className="block text-[13px]">
          <span className="mb-1 block font-medium">New date</span>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            aria-label="New booking date"
            className="w-full rounded-xl border border-black/10 px-3 py-2"
          />
        </label>

        <div className="grid grid-cols-2 gap-2">
          <label className="block text-[13px]">
            <span className="mb-1 block font-medium">Start</span>
            <input
              type="time"
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
              aria-label="New start time"
              className="w-full rounded-xl border border-black/10 px-3 py-2"
            />
          </label>
          <label className="block text-[13px]">
            <span className="mb-1 block font-medium">End</span>
            <input
              type="time"
              value={endTime}
              onChange={(e) => setEndTime(e.target.value)}
              aria-label="New end time"
              className="w-full rounded-xl border border-black/10 px-3 py-2"
            />
          </label>
        </div>

        <label className="block text-[13px]">
          <span className="mb-1 block font-medium">Reschedule fee (optional)</span>
          <input
            type="number"
            min="0"
            step="0.01"
            placeholder="0.00"
            value={fee}
            onChange={(e) => setFee(e.target.value)}
            aria-label="Reschedule fee in USD"
            className="w-full rounded-xl border border-black/10 px-3 py-2"
          />
          <span className="mt-1 block text-[12px] text-[#5F6368]">
            Leave at $0 to reschedule at no extra charge.
          </span>
        </label>
      </section>

      {result && (
        <p
          aria-live="polite"
          className={`text-center text-[13px] ${result.includes("✓") ? "text-[#1F7A4C]" : "text-[#B42318]"}`}
        >
          {result}
        </p>
      )}

      <button
        type="button"
        disabled={!canSend || pending}
        onClick={handlePropose}
        aria-label="Send reschedule proposal"
        className="min-h-[44px] w-full rounded-xl bg-[var(--tc-primary)] text-[14px] font-semibold text-white disabled:opacity-40"
      >
        {pending ? "Sending…" : "Send proposal"}
      </button>
    </div>
  );
}
