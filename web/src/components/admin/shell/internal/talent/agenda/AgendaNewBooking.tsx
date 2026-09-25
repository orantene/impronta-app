"use client";

import { useMemo, useState } from "react";
import { resolveTradeProfile } from "@/lib/talent-agenda/trades";
import { createOwnSlotBooking } from "@/lib/talent-agenda/create-slot";
import { TALENT_AGENDA_VARS } from "./primitives";
import { AgendaEventQuote, AgendaProjectQuote } from "./AgendaQuotes";
import { useAgendaCopy } from "./use-agenda-copy";

type PayChoice = "received" | "due_later" | "request_link" | null;

/**
 * T7.1–T7.3 New booking / quote. Kind comes from TRADE_PROFILES.
 */
export function AgendaNewBooking({
  talentTypeSlug,
  talentProfileId,
  onCancel,
  onSaved,
}: {
  talentTypeSlug?: string | null;
  talentProfileId?: string;
  newLabel?: string;
  onCancel: () => void;
  onSaved?: () => void;
}) {
  const profile = resolveTradeProfile(talentTypeSlug);
  const newLabel = profile.words.newLabel[0];

  if (profile.kind === "event") {
    return (
      <AgendaEventQuote
        title={newLabel}
        talentProfileId={talentProfileId}
        onCancel={onCancel}
        onSent={onSaved}
      />
    );
  }
  if (profile.kind === "project") {
    return <AgendaProjectQuote onCancel={onCancel} onSent={onSaved} />;
  }

  return (
    <SlotComposer newLabel={newLabel} onCancel={onCancel} onSaved={onSaved} />
  );
}

function SlotComposer({
  newLabel,
  onCancel,
  onSaved,
}: {
  newLabel: string;
  onCancel: () => void;
  onSaved?: () => void;
}) {
  const copy = useAgendaCopy();
  const [clientName, setClientName] = useState("");
  const [service, setService] = useState("");
  const [date, setDate] = useState("");
  const [starts, setStarts] = useState("");
  const [ends, setEnds] = useState("");
  const [pay, setPay] = useState<PayChoice>(null);
  const [saving, setSaving] = useState(false);
  const [conflict, setConflict] = useState<string | null>(null);
  const [alternatives, setAlternatives] = useState<string[]>([]);
  const [savedNote, setSavedNote] = useState<string | null>(null);

  const canSave = useMemo(
    () => Boolean(clientName.trim() && service.trim() && date && starts && ends && pay) && !saving,
    [clientName, service, date, starts, ends, pay, saving],
  );

  async function save() {
    if (!canSave || !pay) return;
    setSaving(true);
    setConflict(null);
    setAlternatives([]);
    try {
      const startsAt = new Date(`${date}T${starts}:00`).toISOString();
      const endsAt = new Date(`${date}T${ends}:00`).toISOString();
      const result = await createOwnSlotBooking({
        clientName,
        title: service,
        startsAt,
        endsAt,
        paymentChoice: pay,
      });
      if (!result.ok) {
        setConflict(result.message ?? copy.t("Could not save. Try another time."));
        setAlternatives(result.alternatives ?? []);
        return;
      }
      const payLabel =
        pay === "received"
          ? copy.t("Payment recorded as received. The client has not been told.")
          : pay === "request_link"
            ? copy.t("Saved as unpaid. Request a payment link from the booking when you are ready. The client has not been told.")
            : copy.t("Due later. The client has not been told.");
      setSavedNote(payLabel);
      onSaved?.();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={TALENT_AGENDA_VARS} className="mx-auto max-w-[720px] space-y-4">
      <button type="button" onClick={onCancel} className="min-h-[44px] text-[13px] text-[var(--tc-accent)]">
        {"<"} {copy.t("Calendar")}
      </button>
      <h1 className="text-[24px] font-semibold text-[var(--tc-primary)]">{newLabel}</h1>

      {savedNote ? (
        <p className="rounded-xl border border-[rgba(31,92,66,0.25)] bg-[rgba(31,92,66,0.08)] px-3 py-2 text-[13px] text-[#1F5C42]">
          {savedNote}
        </p>
      ) : null}

      <section className="space-y-3 rounded-2xl border border-black/8 bg-white p-4">
        <h2 className="text-[15px] font-semibold">{copy.t("Client")}</h2>
        <label className="block text-[13px]">
          {copy.t("Name")}
          <input
            className="mt-1 w-full rounded-xl border border-black/10 px-3 py-2"
            value={clientName}
            onChange={(e) => setClientName(e.target.value)}
          />
        </label>
      </section>

      <section className="space-y-3 rounded-2xl border border-black/8 bg-white p-4">
        <h2 className="text-[15px] font-semibold">{copy.t("Work and time")}</h2>
        <label className="block text-[13px]">
          {copy.t("Service")}
          <input
            className="mt-1 w-full rounded-xl border border-black/10 px-3 py-2"
            value={service}
            onChange={(e) => setService(e.target.value)}
          />
        </label>
        <div className="grid grid-cols-3 gap-2">
          <label className="block text-[13px]">
            {copy.t("Date")}
            <input type="date" className="mt-1 w-full rounded-xl border border-black/10 px-3 py-2" value={date} onChange={(e) => setDate(e.target.value)} />
          </label>
          <label className="block text-[13px]">
            {copy.t("Start")}
            <input type="time" className="mt-1 w-full rounded-xl border border-black/10 px-3 py-2" value={starts} onChange={(e) => { setStarts(e.target.value); setConflict(null); }} />
          </label>
          <label className="block text-[13px]">
            {copy.t("End")}
            <input type="time" className="mt-1 w-full rounded-xl border border-black/10 px-3 py-2" value={ends} onChange={(e) => { setEnds(e.target.value); setConflict(null); }} />
          </label>
        </div>
        {conflict ? <p className="text-[13px] text-[#B42318]">{conflict}</p> : null}
        {alternatives.length > 0 ? (
          <div className="space-y-1">
            <p className="text-[12px] font-medium text-[var(--tc-primary)]">{copy.t("Try one of these:")}</p>
            {alternatives.map((iso) => {
              const d = new Date(iso);
              const label = d.toLocaleString([], { weekday: "short", hour: "numeric", minute: "2-digit" });
              return (
                <button
                  key={iso}
                  type="button"
                  className="mr-2 min-h-[44px] rounded-full border border-black/10 px-3 text-[12px]"
                  onClick={() => {
                    setDate(iso.slice(0, 10));
                    setStarts(d.toTimeString().slice(0, 5));
                    const end = new Date(d.getTime() + 60 * 60_000);
                    setEnds(end.toTimeString().slice(0, 5));
                    setConflict(null);
                    setAlternatives([]);
                  }}
                >
                  {label}
                </button>
              );
            })}
          </div>
        ) : null}
        {!pay ? (
          <p className="text-[13px] text-[#5F6368]">{copy.t("Save stays off until a payment choice is selected.")}</p>
        ) : null}
      </section>

      <section className="space-y-2 rounded-2xl border border-black/8 bg-white p-4">
        <h2 className="text-[15px] font-semibold">{copy.t("Payment")}</h2>
        {(
          [
            ["received", "Record payment received"],
            ["due_later", "Due later"],
            ["request_link", "Collect later (no link yet)"],
          ] as const
        ).map(([id, label]) => (
          <label key={id} className="flex min-h-[44px] items-center gap-2 text-[14px]">
            <input
              type="radio"
              name="pay"
              checked={pay === id}
              onChange={() => setPay(id)}
            />
            {copy.t(label)}
          </label>
        ))}
        {pay === "request_link" ? (
          <p className="text-[13px] text-[#5F6368]">
            {copy.t("Does not create a pay link. Open Request payment from the booking when you are ready.")}
          </p>
        ) : null}
      </section>

      <div className="sticky bottom-0 z-10 -mx-1 flex justify-end gap-2 border-t border-black/5 bg-[var(--tc-canvas,#FAFAF7)] px-1 pt-3 pb-[max(12px,env(safe-area-inset-bottom))]">
        <button type="button" onClick={onCancel} className="min-h-[44px] rounded-full px-4 text-[13px]">
          {copy.t("Cancel")}
        </button>
        <button
          type="button"
          disabled={!canSave || saving}
          onClick={() => void save()}
          className="min-h-[44px] rounded-full bg-[var(--tc-primary)] px-4 text-[13px] text-white disabled:opacity-40"
        >
          {saving ? copy.t("Saving…") : copy.t("Save")}
        </button>
      </div>
    </div>
  );
}
