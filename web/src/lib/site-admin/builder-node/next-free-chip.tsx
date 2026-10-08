/**
 * Next-free-time chip — live-bound to `/api/public/booking/slots`.
 * Hidden when no bookable offering or the API returns an empty list.
 * Kept out of render.tsx to avoid growing the god file.
 */
"use client";

import { useEffect, useState, type CSSProperties, type ReactNode } from "react";

import { fetchLiveSlots } from "@/components/public-booking/catalog-booking-live-slots";
import {
  isSlotEligibleOffering,
  pickBookableOffering,
} from "@/components/public-booking/pick-bookable-offering";
import type { TalentOffering } from "@/lib/talent/offerings-types";

import { firstSlotStart, openAtNextSlot, type NextSlot } from "@/lib/talent-site/next-free-slot";

import { safeChipHref } from "./next-free-chip-href";
import type { BuilderNextFreeChipNode } from "./types";

export const NEXT_FREE_CHIP_CSS = `
.sb-next-free{display:inline-flex;align-items:center;gap:0.4rem;margin:0;padding:0.4rem 0.85rem;border-radius:999px;border:1px solid var(--token-color-line,currentColor);background:color-mix(in srgb,var(--token-color-background,Canvas) 88%,transparent);color:var(--token-color-ink,CanvasText);font:inherit;font-size:0.8125rem;letter-spacing:0.01em;line-height:1.2;max-width:100%}
.sb-next-free[hidden],.sb-next-free[data-empty="1"]{display:none!important}
.sb-next-free-label{font-weight:500;color:var(--token-color-muted,var(--token-color-ink))}
.sb-next-free[data-variant="stacked"]{gap:9px;padding:9px 13px 9px 10px;border:0;border-radius:16px;font-size:12.5px;text-align:left;background:color-mix(in srgb,var(--token-color-surface-raised,var(--token-color-background,Canvas)) 92%,transparent);-webkit-backdrop-filter:blur(10px);backdrop-filter:blur(10px);box-shadow:0 10px 30px -16px color-mix(in srgb,var(--token-color-ink,CanvasText) 60%,transparent)}
a.sb-next-free{text-decoration:none;cursor:pointer}
a.sb-next-free:focus-visible{outline:2px solid var(--token-color-accent,var(--token-color-primary,currentColor));outline-offset:2px}
.sb-next-free-dot{flex:0 0 auto;width:9px;height:9px;border-radius:50%;background:var(--token-color-success,var(--token-color-accent,currentColor));box-shadow:0 0 0 4px color-mix(in srgb,var(--token-color-success,var(--token-color-accent,currentColor)) 18%,transparent)}
.sb-next-free-stack{display:flex;flex-direction:column;gap:1px}
.sb-next-free-stack b{font-size:13.5px;font-weight:600;color:var(--token-color-ink,CanvasText)}
.sb-next-free-stack small{font-size:12.5px;color:var(--token-color-muted,var(--token-color-ink))}
.sb-next-free-when{font-family:var(--token-typography-heading-font-family,var(--site-heading-font,Georgia,serif));font-style:italic;font-weight:400;color:var(--token-color-accent,var(--token-color-primary,var(--token-color-ink)))}
`;

type Locale = "en" | "es";

/** "Today at 12:00" / "Hoy a las 12:00"; tomorrow likewise; later: weekday + time. */
function formatSlotRelative(iso: string, timezone: string, locale: Locale): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const tz = timezone || "UTC";
  const loc = locale === "es" ? "es-MX" : "en-US";
  let dayKey: (d: Date) => string;
  let time: string;
  try {
    const dayFmt = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" });
    dayKey = (d) => dayFmt.format(d);
    time = new Intl.DateTimeFormat(loc, { timeZone: tz, hour: "numeric", minute: "2-digit", hour12: locale !== "es" }).format(date);
  } catch {
    return formatSlotWhen(iso, timezone, locale);
  }
  const now = new Date();
  const tomorrow = new Date(now.getTime() + 86_400_000);
  if (dayKey(date) === dayKey(now)) return locale === "es" ? `Hoy a las ${time}` : `Today at ${time}`;
  if (dayKey(date) === dayKey(tomorrow)) return locale === "es" ? `Mañana a las ${time}` : `Tomorrow at ${time}`;
  return formatSlotWhen(iso, timezone, locale);
}

function pickLocale(raw?: string): Locale {
  return raw?.toLowerCase().startsWith("es") ? "es" : "en";
}

function formatSlotWhen(iso: string, timezone: string, locale: Locale): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  try {
    return new Intl.DateTimeFormat(locale === "es" ? "es-MX" : "en-US", {
      timeZone: timezone || "UTC",
      weekday: "short",
      hour: "numeric",
      minute: "2-digit",
    }).format(date);
  } catch {
    return new Intl.DateTimeFormat(locale === "es" ? "es-MX" : "en-US", {
      weekday: "short",
      hour: "numeric",
      minute: "2-digit",
    }).format(date);
  }
}

export function NextFreeChipIsland({
  offerings,
  offeringId,
  labelEn,
  labelEs,
  days = 14,
  locale,
  variant = "inline",
  href,
}: {
  offerings: ReadonlyArray<TalentOffering>;
  offeringId?: string;
  labelEn: string;
  labelEs: string;
  days?: number;
  locale?: string;
  variant?: "inline" | "stacked";
  /** Stacked only: a same-page anchor or site path makes the chip a link. */
  href?: string;
}) {
  const loc = pickLocale(locale);
  const label = (loc === "es" ? labelEs : labelEn).trim() || (loc === "es" ? "Próximo libre" : "Next free");
  const [when, setWhen] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  // TUL-232: the first free start, so the linked chip can open booking at it.
  const [slot, setSlot] = useState<NextSlot | null>(null);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      const picked =
        offeringId && offeringId.trim()
          ? (() => {
              const match = offerings.find((o) => o.id === offeringId);
              if (!match || !isSlotEligibleOffering(match)) return null;
              return {
                offeringId: match.id,
                durationMinutes: match.durationMinutes as number,
              };
            })()
          : pickBookableOffering([...offerings]);
      if (!picked) {
        if (!cancelled) {
          setWhen(null);
          setSlot(null);
          setReady(true);
        }
        return;
      }
      try {
        const { slots, timezone } = await fetchLiveSlots(
          picked.offeringId,
          picked.durationMinutes,
        );
        // days prop reserved for a future slots API days param; fetchLiveSlots uses 14 today.
        void days;
        const first = slots[0];
        const formatted = first
          ? variant === "stacked"
            ? formatSlotRelative(first, timezone, loc)
            : formatSlotWhen(first, timezone, loc)
          : "";
        if (!cancelled) {
          setWhen(formatted || null);
          const start = firstSlotStart(slots);
          setSlot(start ? { offeringId: picked.offeringId, slotStart: start } : null);
          setReady(true);
        }
      } catch {
        if (!cancelled) {
          setWhen(null);
          setSlot(null);
          setReady(true);
        }
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [offerings, offeringId, days, loc, variant]);

  if (!ready || !when) {
    return (
      <span className="sb-next-free" data-empty="1" hidden aria-hidden="true">
        <style>{NEXT_FREE_CHIP_CSS}</style>
      </span>
    );
  }

  if (variant === "stacked") {
    const inner = (
      <>
        <style>{NEXT_FREE_CHIP_CSS}</style>
        <span className="sb-next-free-dot" aria-hidden="true" />
        <span className="sb-next-free-stack">
          <b className="sb-next-free-when-strong">{when}</b>
          <small>{loc === "es" && label === "Próximo libre" ? "Próximo horario libre" : loc === "en" && label === "Next free" ? "Next free time" : label}</small>
        </span>
      </>
    );
    const link = safeChipHref(href);
    return link ? (
      <a
        className="sb-next-free"
        href={link}
        data-next-free-chip=""
        data-has-slot="1"
        data-variant="stacked"
        onClick={(e) => {
          // Booking opens at the slot when the offering is registered; otherwise the link works as before.
          if (openAtNextSlot(slot)) e.preventDefault();
        }}
      >
        {inner}
      </a>
    ) : (
      <p className="sb-next-free" data-next-free-chip="" data-has-slot="1" data-variant="stacked">
        {inner}
      </p>
    );
  }

  return (
    <p className="sb-next-free" data-next-free-chip="" data-has-slot="1">
      <style>{NEXT_FREE_CHIP_CSS}</style>
      <span className="sb-next-free-label">{label}</span>
      <span aria-hidden="true">·</span>
      <span className="sb-next-free-when">{when}</span>
    </p>
  );
}

export function renderNextFreeChip(args: {
  node: BuilderNextFreeChipNode;
  offerings: ReadonlyArray<TalentOffering>;
  locale?: string;
  styleAttr?: CSSProperties;
}): ReactNode {
  const p = args.node.props;
  return (
    <div
      data-builder-node-kind="next_free_chip"
      data-builder-node-id={args.node.id}
      className="site-builder-node site-builder-node--next-free-chip"
      style={args.styleAttr}
    >
      <NextFreeChipIsland
        offerings={args.offerings}
        offeringId={p.offeringId}
        labelEn={p.labelEn ?? "Next free"}
        labelEs={p.labelEs ?? "Próximo libre"}
        days={p.days}
        locale={args.locale}
        variant={p.variant ?? "inline"}
        href={p.href}
      />
    </div>
  );
}

/** Client-component form for the server renderer (see ReviewsBlockView). */
export function NextFreeChipView(props: Parameters<typeof renderNextFreeChip>[0]): ReactNode {
  return renderNextFreeChip(props);
}
