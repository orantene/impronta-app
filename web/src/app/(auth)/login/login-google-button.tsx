"use client";

/**
 * Tulala-branded Google sign-in button used on /login.
 *
 * Wraps the same Supabase OAuth popup flow as the legacy GoogleAuthButton
 * but styles itself to match the talent-register modal: parchment bg,
 * hairline border, Google glyph + label. Keeps the form premium and
 * cohesive with the rest of the auth chrome.
 */

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { AuthNotice, AuthSpinner } from "@/components/auth/auth-ui";
import { AuthGoogleGlyph } from "@/components/auth/auth-google-glyph";
import {
  AUTH_POPUP_MESSAGE_TYPE,
  type AuthPopupMessage,
  navigateToAuthPopupDestination,
} from "@/lib/auth-popup";

export function LoginGoogleButton({
  nextPath,
  label,
  pendingLabel,
  failedLabel,
  popupBlockedMessage,
  unableToStartMessage,
}: {
  nextPath?: string;
  label: string;
  pendingLabel: string;
  failedLabel: string;
  popupBlockedMessage: string;
  unableToStartMessage: string;
}) {
  const router = useRouter();
  const popupRef = useRef<Window | null>(null);
  const closeWatcherRef = useRef<number | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    function handleMessage(event: MessageEvent<AuthPopupMessage>) {
      if (event.origin !== window.location.origin) return;
      if (event.data?.type !== AUTH_POPUP_MESSAGE_TYPE) return;
      setPending(false);
      setError(event.data.success ? null : event.data.error ?? failedLabel);
      if (closeWatcherRef.current) {
        window.clearInterval(closeWatcherRef.current);
        closeWatcherRef.current = null;
      }
      popupRef.current?.close();
      popupRef.current = null;
      if (event.data.success) {
        navigateToAuthPopupDestination(event.data.destination ?? "/", router);
        router.refresh();
      }
    }
    window.addEventListener("message", handleMessage);
    return () => {
      window.removeEventListener("message", handleMessage);
      if (closeWatcherRef.current) {
        window.clearInterval(closeWatcherRef.current);
      }
    };
  }, [failedLabel, router]);

  function handleClick() {
    setError(null);
    const W = 520;
    const H = 640;
    const left = Math.max(window.screenX + (window.outerWidth - W) / 2, 0);
    const top = Math.max(window.screenY + (window.outerHeight - H) / 2, 0);

    // Build the server-initiated OAuth URL. The server stores the PKCE
    // code verifier in Set-Cookie (more reliable than document.cookie in
    // a popup's cross-origin redirect chain).
    const startUrl = new URL("/auth/google", window.location.origin);
    startUrl.searchParams.set("popup", "1");
    if (nextPath) startUrl.searchParams.set("next", nextPath);

    const popup = window.open(
      startUrl.toString(),
      "google-auth-popup",
      `width=${W},height=${H},left=${left},top=${top},popup=yes,resizable=yes,scrollbars=yes`,
    );
    if (!popup) {
      setError(popupBlockedMessage);
      return;
    }
    popupRef.current = popup;
    setPending(true);
    closeWatcherRef.current = window.setInterval(() => {
      if (!popupRef.current || popupRef.current.closed) {
        if (closeWatcherRef.current) {
          window.clearInterval(closeWatcherRef.current);
          closeWatcherRef.current = null;
        }
        popupRef.current = null;
        setPending(false);
      }
    }, 500);
  }

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={handleClick}
        disabled={pending}
        className="group inline-flex w-full items-center justify-center gap-2.5 rounded-full px-5 py-3 text-[0.9375rem] font-medium leading-none tracking-[-0.005em] transition-[background,border-color,box-shadow] duration-200 disabled:cursor-wait disabled:opacity-70"
        style={{
          background: "var(--plt-bg-raised)",
          border: "1px solid var(--plt-hairline-strong)",
          color: "var(--plt-ink)",
        }}
      >
        {pending ? <AuthSpinner /> : <AuthGoogleGlyph />}
        <span>{pending ? pendingLabel : label}</span>
      </button>
      {error ? <AuthNotice tone="error">{error}</AuthNotice> : null}
    </div>
  );
}
