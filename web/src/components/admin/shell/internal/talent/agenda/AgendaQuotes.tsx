"use client";

import { useState, useTransition } from "react";
import { TaskShell } from "./primitives/TaskShell";
import { createOwnEventQuote, createOwnProjectQuote } from "@/lib/talent-agenda/create-quote";
import { useAgendaCopy } from "./use-agenda-copy";

/** T7.2 / G2.2 / A1.4 / A2 Event quote — saves a draft inquiry + offer; optional date hold. */
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
  const copy = useAgendaCopy();
  const [what, setWhat] = useState("");
  const [date, setDate] = useState("");
  const [hold, setHold] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const canSave = Boolean(what.trim() && date && !pending);

  function handleSave() {
    if (!canSave) return;
    start(async () => {
      const res = await createOwnEventQuote({
        what: what.trim(),
        eventDate: date,
        holdDate: hold,
      });
      if (!res.ok) {
        setStatus(res.message ?? `${copy.t("Could not save draft")}: ${res.reason}`);
        return;
      }
      setStatus(
        hold
          ? copy.t(
              "Draft saved. Date blocked while the draft is out. Nothing else is reserved until accepted.",
            )
          : copy.t("Draft saved. Nothing is reserved until the quote is accepted."),
      );
      onSent?.();
    });
  }

  return (
    <TaskShell
      open
      onClose={onCancel}
      title={title === "New event quote" ? copy.t("New event quote") : title}
      primaryActionLabel={pending ? copy.t("Working…") : copy.t("Save draft")}
      onPrimaryAction={canSave ? handleSave : undefined}
      secondaryActionLabel={copy.t("Cancel")}
    >
      <section className="space-y-3 rounded-2xl border border-black/8 bg-white p-4">
        <label className="block text-[13px]">
          {copy.t("What")}
          <input
            className="mt-1 w-full rounded-xl border border-black/10 px-3 py-2"
            value={what}
            onChange={(e) => setWhat(e.target.value)}
          />
        </label>
        <label className="block text-[13px]">
          {copy.t("Event date")}
          <input
            type="date"
            className="mt-1 w-full rounded-xl border border-black/10 px-3 py-2"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </label>
        <label className="flex min-h-[44px] items-center gap-2 text-[14px]">
          <input type="checkbox" checked={hold} onChange={(e) => setHold(e.target.checked)} />
          {copy.t("Hold this date for a few days")}
        </label>
        <p className="text-[13px] text-[#5F6368]">
          {hold
            ? copy.t(
                "Saves a draft only. No client email is sent. Nothing is reserved until accepted, except the optional hold. Other requests still show.",
              )
            : copy.t(
                "Saves a draft only. No client email is sent. Nothing is reserved until accepted.",
              )}
        </p>
      </section>
      {status ? <p className="text-[13px] text-[#5F6368]">{status}</p> : null}
    </TaskShell>
  );
}

/** T7.3 / G2.2 / A1.4 / A2 Project quote — draft booking + deliverables with due_at. No appointment. */
export function AgendaProjectQuote({
  onCancel,
  onSent,
}: {
  onCancel: () => void;
  onSent?: () => void;
}) {
  const copy = useAgendaCopy();
  const [what, setWhat] = useState("");
  const [deliverables, setDeliverables] = useState("");
  const [due, setDue] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const canSave = Boolean(what.trim() && !pending);

  function handleSave() {
    if (!canSave) return;
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
        setStatus(res.message ?? `${copy.t("Could not save draft")}: ${res.reason}`);
        return;
      }
      setStatus(
        copy.t(
          "Project draft saved. Due dates appear on your calendar. No appointment was created. No client email was sent.",
        ),
      );
      onSent?.();
    });
  }

  const draftNote = due
    ? `${copy.t("Saves a draft only. No appointment is created. Due dates appear in your calendar all-day row once saved.")} (${copy.t("target")} ${due})`
    : copy.t(
        "Saves a draft only. No appointment is created. Due dates appear in your calendar all-day row once saved.",
      );

  return (
    <TaskShell
      open
      onClose={onCancel}
      title={copy.t("New project quote")}
      primaryActionLabel={pending ? copy.t("Working…") : copy.t("Save draft")}
      onPrimaryAction={canSave ? handleSave : undefined}
      secondaryActionLabel={copy.t("Cancel")}
    >
      <section className="space-y-3 rounded-2xl border border-black/8 bg-white p-4">
        <label className="block text-[13px]">
          {copy.t("What")}
          <input
            className="mt-1 w-full rounded-xl border border-black/10 px-3 py-2"
            value={what}
            onChange={(e) => setWhat(e.target.value)}
          />
        </label>
        <label className="block text-[13px]">
          {copy.t("Deliverables")}
          <textarea
            className="mt-1 w-full rounded-xl border border-black/10 px-3 py-2"
            value={deliverables}
            onChange={(e) => setDeliverables(e.target.value)}
          />
        </label>
        <label className="block text-[13px]">
          {copy.t("Due date")}
          <input
            type="date"
            className="mt-1 w-full rounded-xl border border-black/10 px-3 py-2"
            value={due}
            onChange={(e) => setDue(e.target.value)}
          />
        </label>
        <p className="rounded-xl bg-[#f5f5f0] p-3 text-[13px] text-[#5F6368]">{draftNote}</p>
      </section>
      {status ? <p className="text-[13px] text-[#5F6368]">{status}</p> : null}
    </TaskShell>
  );
}
