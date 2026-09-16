"use client";

import { useT } from "@/i18n/use-t";
import {
  isLiveWhatsAppState,
  needsPairingWhatsApp,
  type WhatsAppConnectionPublic,
} from "@/lib/channels/types";
import { cn } from "@/lib/utils";

import { WhatsAppIcon } from "./WhatsAppIcon";
import { toggleWhatsAppDrawer } from "./whatsapp-events";

function dotClass(state: WhatsAppConnectionPublic["state"]): string {
  if (state === "pairing") return "bg-admin-royal";
  if (state === "connected") return "bg-admin-success";
  if (state === "phone_offline") return "bg-admin-ink-dim";
  if (state === "reconnecting" || state === "blocked") return "bg-admin-coral";
  return "bg-admin-ink-dim";
}

export function WhatsAppButton({
  connection,
  size,
  iconOnly = false,
}: {
  connection: WhatsAppConnectionPublic;
  size: 32 | 34 | 40;
  iconOnly?: boolean;
}) {
  const t = useT();
  const reconnect = connection.state === "unlinked" || connection.state === "blocked";
  const label =
    needsPairingWhatsApp(connection.state) && connection.canPair
      ? reconnect
        ? t("dashboard.channels.button.reconnect")
        : t("dashboard.channels.button.connect")
      : t("dashboard.channels.button.whatsapp");
  const showDot = connection.state !== "disconnected" || !connection.canPair;
  return (
    <button
      type="button"
      data-tulala-whatsapp-button
      data-state={connection.state}
      aria-label={label}
      title={`${label} · ⌥W`}
      onClick={() => toggleWhatsAppDrawer()}
      className={cn(
        "inline-flex shrink-0 items-center justify-center gap-2 rounded-full border border-admin-border bg-admin-card font-semibold text-admin-ink",
        size === 40 ? "h-10 px-3.5 text-[14px]" : "h-8 px-3 text-[13px]",
        iconOnly && "w-8 px-0",
      )}
    >
      <span className="text-admin-success">
        <WhatsAppIcon size={size === 40 ? 16 : 14} />
      </span>
      {iconOnly ? null : <span className="whitespace-nowrap">{label}</span>}
      {showDot ? (
        <i aria-hidden className={cn("inline-block h-1.5 w-1.5 rounded-full", dotClass(connection.state))} />
      ) : null}
      {isLiveWhatsAppState(connection.state) && connection.unread > 0 ? (
        <span className="inline-flex min-w-[18px] items-center justify-center rounded-full bg-admin-coral px-1 text-[10px] font-bold text-white">
          {connection.unread > 99 ? "99+" : connection.unread}
        </span>
      ) : null}
    </button>
  );
}
