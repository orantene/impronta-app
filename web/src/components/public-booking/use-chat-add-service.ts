"use client";

import { useEffect, useRef } from "react";

import { CHAT_ADD_SERVICE_EVENT, type ChatAddServiceDetail } from "./chat-catalog-events";

/**
 * CH-4: the catalog island's side of "Add" in the card chat's service list.
 * `onAdd` runs with the requested offering id; it always sees the latest
 * render's state (kept in a ref), so the listener is bound once. Returning
 * `true` marks the request handled (TUL-1068), so the asker can tell an island
 * took it from nobody listening.
 */
export function useChatAddService(onAdd: (offeringId: string | null) => void | boolean): void {
  const ref = useRef(onAdd);
  useEffect(() => {
    ref.current = onAdd;
  });
  useEffect(() => {
    const onEvent = (e: Event) => {
      if (ref.current((e as CustomEvent<ChatAddServiceDetail>).detail?.offeringId ?? null) === true) e.preventDefault();
    };
    window.addEventListener(CHAT_ADD_SERVICE_EVENT, onEvent);
    return () => window.removeEventListener(CHAT_ADD_SERVICE_EVENT, onEvent);
  }, []);
}
