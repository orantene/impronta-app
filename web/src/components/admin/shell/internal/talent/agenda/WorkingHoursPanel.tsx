"use client";

import { useEffect, useRef, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";

import { useAdminShell } from "../../state";
import { AgendaAvailabilityPage } from "./AgendaAvailabilityPage";
import { useAgendaCopy } from "./use-agenda-copy";

/**
 * Working hours as ONE shared panel: a right drawer on desktop, a bottom sheet
 * on a phone. Settings, Calendar, Today and setup all open the same panel with
 * `openWorkingHoursPanel()` instead of navigating away from where she was.
 * `/talent/calendar/availability` stays as the full-page fallback (deep links,
 * and the agenda data not being loaded yet).
 */

let panelOpen = false;
const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
}

export function openWorkingHoursPanel(): void {
  panelOpen = true;
  emit();
}

export function closeWorkingHoursPanel(): void {
  panelOpen = false;
  emit();
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

export function useWorkingHoursPanelOpen(): boolean {
  return useSyncExternalStore(subscribe, () => panelOpen, () => false);
}

/** Mounted once in the talent router; renders nothing until opened. */
export function WorkingHoursPanelHost() {
  const open = useWorkingHoursPanelOpen();
  const router = useRouter();
  const copy = useAgendaCopy();
  const { setTalentPage, bridgeTalentSelfProfile, bridgeTalentAgendaHours, bridgeTalentAgendaV2 } = useAdminShell();
  const panelRef = useRef<HTMLDivElement | null>(null);
  const talentProfileId = bridgeTalentSelfProfile?.id ?? null;
  const eligible = Boolean(bridgeTalentAgendaV2 && talentProfileId);

  // No agenda data to edit in place: fall back to the full page.
  useEffect(() => {
    if (open && !eligible) {
      closeWorkingHoursPanel();
      setTalentPage("calendar-availability");
    }
  }, [open, eligible, setTalentPage]);

  useEffect(() => {
    if (!open) return;
    panelRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeWorkingHoursPanel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  if (!open || !eligible || !talentProfileId) return null;

  return (
    <div className="fixed inset-0 z-[80]" data-working-hours-panel>
      <button
        type="button"
        aria-label={copy.t("Close")}
        onClick={closeWorkingHoursPanel}
        className="absolute inset-0 bg-black/40"
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={copy.t("Working hours")}
        tabIndex={-1}
        className="absolute bg-white outline-none max-md:inset-x-0 max-md:bottom-0 max-md:max-h-[90dvh] max-md:rounded-t-[20px] md:inset-y-0 md:right-0 md:w-[560px] md:max-w-full"
      >
        <div className="flex h-full max-h-[inherit] flex-col">
          <div className="flex items-center gap-2 border-b border-black/10 px-5 py-3">
            <h2 className="flex-1 text-[17px] font-semibold text-[var(--tc-primary,inherit)]">{copy.t("Working hours")}</h2>
            <button
              type="button"
              onClick={closeWorkingHoursPanel}
              className="min-h-[44px] min-w-[44px] rounded-full text-[15px]"
              aria-label={copy.t("Close")}
            >
              <span aria-hidden>×</span>
            </button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
            <AgendaAvailabilityPage
              embedded
              talentProfileId={talentProfileId}
              initialHours={bridgeTalentAgendaHours}
              onBack={closeWorkingHoursPanel}
              onSaved={() => {
                closeWorkingHoursPanel();
                router.refresh();
              }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
