"use client";

import { useState, useTransition } from "react";
import { createOwnSlotBooking } from "@/lib/talent-agenda/create-slot";
import { TALENT_AGENDA_VARS } from "./primitives";

/**
 * T8.5 Rebook suggestion — after a cancelled booking, offer the client a new slot.
 */
export function AgendaRebookSuggestion({
  cancelledBookingId,
  clientName,
  onClose,
  onSent,
}: {
  cancelledBookingId?: string;
  clientName?: string;
  onClose: () => void;
  onSent?: () => void;
}) {
  const [date, setDate] = useState("");
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [note, setNote] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const canSend = Boolean(date && startTime && endTime && clientName?.trim());

  function handleSend() {
    if (!canSend || !clientName) return;
    start(async () => {
      const startsAt = new Date(`${date}T${startTime}:00`).toISOString();
      const endsAt = new Date(`${date}T${endTime}:00`).toISOString();
      const result = await createOwnSlotBooking({
        clientName,
        title: note.trim() || `Rebook · ${clientName}`,
        startsAt,
        endsAt,
        paymentChoice: "due_later",
      });
      if (!result.ok) {
        setStatus(result.message ?? "Could not rebook. Try another time.");
        return;
      }
      void cancelledBookingId;
      setStatus("Rebook saved. The client has not been told yet.");
      onSent?.();
    });
  }

  return (
    <div style={TALENT_AGENDA_VARS} className="mx-auto max-w-[480px] space-y-4">
      <button
        type="button"
        onClick={onClose}
        className="min-h-[44px] px-1 text-[13px] text-[var(--tc-accent)]"
      >
        ← Back
      </button>
      <h1 className="text-[22px] font-semibold text-[var(--tc-primary)]">
        Rebook {clientName ?? "client"}
      </h1>
      <section className="space-y-3 rounded-2xl border border-black/8 bg-white p-4">
        <label className="block text-[13px]">
          Date
          <input type="date" className="mt-1 w-full rounded-xl border border-black/10 px-3 py-2" value={date} onChange={(e) => setDate(e.target.value)} />
        </label>
        <div className="grid grid-cols-2 gap-2">
          <label className="block text-[13px]">
            Starts
            <input type="time" className="mt-1 w-full rounded-xl border border-black/10 px-3 py-2" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
          </label>
          <label className="block text-[13px]">
            Ends
            <input type="time" className="mt-1 w-full rounded-xl border border-black/10 px-3 py-2" value={endTime} onChange={(e) => setEndTime(e.target.value)} />
          </label>
        </div>
        <label className="block text-[13px]">
          Note
          <input className="mt-1 w-full rounded-xl border border-black/10 px-3 py-2" value={note} onChange={(e) => setNote(e.target.value)} />
        </label>
      </section>
      {status ? <p className="text-[13px] text-[#5F6368]">{status}</p> : null}
      <button
        type="button"
        disabled={!canSend || pending}
        onClick={() => void handleSend()}
        className="min-h-[44px] w-full rounded-xl bg-[var(--tc-primary)] text-[14px] font-semibold text-white disabled:opacity-40"
      >
        {pending ? "Saving…" : "Save rebook"}
      </button>
    </div>
  );
}
