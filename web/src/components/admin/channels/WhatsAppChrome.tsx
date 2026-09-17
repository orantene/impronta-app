"use client";

import { useEffect, useState, type ComponentType } from "react";

import type { WhatsAppConnectionPublic } from "@/lib/channels/types";

import { WhatsAppButton } from "./WhatsAppButton";

/**
 * EXPERIMENTAL one-line mounts. If the flag is off these render nothing.
 * Search these names to remove the feature: WhatsAppTopBarButton, WhatsAppDrawerHost.
 *
 * This file must stay free of server-action and MessagesShell imports.
 * PosFrame and IdentityBar render tests import it; a static import of
 * pairing-actions (server-only) or the drawer would fail those suites.
 *
 * THE POLL IS A FETCH, NOT A SERVER ACTION, AND THERE IS ONE OF IT (D-171).
 * The button is mounted three times (desktop bar, phone bar, POS header) and
 * used to call `loadWhatsAppConnection` every 8 s from each mount. A server
 * action rides the router's action queue, and a navigation that lands while
 * one is in flight can have the OLD address re-applied over it by the next
 * queued action (see `app/api/admin/channels/whatsapp/route.ts`). On the
 * counter that threw the operator from the switch-entered POS back to the
 * Overview. So: one module-level poller that every mount subscribes to, over
 * `GET /api/admin/channels/whatsapp`, paused while the tab is hidden.
 */

export const WHATSAPP_CONNECTION_ROUTE = "/api/admin/channels/whatsapp";
const POLL_MS = 8000;

type ConnectionResult =
  | { ok: true; connection: WhatsAppConnectionPublic; enabled: true }
  | { ok: true; enabled: false }
  | { ok: false; reason: string };

type Snapshot = { connection: WhatsAppConnectionPublic | null; disabled: boolean };

const listeners = new Set<(s: Snapshot) => void>();
let snapshot: Snapshot = { connection: null, disabled: false };
let timer: number | null = null;
let inFlight = false;

function publish(next: Snapshot) {
  snapshot = next;
  for (const fn of listeners) fn(next);
}

export async function refreshWhatsAppConnection(): Promise<void> {
  if (inFlight) return;
  inFlight = true;
  try {
    const res = await fetch(WHATSAPP_CONNECTION_ROUTE, { cache: "no-store", credentials: "same-origin" });
    if (!res.ok) {
      publish({ connection: null, disabled: snapshot.disabled });
      return;
    }
    const result = (await res.json()) as ConnectionResult;
    if (result.ok && result.enabled === false) {
      publish({ connection: null, disabled: true });
      return;
    }
    publish({ connection: result.ok && result.enabled ? result.connection : null, disabled: false });
  } catch {
    publish({ connection: null, disabled: snapshot.disabled });
  } finally {
    inFlight = false;
  }
}

function tick() {
  if (snapshot.disabled) return;
  if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
  void refreshWhatsAppConnection();
}

function subscribe(fn: (s: Snapshot) => void): () => void {
  listeners.add(fn);
  fn(snapshot);
  if (listeners.size === 1) {
    tick();
    timer = window.setInterval(tick, POLL_MS);
    document.addEventListener("visibilitychange", tick);
  }
  return () => {
    listeners.delete(fn);
    if (listeners.size === 0 && timer !== null) {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", tick);
      timer = null;
    }
  };
}

export function WhatsAppTopBarButton({
  size,
  iconOnly = false,
}: {
  size: 32 | 34 | 40;
  iconOnly?: boolean;
}) {
  const [current, setCurrent] = useState<Snapshot>(() => snapshot);
  useEffect(() => subscribe(setCurrent), []);
  if (!current.connection) return null;
  return <WhatsAppButton connection={current.connection} size={size} iconOnly={iconOnly} />;
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
