"use client";

/**
 * Opens InquiryDrawer (request) or confirms via instant-book-action (instant).
 */

import { useEffect, useState } from "react";
import { InquiryDrawer } from "@/components/inquiry/InquiryDrawer";
import { SlotPicker, type SlotPickerValue } from "@/components/public-booking/SlotPicker";
import {
  applyReservationToIntent,
  type ReservationStamp,
} from "@/lib/scheduling/reservation-intent";
import type { InquiryIntent } from "@/lib/inquiry/inquiry-intent";
import type { BookableOffering } from "@/components/public-booking/pick-bookable-offering";
import { createInstantBookingAction } from "@/lib/server-actions/instant-book-action";
import type { TalentBookingMode } from "@/lib/scheduling/booking-surface";
import { useT } from "@/i18n/use-t";

export type { BookableOffering };

function baseIntent(offering: BookableOffering): InquiryIntent {
  return {
    source: "offering_request",
    requester: {},
    talent: offering.talentProfileId
      ? { selected_ids: [offering.talentProfileId], selection_mode: "i_know_who" }
      : undefined,
    location: offering.locationLabel
      ? { city: offering.locationLabel, status: "confirmed" }
      : { status: "unconfirmed" },
  };
}

export function BookableComposer({
  tenantSlug,
  tenantId,
  agencyName,
  offering,
  bookingMode = "request",
  showInlinePicker = true,
}: {
  tenantSlug: string;
  tenantId?: string | null;
  agencyName: string;
  offering: BookableOffering;
  bookingMode?: TalentBookingMode;
  showInlinePicker?: boolean;
}) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [slot, setSlot] = useState<SlotPickerValue | null>(null);
  const [eventOffering, setEventOffering] = useState<BookableOffering | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [forceRequest, setForceRequest] = useState(false);
  const active = eventOffering ?? offering;
  const instant = bookingMode === "instant" && !forceRequest && !!tenantId;

  useEffect(() => {
    const onSlot = (e: Event) => {
      const d = (e as CustomEvent<{
        offeringId?: string;
        talentProfileId?: string;
        durationMinutes?: number | null;
      }>).detail;
      if (!d?.offeringId) return;
      setEventOffering({
        offeringId: d.offeringId,
        durationMinutes:
          typeof d.durationMinutes === "number" && d.durationMinutes > 0
            ? d.durationMinutes
            : offering.durationMinutes,
        timezone: offering.timezone,
        locationLabel: offering.locationLabel,
        talentProfileId: d.talentProfileId ?? offering.talentProfileId,
      });
      setSlot(null);
      setForceRequest(false);
      setError(null);
    };
    window.addEventListener("tulala:offering-slot", onSlot);
    return () => window.removeEventListener("tulala:offering-slot", onSlot);
  }, [offering]);

  function stampFromSlot(value: SlotPickerValue): ReservationStamp {
    return {
      v: 1,
      offering_id: active.offeringId,
      starts_at: value.startsAt,
      ends_at: value.endsAt,
      timezone: value.timezone,
      duration_minutes: active.durationMinutes,
      mode: instant ? "instant" : "request",
    };
  }

  const initialIntent: InquiryIntent = slot
    ? applyReservationToIntent(baseIntent(active), stampFromSlot(slot))
    : baseIntent(active);

  async function confirmInstant() {
    if (!slot || !tenantId || !active.talentProfileId) return;
    setBusy(true);
    setError(null);
    try {
      const res = await createInstantBookingAction({
        talentProfileId: active.talentProfileId,
        tenantId,
        offeringId: active.offeringId,
        payInPerson: true,
        reservation: {
          startsAt: slot.startsAt,
          endsAt: slot.endsAt,
          timezone: slot.timezone,
        },
      });
      if (!res.ok) {
        if (res.needsAuth) {
          window.location.href = `/login?next=${encodeURIComponent(window.location.pathname)}`;
          return;
        }
        setError(res.error);
        if (res.upgrade) {
          setForceRequest(true);
          setOpen(true);
        }
        if (res.slotTaken) setSlot(null);
        return;
      }
      window.location.href = res.redirectPath;
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      {showInlinePicker ? (
        <SlotPicker
          offeringId={active.offeringId}
          durationMinutes={active.durationMinutes}
          timezone={active.timezone}
          value={slot}
          onChange={(next) => {
            setSlot(next);
            setError(null);
            if (next && !instant) setOpen(true);
          }}
        />
      ) : null}
      {instant && slot ? (
        <div className="mt-3 flex flex-col gap-2">
          {error ? (
            <p className="text-sm text-[var(--token-color-danger,#dc2626)]">{error}</p>
          ) : null}
          <button
            type="button"
            disabled={busy}
            onClick={() => void confirmInstant()}
            className="inline-flex items-center justify-center rounded-full bg-[#0B0B0D] px-5 py-2.5 text-sm font-medium text-white disabled:opacity-60"
          >
            {busy ? t("public.slotPicker.confirming") : t("public.slotPicker.confirmInstant")}
          </button>
          {forceRequest ? (
            <button
              type="button"
              className="text-sm underline"
              onClick={() => setOpen(true)}
            >
              {t("public.slotPicker.requestInstead")}
            </button>
          ) : null}
        </div>
      ) : null}
      {open ? (
        <InquiryDrawer
          source="offering_request"
          tenantSlug={tenantSlug}
          agencyName={agencyName}
          client={null}
          enableDraftAutosave={false}
          bookableOffering={active}
          initialIntent={initialIntent}
          onClose={() => setOpen(false)}
        />
      ) : null}
    </div>
  );
}
