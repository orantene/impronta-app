"use client";

import { useCallback, useEffect, useState } from "react";
import { DrawerShell } from "./drawer-shared";
import { useAdminShell } from "../state";
import { useT } from "@/i18n/use-t";
import { createClient } from "@/lib/supabase/client";
import { supportFrom } from "@/lib/support/support-from";
import {
  mapMessageRow,
  mapTicketRow,
  type SupportMessageRow,
  type SupportTicketRow,
} from "@/lib/support/support-types";
import { SupportThreadView } from "@/components/support/SupportThreadView";
import { markSupportTicketReadAction } from "@/lib/support/actions";
import { useSupportRealtime } from "@/components/support/support-hooks";

export function SupportTicketDrawer() {
  const { state, closeDrawer } = useAdminShell();
  const t = useT();
  const open = state.drawer.drawerId === "support-ticket";
  const ticketId =
    typeof state.drawer.payload?.ticketId === "string" ? state.drawer.payload.ticketId : null;
  const [ticket, setTicket] = useState<SupportTicketRow | null>(null);
  const [messages, setMessages] = useState<SupportMessageRow[]>([]);

  useEffect(() => {
    if (!open || !ticketId) return;
    const supabase = createClient();
    if (!supabase) return;
    void (async () => {
      const { data: tRow } = await supportFrom(supabase, "support_tickets")
        .select("*")
        .eq("id", ticketId)
        .maybeSingle();
      setTicket(mapTicketRow(tRow));
      const { data: msgs } = await supportFrom(supabase, "support_messages")
        .select("*")
        .eq("ticket_id", ticketId)
        .order("created_at", { ascending: true });
      setMessages((msgs ?? []).map(mapMessageRow).filter(Boolean) as SupportMessageRow[]);
      // A ticket opened from the bell must clear its unread state, exactly
      // like the panel path does.
      void markSupportTicketReadAction({ ticketId });
    })();
  }, [open, ticketId]);

  // Live-update the open drawer so a reply arriving mid-read shows up.
  const onMessage = useCallback((row: SupportMessageRow) => {
    setMessages((prev) => (prev.some((m) => m.id === row.id) ? prev : [...prev, row]));
  }, []);
  const onTicket = useCallback((row: SupportTicketRow) => setTicket(row), []);
  useSupportRealtime({ ticketId: open ? ticketId : null, onMessage, onTicket });

  return (
    <DrawerShell
      open={open}
      onClose={closeDrawer}
      title={ticket?.subject || t("dashboard.adminSupport.drawerTitle")}
      description={ticket ? `#${ticket.ticketNumber}` : undefined}
      defaultSize="compact"
    >
      {ticketId ? (
        <SupportThreadView ticket={ticket} messages={messages} />
      ) : (
        <p className="p-4 text-[13px] text-admin-ink-muted">{t("dashboard.adminSupport.drawerEmpty")}</p>
      )}
    </DrawerShell>
  );
}
