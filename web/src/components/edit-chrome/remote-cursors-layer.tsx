"use client";

/**
 * RemoteCursorsLayer — WS1-B (live cursors).
 *
 * Figma-style live cursors. Self-contained: it opens its OWN Supabase Realtime
 * BROADCAST channel (same room as presence, keyed by pageId+locale), reads its
 * identity (tab id, name, color) from `usePagePresence()`, broadcasts the local
 * pointer anchored to the builder node under it (node id + fractional position),
 * and renders peers' cursors by re-projecting that fraction onto the SAME node's
 * box in this editor — so cursors line up across different zoom / scroll / width
 * (see cursor-coords.ts). Pure ephemeral broadcast: zero DB writes, no builder-tree
 * coupling. Gated behind NEXT_PUBLIC_BUILDER_PRESENCE.
 */
import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

import { createClient } from "@/lib/supabase/client";
import { isBuilderPresenceEnabled } from "@/lib/site-admin/edit-mode/presence-flag";

import { useEditContext } from "./edit-context";
import { usePagePresence } from "./presence-provider";
import { useSelectedBuilderNodeId } from "./selection-bridge";
import { anchorToCursor, cursorToAnchor } from "./cursor-coords";
import {
  reconcileRemoteCursors,
  removeRemoteCursor,
  resetRemoteCursors,
  upsertRemoteCursor,
  useRemoteCursors,
} from "./remote-cursor-bridge";

/** Min ms between cursor broadcasts (~22fps) — smooth without flooding Realtime. */
const BROADCAST_MS = 45;

function cssEscape(value: string): string {
  if (typeof CSS !== "undefined" && typeof CSS.escape === "function") {
    return CSS.escape(value);
  }
  return value.replace(/["\\]/g, "\\$&");
}

export function RemoteCursorsLayer() {
  if (!isBuilderPresenceEnabled()) return null;
  return <RemoteCursorsLayerInner />;
}

function RemoteCursorsLayerInner() {
  const { pageId, locale } = useEditContext();
  const { editors } = usePagePresence();
  const selectedNodeId = useSelectedBuilderNodeId();

  const self = editors.find((e) => e.isSelf) ?? null;
  const selfRef = useRef(self);
  useEffect(() => {
    selfRef.current = self;
  }, [self]);
  const selectedRef = useRef<string | null>(selectedNodeId);
  useEffect(() => {
    selectedRef.current = selectedNodeId;
  }, [selectedNodeId]);

  const sendRef = useRef<((payload: Record<string, unknown>) => void) | null>(
    null,
  );

  // ── Broadcast channel (its own; same room as presence) ────────────────────
  useEffect(() => {
    if (!pageId) return;
    let supa: ReturnType<typeof createClient>;
    try {
      supa = createClient();
    } catch {
      supa = null;
    }
    if (!supa) return;

    const channelName = locale
      ? `cms-cursors-${pageId}-${locale}`
      : `cms-cursors-${pageId}`;
    const channel = supa.channel(channelName, {
      config: { broadcast: { self: false } },
    });

    channel
      .on("broadcast", { event: "cursor" }, ({ payload }) => {
        const p = payload as
          | {
              tabId?: string;
              nodeId?: string;
              fx?: number;
              fy?: number;
              name?: string;
              color?: string;
              selectedNodeId?: string | null;
            }
          | undefined;
        if (
          !p ||
          typeof p.tabId !== "string" ||
          typeof p.nodeId !== "string" ||
          typeof p.fx !== "number" ||
          typeof p.fy !== "number"
        ) {
          return;
        }
        if (selfRef.current && p.tabId === selfRef.current.id) return;
        upsertRemoteCursor({
          tabId: p.tabId,
          nodeId: p.nodeId,
          fx: p.fx,
          fy: p.fy,
          name: typeof p.name === "string" ? p.name : "Editor",
          color: typeof p.color === "string" ? p.color : "#1e6f8e",
          selectedNodeId:
            typeof p.selectedNodeId === "string" ? p.selectedNodeId : null,
          lastSeen: Date.now(),
        });
      })
      .on("broadcast", { event: "cursor-leave" }, ({ payload }) => {
        const tabId = (payload as { tabId?: string } | undefined)?.tabId;
        if (typeof tabId === "string") removeRemoteCursor(tabId);
      })
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          sendRef.current = (payload) => {
            try {
              void channel.send({ type: "broadcast", event: "cursor", payload });
            } catch {
              // ignore — cursors are decorative
            }
          };
        }
      });

    return () => {
      const me = selfRef.current?.id;
      sendRef.current = null;
      try {
        if (me) {
          void channel.send({
            type: "broadcast",
            event: "cursor-leave",
            payload: { tabId: me },
          });
        }
        void supa!.removeChannel(channel);
      } catch {
        // ignore
      }
      resetRemoteCursors();
    };
  }, [pageId, locale]);

  // ── Local pointer → throttled anchored broadcast ──────────────────────────
  useEffect(() => {
    let raf = 0;
    let lastSent = 0;
    let pending: { x: number; y: number } | null = null;

    const flush = () => {
      raf = 0;
      const now = Date.now();
      if (now - lastSent < BROADCAST_MS) return;
      const me = selfRef.current;
      const send = sendRef.current;
      if (!me || !send || !pending) return;
      const target = document.elementFromPoint(pending.x, pending.y);
      const nodeEl = target?.closest?.("[data-builder-node-id]") as
        | HTMLElement
        | null
        | undefined;
      const nodeId = nodeEl?.getAttribute("data-builder-node-id");
      if (!nodeEl || !nodeId) return;
      const rect = nodeEl.getBoundingClientRect();
      const anchor = cursorToAnchor(pending.x, pending.y, nodeId, rect);
      lastSent = now;
      send({
        tabId: me.id,
        nodeId: anchor.nodeId,
        fx: anchor.fx,
        fy: anchor.fy,
        name: me.name,
        color: me.color,
        selectedNodeId: selectedRef.current,
      });
    };

    const onMove = (e: PointerEvent) => {
      pending = { x: e.clientX, y: e.clientY };
      if (!raf) raf = requestAnimationFrame(flush);
    };

    window.addEventListener("pointermove", onMove, { passive: true });
    return () => {
      window.removeEventListener("pointermove", onMove);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  // ── Prune cursors of editors who left (presence is the source of truth) ───
  useEffect(() => {
    reconcileRemoteCursors(new Set(editors.map((e) => e.id)));
  }, [editors]);

  // ── Re-render on scroll/resize so peer cursors track MY viewport ──────────
  const cursors = useRemoteCursors();
  const [, forceTick] = useState(0);
  useEffect(() => {
    if (cursors.size === 0) return;
    const tick = () => forceTick((t) => (t + 1) % 1_000_000);
    window.addEventListener("scroll", tick, { passive: true, capture: true });
    window.addEventListener("resize", tick, { passive: true });
    return () => {
      window.removeEventListener("scroll", tick, { capture: true });
      window.removeEventListener("resize", tick);
    };
  }, [cursors.size]);

  if (typeof document === "undefined") return null;
  const portal = document.getElementById("edit-overlay-portal");
  if (!portal) return null;

  const selfId = self?.id;
  const items: ReactNode[] = [];
  for (const c of cursors.values()) {
    if (c.tabId === selfId) continue;
    // WS1-C — selection awareness: ring the node this peer has selected.
    if (c.selectedNodeId) {
      const selEl = document.querySelector(
        `[data-builder-node-id="${cssEscape(c.selectedNodeId)}"]`,
      );
      if (selEl) {
        const r = selEl.getBoundingClientRect();
        items.push(
          <RemoteSelectionRing
            key={`sel-${c.tabId}`}
            rect={r}
            name={c.name}
            color={c.color}
          />,
        );
      }
    }
    const nodeEl = document.querySelector(
      `[data-builder-node-id="${cssEscape(c.nodeId)}"]`,
    );
    if (!nodeEl) continue;
    const rect = nodeEl.getBoundingClientRect();
    const { x, y } = anchorToCursor(c, rect);
    items.push(
      <CursorView key={c.tabId} x={x} y={y} name={c.name} color={c.color} />,
    );
  }

  return createPortal(<>{items}</>, portal);
}

/** WS1-C — a peer's selection outline (a colored ring + name tag on their node). */
function RemoteSelectionRing({
  rect,
  name,
  color,
}: {
  rect: { left: number; top: number; width: number; height: number };
  name: string;
  color: string;
}) {
  return (
    <div
      aria-hidden
      style={{
        position: "fixed",
        left: rect.left - 1,
        top: rect.top - 1,
        width: rect.width + 2,
        height: rect.height + 2,
        zIndex: 129,
        pointerEvents: "none",
        border: `1.5px solid ${color}`,
        borderRadius: 4,
        boxShadow: `0 0 0 1px ${color}22`,
      }}
    >
      <span
        style={{
          position: "absolute",
          left: -1,
          top: -16,
          whiteSpace: "nowrap",
          borderRadius: "4px 4px 4px 0",
          background: color,
          color: "#fff",
          fontSize: 9.5,
          fontWeight: 700,
          lineHeight: "1",
          padding: "2px 5px",
        }}
      >
        {name}
      </span>
    </div>
  );
}

function CursorView({
  x,
  y,
  name,
  color,
}: {
  x: number;
  y: number;
  name: string;
  color: string;
}) {
  return (
    <div
      aria-hidden
      style={{
        position: "fixed",
        left: x,
        top: y,
        zIndex: 130,
        pointerEvents: "none",
        transform: "translate(-2px, -2px)",
        transition: "left 90ms linear, top 90ms linear",
        willChange: "left, top",
      }}
    >
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
        <path
          d="M5 3l14 7-6 2-2 6-6-15z"
          fill={color}
          stroke="#fff"
          strokeWidth="1.5"
          strokeLinejoin="round"
        />
      </svg>
      <span
        style={{
          position: "absolute",
          left: 14,
          top: 12,
          whiteSpace: "nowrap",
          borderRadius: 6,
          background: color,
          color: "#fff",
          fontSize: 10.5,
          fontWeight: 700,
          lineHeight: "1",
          padding: "3px 6px",
          boxShadow: "0 1px 2px rgba(17,24,39,0.25)",
        }}
      >
        {name}
      </span>
    </div>
  );
}
