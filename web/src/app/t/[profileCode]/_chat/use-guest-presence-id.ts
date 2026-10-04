"use client";

/**
 * Stable ephemeral id for guest Realtime presence. The guest cookie is
 * httpOnly, so the browser cannot read it; a sessionStorage UUID is enough
 * for presence track/sync (nothing is persisted server-side).
 */

import { useEffect, useState } from "react";

const STORAGE_KEY = "impronta.guestPresenceId";

function readOrCreate(): string {
  try {
    const existing = window.sessionStorage.getItem(STORAGE_KEY);
    if (existing && existing.length > 0) return existing;
    const id = crypto.randomUUID();
    window.sessionStorage.setItem(STORAGE_KEY, id);
    return id;
  } catch {
    return crypto.randomUUID();
  }
}

export function useGuestPresenceId(): string | null {
  const [id, setId] = useState<string | null>(null);
  useEffect(() => {
    setId(readOrCreate());
  }, []);
  return id;
}
