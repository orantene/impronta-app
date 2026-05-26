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

import { AUTH_POPUP_MESSAGE_TYPE, type AuthPopupMessage } from "@/lib/auth-popup";
import { createClient } from "@/lib/supabase/client";
import { SUPABASE_ENV_HELP } from "@/lib/supabase/config";

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
        router.push(event.data.destination ?? "/");
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

  async function handleClick() {
    setError(null);
    const supabase = createClient();
    if (!supabase) {
      setError(SUPABASE_ENV_HELP);
      return;
    }
    const W = 520;
    const H = 640;
    const left = Math.max(window.screenX + (window.outerWidth - W) / 2, 0);
    const top = Math.max(window.screenY + (window.outerHeight - H) / 2, 0);
    const popup = window.open(
      "",
      "google-auth-popup",
      `width=${W},height=${H},left=${left},top=${top},popup=yes,resizable=yes,scrollbars=yes`,
    );
    if (!popup) {
      setError(popupBlockedMessage);
      return;
    }
    popupRef.current = popup;
    setPending(true);
    const cb = new URL("/auth/callback", window.location.origin);
    cb.searchParams.set("popup", "1");
    if (nextPath) cb.searchParams.set("next", nextPath);
    const { data, error: oauthError } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: cb.toString(), skipBrowserRedirect: true },
    });
    if (oauthError || !data?.url) {
      popup.close();
      popupRef.current = null;
      setPending(false);
      setError(oauthError?.message ?? unableToStartMessage);
      return;
    }
    popup.location.href = data.url;
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
        {pending ? <Spinner /> : <GoogleGlyph />}
        <span>{pending ? pendingLabel : label}</span>
      </button>
      {error ? (
        <p
          className="rounded-xl px-3 py-2 text-[0.75rem]"
          style={{
            background: "rgba(180, 35, 24, 0.08)",
            color: "#9b1c14",
            border: "1px solid rgba(180, 35, 24, 0.18)",
          }}
        >
          {error}
        </p>
      ) : null}
    </div>
  );
}

function GoogleGlyph() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden>
      <path
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09Z"
        fill="#4285F4"
      />
      <path
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.99.66-2.25 1.06-3.71 1.06-2.86 0-5.29-1.93-6.15-4.53H2.18v2.84A10.99 10.99 0 0 0 12 23Z"
        fill="#34A853"
      />
      <path
        d="M5.85 14.1c-.22-.66-.35-1.36-.35-2.1s.13-1.44.35-2.1V7.07H2.18A10.99 10.99 0 0 0 1 12c0 1.78.43 3.47 1.18 4.93l3.67-2.83Z"
        fill="#FBBC05"
      />
      <path
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1A10.99 10.99 0 0 0 2.18 7.07l3.67 2.83C6.71 7.31 9.14 5.38 12 5.38Z"
        fill="#EA4335"
      />
    </svg>
  );
}

function Spinner() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden
      className="animate-spin"
    >
      <circle
        cx="12"
        cy="12"
        r="9"
        stroke="currentColor"
        strokeOpacity="0.25"
        strokeWidth="2"
      />
      <path
        d="M21 12a9 9 0 0 0-9-9"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}
