"use client";

/**
 * The Google popup, as the talent modal runs it (`/auth/google?popup=1`,
 * `postMessage` back to the opener), minus the navigation: the module stays
 * open and moves to the next step on `success`. The callback claims the
 * guest brief and, for a talent `next`, promotes the fresh profile.
 */

import { useCallback, useEffect, useRef, useState } from "react";

import { AUTH_POPUP_MESSAGE_TYPE, type AuthPopupMessage } from "@/lib/auth-popup";

export type GooglePopupError = "failed" | "blocked" | "closed" | null;

export function useGooglePopup(input: { next: string; onSuccess: () => void }) {
  const { next, onSuccess } = input;
  const popupRef = useRef<Window | null>(null);
  const closeWatcherRef = useRef<number | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<GooglePopupError>(null);
  const onSuccessRef = useRef(onSuccess);
  useEffect(() => {
    onSuccessRef.current = onSuccess;
  }, [onSuccess]);

  const stopWatching = useCallback(() => {
    if (closeWatcherRef.current) {
      window.clearInterval(closeWatcherRef.current);
      closeWatcherRef.current = null;
    }
  }, []);

  useEffect(() => {
    function handleMessage(event: MessageEvent<AuthPopupMessage>) {
      if (event.origin !== window.location.origin) return;
      if (event.data?.type !== AUTH_POPUP_MESSAGE_TYPE) return;
      setPending(false);
      stopWatching();
      popupRef.current?.close();
      popupRef.current = null;
      if (event.data.success) {
        setError(null);
        onSuccessRef.current();
      } else {
        setError("failed");
      }
    }
    window.addEventListener("message", handleMessage);
    return () => {
      window.removeEventListener("message", handleMessage);
      stopWatching();
    };
  }, [stopWatching]);

  const open = useCallback(() => {
    setError(null);
    const W = 520;
    const H = 640;
    const left = Math.max(window.screenX + (window.outerWidth - W) / 2, 0);
    const top = Math.max(window.screenY + (window.outerHeight - H) / 2, 0);
    const startUrl = new URL("/auth/google", window.location.origin);
    startUrl.searchParams.set("popup", "1");
    startUrl.searchParams.set("next", next);
    const popup = window.open(
      startUrl.toString(),
      "google-auth-popup",
      `width=${W},height=${H},left=${left},top=${top},popup=yes,resizable=yes,scrollbars=yes`,
    );
    if (!popup) {
      setError("blocked");
      return;
    }
    popupRef.current = popup;
    setPending(true);
    closeWatcherRef.current = window.setInterval(() => {
      if (!popupRef.current || popupRef.current.closed) {
        stopWatching();
        popupRef.current = null;
        setPending((was) => {
          if (was) setError("closed");
          return false;
        });
      }
    }, 500);
  }, [next, stopWatching]);

  return { open, pending, error, clearError: () => setError(null) };
}
