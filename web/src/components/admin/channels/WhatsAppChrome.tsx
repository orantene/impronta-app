"use client";

import { useCallback, useEffect, useState, type ComponentType } from "react";

import type { WhatsAppConnectionPublic } from "@/lib/channels/types";

import { WhatsAppButton } from "./WhatsAppButton";

/**
 * EXPERIMENTAL one-line mounts. If the flag is off these render nothing.
 * Search these names to remove the feature: WhatsAppTopBarButton, WhatsAppDrawerHost.
 *
 * This file must stay free of server-action and MessagesShell imports.
 * PosFrame and IdentityBar render tests import it; a static import of
 * pairing-actions (server-only) or the drawer would fail those suites.
 */

export function WhatsAppTopBarButton({
  size,
  iconOnly = false,
}: {
  size: 32 | 34 | 40;
  iconOnly?: boolean;
}) {
  const [connection, setConnection] = useState<WhatsAppConnectionPublic | null>(null);
  const [disabled, setDisabled] = useState(false);
  const refresh = useCallback(async () => {
    const { loadWhatsAppConnection } = await import("@/lib/channels/pairing-actions");
    const result = await loadWhatsAppConnection();
    if (result.ok && result.enabled === false) {
      setConnection(null);
      setDisabled(true);
      return;
    }
    if (result.ok && result.enabled) setConnection(result.connection);
    else setConnection(null);
  }, []);
  useEffect(() => {
    void refresh();
  }, [refresh]);
  useEffect(() => {
    if (disabled) return;
    const id = window.setInterval(() => { void refresh(); }, 8000);
    return () => window.clearInterval(id);
  }, [disabled, refresh]);
  if (!connection) return null;
  return <WhatsAppButton connection={connection} size={size} iconOnly={iconOnly} />;
}

export function WhatsAppDrawerHost() {
  const [Host, setHost] = useState<ComponentType | null>(null);
  useEffect(() => {
    void import("./WhatsAppDrawer").then((mod) => {
      setHost(() => mod.WhatsAppDrawerHost);
    });
  }, []);
  if (!Host) return null;
  return <Host />;
}
