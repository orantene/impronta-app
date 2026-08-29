"use client";

/**
 * Shared public slot picker. Thin mounts only — InquiryDrawer, BookingCard,
 * later OfferingInstantMount. Fetches GET /api/public/booking/slots.
 */

import { useEffect, useMemo, useState } from "react";
import { useT } from "@/i18n/use-t";

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
};

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
}: Props) {
  const t = useT();
  const [slots, setSlots] = useState<string[]>([]);
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
    fetch(`/api/public/booking/slots?${params.toString()}`, { cache: "no-store" })
      .then(async (res) => {
        const body = (await res.json()) as {
          slots?: string[];
          timezone?: string;
          error?: string;
        };
        if (cancelled) return;
        if (!res.ok) {
          setSlots([]);
          setError(t("public.slotPicker.unavailable"));
          return;
        }
        setSlots(Array.isArray(body.slots) ? body.slots : []);
        if (typeof body.timezone === "string" && body.timezone.trim()) {
          setResolvedTz(body.timezone.trim());
        }
      })
      .catch(() => {
        if (!cancelled) setError(t("public.slotPicker.unavailable"));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [offeringId, from, days, t]);

  const locale = typeof document !== "undefined" && document.documentElement.lang.startsWith("es")
    ? "es"
    : "en";

  return (
    <div data-testid="slot-picker">
      <p className="text-sm font-semibold text-[var(--plt-ink,#0B0B0D)]">
        {t("public.slotPicker.title")}
      </p>
      <p className="mt-1 text-xs text-[var(--plt-muted,rgba(11,11,13,0.62))]">
        {t("public.slotPicker.subtitle")}
      </p>
      {loading ? (
        <p className="mt-3 text-xs text-[var(--plt-muted,rgba(11,11,13,0.62))]">
          {t("public.slotPicker.loading")}
        </p>
      ) : error ? (
        <p className="mt-3 text-xs text-[#dc2626]">{error}</p>
      ) : slots.length === 0 ? (
        <p className="mt-3 text-xs text-[var(--plt-muted,rgba(11,11,13,0.62))]">
          {t("public.slotPicker.empty")}
        </p>
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
