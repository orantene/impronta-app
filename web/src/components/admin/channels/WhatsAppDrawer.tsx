"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { MessagesShell } from "@/components/admin/pos/messages/MessagesShell";
import { useT } from "@/i18n/use-t";
import { interpolate } from "@/i18n/interpolate";
import { loadWhatsAppConnection } from "@/lib/channels/pairing-actions";
import {
  isLiveWhatsAppState,
  needsPairingWhatsApp,
  type WhatsAppConnectionPublic,
} from "@/lib/channels/types";
import { cn } from "@/lib/utils";

import { AskOwnerPanel } from "./AskOwnerPanel";
import { ConnectionBanner } from "./ConnectionBanner";
import { PairingPanel } from "./PairingPanel";
import { WhatsAppIcon } from "./WhatsAppIcon";
import {
  WHATSAPP_DRAWER_OPEN_EVENT,
  WHATSAPP_DRAWER_TOGGLE_EVENT,
} from "./whatsapp-events";

/** Workspace + POS both mount this. Only the first instance owns Option+W. */
let drawerHostCount = 0;

function workspaceAdminBase(): string {
  if (typeof window === "undefined") return "/admin";
  const parts = window.location.pathname.split("/").filter(Boolean);
  if (parts[0] === "admin") return "/admin";
  const adminAt = parts.indexOf("admin");
  if (adminAt > 0) return `/${parts.slice(0, adminAt + 1).join("/")}`;
  return "/admin";
}

export function WhatsAppDrawerHost() {
  const [primary, setPrimary] = useState(false);
  useEffect(() => {
    if (drawerHostCount > 0) return;
    drawerHostCount += 1;
    setPrimary(true);
    return () => {
      drawerHostCount -= 1;
    };
  }, []);
  if (!primary) return null;
  return <WhatsAppDrawerPanel />;
}

function WhatsAppDrawerPanel() {
  const [enabled, setEnabled] = useState(false);
  const [open, setOpen] = useState(false);
  const [connection, setConnection] = useState<WhatsAppConnectionPublic | null>(null);
  const [channelFilter, setChannelFilter] = useState<"whatsapp" | "all">("whatsapp");
  const [focusId, setFocusId] = useState<string | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const t = useT();

  const refresh = useCallback(async () => {
    const result = await loadWhatsAppConnection();
    if (!result.ok || !result.enabled) {
      setEnabled(false);
      setConnection(null);
      return;
    }
    setEnabled(true);
    setConnection(result.connection);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!enabled) return;
    const onToggle = () => setOpen((value) => !value);
    const onOpen = (event: Event) => {
      const inquiryId = (event as CustomEvent<{ inquiryId?: string }>).detail?.inquiryId;
      if (inquiryId) setFocusId(inquiryId);
      setOpen(true);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.altKey && (event.key === "w" || event.key === "W") && !event.metaKey && !event.ctrlKey) {
        event.preventDefault();
        setOpen((value) => !value);
      }
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener(WHATSAPP_DRAWER_TOGGLE_EVENT, onToggle);
    window.addEventListener(WHATSAPP_DRAWER_OPEN_EVENT, onOpen);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener(WHATSAPP_DRAWER_TOGGLE_EVENT, onToggle);
      window.removeEventListener(WHATSAPP_DRAWER_OPEN_EVENT, onOpen);
      window.removeEventListener("keydown", onKey);
    };
  }, [enabled]);

  useEffect(() => {
    if (!open || !enabled) return;
    void refresh();
    const id = window.setInterval(() => { void refresh(); }, 2000);
    return () => window.clearInterval(id);
  }, [open, enabled, refresh]);

  useEffect(() => {
    if (!open) return;
    const node = panelRef.current;
    node?.querySelector<HTMLElement>("button, input, a, textarea")?.focus();
  }, [open]);

  if (!enabled || !connection) return null;

  const live = isLiveWhatsAppState(connection.state);
  const locationSlug = "default";
  const adminBasePath = workspaceAdminBase();
  const titleName = connection.tenantName || connection.displayName || "WhatsApp";

  return (
    <div className={open ? "contents" : "hidden"} data-tulala-whatsapp-root>
      {open ? (
        <button
          type="button"
          aria-label={t("dashboard.channels.drawer.close")}
          className="fixed inset-0 z-[70] bg-admin-ink/20"
          onClick={() => setOpen(false)}
        />
      ) : null}
      <aside
        ref={panelRef}
        data-tulala-whatsapp-drawer
        aria-hidden={!open}
        className={cn(
          "fixed inset-y-0 right-0 z-[80] flex w-full max-w-[820px] flex-col bg-admin-card shadow-admin-hover max-[1279px]:max-w-[720px] max-[720px]:inset-x-0 max-[720px]:top-auto max-[720px]:h-[92vh] max-[720px]:rounded-t-[20px]",
          open ? "translate-x-0" : "pointer-events-none translate-x-full",
        )}
      >
        <header className="flex items-start justify-between gap-3 border-b border-admin-border-soft px-5 py-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-admin-success">
              <WhatsAppIcon size={18} />
              <h2 className="m-0 truncate text-[16px] font-semibold text-admin-ink">
                {interpolate(t("dashboard.channels.drawer.title"), { name: titleName })}
              </h2>
            </div>
            <p className="m-0 mt-1 text-[12px] text-admin-ink-muted">
              {connection.phoneE164
                ? interpolate(t("dashboard.channels.drawer.subtitleLive"), {
                    phone: connection.phoneE164,
                    unread: String(connection.unread),
                  })
                : t("dashboard.channels.drawer.subtitleOff")}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {live ? (
              <>
                <button
                  type="button"
                  className="hidden text-[12px] font-semibold text-admin-ink-muted md:inline"
                  onClick={() => setChannelFilter((value) => (value === "all" ? "whatsapp" : "all"))}
                >
                  {channelFilter === "all"
                    ? t("dashboard.channels.drawer.whatsappOnly")
                    : t("dashboard.channels.drawer.allChannels")}
                </button>
                <a
                  href={`${adminBasePath}/messages`}
                  className="text-[12px] font-semibold text-admin-brand no-underline"
                >
                  {t("dashboard.channels.drawer.openMessages")}
                </a>
              </>
            ) : null}
            <button
              type="button"
              aria-label={t("dashboard.channels.drawer.close")}
              onClick={() => setOpen(false)}
              className="inline-flex h-8 w-8 items-center justify-center rounded-[8px] text-admin-ink-muted"
            >
              ×
            </button>
          </div>
        </header>
        <ConnectionBanner state={connection.state} />
        <div className="min-h-0 flex-1">
          {live ? (
            <MessagesShell
              mode="counter"
              locationSlug={locationSlug}
              tenantId={connection.tenantId}
              adminBasePath={adminBasePath}
              channelFilter={channelFilter}
              initialInquiryId={focusId}
            />
          ) : needsPairingWhatsApp(connection.state) || connection.state === "pairing" ? (
            connection.canPair ? (
              <PairingPanel connection={connection} />
            ) : (
              <AskOwnerPanel ownerFirstName={connection.ownerFirstName} />
            )
          ) : (
            <AskOwnerPanel ownerFirstName={connection.ownerFirstName} />
          )}
        </div>
      </aside>
    </div>
  );
}
