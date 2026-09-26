"use client";

import { useEffect, useMemo, useState } from "react";
import { resolveTradeProfile } from "@/lib/talent-agenda/trades";
import { createOwnSlotBooking } from "@/lib/talent-agenda/create-slot";
import { loadTalentOfferingsForEditor } from "@/lib/talent/offerings-actions";
import { formatOfferingPrice, type TalentOffering } from "@/lib/talent/offerings-types";
import { TaskShell } from "./primitives/TaskShell";
import { AgendaEventQuote, AgendaProjectQuote } from "./AgendaQuotes";
import { useAgendaCopy } from "./use-agenda-copy";

type PayChoice = "received" | "due_later" | "request_link" | null;

const OTHER = "__other__";

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
    <SlotComposer
      newLabel={newLabel}
      talentProfileId={talentProfileId}
      onCancel={onCancel}
      onSaved={onSaved}
    />
  );
}

function SlotComposer({
  newLabel,
  talentProfileId,
  onCancel,
  onSaved,
}: {
  newLabel: string;
  talentProfileId?: string;
  onCancel: () => void;
  onSaved?: () => void;
}) {
  const copy = useAgendaCopy();
  const [clientName, setClientName] = useState("");
  const [service, setService] = useState("");
  const [offeringId, setOfferingId] = useState<string>(OTHER);
  const [offerings, setOfferings] = useState<TalentOffering[]>([]);
  const [date, setDate] = useState("");
  const [starts, setStarts] = useState("");
  const [ends, setEnds] = useState("");
  const [pay, setPay] = useState<PayChoice>(null);
  const [saving, setSaving] = useState(false);
  const [conflict, setConflict] = useState<string | null>(null);
  const [alternatives, setAlternatives] = useState<string[]>([]);
  const [savedNote, setSavedNote] = useState<string | null>(null);

  useEffect(() => {
    if (!talentProfileId) return;
    let cancelled = false;
    void loadTalentOfferingsForEditor(talentProfileId).then((res) => {
      if (cancelled || !res.ok) return;
      const published = res.items.filter((item) => item.status === "published");
      setOfferings(published);
      if (published.length > 0) {
        setOfferingId(published[0]!.id);
        setService(published[0]!.title);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [talentProfileId]);

  const serviceReady =
    offeringId !== OTHER ? Boolean(offeringId) : Boolean(service.trim());

  const canSave = useMemo(
    () => Boolean(clientName.trim() && serviceReady && date && starts && ends && pay) && !saving,
    [clientName, serviceReady, date, starts, ends, pay, saving],
  );

  async function save() {
    if (!canSave || !pay) return;
    setSaving(true);
    setConflict(null);
    setAlternatives([]);
    try {
      const startsAt = new Date(`${date}T${starts}:00`).toISOString();
      const endsAt = new Date(`${date}T${ends}:00`).toISOString();
      const selected =
        offeringId !== OTHER ? offerings.find((o) => o.id === offeringId) : undefined;
      const result = await createOwnSlotBooking({
        clientName,
        title: selected?.title?.trim() || service,
        startsAt,
        endsAt,
        paymentChoice: pay,
        offeringId: selected?.id ?? null,
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
    <TaskShell
      open
      onClose={onCancel}
      title={newLabel}
      primaryActionLabel={saving ? copy.t("Saving…") : copy.t("Save")}
      onPrimaryAction={canSave ? () => void save() : undefined}
      secondaryActionLabel={copy.t("Cancel")}
    >
      {savedNote ? (
        <p className="mb-4 rounded-xl border border-[rgba(31,92,66,0.25)] bg-[rgba(31,92,66,0.08)] px-3 py-2 text-[13px] text-[#1F5C42]">
          {savedNote}
        </p>
      ) : null}

      <section className="mb-4 space-y-3 rounded-2xl border border-black/8 bg-white p-4">
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

      <section className="mb-4 space-y-3 rounded-2xl border border-black/8 bg-white p-4">
        <h2 className="text-[15px] font-semibold">{copy.t("Work and time")}</h2>
        {offerings.length > 0 ? (
          <label className="block text-[13px]">
            {copy.t("Service")}
            <select
              className="mt-1 w-full rounded-xl border border-black/10 px-3 py-2"
              value={offeringId}
              onChange={(e) => {
                const next = e.target.value;
                setOfferingId(next);
                if (next === OTHER) {
                  setService("");
                  return;
                }
                const picked = offerings.find((o) => o.id === next);
                setService(picked?.title ?? "");
              }}
            >
              {offerings.map((o) => {
                const price =
                  o.amountCents != null
                    ? formatOfferingPrice(o.amountCents, o.currency, "en")
                    : "";
                const label = price ? `${o.title} · ${price}` : o.title;
                return (
                  <option key={o.id} value={o.id}>
                    {label}
                  </option>
                );
              })}
              <option value={OTHER}>{copy.t("Other…")}</option>
            </select>
          </label>
        ) : null}
        {offerings.length === 0 || offeringId === OTHER ? (
          <label className="block text-[13px]">
            {offerings.length > 0 ? copy.t("Describe the work") : copy.t("Service")}
            <input
              className="mt-1 w-full rounded-xl border border-black/10 px-3 py-2"
              value={service}
              onChange={(e) => {
                setService(e.target.value);
                setOfferingId(OTHER);
              }}
            />
          </label>
        ) : null}
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
    </TaskShell>
  );
}
