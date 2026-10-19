"use client";

import { useEffect, useState } from "react";

import { loadTalentAgendaRecordItem, loadTalentTimelessBookingStub } from "@/lib/talent-agenda/load-record-item";
import { agendaItemFromSnapshot } from "@/lib/talent-agenda/record-item";
import type { TalentAgendaItem } from "@/lib/talent-agenda/types";

import { useAgendaCopy } from "./use-agenda-copy";
import { AgendaBookingRecord } from "./AgendaBookingRecord";
import { buildAgendaListItemFromAgendaItem } from "./view-model";

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

/** Longest the record waits for its own read before showing what it has. */
const RECORD_LOAD_TIMEOUT_MS = 8000;

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
  useEffect(() => {
    if (fromSnapshot || !bookingId) return;
    let cancelled = false;
    // Bounded: a slow or failing read must end in the summary stub, never an empty page.
    const timer = setTimeout(() => {
      if (!cancelled) setLoaded((cur) => (cur?.id === bookingId ? cur : { id: bookingId, item: null }));
    }, RECORD_LOAD_TIMEOUT_MS);
    void (async () => {
      try {
        const item = await loadTalentAgendaRecordItem(bookingId);
        // No time yet: read the service from the booking / order line.
        const stub = item ? null : await loadTalentTimelessBookingStub(bookingId).catch(() => null);
        if (!cancelled) setLoaded({ id: bookingId, item, service: stub?.service ?? null, clientName: stub?.clientName ?? null, status: stub?.status ?? null });
      } catch {
        if (!cancelled) setLoaded({ id: bookingId, item: null });
      }
    })();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [bookingId, fromSnapshot]);

  const agendaItem = fromSnapshot ?? (loaded?.id === bookingId ? loaded.item : null);
  // Still reading: render nothing rather than a stub that reads as an empty booking.
  if (!agendaItem && bookingId && loaded?.id !== bookingId) return null;

  // Nothing loaded: say so honestly. Never a stub record with a default status.
  if (!agendaItem) {
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
  );
}
