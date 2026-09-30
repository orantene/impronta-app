"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

import { useAdminShell } from "../../state";
import { AgendaNewBooking } from "./AgendaNewBooking";
import { AgendaPanelFrame, createPanelStore } from "./AgendaPanelFrame";
import { useAgendaCopy } from "./use-agenda-copy";

/**
 * New booking as ONE shared panel (right drawer on desktop, bottom sheet on a
 * phone), opened from Today and Calendar with `openNewBookingPanel()`. The
 * full page at `/talent/bookings/new` stays as the fallback, used when the
 * agenda data is not loaded and for deep links.
 */
const store = createPanelStore();

export const openNewBookingPanel = store.open;
export const closeNewBookingPanel = store.close;

export function NewBookingPanelHost({
  onOpenRecord,
  onFallback,
}: {
  /** Soft-navigates to a booking record (the router owns this). */
  onOpenRecord: (id: string) => void;
  /** Opens the full New booking page instead. */
  onFallback: () => void;
}) {
  const open = store.useOpen();
  const router = useRouter();
  const copy = useAgendaCopy();
  const { bridgeTalentSelfProfile, bridgeTalentAgendaItems, bridgeTalentAgendaHours, bridgeTalentAgendaV2, toast } =
    useAdminShell();
  const eligible = Boolean(bridgeTalentAgendaV2 && bridgeTalentSelfProfile?.id);

  useEffect(() => {
    if (open && !eligible) {
      store.close();
      onFallback();
    }
  }, [open, eligible, onFallback]);

  if (!open || !eligible) return null;

  return (
    <AgendaPanelFrame title={copy.t("New booking")} onClose={store.close} dataAttr="data-new-booking-panel">
      <AgendaNewBooking
        embedded
        talentTypeSlug={bridgeTalentSelfProfile?.primaryTypeLabel}
        talentProfileId={bridgeTalentSelfProfile?.id}
        agendaItems={bridgeTalentAgendaItems ?? []}
        hours={bridgeTalentAgendaHours}
        onCancel={store.close}
        onSaved={() => {
          toast("Booking saved");
          store.close();
          router.refresh();
        }}
        onOpenRecord={(id) => {
          toast("Booking saved");
          store.close();
          onOpenRecord(id);
          router.refresh();
        }}
      />
    </AgendaPanelFrame>
  );
}
