"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { useT } from "@/i18n/use-t";
import { interpolate } from "@/i18n/interpolate";
import { HQ, HQ_F, PlanChip } from "../tenants/hq-kit";
import type { HqQueueRow } from "@/lib/support/load-hq";
import type { SupportMessageRow, SupportTicketRow } from "@/lib/support/support-types";
import type { SupportCannedReply } from "@/lib/platform/support-canned";
import { SupportTicketHqDrawer } from "./SupportTicketHqDrawer";
import { hqChangeStatusAction, hqClaimSelfAction } from "@/lib/support/hq-actions";
import { useHqSupportRealtime } from "@/components/support/support-hooks";
import {
  HQ_GUEST_AUDIENCE_ID,
  hqQueueSearchHaystack,
  surfaceIcon as surfaceIconKind,
} from "@/lib/support/support-hq-presentation";

type FilterId = "needsYou" | "waitingThem" | "new" | "allOpen" | "resolved7d";
type AudienceId = "all" | "workspace" | "talent" | "client" | typeof HQ_GUEST_AUDIENCE_ID;

function hoursAgo(iso: string): number {
  return (Date.now() - new Date(iso).getTime()) / 36e5;
}

function matchesFilter(row: HqQueueRow, filter: FilterId): boolean {
  const t = row.ticket;
  if (filter === "needsYou") return t.status === "open" && t.waitingOn === "support";
  if (filter === "waitingThem") return t.status === "open" && t.waitingOn === "requester";
  if (filter === "new") return t.status === "open" && !t.firstHumanResponseAt;
  if (filter === "allOpen") return t.status === "open";
  if (filter === "resolved7d") {
    if (t.status !== "resolved" || !t.resolvedAt) return false;
    return Date.now() - new Date(t.resolvedAt).getTime() < 7 * 864e5;
  }
  return true;
}

const SURFACE_HQ_COLOR: Record<string, string> = {
  purple: HQ.purple,
  amber: HQ.amber,
  green: HQ.green,
  blue: HQ.blue,
};

function surfaceIcon(surface: string): { glyph: string; color: string } {
  const { glyph, color } = surfaceIconKind(surface);
  return { glyph, color: SURFACE_HQ_COLOR[color] ?? HQ.blue };
}

export function SupportQueueClient({
  rows,
  initialTicketId,
  cannedReplies,
  onOpenCountChange,
}: {
  rows: HqQueueRow[];
  initialTicketId: string | null;
  cannedReplies: SupportCannedReply[];
  /** Lifts the live open count so the page header stops showing a stale
   *  server-render number after realtime inserts. */
  onOpenCountChange?: (n: number) => void;
}) {
  const t = useT();
  const [filter, setFilter] = useState<FilterId>("needsYou");
  const [audience, setAudience] = useState<AudienceId>("all");
  const [q, setQ] = useState("");
  const [queue, setQueue] = useState(rows);
  const [selected, setSelected] = useState<string | null>(initialTicketId);
  const [cursor, setCursor] = useState(0);
  const selectedRef = useRef(selected);
  const queueRef = useRef(queue);
  useEffect(() => {
    selectedRef.current = selected;
  }, [selected]);
  useEffect(() => {
    queueRef.current = queue;
  }, [queue]);

  useEffect(() => {
    setQueue(rows);
  }, [rows]);

  const ping = useCallback((ticketId: string, n: number, preview: string) => {
    if (typeof Notification === "undefined") return;
    if (Notification.permission !== "granted") return;
    const drawerOpen = selectedRef.current === ticketId;
    if (!document.hidden && drawerOpen) return;
    try {
      const note = new Notification(
        interpolate(t("dashboard.platform.support.pingTitle"), { n: String(n) }),
        { body: preview, tag: ticketId },
      );
      note.onclick = () => {
        window.focus();
        setSelected(ticketId);
        note.close();
      };
    } catch {
      /* permission can flip after the check */
    }
  }, []);

  const onTicketInsert = useCallback(
    (ticket: SupportTicketRow) => {
      setQueue((prev) => {
        if (prev.some((r) => r.ticket.id === ticket.id)) {
          return prev.map((r) => (r.ticket.id === ticket.id ? { ...r, ticket } : r));
        }
        return [
          {
            ticket,
            tenantName: null,
            tenantSlug: null,
            planTier: null,
            requesterName: ticket.contactName,
            requesterEmail: ticket.contactEmail,
          },
          ...prev,
        ];
      });
      ping(ticket.id, ticket.ticketNumber, ticket.subject || ticket.lastMessagePreview || "");
    },
    [ping],
  );
  const onTicketUpdate = useCallback((ticket: SupportTicketRow) => {
    setQueue((prev) =>
      prev.map((r) => (r.ticket.id === ticket.id ? { ...r, ticket } : r)),
    );
  }, []);
  const onRequesterMessage = useCallback(
    (message: SupportMessageRow) => {
      if (message.authorKind !== "requester") return;
      setQueue((prev) =>
        prev.map((r) =>
          r.ticket.id === message.ticketId
            ? {
                ...r,
                ticket: {
                  ...r.ticket,
                  lastMessageAt: message.createdAt,
                  lastMessagePreview: message.body.slice(0, 140),
                },
              }
            : r,
        ),
      );
      const n =
        queueRef.current.find((r) => r.ticket.id === message.ticketId)?.ticket.ticketNumber ?? 0;
      ping(message.ticketId, n, message.body.slice(0, 140));
    },
    [ping],
  );
  useHqSupportRealtime({ onTicketInsert, onTicketUpdate, onRequesterMessage });

  useEffect(() => {
    onOpenCountChange?.(queue.filter((r) => r.ticket.status === "open").length);
  }, [queue, onOpenCountChange]);

  const filtered = useMemo(() => {
    const query = q.trim().toLowerCase();
    return queue.filter((row) => {
      if (!matchesFilter(row, filter)) return false;
      if (audience !== "all" && row.ticket.surface !== audience) return false;
      if (!query) return true;
      const hay = hqQueueSearchHaystack(row);
      return hay.includes(query);
    });
  }, [queue, filter, audience, q]);

  useEffect(() => {
    if (cursor >= filtered.length) setCursor(0);
  }, [filtered.length, cursor]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target;
      if (target instanceof Element && target.matches("input, textarea, select, [contenteditable]")) return;
      // Drawer open: list shortcuts act on the invisible cursor row, which may
      // not be the ticket on screen — Escape closes, everything else is off.
      if (selectedRef.current) {
        if (e.key === "Escape") setSelected(null);
        return;
      }
      if (e.key === "j") {
        e.preventDefault();
        setCursor((i) => Math.min(filtered.length - 1, i + 1));
      } else if (e.key === "k") {
        e.preventDefault();
        setCursor((i) => Math.max(0, i - 1));
      } else if (e.key === "Enter") {
        const row = filtered[cursor];
        if (row) setSelected(row.ticket.id);
      } else if (e.key === "e") {
        const row = filtered[cursor];
        if (row) void hqChangeStatusAction({ ticketId: row.ticket.id, status: "resolved" });
      } else if (e.key === "a") {
        const row = filtered[cursor];
        if (row) void hqClaimSelfAction({ ticketId: row.ticket.id });
      } else if (e.key === "r") {
        const row = filtered[cursor];
        if (row) setSelected(row.ticket.id);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [filtered, cursor]);

  const FILTERS: { id: FilterId; label: string }[] = [
    { id: "needsYou", label: t("dashboard.platform.support.filterNeedsYou") },
    { id: "waitingThem", label: t("dashboard.platform.support.filterWaitingThem") },
    { id: "new", label: t("dashboard.platform.support.filterNew") },
    { id: "allOpen", label: t("dashboard.platform.support.filterAllOpen") },
    { id: "resolved7d", label: t("dashboard.platform.support.filterResolved7d") },
  ];
  const AUDIENCES: { id: AudienceId; label: string }[] = [
    { id: "all", label: t("dashboard.platform.support.audAll") },
    { id: "workspace", label: t("dashboard.platform.support.audAdmins") },
    { id: "talent", label: t("dashboard.platform.support.audTalents") },
    { id: "client", label: t("dashboard.platform.support.audClients") },
    { id: HQ_GUEST_AUDIENCE_ID, label: t("dashboard.platform.support.audGuests") },
  ];

  return (
    <div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 10 }}>
        {FILTERS.map((f) => (
          <button
            key={f.id}
            type="button"
            onClick={() => setFilter(f.id)}
            style={chipStyle(filter === f.id)}
          >
            {f.label}
          </button>
        ))}
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 12 }}>
        {AUDIENCES.map((a) => (
          <button
            key={a.id}
            type="button"
            onClick={() => setAudience(a.id)}
            style={chipStyle(audience === a.id)}
          >
            {a.label}
          </button>
        ))}
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={t("dashboard.platform.support.search")}
          style={{
            marginLeft: "auto",
            background: HQ.card,
            border: `1px solid ${HQ.border}`,
            color: HQ.ink,
            borderRadius: 8,
            padding: "6px 10px",
            fontSize: 12,
            minWidth: 180,
          }}
        />
      </div>

      <div
        data-tulala-support-hq-queue=""
        style={{ background: HQ.card, border: `1px solid ${HQ.border}`, borderRadius: 12, overflow: "hidden" }}
      >
        {filtered.length === 0 ? (
          <div style={{ padding: 24, color: HQ.inkDim, fontSize: 13 }}>{t("dashboard.platform.support.empty")}</div>
        ) : (
          filtered.map((row, i) => {
            const ageH = hoursAgo(row.ticket.lastMessageAt);
            const waitingSupport = row.ticket.status === "open" && row.ticket.waitingOn === "support";
            const icon = surfaceIcon(row.ticket.surface);
            const left =
              waitingSupport && ageH > 48 ? HQ.red : waitingSupport ? "#C26A45" : "transparent";
            return (
              <button
                key={row.ticket.id}
                type="button"
                onClick={() => setSelected(row.ticket.id)}
                style={{
                  display: "flex",
                  width: "100%",
                  textAlign: "left",
                  gap: 12,
                  padding: "12px 14px",
                  background: i === cursor ? "rgba(255,255,255,0.04)" : "transparent",
                  border: "none",
                  borderBottom: `1px solid ${HQ.borderSoft}`,
                  borderLeft: `3px solid ${left}`,
                  cursor: "pointer",
                  color: HQ.ink,
                  fontFamily: HQ_F,
                }}
              >
                <span style={{ color: icon.color, width: 16 }}>{icon.glyph}</span>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <span style={{ fontSize: 13, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis" }}>
                      {row.requesterName ?? row.requesterEmail ?? t("dashboard.platform.support.unknownRequester")}
                    </span>
                    {row.planTier ? <PlanChip plan={row.planTier} /> : null}
                    {row.ticket.category ? (
                      <span
                        style={{
                          fontSize: 10,
                          border: `1px solid ${HQ.border}`,
                          borderRadius: 999,
                          padding: "1px 7px",
                          color: HQ.inkMuted,
                        }}
                      >
                        {row.ticket.category}
                      </span>
                    ) : null}
                  </span>
                  <span style={{ display: "block", fontSize: 12, color: HQ.inkMuted, marginTop: 3 }}>
                    {row.tenantName ? `${row.tenantName} · ` : ""}
                    {row.ticket.subject || t("dashboard.adminSupport.untitled")}
                  </span>
                </span>
                <span
                  style={{
                    fontSize: 11,
                    color: waitingSupport && ageH > 24 ? "#C26A45" : HQ.inkDim,
                    whiteSpace: "nowrap",
                  }}
                >
                  {ageH < 1 ? t("dashboard.platform.support.ageJustNow") : `${Math.floor(ageH)}h`}
                </span>
                <span style={{ fontSize: 11, color: HQ.inkDim, minWidth: 18 }}>
                  {row.ticket.assigneeUserId ? "●" : "+"}
                </span>
              </button>
            );
          })
        )}
      </div>
      <div style={{ fontSize: 11, color: HQ.inkDim, marginTop: 10 }}>
        {t("dashboard.platform.support.keyboardHint")}
      </div>
      {selected ? (
        <SupportTicketHqDrawer
          ticketId={selected}
          cannedReplies={cannedReplies}
          onClose={() => setSelected(null)}
          onOpenPast={(id) => setSelected(id)}
        />
      ) : null}
    </div>
  );
}

function chipStyle(active: boolean): CSSProperties {
  return {
    background: active ? "rgba(255,255,255,0.10)" : "transparent",
    color: active ? HQ.ink : HQ.inkMuted,
    border: `1px solid ${active ? HQ.border : HQ.borderSoft}`,
    borderRadius: 999,
    padding: "5px 10px",
    fontSize: 12,
    cursor: "pointer",
  };
}
