/**
 * Pure mapping from a channel-handler return to a dispatch_log patch.
 * Kept out of `dispatcher.ts` so unit tests can import it without `server-only`.
 */

export const SKIPPED_DISPATCH_ERROR = "channel not configured or no endpoint";

export function dispatchLogPatchFromHandlerResult(result: string | null): {
  status: "sent" | "skipped";
  provider_reference: string | null;
  error_message: string | null;
  sent_at: string | null;
} {
  if (result == null) {
    return {
      status: "skipped",
      provider_reference: null,
      error_message: SKIPPED_DISPATCH_ERROR,
      sent_at: null,
    };
  }
  return {
    status: "sent",
    provider_reference: result,
    error_message: null,
    sent_at: new Date().toISOString(),
  };
}

export function dispatchLogPatchFromThrown(err: unknown): {
  status: "failed";
  error_message: string;
} {
  return {
    status: "failed",
    error_message: (err instanceof Error ? err.message : String(err)).slice(0, 1000),
  };
}
