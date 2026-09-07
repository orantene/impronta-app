/**
 * Popup channel for the connection-OAuth flow.
 *
 * WHY A POPUP AND NOT AN IFRAME. Neither Instagram nor TikTok can be framed:
 * both send frame-ancestor restrictions on their authorize screens, deliberately,
 * so that a hostile site cannot overlay a consent dialog. A popup is the only
 * shape that keeps the operator's workspace window intact.
 *
 * WHY ITS OWN MESSAGE TYPE, rather than reusing AUTH_POPUP_MESSAGE_TYPE. The
 * sign-in popup's listeners NAVIGATE the opener when they see their message.
 * A connection finishing must never move the operator off Settings, so the two
 * channels are kept distinct and cannot be confused for one another.
 */
export const CONNECTION_POPUP_MESSAGE_TYPE = "impronta:connection-popup-result";

export type ConnectionPopupMessage = {
  type: typeof CONNECTION_POPUP_MESSAGE_TYPE;
  success: boolean;
  /** Provider key the flow was for, so a stale message cannot be misread. */
  provider?: string;
  /** `connection_error` code on failure, shown with the same copy as the redirect path. */
  error?: string;
};

/**
 * True when a message really is ours. Callers MUST also check
 * `event.origin === window.location.origin` before trusting it: any page may
 * postMessage to an opener, so shape alone is not provenance.
 */
export function isConnectionPopupMessage(data: unknown): data is ConnectionPopupMessage {
  if (typeof data !== "object" || data === null) return false;
  const candidate = data as { type?: unknown; success?: unknown };
  return (
    candidate.type === CONNECTION_POPUP_MESSAGE_TYPE &&
    typeof candidate.success === "boolean"
  );
}
