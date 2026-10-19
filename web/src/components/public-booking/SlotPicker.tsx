"use client";

/**
 * Shared public slot picker. Thin mounts only — InquiryDrawer, BookingCard,
 * later OfferingInstantMount. Fetches GET /api/public/booking/slots.
 */

import Link from "next/link";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { publicSlotsUrl } from "@/lib/scheduling/public-slots-workspace";
import { loadPublicSlots } from "./slot-picker-load";
import { usePublicT } from "@/i18n/use-public-t";
import { translatorFor } from "@/i18n/translator-for";

export type SlotPickerValue = {
  startsAt: string;
  endsAt: string;
  timezone: string;
};

type Props = {
  offeringId: string;
  durationMinutes: number;
  timezone: string;
  value: SlotPickerValue | null;
  onChange: (next: SlotPickerValue | null) => void;
  days?: number;
  /** Page locale when known (CMS /book). Falls back to dashboard cookie via useT. */
  locale?: string;
  /** Where a guest with no times to pick can write to the studio (TUL-698). */
  contactHref?: string | null;
  /** Primary request action shown when there are no times to pick (B2/D3). */
  emptyAction?: ReactNode;
};

const INK = "var(--token-color-ink, #0B0B0D)";
const MUTED = "var(--token-color-muted, rgba(11,11,13,0.62))";

function ymd(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function formatSlot(iso: string, timezone: string, locale: string): string {
  try {
    return new Intl.DateTimeFormat(locale, {
      weekday: "short",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      timeZone: timezone,
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

export function SlotPicker({
  offeringId,
  durationMinutes,
  timezone,
  value,
  onChange,
  days = 14,
  locale: localeProp,
  contactHref = null,
  emptyAction = null,
}: Props) {
  const cookieT = usePublicT();
  const t = useMemo(() => {
    if (!localeProp?.trim()) return cookieT;
    return translatorFor(localeProp.startsWith("es") ? "es" : "en");
  }, [localeProp, cookieT]);
  const [slots, setSlots] = useState<string[]>([]);
  // WHY THE LIST IS EMPTY, when it is. The endpoint says (`no_booking_hours`,
  // `closed_in_window`, `fully_booked`) and this used to drop it, so a
  // calendar nobody had ever set read "No open times in the next two weeks",
  // which is what a fully booked barber says. A guest cannot tell "come back
  // later" from "there is nothing to come back to", and the second is the
  // honest sentence for a person whose hours are still a proposal.
  const [emptyReason, setEmptyReason] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [resolvedTz, setResolvedTz] = useState(timezone);
  useEffect(() => {
    setResolvedTz(timezone);
  }, [timezone]);

  const from = useMemo(() => ymd(new Date()), []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    const params = new URLSearchParams({
      offering: offeringId,
      from,
      days: String(days),
    });
    setSlots([]);
    setEmptyReason(null);
    // TUL-690: the URL carries the `/w/<slug>` workspace; TUL-977: a deadline,
    // so a slow endpoint resolves to an honest state.
    void loadPublicSlots(publicSlotsUrl(params)).then((r) => {
      if (cancelled) return;
      if (!r.ok) {
        // Friendly, not an error: the guest can still send a request (B2/D3).
        setError(t("public.slotPicker.noOnlineTimes"));
      } else {
        setSlots(r.slots);
        setEmptyReason(r.reason);
        if (r.timezone) setResolvedTz(r.timezone);
      }
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [offeringId, from, days, t]);

  const locale =
    localeProp?.trim()
      ? localeProp.startsWith("es")
        ? "es"
        : "en"
      : typeof document !== "undefined" && document.documentElement.lang.startsWith("es")
        ? "es"
        : "en";

  const contactLink = emptyAction || contactHref ? (
    <div className="mt-2 flex flex-col items-start gap-2">
      {emptyAction}
      {contactHref ? (
    <Link
      href={contactHref}
      data-testid="slot-picker-contact"
      className="inline-block rounded-lg border border-[rgba(24,24,27,0.12)] px-3 py-2 text-xs font-medium"
      style={{ color: INK }}
    >
      {t("public.bookPage.contactCta")}
    </Link>
      ) : null}
    </div>
  ) : null;

  return (
    <div data-testid="slot-picker" style={{ color: INK }}>
      <p className="text-sm font-semibold" style={{ color: INK }}>
        {t("public.slotPicker.title")}
      </p>
      <p className="mt-1 text-xs" style={{ color: MUTED }}>
        {t("public.slotPicker.subtitle")}
      </p>
      {loading ? (
        <div className="mt-3 flex flex-col gap-1.5" role="status" aria-busy="true" data-testid="slot-picker-skeleton">
          <span className="sr-only">{t("public.slotPicker.loading")}</span>
          {[0, 1, 2].map((i) => (
            <span key={i} aria-hidden="true" className="block h-9 animate-pulse rounded-lg bg-[rgba(24,24,27,0.06)]" />
          ))}
        </div>
      ) : error ? (
        <div className="mt-3">
          <p className="text-xs" style={{ color: MUTED }} data-testid="slot-picker-unavailable">
            {error}
          </p>
          {contactLink}
        </div>
      ) : slots.length === 0 ? (
        <div className="mt-3">
        <p
          className="text-xs"
          style={{ color: MUTED }}
          data-testid="slot-picker-empty"
          data-reason={emptyReason ?? "unknown"}
        >
          {emptyReason === "no_booking_hours"
            ? t("public.slotPicker.noHours")
            : emptyReason === "closed_in_window"
              ? t("public.slotPicker.closed")
              : emptyReason === "fully_booked"
                ? t("public.slotPicker.fullyBooked")
                : t("public.slotPicker.empty")}
        </p>
        {contactLink}
        </div>
      ) : (
        <div className="mt-3 flex flex-col gap-1.5 max-h-64 overflow-auto">
          {slots.map((start) => {
            const ends = new Date(new Date(start).getTime() + durationMinutes * 60_000).toISOString();
            const selected = value?.startsAt === start;
            return (
              <button
                key={start}
                type="button"
                onClick={() =>
                  onChange(
                    selected
                      ? null
                      : { startsAt: start, endsAt: ends, timezone: resolvedTz },
                  )
                }
                className={`text-left text-[13px] rounded-lg border px-3 py-2 ${
                  selected
                    ? "border-[rgba(11,11,13,0.85)] bg-[rgba(11,11,13,0.06)]"
                    : "border-[rgba(24,24,27,0.12)] bg-white"
                }`}
                style={{ color: INK }}
              >
                {formatSlot(start, resolvedTz, locale)}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
