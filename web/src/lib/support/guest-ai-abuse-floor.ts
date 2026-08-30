export type GuestAiAbuseFloor =
  | { ok: true }
  | { ok: false; status: 503; error: string; invokeAdapter: false };

/**
 * Fail closed before any model call. Unsigned cookies and a no-op KV
 * limiter must refuse — never burn Sonnet tokens.
 */
export function guestAiAbuseFloor(input: {
  signingEnabled: boolean;
  kvConfigured: boolean;
}): GuestAiAbuseFloor {
  if (!input.signingEnabled) {
    return {
      ok: false,
      status: 503,
      error: "Support chat is temporarily unavailable.",
      invokeAdapter: false,
    };
  }
  if (!input.kvConfigured) {
    return {
      ok: false,
      status: 503,
      error: "We'll get back to you by email. Chat answers are paused right now.",
      invokeAdapter: false,
    };
  }
  return { ok: true };
}
