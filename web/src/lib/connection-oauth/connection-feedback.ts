/**
 * connection-feedback.ts
 *
 * Client-safe helpers for surfacing the OAuth round-trip result that the
 * /api/connections/oauth/start + .../callback/google routes communicate back
 * to the originating page via query params:
 *
 *   ?connection_error=<code>   — start/callback failed (e.g. oauth_setup)
 *   ?connection=<provider>_connected — success
 *
 * No UI read these params before, so a failed connect (very common while OAuth
 * is DORMANT in prod and creds are unset → `oauth_setup`) made the button look
 * dead. These helpers map the known codes to friendly copy and let each connect
 * surface clear the param from the URL after reading it.
 *
 * IMPORTANT: client-only module — no server imports. Safe in "use client".
 */

export type ConnectionFeedbackTone = "success" | "error";

export type ConnectionFeedback = {
  tone: ConnectionFeedbackTone;
  message: string;
};

const ERROR_COPY: Record<string, string> = {
  oauth_setup:
    "Connecting with Google isn't set up yet — ask the platform admin to finish OAuth configuration.",
};

const DEFAULT_ERROR_COPY =
  "We couldn't finish connecting that account. Please try again, or contact support if it keeps happening.";

/** Friendly copy for a `connection_error` code. */
export function connectionErrorCopy(code: string): string {
  return ERROR_COPY[code] ?? DEFAULT_ERROR_COPY;
}

/** Friendly copy for a `connection` success value (e.g. `youtube_connected`). */
export function connectionSuccessCopy(value: string): string {
  const provider = value.replace(/_connected$/i, "").trim();
  if (provider && provider !== value) {
    const label = provider.charAt(0).toUpperCase() + provider.slice(1);
    return `${label} connected. Ownership is now verified.`;
  }
  return "Account connected. Ownership is now verified.";
}

/**
 * Read the connection result from the current URL's query string and return a
 * feedback object, or null when neither param is present. Pass
 * `window.location.search`.
 */
export function readConnectionFeedback(
  search: string,
): ConnectionFeedback | null {
  const params = new URLSearchParams(search);
  const error = params.get("connection_error");
  if (error) {
    return { tone: "error", message: connectionErrorCopy(error) };
  }
  const connection = params.get("connection");
  if (connection) {
    return { tone: "success", message: connectionSuccessCopy(connection) };
  }
  return null;
}

/**
 * Strip the connection result params from the current URL via replaceState so
 * the message doesn't reappear on refresh. No-op outside the browser.
 */
export function clearConnectionFeedbackParams(): void {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  let changed = false;
  for (const key of ["connection_error", "connection"]) {
    if (url.searchParams.has(key)) {
      url.searchParams.delete(key);
      changed = true;
    }
  }
  if (changed) {
    window.history.replaceState(
      window.history.state,
      "",
      url.pathname + url.search + url.hash,
    );
  }
}
