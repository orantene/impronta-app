import "server-only";

import { NextResponse } from "next/server";

import { CONNECTION_POPUP_MESSAGE_TYPE, type ConnectionPopupMessage } from "./popup";

/**
 * `<` is escaped so that a vendor's error text or an account handle containing
 * `</script>` cannot break out of the inline script. JSON.stringify alone does
 * NOT escape it, and every value below is attacker-influenced in principle: the
 * error string comes from Instagram or TikTok, the handle from the connecting
 * account's own profile.
 */
function toScriptLiteral(value: unknown): string {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}

/**
 * Answer a popup-initiated connection callback.
 *
 * The opener stays exactly where it was, on Settings, and learns the outcome by
 * message. Note this deliberately posts to a SPECIFIC target origin rather than
 * "*", so the result cannot be read by an unrelated window that happens to have
 * opened us.
 *
 * The message carries the outcome and, on failure, the same `connection_error`
 * code the redirect path uses, so both routes render identical copy.
 */
export function connectionPopupResponse(
  appUrl: string,
  params: Record<string, string>,
): NextResponse {
  const error = params.connection_error;
  const message: ConnectionPopupMessage = {
    type: CONNECTION_POPUP_MESSAGE_TYPE,
    success: !error,
    provider: params.connection_success,
    error: error ? (params.connection_message ?? error) : undefined,
  };

  let targetOrigin: string;
  try {
    targetOrigin = new URL(appUrl).origin;
  } catch {
    // No origin, no postMessage: refuse rather than broadcast to "*".
    targetOrigin = "";
  }

  const body = `<!doctype html>
<html lang="en">
  <body>
    <script>
      const message = ${toScriptLiteral(message)};
      const targetOrigin = ${toScriptLiteral(targetOrigin)};
      if (targetOrigin && window.opener && !window.opener.closed) {
        window.opener.postMessage(message, targetOrigin);
      }
      window.close();
      document.body.textContent = message.success
        ? "Connected. You can close this window."
        : (message.error || "Could not connect. You can close this window.");
    </script>
  </body>
</html>`;

  return new NextResponse(body, {
    headers: {
      "content-type": "text/html; charset=utf-8",
      // Never cached: it carries a one-time outcome.
      "cache-control": "no-store",
    },
  });
}
