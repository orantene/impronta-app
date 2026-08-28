"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { mapMessageRow, mapTicketRow, type SupportMessageRow, type SupportTicketRow, type SupportTicketSummary } from "@/lib/support/support-types";

const VIEW_KEY = "tulala.support.view";

export function useSupportSessionRestore(): {
  view: "home" | "tickets" | "thread" | "new";
  ticketId: string | null;
  setView: (v: "home" | "tickets" | "thread" | "new", ticketId?: string | null) => void;
} {
  const [view, setViewState] = useState<"home" | "tickets" | "thread" | "new">("home");
  const [ticketId, setTicketId] = useState<string | null>(null);

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(VIEW_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as { view?: string; ticketId?: string | null };
      if (parsed.view === "home" || parsed.view === "tickets" || parsed.view === "thread" || parsed.view === "new") {
        setViewState(parsed.view);
        setTicketId(parsed.ticketId ?? null);
      }
    } catch {
      /* ignore */
    }
  }, []);

  const setView = useCallback((v: "home" | "tickets" | "thread" | "new", id?: string | null) => {
    setViewState(v);
    const nextId = v === "thread" ? (id ?? null) : null;
    setTicketId(nextId);
    try {
      sessionStorage.setItem(VIEW_KEY, JSON.stringify({ view: v, ticketId: nextId }));
    } catch {
      /* ignore */
    }
  }, []);

  return { view, ticketId, setView };
}

export function useSupportDeepLink(
  openToTicket: (ticketId: string) => void,
): void {
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const id = params.get("support");
    if (!id) return;
    openToTicket(id);
    params.delete("support");
    const next = `${window.location.pathname}${params.toString() ? `?${params}` : ""}${window.location.hash}`;
    window.history.replaceState({}, "", next);
  }, [openToTicket]);
}

export function useSupportUnread(tickets: SupportTicketSummary[]): number {
  return tickets.filter((t) => t.unread && t.status === "open").length;
}

export function useSupportRealtime(opts: {
  ticketId: string | null;
  tenantId?: string | null;
  onMessage: (row: SupportMessageRow) => void;
  onTicket: (row: SupportTicketRow) => void;
}): void {
  const { ticketId, onMessage, onTicket } = opts;
  useEffect(() => {
    const supabase = createClient();
    if (!supabase || !ticketId) return;
    const channel = supabase
      .channel(`support_msg:${ticketId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "support_messages", filter: `ticket_id=eq.${ticketId}` },
        (payload) => {
          const row = mapMessageRow(payload.new);
          if (row) onMessage(row);
        },
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "support_tickets", filter: `id=eq.${ticketId}` },
        (payload) => {
          const row = mapTicketRow(payload.new);
          if (row) onTicket(row);
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [ticketId, onMessage, onTicket]);
}
