"use client";

import {
  AUTH_POPUP_MESSAGE_TYPE,
  type AuthPopupMessage,
  navigateToAuthPopupDestination,
} from "@/lib/auth-popup";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { AuthNotice, AuthSpinner } from "@/components/auth/auth-ui";
import { AuthGoogleGlyph } from "@/components/auth/auth-google-glyph";

const POPUP_WIDTH = 520;
const POPUP_HEIGHT = 640;

function getPopupPosition(size: number, screenStart: number, screenSpan: number) {
  return Math.max(screenStart + (screenSpan - size) / 2, 0);
}

export function GoogleAuthButton({
  nextPath,
  children,
  pendingLabel = "Opening Google…",
  failedLabel = "Google sign-in failed.",
  popupBlockedMessage = "Popup blocked. Allow popups for this site and try again.",
  unableToStartMessage = "Unable to start Google sign-in.",
}: {
  nextPath?: string;
  children: React.ReactNode;
  pendingLabel?: string;
  failedLabel?: string;
  popupBlockedMessage?: string;
  unableToStartMessage?: string;
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

    const left = getPopupPosition(POPUP_WIDTH, window.screenX, window.outerWidth);
    const top = getPopupPosition(POPUP_HEIGHT, window.screenY, window.outerHeight);

    // Open popup directly to the server-initiated OAuth route so the PKCE
    // verifier is stored via Set-Cookie (server-side) rather than
    // document.cookie, avoiding "bad_oauth_callback" state mismatches.
    const startUrl = new URL("/auth/google", window.location.origin);
    startUrl.searchParams.set("popup", "1");
    if (nextPath) startUrl.searchParams.set("next", nextPath);

    const popup = window.open(
      startUrl.toString(),
      "google-auth-popup",
      `width=${POPUP_WIDTH},height=${POPUP_HEIGHT},left=${left},top=${top},popup=yes,resizable=yes,scrollbars=yes`,
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

  // Same outlined pill as the marketing sign-in modal's Google button
  // (`login-modal.tsx`) — this used to be a filled shadcn `Button`, which made
  // the standalone register pages look unrelated to the popup the owner signed
  // off on, and put two competing filled buttons in one card.
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
        <span>{pending ? pendingLabel : children}</span>
      </button>
      {error ? <AuthNotice tone="error">{error}</AuthNotice> : null}
    </div>
  );
}
