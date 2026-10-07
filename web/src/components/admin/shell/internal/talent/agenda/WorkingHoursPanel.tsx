"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

import { useAdminShell } from "../../state";
import { AgendaAvailabilityPage } from "./AgendaAvailabilityPage";
import { AgendaPanelFrame, createPanelStore } from "./AgendaPanelFrame";
import { useAgendaCopy } from "./use-agenda-copy";

/**
 * Working hours as ONE shared panel: a right drawer on desktop, a bottom sheet
 * on a phone. Settings, Calendar, Today and setup all open the same panel with
 * `openWorkingHoursPanel()` instead of navigating away from where she was.
 * `/talent/calendar/availability` stays as the full-page fallback (deep links,
 * and the agenda data not being loaded yet).
 */
const store = createPanelStore();

export const openWorkingHoursPanel = store.open;
export const closeWorkingHoursPanel = store.close;

/** Mounted once in the talent router; renders nothing until opened. */
export function WorkingHoursPanelHost() {
  const open = store.useOpen();
  const router = useRouter();
  const copy = useAgendaCopy();
  const { setTalentPage, bridgeTalentSelfProfile, bridgeTalentAgendaHours, bridgeTalentAgendaV2, toast } = useAdminShell();
  const talentProfileId = bridgeTalentSelfProfile?.id ?? null;
  const eligible = Boolean(bridgeTalentAgendaV2 && talentProfileId);

  // No agenda data to edit in place: fall back to the full page.
  useEffect(() => {
    if (open && !eligible) {
      store.close();
      setTalentPage("calendar-availability");
    }
  }, [open, eligible, setTalentPage]);

  if (!open || !eligible || !talentProfileId) return null;

  return (
    <AgendaPanelFrame title={copy.t("Working hours")} onClose={store.close} dataAttr="data-working-hours-panel">
      <AgendaAvailabilityPage
        embedded
        talentProfileId={talentProfileId}
        initialHours={bridgeTalentAgendaHours}
        onBack={store.close}
        onSaved={() => {
          store.close();
          toast(copy.t("Availability saved."));
          router.refresh();
        }}
      />
    </AgendaPanelFrame>
  );
}
