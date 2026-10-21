"use client";

import { useEffect, useState } from "react";

import { loadTalentAgendaRecordItem, loadTalentTimelessBookingStub } from "@/lib/talent-agenda/load-record-item";
import { agendaItemFromSnapshot } from "@/lib/talent-agenda/record-item";
import type { TalentAgendaItem } from "@/lib/talent-agenda/types";

import { useAgendaCopy } from "./use-agenda-copy";
import { AgendaBookingRecord } from "./AgendaBookingRecord";
import { MyAssignmentAnswer } from "./MyAssignmentAnswer";
import { buildAgendaListItemFromAgendaItem } from "./view-model";
import { RECORD_SLOW_AFTER_MS, readRecordInParallel, recordViewState } from "./booking-record-state";

/** Plain status text for a status we know; null for anything else (no pill, no default). */
function knownStatusLabel(status: string | null | undefined, t: (key: string) => string): string | null {
  switch ((status ?? "").trim().toLowerCase()) {
    case "cancelled":
      return t("Cancelled");
    case "refunded":
      return t("Refunded");
    case "completed":
      return t("Completed");
    case "confirmed":
      return t("Confirmed");
    default:
      return null;
  }
}

/**
 * /talent/bookings/<id>. F60: a booking saved a moment ago is not in the
 * layout's agenda snapshot yet, so the record reads that one item itself
 * instead of rendering a stub ("Booking", "No service set", When "-").
 */
export function BookingRecordRoute({
  bookingId,
  snapshot,
  onBack,
  onMessage,
}: {
  bookingId: string;
  snapshot: readonly TalentAgendaItem[] | null;
  onBack: () => void;
  onMessage: () => void;
}) {
  const fromSnapshot = agendaItemFromSnapshot(snapshot, bookingId);
  const copy = useAgendaCopy();
  const [loaded, setLoaded] = useState<{ id: string; item: TalentAgendaItem | null; service?: string | null; clientName?: string | null; status?: string | null } | null>(null);
  const [mounted, setMounted] = useState(false);
  const [slow, setSlow] = useState(false);
  useEffect(() => setMounted(true), []);
  useEffect(() => {
    if (fromSnapshot || !bookingId) return;
    let cancelled = false;
    setSlow(false);
    // A slow read only changes the loading line; it is never turned into a failure, and a
    // late result still replaces it.
    const timer = setTimeout(() => {
      if (!cancelled) setSlow(true);
    }, RECORD_SLOW_AFTER_MS);
    void (async () => {
      const { item, stub } = await readRecordInParallel(
        () => loadTalentAgendaRecordItem(bookingId),
        () => loadTalentTimelessBookingStub(bookingId),
      );
      if (!cancelled) setLoaded({ id: bookingId, item, service: stub?.service ?? null, clientName: stub?.clientName ?? null, status: stub?.status ?? null });
    })();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [bookingId, fromSnapshot]);

  const agendaItem = fromSnapshot ?? (loaded?.id === bookingId ? loaded.item : null);
  const view = recordViewState({
    bookingId,
    mounted,
    hasItem: Boolean(agendaItem),
    settled: loaded?.id === bookingId,
    slow,
  });
  if (view === "loading" || view === "still-loading") {
    return (
      <div className="mx-auto max-w-[560px] px-4 py-10 text-center text-[14px] text-[var(--tc-muted)]" role="status" aria-live="polite" data-booking-record-loading>
        {view === "still-loading" ? copy.t("Still loading…") : copy.t("Loading…")}
      </div>
    );
  }

  // Nothing loaded: say so honestly. Never a stub record with a default status.
  if (view === "unavailable" || !agendaItem) {
    const status = knownStatusLabel(loaded?.status, copy.t);
    return (
      <div className="mx-auto max-w-[560px] px-4 py-10 text-center" data-booking-record-unavailable>
        <h1 className="text-[18px] font-semibold text-[var(--tc-ink,inherit)]">{copy.t("We could not load this booking")}</h1>
        {loaded?.clientName || loaded?.service ? (
          <p className="mt-2 text-[14px] text-[var(--tc-muted)]">{[loaded?.clientName, loaded?.service].filter(Boolean).join(" · ")}</p>
        ) : null}
        {status ? <p className="mt-1 text-[13px] text-[var(--tc-muted)]">{status}</p> : null}
        <p className="mt-2 text-[14px] text-[var(--tc-muted)]">{copy.t("Nothing was changed. Go back and open it again.")}</p>
        <button type="button" onClick={onBack} className="mt-5 rounded-full border border-[var(--tc-line,#ddd)] px-4 py-2 text-[14px] font-medium">
          {copy.t("Back")}
        </button>
      </div>
    );
  }

  return (
    <>
    <MyAssignmentAnswer bookingId={bookingId} locale={copy.locale} />
    <AgendaBookingRecord
      bookingId={bookingId || undefined}
      isAgency={Boolean(agendaItem?.managedBy)}
      refTable={agendaItem?.ref?.table}
      refId={agendaItem?.ref?.id}
      tradeSection={
        agendaItem?.tradeSection
          ? { kind: agendaItem.tradeSection.kind, payload: agendaItem.tradeSection.payload as Record<string, unknown> }
          : undefined
      }
      item={buildAgendaListItemFromAgendaItem(agendaItem)}
      onBack={onBack}
      onMessage={onMessage}
    />
    </>
  );
}
