"use client";

import { useState, useTransition } from "react";
import { TALENT_AGENDA_VARS } from "./primitives";
import { createOwnEventQuote, createOwnProjectQuote } from "@/lib/talent-agenda/create-quote";

/** T7.2 / G2.2 Event quote — writes draft inquiry + offer; optional date hold. */
export function AgendaEventQuote({
  title = "New event quote",
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
    if (!what.trim() || !date) return;
    start(async () => {
      const res = await createOwnEventQuote({
        what: what.trim(),
        eventDate: date,
        holdDate: hold,
      });
      if (!res.ok) {
        setStatus(res.message ?? `Could not save quote: ${res.reason}`);
        return;
      }
      setStatus(
        hold
          ? "Quote draft saved. Date blocked while the quote is out. Nothing else is reserved until accepted."
          : "Quote draft saved. Nothing is reserved until the quote is accepted.",
      );
      onSent?.();
    });
  }

  return (
    <div style={TALENT_AGENDA_VARS} className="mx-auto max-w-[720px] space-y-4">
      <button type="button" onClick={onCancel} className="min-h-[44px] text-[13px] text-[var(--tc-accent)]">
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
        <label className="flex min-h-[44px] items-center gap-2 text-[14px]">
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
        <button type="button" onClick={onCancel} className="min-h-[44px] rounded-full px-4 text-[13px]">Cancel</button>
        <button
          type="button"
          disabled={!what.trim() || !date || pending}
          onClick={() => void handleSend()}
          className="min-h-[44px] rounded-full bg-[var(--tc-primary)] px-4 text-[13px] text-white disabled:opacity-40"
        >
          {pending ? "Working…" : "Send quote"}
        </button>
      </div>
    </div>
  );
}

/** T7.3 / G2.2 Project quote — draft booking + deliverables with due_at. No appointment. */
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
  const [pending, start] = useTransition();

  function handleSend() {
    if (!what.trim()) return;
    start(async () => {
      const lines = deliverables
        .split("\n")
        .map((l) => l.trim())
        .filter(Boolean);
      const res = await createOwnProjectQuote({
        scope: what.trim(),
        dueDate: due || undefined,
        deliverables: lines.length > 0 ? lines : undefined,
      });
      if (!res.ok) {
        setStatus(res.message ?? `Could not save: ${res.reason}`);
        return;
      }
      setStatus(
        "Project quote drafted. Due dates appear on your calendar. No appointment was created.",
      );
      onSent?.();
    });
  }

  return (
    <div style={TALENT_AGENDA_VARS} className="mx-auto max-w-[720px] space-y-4">
      <button type="button" onClick={onCancel} className="min-h-[44px] text-[13px] text-[var(--tc-accent)]">
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
          No appointment is created. Due dates appear in your calendar all-day row once saved
          {due ? ` (target ${due})` : ""}.
        </p>
      </section>
      {status ? <p className="text-[13px] text-[#5F6368]">{status}</p> : null}
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onCancel} className="min-h-[44px] rounded-full px-4 text-[13px]">Cancel</button>
        <button
          type="button"
          disabled={!what.trim() || pending}
          onClick={() => void handleSend()}
          className="min-h-[44px] rounded-full bg-[var(--tc-primary)] px-4 text-[13px] text-white disabled:opacity-40"
        >
          {pending ? "Working…" : "Send quote"}
        </button>
      </div>
    </div>
  );
}
