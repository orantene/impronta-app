"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { mapMessageRow, mapTicketRow, type SupportMessageRow, type SupportTicketRow, type SupportTicketSummary } from "@/lib/support/support-types";
import { parseSupportDeepLink } from "./support-deep-link";

const VIEW_KEY = "tulala.support.view";

export function useSupportSessionRestore(): {
  view: "home" | "tickets" | "thread" | "new";
  ticketId: string | null;
  setView: (v: "home" | "tickets" | "thread" | "new", ticketId?: string | null) => void;
  restoredRef: { current: boolean };
} {
  const [view, setViewState] = useState<"home" | "tickets" | "thread" | "new">("home");
  const [ticketId, setTicketId] = useState<string | null>(null);
  const restoredRef = useRef(false);

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(VIEW_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as { view?: string; ticketId?: string | null };
      if (parsed.view === "home" || parsed.view === "tickets" || parsed.view === "thread" || parsed.view === "new") {
        if (parsed.view === "thread") restoredRef.current = true;
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

  return { view, ticketId, setView, restoredRef };
}

export function useSupportDeepLink(
  openToTicket: (ticketId: string) => void,
): void {
  useEffect(() => {
    if (typeof window === "undefined") return;
    const parsed = parseSupportDeepLink(window.location.search);
    if (!parsed.ticketId) return;
    openToTicket(parsed.ticketId);
    window.history.replaceState(
      {},
      "",
      `${window.location.pathname}${parsed.nextQuery}${window.location.hash}`,
    );
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

export function useHqSupportRealtime(opts: {
  onTicketInsert: (ticket: SupportTicketRow) => void;
  onTicketUpdate: (ticket: SupportTicketRow) => void;
  onRequesterMessage: (message: SupportMessageRow) => void;
}): void {
  const { onTicketInsert, onTicketUpdate, onRequesterMessage } = opts;
  useEffect(() => {
    const supabase = createClient();
    if (!supabase) return;
    const channel = supabase
      .channel("support_hq")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "support_tickets" },
        (payload) => {
          const row = mapTicketRow(payload.new);
          if (row) onTicketInsert(row);
        },
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "support_tickets" },
        (payload) => {
          const row = mapTicketRow(payload.new);
          if (row) onTicketUpdate(row);
        },
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "support_messages" },
        (payload) => {
          const row = mapMessageRow(payload.new);
          if (row) onRequesterMessage(row);
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [onTicketInsert, onTicketUpdate, onRequesterMessage]);
}
