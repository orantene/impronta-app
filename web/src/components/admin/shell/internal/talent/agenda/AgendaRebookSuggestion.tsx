"use client";

import { useState, useTransition } from "react";
import { createOwnSlotBooking } from "@/lib/talent-agenda/create-slot";
import { TaskShell } from "./primitives/TaskShell";
import { useAgendaCopy } from "./use-agenda-copy";

/**
 * T8.5 / A2 Rebook suggestion — after a cancelled booking, offer the client a new slot.
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
  const copy = useAgendaCopy();
  const [date, setDate] = useState("");
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [note, setNote] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const canSend = Boolean(date && startTime && endTime && clientName?.trim() && !pending);

  function handleSend() {
    if (!canSend || !clientName) return;
    start(async () => {
      const startsAt = new Date(`${date}T${startTime}:00`).toISOString();
      const endsAt = new Date(`${date}T${endTime}:00`).toISOString();
      const result = await createOwnSlotBooking({
        clientName,
        title: note.trim() || `${copy.t("Rebook")} · ${clientName}`,
        startsAt,
        endsAt,
        paymentChoice: "due_later",
      });
      if (!result.ok) {
        setStatus(result.message ?? copy.t("Could not rebook. Try another time."));
        return;
      }
      void cancelledBookingId;
      setStatus(copy.t("Rebook saved. The client has not been told yet."));
      onSent?.();
    });
  }

  const titleClient = clientName?.trim() || copy.t("client");

  return (
    <TaskShell
      open
      onClose={onClose}
      title={`${copy.t("Rebook")} ${titleClient}`}
      primaryActionLabel={pending ? copy.t("Saving…") : copy.t("Save rebook")}
      onPrimaryAction={canSend ? handleSend : undefined}
      secondaryActionLabel={copy.t("Back")}
    >
      <section className="space-y-3 rounded-2xl border border-black/8 bg-white p-4">
        <label className="block text-[13px]">
          {copy.t("Date")}
          <input
            type="date"
            className="mt-1 w-full rounded-xl border border-black/10 px-3 py-2"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </label>
        <div className="grid grid-cols-2 gap-2">
          <label className="block text-[13px]">
            {copy.t("Starts")}
            <input
              type="time"
              className="mt-1 w-full rounded-xl border border-black/10 px-3 py-2"
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
            />
          </label>
          <label className="block text-[13px]">
            {copy.t("Ends")}
            <input
              type="time"
              className="mt-1 w-full rounded-xl border border-black/10 px-3 py-2"
              value={endTime}
              onChange={(e) => setEndTime(e.target.value)}
            />
          </label>
        </div>
        <label className="block text-[13px]">
          {copy.t("Note")}
          <input
            className="mt-1 w-full rounded-xl border border-black/10 px-3 py-2"
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </label>
      </section>
      {status ? <p className="text-[13px] text-[#5F6368]">{status}</p> : null}
    </TaskShell>
  );
}
