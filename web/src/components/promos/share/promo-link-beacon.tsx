"use client";

import { useEffect } from "react";

import type { PromoEventKind } from "@/lib/promos/share/events";

/**
 * Fires once per page view: logs the open and pins the promo (httpOnly cookie
 * set by the response). Fire-and-forget; the page never waits on it.
 */
export function PromoLinkBeacon({
  promoId,
  via,
  token,
  kind = "link_open",
}: {
  promoId: string;
  via: string | null;
  token?: string | null;
  kind?: PromoEventKind;
}) {
  useEffect(() => {
    const body = JSON.stringify({ promoId, kind, via, t: token ?? undefined });
    void fetch("/api/promos/event", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      keepalive: true,
      credentials: "same-origin",
    }).catch(() => undefined);
  }, [promoId, via, token, kind]);
  return null;
}
