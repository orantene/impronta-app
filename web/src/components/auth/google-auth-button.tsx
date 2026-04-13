"use client";

import { AUTH_POPUP_MESSAGE_TYPE, type AuthPopupMessage } from "@/lib/auth-popup";
import { SUPABASE_ENV_HELP } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

const POPUP_WIDTH = 520;
const POPUP_HEIGHT = 640;

function getPopupPosition(size: number, screenStart: number, screenSpan: number) {
  return Math.max(screenStart + (screenSpan - size) / 2, 0);
}

export function GoogleAuthButton({
  nextPath,
  children,
}: {
  nextPath?: string;
  children: React.ReactNode;
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
      setError(event.data.success ? null : event.data.error ?? "Google sign-in failed.");

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
  }, [router]);

  async function handleClick() {
    setError(null);

    const supabase = createClient();
    if (!supabase) {
      setError(SUPABASE_ENV_HELP);
      return;
    }

    const left = getPopupPosition(
      POPUP_WIDTH,
      window.screenX,
      window.outerWidth,
    );
    const top = getPopupPosition(
      POPUP_HEIGHT,
      window.screenY,
      window.outerHeight,
    );

    const popup = window.open(
      "",
      "google-auth-popup",
      `width=${POPUP_WIDTH},height=${POPUP_HEIGHT},left=${left},top=${top},popup=yes,resizable=yes,scrollbars=yes`,
    );

    if (!popup) {
      setError("Popup blocked. Allow popups for this site and try again.");
      return;
    }

    popupRef.current = popup;
    setPending(true);

    const callbackUrl = new URL("/auth/callback", window.location.origin);
    callbackUrl.searchParams.set("popup", "1");
    if (nextPath) {
      callbackUrl.searchParams.set("next", nextPath);
    }

    const { data, error: oauthError } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: callbackUrl.toString(),
        skipBrowserRedirect: true,
      },
    });

    if (oauthError || !data?.url) {
      popup.close();
      popupRef.current = null;
      setPending(false);
      setError(oauthError?.message ?? "Unable to start Google sign-in.");
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
    <div className="space-y-3">
      <Button type="button" className="w-full" disabled={pending} onClick={handleClick}>
        {pending ? "Opening Google…" : children}
      </Button>
      {error ? (
        <p className="rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-m text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}
