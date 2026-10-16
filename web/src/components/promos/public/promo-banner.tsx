"use client";

import { useEffect, useState } from "react";

import { publicPromoCopy } from "@/lib/promos/copy/public";
import { countdownParts } from "@/lib/promos/public-view";

/** Optional slim banner on top of a talent site: "Semana de lanzamiento · -30% · termina en 2d 14h". */
export function PromoBanner({
  title,
  offLabel,
  endsAt,
  showCountdown,
  locale,
}: {
  title: string;
  offLabel?: string | null;
  endsAt?: string | null;
  showCountdown?: boolean;
  locale: string;
}) {
  const copy = publicPromoCopy(locale);
  const [nowMs, setNowMs] = useState<number | null>(null);
  useEffect(() => {
    if (!showCountdown || !endsAt) return;
    setNowMs(Date.now());
    const t = window.setInterval(() => setNowMs(Date.now()), 60_000);
    return () => window.clearInterval(t);
  }, [showCountdown, endsAt]);
  const parts = showCountdown && endsAt && nowMs !== null ? countdownParts(Date.parse(endsAt), nowMs) : null;
  const text = [title, offLabel, parts ? copy.endsIn(parts.d, parts.h, parts.m) : null].filter(Boolean).join(" · ");
  return (
    <div role="note" data-promo-banner="" style={{ padding: "8px 16px", textAlign: "center", fontSize: 14, fontWeight: 600 }}>
      {text}
    </div>
  );
}
