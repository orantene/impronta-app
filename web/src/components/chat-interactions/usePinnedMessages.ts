"use client";

/**
 * usePinnedMessages — client hook owning the inquiry-wide pinned set for a
 * single thread. Loads via the fetchPinnedMessagesAction wrapper on mount
 * and whenever the inquiry/thread changes, exposes:
 *   - pins:        the ordered PinnedMessage[] for the strip (newest first)
 *   - pinnedIds:   Set<string> of pinned message ids (drives PinButton state)
 *   - refresh:     re-pull from the server (call after a toggle reconciles)
 *   - applyLocal:  optimistic add/remove of a single id (instant strip update
 *                  before the server round-trip lands)
 *
 * Pins are shared, so a toggle by anyone should eventually reflect for all;
 * refresh() is the authoritative reconcile.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { fetchPinnedMessagesAction } from "./pins-fetch-action";
import type { PinnedMessage } from "@/lib/messages/pin-types";

export function usePinnedMessages(
  inquiryId: string | null | undefined,
  threadType?: "private" | "group",
) {
  const [pins, setPins] = useState<PinnedMessage[]>([]);

  const refresh = useCallback(async () => {
    if (!inquiryId) {
      setPins([]);
      return;
    }
    try {
      const rows = await fetchPinnedMessagesAction(inquiryId, threadType);
      setPins(rows);
    } catch {
      // Loader swallows its own errors; on transport failure keep prior state.
    }
  }, [inquiryId, threadType]);

  useEffect(() => {
    let active = true;
    if (!inquiryId) {
      setPins([]);
      return;
    }
    setPins([]);
    fetchPinnedMessagesAction(inquiryId, threadType)
      .then((rows) => {
        if (active) setPins(rows);
      })
      .catch(() => {
        /* keep empty */
      });
    return () => {
      active = false;
    };
  }, [inquiryId, threadType]);

  const pinnedIds = useMemo(() => new Set(pins.map((p) => p.messageId)), [pins]);

  /** Optimistically drop a pin from the local strip (used by unpin). */
  const removeLocal = useCallback((messageId: string) => {
    setPins((prev) => prev.filter((p) => p.messageId !== messageId));
  }, []);

  return { pins, pinnedIds, refresh, removeLocal };
}
