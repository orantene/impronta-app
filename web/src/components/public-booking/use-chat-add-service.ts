"use client";

import { useEffect, useRef } from "react";

import { CHAT_ADD_SERVICE_EVENT, type ChatAddServiceDetail } from "./chat-catalog-events";

/**
 * CH-4: the catalog island's side of "Add" in the card chat's service list.
 * `onAdd` runs with the requested offering id; it always sees the latest
 * render's state (kept in a ref), so the listener is bound once.
 */
export function useChatAddService(onAdd: (offeringId: string | null) => void): void {
  const ref = useRef(onAdd);
  useEffect(() => {
    ref.current = onAdd;
  });
  useEffect(() => {
    const onEvent = (e: Event) => ref.current((e as CustomEvent<ChatAddServiceDetail>).detail?.offeringId ?? null);
    window.addEventListener(CHAT_ADD_SERVICE_EVENT, onEvent);
    return () => window.removeEventListener(CHAT_ADD_SERVICE_EVENT, onEvent);
  }, []);
}
