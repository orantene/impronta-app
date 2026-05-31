"use client";

/**
 * Leaf UI parts for the talent registration modal — extracted to keep
 * talent-register-modal.tsx under the 800-line cap. These are presentation +
 * the Google OAuth popup button; the modal shell + step orchestration stay in
 * the main file. All styling is driven by `--plt-*` vars, which the tenant
 * variant remaps onto storefront tokens at the modal root.
 */

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { AUTH_POPUP_MESSAGE_TYPE, type AuthPopupMessage } from "@/lib/auth-popup";
import { getAppUrl } from "@/lib/auth-flow";
import { createClient } from "@/lib/supabase/client";
import { SUPABASE_ENV_HELP } from "@/lib/supabase/config";
import {
  ArrowGlyph,
  GoogleGlyph,
  MailGlyph,
  Spinner,
} from "./talent-register-modal-glyphs";

export const OAUTH_NEXT_PATH = "/onboarding/talent-location";

export function GoogleButton({
  next,
  onAuthed,
}: {
  next?: string;
  onAuthed: () => void;
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
      setError(
        event.data.success ? null : event.data.error ?? "Google sign-in failed.",
      );
      if (closeWatcherRef.current) {
        window.clearInterval(closeWatcherRef.current);
        closeWatcherRef.current = null;
      }
      popupRef.current?.close();
      popupRef.current = null;
      if (event.data.success) {
        // Session is now shared across the parent domain — advance in place.
        router.refresh();
        onAuthed();
      }
    }
    window.addEventListener("message", handleMessage);
    return () => {
      window.removeEventListener("message", handleMessage);
      if (closeWatcherRef.current) {
        window.clearInterval(closeWatcherRef.current);
      }
    };
  }, [router, onAuthed]);

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
      setError("Popup blocked. Allow popups and try again.");
      return;
    }
    popupRef.current = popup;
    setPending(true);
    // The callback must run on the app host — /auth/callback isn't allowed on
    // the marketing host. The PKCE verifier cookie is shared across the parent
    // domain (see lib/supabase/client.ts), so the exchange succeeds there.
    const cb = new URL("/auth/callback", getAppUrl());
    cb.searchParams.set("popup", "1");
    cb.searchParams.set("next", next ?? OAUTH_NEXT_PATH);
    const { data, error: oauthError } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: cb.toString(), skipBrowserRedirect: true },
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
        <span>{pending ? "Opening Google…" : "Continue with Google"}</span>
      </button>
      {error ? <ErrorNote small>{error}</ErrorNote> : null}
    </div>
  );
}

export function ConfirmationView({ message }: { message: string }) {
  return (
    <div className="space-y-5 py-2 text-center">
      <div
        className="mx-auto flex h-14 w-14 items-center justify-center rounded-full"
        style={{
          background: "color-mix(in srgb, var(--plt-forest) 12%, transparent)",
          color: "var(--plt-forest)",
        }}
      >
        <MailGlyph />
      </div>
      <div className="space-y-1.5">
        <h3
          className="plt-display text-[1.125rem] font-semibold"
          style={{ color: "var(--plt-ink)" }}
        >
          Check your inbox
        </h3>
        <p
          className="text-[0.875rem] leading-[1.5]"
          style={{ color: "var(--plt-muted)" }}
        >
          {message}
        </p>
      </div>
    </div>
  );
}

export function SubmitButton({
  pending,
  idle,
  busy,
}: {
  pending: boolean;
  idle: string;
  busy: string;
}) {
  return (
    <button
      type="submit"
      disabled={pending}
      className="group relative mt-1 inline-flex w-full items-center justify-center gap-2 rounded-full px-6 py-3 text-[0.9375rem] font-medium leading-none tracking-[-0.005em] transition-[background,transform,box-shadow] duration-200 disabled:cursor-wait disabled:opacity-80"
      style={{
        background: "var(--plt-forest)",
        color: "var(--plt-forest-on)",
        boxShadow: "var(--plt-shadow-forest)",
      }}
    >
      <span>{pending ? busy : idle}</span>
      {pending ? <Spinner /> : <ArrowGlyph />}
    </button>
  );
}

export function ErrorNote({
  children,
  small,
}: {
  children: React.ReactNode;
  small?: boolean;
}) {
  return (
    <p
      className={`rounded-xl px-3 py-2 ${small ? "text-[0.75rem]" : "text-[0.8125rem]"}`}
      style={{
        background: "rgba(180, 35, 24, 0.08)",
        color: "#9b1c14",
        border: "1px solid rgba(180, 35, 24, 0.18)",
      }}
    >
      {children}
    </p>
  );
}

export function StepDot({ active, done }: { active: boolean; done: boolean }) {
  return (
    <span
      aria-hidden
      className="h-1.5 rounded-full transition-all duration-300"
      style={{
        width: active ? "1.5rem" : "0.375rem",
        background:
          active || done ? "var(--plt-forest)" : "var(--plt-hairline-strong)",
      }}
    />
  );
}

export function FieldShell({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span
        className="plt-mono mb-1.5 block text-[0.6875rem] font-semibold uppercase tracking-[0.16em]"
        style={{ color: "var(--plt-muted)" }}
      >
        {label}
      </span>
      <div
        className="flex h-12 items-center rounded-2xl px-4 transition-[border-color,box-shadow] focus-within:shadow-[0_0_0_3px_color-mix(in_srgb,var(--plt-forest)_18%,transparent)]"
        style={{
          background: "var(--plt-bg)",
          border: "1px solid var(--plt-hairline-strong)",
        }}
      >
        {children}
      </div>
      {hint ? (
        <span
          className="mt-1 block text-[0.6875rem]"
          style={{ color: "var(--plt-muted)" }}
        >
          {hint}
        </span>
      ) : null}
    </label>
  );
}
