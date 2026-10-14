"use client";

import { useEffect } from "react";

import { shouldReloadForSignOut } from "@/lib/auth/cross-tab-sign-out";

/** TUL-788: another tab signed out, so this one reloads into the signed-out state. */
export function CrossTabSignOut() {
  useEffect(() => {
    function onStorage(e: StorageEvent) {
      if (shouldReloadForSignOut(e)) window.location.reload();
    }
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);
  return null;
}
