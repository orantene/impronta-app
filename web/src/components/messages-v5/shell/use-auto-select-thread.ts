"use client";

/**
 * Desktop/tablet: once the inbox has rows and nothing is selected, open the
 * first conversation so the middle pane is never blank while the list shows
 * previews. Seller mode prefers a Needs-reply row.
 */

import { useEffect, useRef } from "react";

import type { InboxRow } from "@/lib/messaging/types";

import type { ShellLayout } from "./layout";

export function useAutoSelectThread(input: {
  readonly activeId: string | null;
  readonly inboxLoading: boolean;
  readonly inboxError: unknown;
  readonly rows: readonly InboxRow[];
  readonly layout: ShellLayout;
  readonly seller: boolean;
  readonly skip: boolean;
  readonly openThread: (id: string) => void;
}): void {
  const done = useRef(input.skip);
  const { activeId, inboxLoading, inboxError, rows, layout, seller, openThread } = input;
  useEffect(() => {
    if (done.current) return;
    if (activeId) {
      done.current = true;
      return;
    }
    if (inboxLoading || inboxError || rows.length === 0) return;
    if (layout === "one") return;
    const first = seller ? rows.find((row) => row.conversationState === "needs_reply") ?? rows[0] : rows[0];
    if (!first) return;
    done.current = true;
    openThread(first.id);
  }, [activeId, inboxError, inboxLoading, layout, openThread, rows, seller]);
}
