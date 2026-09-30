"use client";

import { useEffect, useState } from "react";

import { loadTalentAgendaRecordItem } from "@/lib/talent-agenda/load-record-item";
import { agendaItemFromSnapshot } from "@/lib/talent-agenda/record-item";
import type { TalentAgendaItem } from "@/lib/talent-agenda/types";

import { AgendaBookingRecord } from "./AgendaBookingRecord";
import { buildAgendaListItemFromAgendaItem } from "./view-model";

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
  const [loaded, setLoaded] = useState<{ id: string; item: TalentAgendaItem | null } | null>(null);
  useEffect(() => {
    if (fromSnapshot || !bookingId) return;
    let cancelled = false;
    void loadTalentAgendaRecordItem(bookingId).then((item) => {
      if (!cancelled) setLoaded({ id: bookingId, item });
    });
    return () => {
      cancelled = true;
    };
  }, [bookingId, fromSnapshot]);

  const agendaItem = fromSnapshot ?? (loaded?.id === bookingId ? loaded.item : null);
  // Still reading: render nothing rather than a stub that reads as an empty booking.
  if (!agendaItem && bookingId && loaded?.id !== bookingId) return null;

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
      item={
        agendaItem
          ? buildAgendaListItemFromAgendaItem(agendaItem)
          : { id: bookingId || "unknown", title: "Booking", whenLabel: "-", whereLabel: "-", sourceLabel: "Direct" }
      }
      onBack={onBack}
      onMessage={onMessage}
    />
  );
}
