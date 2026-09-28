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

import type { BuilderNextFreeChipNode } from "./types";

export const NEXT_FREE_CHIP_CSS = `
.sb-next-free{display:inline-flex;align-items:center;gap:0.4rem;margin:0;padding:0.4rem 0.85rem;border-radius:999px;border:1px solid var(--token-color-line,currentColor);background:color-mix(in srgb,var(--token-color-background,Canvas) 88%,transparent);color:var(--token-color-ink,CanvasText);font:inherit;font-size:0.8125rem;letter-spacing:0.01em;line-height:1.2;max-width:100%}
.sb-next-free[hidden],.sb-next-free[data-empty="1"]{display:none!important}
.sb-next-free-label{font-weight:500;color:var(--token-color-muted,var(--token-color-ink))}
.sb-next-free-when{font-family:var(--token-typography-heading-font-family,var(--site-heading-font,Georgia,serif));font-style:italic;font-weight:400;color:var(--token-color-accent,var(--token-color-primary,var(--token-color-ink)))}
`;

type Locale = "en" | "es";

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
}: {
  offerings: ReadonlyArray<TalentOffering>;
  offeringId?: string;
  labelEn: string;
  labelEs: string;
  days?: number;
  locale?: string;
}) {
  const loc = pickLocale(locale);
  const label = (loc === "es" ? labelEs : labelEn).trim() || (loc === "es" ? "Próximo libre" : "Next free");
  const [when, setWhen] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

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
        const formatted = first ? formatSlotWhen(first, timezone, loc) : "";
        if (!cancelled) {
          setWhen(formatted || null);
          setReady(true);
        }
      } catch {
        if (!cancelled) {
          setWhen(null);
          setReady(true);
        }
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [offerings, offeringId, days, loc]);

  if (!ready || !when) {
    return (
      <span className="sb-next-free" data-empty="1" hidden aria-hidden="true">
        <style>{NEXT_FREE_CHIP_CSS}</style>
      </span>
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
      />
    </div>
  );
}
