"use client";

/**
 * useInquiryRealtime — subscribes to Postgres-changes events on the
 * pipeline tables and triggers a router refresh when one fires. The
 * shell already re-pulls bridge data on refresh, so a single
 * `router.refresh()` per event keeps every panel in sync without
 * per-component plumbing.
 *
 * Scoped by tenant_id: every channel filter targets the tenant the
 * caller passes in so we don't subscribe to cross-tenant noise. When
 * Supabase isn't configured (local dev w/o env vars) the hook is a
 * no-op — the shell still works, just without push refresh.
 *
 * Tables watched:
 *   • inquiries           — status changes, assignment, archival flips
 *   • inquiry_messages    — new messages from any pov
 *   • inquiry_offers      — offer create/send/accept/reject
 *   • booking_transactions — payment state machine transitions
 */

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { RealtimeChannel } from "@supabase/supabase-js";

const REALTIME_DEBOUNCE_MS = 350;

export function useInquiryRealtime(tenantId: string | null | undefined): void {
  const router = useRouter();

  useEffect(() => {
    if (!tenantId) return;
    const supabase = createClient();
    if (!supabase) return;

    let timer: ReturnType<typeof setTimeout> | null = null;
    const refresh = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => router.refresh(), REALTIME_DEBOUNCE_MS);
    };

    const channels: RealtimeChannel[] = [];

    const watch = (table: string) => {
      const ch = supabase
        .channel(`tulala.realtime.${table}.${tenantId}`)
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table,
            filter: `tenant_id=eq.${tenantId}`,
          },
          () => refresh(),
        )
        .subscribe();
      channels.push(ch);
    };

    watch("inquiries");
    watch("inquiry_messages");
    watch("inquiry_offers");
    // booking_transactions uses source_tenant_id (not tenant_id) — filter
    // accordingly so we don't subscribe to every workspace's transactions.
    {
      const ch = supabase
        .channel(`tulala.realtime.booking_transactions.${tenantId}`)
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "booking_transactions",
            filter: `source_tenant_id=eq.${tenantId}`,
          },
          () => refresh(),
        )
        .subscribe();
      channels.push(ch);
    }

    return () => {
      if (timer) clearTimeout(timer);
      for (const ch of channels) {
        void supabase.removeChannel(ch);
      }
    };
  }, [tenantId, router]);
}
