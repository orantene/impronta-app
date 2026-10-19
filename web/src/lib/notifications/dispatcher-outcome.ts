/**
 * Pure mapping from a channel-handler return to a dispatch_log patch.
 * Kept out of `dispatcher.ts` so unit tests can import it without `server-only`.
 */

export const SKIPPED_DISPATCH_ERROR = "channel not configured or no endpoint";

/**
 * A channel that deliberately sent nothing and knows why (TUL-640). The reason
 * is a short, PII-free label stored on the dispatch row so "why was this
 * skipped" is a SQL read, not a guess.
 */
export type ChannelSkip = { skipped: true; reason: string };

export function isChannelSkip(value: unknown): value is ChannelSkip {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as { skipped?: unknown }).skipped === true &&
    typeof (value as { reason?: unknown }).reason === "string"
  );
}

export function dispatchLogPatchFromHandlerResult(
  result: string | null,
  skipReason?: string,
): {
  status: "sent" | "skipped";
  provider_reference: string | null;
  error_message: string | null;
  sent_at: string | null;
} {
  if (result == null) {
    return {
      status: "skipped",
      provider_reference: null,
      error_message: skipReason ? `skipped: ${skipReason}` : SKIPPED_DISPATCH_ERROR,
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

/**
 * TUL-653: the locale written to the dispatch log. A recipient whose locale
 * was never supplied is hydrated with an "en" placeholder; logging that as
 * "en" misleads on Spanish sites, so only an explicit locale is recorded.
 */
export function dispatchLogLocale(recipient: {
  locale: string;
  localeIsExplicit?: boolean;
}): string | null {
  return recipient.localeIsExplicit ? recipient.locale : null;
}
