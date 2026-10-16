"use client";

import { useEffect } from "react";

import { createClient } from "@/lib/supabase/client";
import {
  parseImplicitAuthHash,
  safeSameOriginPath,
} from "@/lib/auth/implicit-hash-session";

/**
 * TUL-881: consumes an implicit-flow `#access_token` / `#error` fragment on any
 * page (staging magic links landed on the site root and signed nobody in).
 * Strips the fragment first so tokens never linger in history, sets the
 * session through the browser client (same cookie scoping as sign-in/sign-out),
 * then hard-navigates to a same-origin destination so the server renders the
 * signed-in state. Renders nothing.
 */
export function ImplicitHashSessionBridge() {
  useEffect(() => {
    const parsed = parseImplicitAuthHash(window.location.hash);
    if (!parsed) return;
    const { origin, pathname, search } = window.location;
    window.history.replaceState(window.history.state, "", `${pathname}${search}`);

    if (parsed.kind === "error") {
      window.location.replace(`/login?error=auth&reason=${encodeURIComponent(parsed.code)}`);
      return;
    }
    const next = new URLSearchParams(search).get("next");
    const destination = safeSameOriginPath(next ?? `${pathname}${search}`, origin, "/");
    const supabase = createClient();
    if (!supabase) return;
    void supabase.auth
      .setSession({ access_token: parsed.accessToken, refresh_token: parsed.refreshToken })
      .then(({ error }) => {
        window.location.replace(error ? "/login?error=auth" : destination);
      })
      .catch(() => window.location.replace("/login?error=auth"));
  }, []);
  return null;
}
