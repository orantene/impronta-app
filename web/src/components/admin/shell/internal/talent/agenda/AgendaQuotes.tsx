"use client";

import { useState, useTransition } from "react";
import { createTalentAvailabilityBlock } from "@/lib/talent-calendar/actions";
import { TALENT_AGENDA_VARS } from "./primitives";

/** T7.2 Event quote composer (chef / dancer). Optional prep/hold as a calendar block. */
export function AgendaEventQuote({
  title = "New event quote",
  talentProfileId,
  onCancel,
  onSent,
}: {
  title?: string;
  talentProfileId?: string;
  onCancel: () => void;
  onSent?: () => void;
}) {
  const [what, setWhat] = useState("");
  const [date, setDate] = useState("");
  const [hold, setHold] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function handleSend() {
    if (!what.trim()) return;
    start(async () => {
      if (hold && talentProfileId && date) {
        const starts = new Date(`${date}T10:00:00`);
        const ends = new Date(`${date}T18:00:00`);
        const res = await createTalentAvailabilityBlock({
          talentProfileId,
          reason: `Event hold · ${what.trim()}`,
          note: "Optional date hold while the quote is out. Other requests still show.",
          startsAt: starts.toISOString(),
          endsAt: ends.toISOString(),
          allDay: false,
        });
        if (!res.ok) {
          setStatus(res.error ?? "Could not hold the date.");
          return;
        }
        setStatus("Quote ready. Date blocked while the quote is out. Nothing else is reserved until accepted.");
      } else {
        setStatus(
          "Nothing is reserved until the quote is accepted. Send the quote from Messages when ready.",
        );
      }
      onSent?.();
    });
  }

  return (
    <div style={TALENT_AGENDA_VARS} className="mx-auto max-w-[720px] space-y-4">
      <button type="button" onClick={onCancel} className="text-[13px] text-[var(--tc-accent)]">
        {"<"} Calendar
      </button>
      <h1 className="text-[24px] font-semibold">{title}</h1>
      <section className="space-y-3 rounded-2xl border border-black/8 bg-white p-4">
        <label className="block text-[13px]">
          What
          <input className="mt-1 w-full rounded-xl border border-black/10 px-3 py-2" value={what} onChange={(e) => setWhat(e.target.value)} />
        </label>
        <label className="block text-[13px]">
          Event date
          <input type="date" className="mt-1 w-full rounded-xl border border-black/10 px-3 py-2" value={date} onChange={(e) => setDate(e.target.value)} />
        </label>
        <label className="flex items-center gap-2 text-[14px]">
          <input type="checkbox" checked={hold} onChange={(e) => setHold(e.target.checked)} />
          Hold this date for a few days
        </label>
        <p className="text-[13px] text-[#5F6368]">
          Nothing is reserved until the quote is accepted
          {hold ? ", except the optional hold. Other requests still show." : "."}
        </p>
      </section>
      {status ? <p className="text-[13px] text-[#5F6368]">{status}</p> : null}
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onCancel} className="rounded-full px-4 py-2 text-[13px]">Cancel</button>
        <button
          type="button"
          disabled={!what.trim() || pending || (hold && !date)}
          onClick={() => void handleSend()}
          className="rounded-full bg-[var(--tc-primary)] px-4 py-2 text-[13px] text-white disabled:opacity-40"
        >
          {pending ? "Working…" : "Send quote"}
        </button>
      </div>
    </div>
  );
}

/** T7.3 Project quote composer (designer). No appointment is created. */
export function AgendaProjectQuote({
  onCancel,
  onSent,
}: {
  onCancel: () => void;
  onSent?: () => void;
}) {
  const [what, setWhat] = useState("");
  const [deliverables, setDeliverables] = useState("");
  const [due, setDue] = useState("");
  const [status, setStatus] = useState<string | null>(null);

  return (
    <div style={TALENT_AGENDA_VARS} className="mx-auto max-w-[720px] space-y-4">
      <button type="button" onClick={onCancel} className="text-[13px] text-[var(--tc-accent)]">
        {"<"} Calendar
      </button>
      <h1 className="text-[24px] font-semibold">New project quote</h1>
      <section className="space-y-3 rounded-2xl border border-black/8 bg-white p-4">
        <label className="block text-[13px]">
          What
          <input className="mt-1 w-full rounded-xl border border-black/10 px-3 py-2" value={what} onChange={(e) => setWhat(e.target.value)} />
        </label>
        <label className="block text-[13px]">
          Deliverables
          <textarea className="mt-1 w-full rounded-xl border border-black/10 px-3 py-2" value={deliverables} onChange={(e) => setDeliverables(e.target.value)} />
        </label>
        <label className="block text-[13px]">
          Due date
          <input type="date" className="mt-1 w-full rounded-xl border border-black/10 px-3 py-2" value={due} onChange={(e) => setDue(e.target.value)} />
        </label>
        <p className="rounded-xl bg-[#f5f5f0] p-3 text-[13px] text-[#5F6368]">
          No appointment is created. Due dates appear in your calendar all-day row once the project booking exists
          {due ? ` (target ${due})` : ""}.
        </p>
      </section>
      {status ? <p className="text-[13px] text-[#5F6368]">{status}</p> : null}
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onCancel} className="rounded-full px-4 py-2 text-[13px]">Cancel</button>
        <button
          type="button"
          disabled={!what.trim()}
          onClick={() => {
            void deliverables;
            setStatus("Project quote drafted. Attach deliverables on the booking after the client accepts.");
            onSent?.();
          }}
          className="rounded-full bg-[var(--tc-primary)] px-4 py-2 text-[13px] text-white disabled:opacity-40"
        >
          Send quote
        </button>
      </div>
    </div>
  );
}
