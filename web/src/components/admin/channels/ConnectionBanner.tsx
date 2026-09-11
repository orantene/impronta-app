"use client";

import { useT } from "@/i18n/use-t";
import { interpolate } from "@/i18n/interpolate";
import type { WhatsAppConnectionState } from "@/lib/channels/types";

export function ConnectionBanner({
  state,
  attempt,
}: {
  state: WhatsAppConnectionState;
  attempt?: number;
}) {
  const t = useT();
  if (state === "connected" || state === "disconnected" || state === "pairing") return null;
  const tone =
    state === "phone_offline"
      ? "bg-admin-surface-alt text-admin-ink-muted"
      : "bg-admin-critical-soft text-admin-red";
  const copy =
    state === "phone_offline"
      ? t("dashboard.channels.banner.phoneOffline")
      : state === "reconnecting"
        ? interpolate(t("dashboard.channels.banner.reconnecting"), { n: String(attempt ?? 2) })
        : state === "blocked"
          ? t("dashboard.channels.banner.blocked")
          : t("dashboard.channels.banner.unlinked");
  return (
    <p data-tulala-whatsapp-banner={state} className={`mx-4 mt-3 rounded-[12px] px-4 py-2 text-[13px] ${tone}`}>
      {copy}
    </p>
  );
}
