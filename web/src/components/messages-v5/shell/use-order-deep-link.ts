"use client";

/**
 * `/admin/messages?order=<id>`: chip fast-path on loaded rows, then a one-shot
 * server resolve that must NOT depend on `rows` (D-MSG-343).
 */

import { useEffect, useRef } from "react";

import { messagingResolveOrderThread } from "@/lib/server-actions/messaging-engine";
import { findConversationForOrder } from "@/lib/messages-v5/pos-continuity";
import type { InboxRow } from "@/lib/messaging/types";

export function useOrderDeepLink(input: {
  readonly initialInquiryId: string | null | undefined;
  readonly initialOrderId: string | null | undefined;
  readonly rows: readonly InboxRow[];
  readonly live: boolean | undefined;
  readonly openThread: (id: string) => void;
}): void {
  const orderRef = useRef<string | null>(input.initialInquiryId ? null : input.initialOrderId ?? null);

  useEffect(() => {
    const orderId = orderRef.current;
    if (!orderId) return;
    const id = findConversationForOrder(input.rows, orderId);
    if (!id) return;
    orderRef.current = null;
    input.openThread(id);
  }, [input.rows, input.openThread]);

  const orderResolveStarted = useRef(false);
  useEffect(() => {
    const orderId = orderRef.current;
    if (!orderId || orderResolveStarted.current || input.live === false) return;
    orderResolveStarted.current = true;
    void (async () => {
      const res = await messagingResolveOrderThread({ orderId });
      if (orderRef.current !== orderId) return;
      const resolved = res.ok ? res.inquiryId : null;
      if (!resolved) return;
      orderRef.current = null;
      input.openThread(resolved);
    })();
  }, [input.openThread, input.live]);
}
