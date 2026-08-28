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
    // Any user-driven navigation ends the "restored from a previous session"
    // state — without this, the park-to-Home effect re-fires on later status
    // changes (e.g. right as the rating row should appear).
    restoredRef.current = false;
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
    let cancelled = false;
    let channel: ReturnType<typeof supabase.channel> | null = null;
    // Subscribe only after the session token has reached the realtime socket.
    // Without this the subscription can register as `anon`, and RLS then
    // delivers ZERO rows — silently (verified live: claims_role was anon).
    void (async () => {
      const { data } = await supabase.auth.getSession();
      await supabase.realtime.setAuth(data.session?.access_token ?? null);
      if (cancelled) return;
      channel = supabase
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
    })();
    return () => {
      cancelled = true;
      if (channel) void supabase.removeChannel(channel);
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
    let cancelled = false;
    let channel: ReturnType<typeof supabase.channel> | null = null;
    void (async () => {
      // Same anon-socket trap as useSupportRealtime: without pushing the
      // session token first, this subscription registers as `anon` and RLS
      // silently delivers nothing to HQ.
      const { data } = await supabase.auth.getSession();
      await supabase.realtime.setAuth(data.session?.access_token ?? null);
      if (cancelled) return;
      channel = supabase
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
    })();
    return () => {
      cancelled = true;
      if (channel) void supabase.removeChannel(channel);
    };
  }, [onTicketInsert, onTicketUpdate, onRequesterMessage]);
}
