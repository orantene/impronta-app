/**
 * TUL-1818: break the `/login -> ?next= -> page rejects -> /login` bounce.
 *
 * A signed-in visitor on a login-like path is normally forwarded to `?next=`.
 * When the session belongs to another account (shared `Domain=.tulala.digital`
 * cookie) the destination rejects it and sends the visitor straight back to
 * `/login?next=…`, which forwards again, forever. Pure decision logic only;
 * the proxy owns the cookies and the redirect.
 */

/** Short-lived marker the proxy sets when it forwards a signed-in visitor off /login. */
export const LOGIN_FORWARD_MARKER_COOKIE = "tl_login_fwd";
export const LOGIN_FORWARD_MARKER_MAX_AGE_S = 30;
export const LOGIN_LOOP_REASON = "session_expired";

export type LoginLoopInput = {
  /** `?reason=` on the current /login request. */
  reasonParam: string | null | undefined;
  /** Safe, normalised `?next=` path (or null). */
  nextPath: string | null | undefined;
  /** Value of the forward-marker cookie from the previous hop (or null). */
  forwardMarker: string | null | undefined;
};

export type LoginLoopDecision =
  /** Normal behaviour: forward the signed-in visitor to their destination. */
  | { kind: "forward" }
  /** Render the form, and expire every sb-* auth cookie at every scope. */
  | { kind: "show-form-clear" }
  /** We already forwarded this exact target a moment ago: restart as expired. */
  | { kind: "break"; redirectTo: string };

function nextCarriesReason(nextPath: string | null | undefined): boolean {
  if (!nextPath) return false;
  const q = nextPath.indexOf("?");
  if (q === -1) return false;
  return new URLSearchParams(nextPath.slice(q + 1)).has("reason");
}

export function resolveLoginLoopGuard(input: LoginLoopInput): LoginLoopDecision {
  // A reason flag means a previous hop already decided this session is unusable.
  if (input.reasonParam || nextCarriesReason(input.nextPath)) {
    return { kind: "show-form-clear" };
  }
  if (input.nextPath && input.forwardMarker && input.forwardMarker === input.nextPath) {
    return {
      kind: "break",
      redirectTo: `/login?next=${encodeURIComponent(input.nextPath)}&reason=${LOGIN_LOOP_REASON}`,
    };
  }
  return { kind: "forward" };
}
