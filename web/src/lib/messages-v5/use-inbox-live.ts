"use client";

/**
 * useMessagingInboxLive — one realtime subscription per tenant that patches
 * inbox rows in place, instead of the `router.refresh()` pattern
 * (`src/hooks/use-inquiry-realtime.ts`) or the 12s poll the POS Messages
 * shell used to run (`MessagesShell.tsx`, pre-Messages-v5). A full-page
 * refresh or blind reload re-fetches and re-renders everything on ANY
 * change; this hook tells the caller exactly which row changed and how, so
 * the shell can update just that row's state.
 *
 * Two subscriptions, both tenant-scoped:
 *   • inquiry_messages INSERT — a new message on any thread. Emits a row
 *     patch (preview + updatedAt + unread delta) and, when the message is
 *     from the customer/guest side (no sender_user_id), an `onIncoming`
 *     event for the toast.
 *   • inquiries UPDATE — conversation_state flips, resolve/reopen, owner
 *     reassignment, anything that bumps `updated_at`. Emits a row patch with
 *     no preview/unread change.
 *
 * A brand-new conversation (a row not yet on screen) is deliberately NOT
 * synthesised here — that is what the shell's own list load is for. This
 * hook only keeps rows already in view current.
 *
 * Fallback: if either channel reports an error, times out, or closes, a
 * 60s poll starts, re-querying both tables for anything newer than the last
 * timestamp this hook has seen and replaying it through the same patch
 * builders — so a caller wired to onRowPatch/onIncoming behaves the same
 * whether an update arrived over the socket or the poll.
 */

import { useEffect, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import type { RealtimeChannel, SupabaseClient } from "@supabase/supabase-js";
import type { ConversationState } from "@/lib/messaging/types";

const PREVIEW_MAX = 140;
const FALLBACK_POLL_MS = 60_000;

export type InboxRowPatch = {
  inquiryId: string;
  lastMessagePreview?: string;
  /** Applied to the row's unreadCount, clamped at 0. Absent/0 for anything
   *  that isn't a new customer message (a staff reply, a state-only update). */
  unreadDelta?: number;
  updatedAt: string;
  conversationState?: ConversationState;
};

export type IncomingEvent = {
  inquiryId: string;
  preview: string;
};

function previewFromBody(body: string | null | undefined): string {
  const trimmed = (body ?? "").trim();
  if (trimmed.length <= PREVIEW_MAX) return trimmed;
  return `${trimmed.slice(0, PREVIEW_MAX - 1)}…`;
}

function isKnownConversationState(value: unknown): value is ConversationState {
  return value === "needs_reply" || value === "awaiting_customer" || value === "resolved";
}

export type MessageInsertRow = {
  inquiry_id: string;
  body: string | null;
  sender_user_id: string | null;
  created_at: string;
};

export type InquiryUpdateRow = {
  id: string;
  conversation_state?: string | null;
  updated_at: string;
};

/**
 * Pure. A message with no `sender_user_id` is from the customer/guest side —
 * that is the "incoming" signal (unread +1, toast); a staff reply carries no
 * unread delta and no toast.
 */
export function patchFromMessageInsert(
  row: MessageInsertRow,
): { patch: InboxRowPatch; incoming: IncomingEvent | null } {
  const preview = previewFromBody(row.body);
  const fromCustomer = !row.sender_user_id;
  const patch: InboxRowPatch = {
    inquiryId: row.inquiry_id,
    lastMessagePreview: preview,
    updatedAt: row.created_at,
    unreadDelta: fromCustomer ? 1 : 0,
  };
  return { patch, incoming: fromCustomer ? { inquiryId: row.inquiry_id, preview } : null };
}

/** Pure. No preview or unread delta — only a message insert carries those. */
export function patchFromInquiryUpdate(row: InquiryUpdateRow): InboxRowPatch {
  return {
    inquiryId: row.id,
    updatedAt: row.updated_at,
    conversationState: isKnownConversationState(row.conversation_state) ? row.conversation_state : undefined,
  };
}

/**
 * Pure reducer: applies one patch to an inbox row array. A patch whose
 * `inquiryId` isn't in `rows` is a no-op — this hook patches rows already on
 * screen, it never inserts a synthetic one. `unreadDelta` is clamped so a
 * late/duplicate patch can never drive the count negative.
 */
export function applyInboxRowPatch<Row extends { id: string; unreadCount: number; unread: boolean }>(
  rows: readonly Row[],
  patch: InboxRowPatch,
): Row[] {
  let touched = false;
  const next = rows.map((row) => {
    if (row.id !== patch.inquiryId) return row;
    touched = true;
    const unreadCount = Math.max(0, row.unreadCount + (patch.unreadDelta ?? 0));
    return {
      ...row,
      ...(patch.lastMessagePreview !== undefined ? { lastMessagePreview: patch.lastMessagePreview } : {}),
      ...(patch.conversationState !== undefined ? { conversationState: patch.conversationState } : {}),
      updatedAt: patch.updatedAt,
      unreadCount,
      unread: unreadCount > 0,
    };
  });
  return touched ? (next as Row[]) : (rows as Row[]);
}

export type UseMessagingInboxLiveArgs = {
  tenantId: string | null | undefined;
  onRowPatch: (patch: InboxRowPatch) => void;
  onIncoming: (event: IncomingEvent) => void;
  /** Test seam — overrides the Supabase client factory. */
  createClientOverride?: () => SupabaseClient | null;
};

export function useMessagingInboxLive(args: UseMessagingInboxLiveArgs): void {
  const { tenantId, onRowPatch, onIncoming, createClientOverride } = args;
  // Refs so a re-render with new (but equivalent) callback identities never
  // tears down and re-subscribes the channel — only tenantId should do that.
  const onRowPatchRef = useRef(onRowPatch);
  const onIncomingRef = useRef(onIncoming);
  onRowPatchRef.current = onRowPatch;
  onIncomingRef.current = onIncoming;

  useEffect(() => {
    if (!tenantId) return;
    const supabase = (createClientOverride ?? createClient)();
    if (!supabase) return;

    const startedAt = new Date().toISOString();
    const lastMessageTsRef = { current: startedAt };
    const lastInquiryTsRef = { current: startedAt };

    let fallbackTimer: ReturnType<typeof setInterval> | null = null;

    const pollOnce = async () => {
      const [{ data: msgRows }, { data: inqRows }] = await Promise.all([
        supabase
          .from("inquiry_messages")
          .select("inquiry_id, body, sender_user_id, created_at")
          .eq("tenant_id", tenantId)
          .gt("created_at", lastMessageTsRef.current)
          .order("created_at", { ascending: true }),
        supabase
          .from("inquiries")
          .select("id, conversation_state, updated_at")
          .eq("tenant_id", tenantId)
          .gt("updated_at", lastInquiryTsRef.current)
          .order("updated_at", { ascending: true }),
      ]);
      for (const row of (msgRows ?? []) as MessageInsertRow[]) {
        lastMessageTsRef.current = row.created_at;
        const { patch, incoming } = patchFromMessageInsert(row);
        onRowPatchRef.current(patch);
        if (incoming) onIncomingRef.current(incoming);
      }
      for (const row of (inqRows ?? []) as InquiryUpdateRow[]) {
        lastInquiryTsRef.current = row.updated_at;
        onRowPatchRef.current(patchFromInquiryUpdate(row));
      }
    };

    const startFallbackPoll = () => {
      if (fallbackTimer) return;
      fallbackTimer = setInterval(() => {
        void pollOnce();
      }, FALLBACK_POLL_MS);
    };

    const onChannelStatus = (status: string) => {
      if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
        startFallbackPoll();
      }
    };

    const channels: RealtimeChannel[] = [];

    const messagesChannel = supabase
      .channel(`messages-v5.inbox-live.messages.${tenantId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "inquiry_messages", filter: `tenant_id=eq.${tenantId}` },
        (payload) => {
          const row = payload.new as MessageInsertRow;
          lastMessageTsRef.current = row.created_at;
          const { patch, incoming } = patchFromMessageInsert(row);
          onRowPatchRef.current(patch);
          if (incoming) onIncomingRef.current(incoming);
        },
      )
      .subscribe(onChannelStatus);
    channels.push(messagesChannel);

    const inquiriesChannel = supabase
      .channel(`messages-v5.inbox-live.inquiries.${tenantId}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "inquiries", filter: `tenant_id=eq.${tenantId}` },
        (payload) => {
          const row = payload.new as InquiryUpdateRow;
          lastInquiryTsRef.current = row.updated_at;
          onRowPatchRef.current(patchFromInquiryUpdate(row));
        },
      )
      .subscribe(onChannelStatus);
    channels.push(inquiriesChannel);

    return () => {
      if (fallbackTimer) clearInterval(fallbackTimer);
      for (const ch of channels) {
        void supabase.removeChannel(ch);
      }
    };
  }, [tenantId, createClientOverride]);
}
