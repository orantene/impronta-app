import { interpolate } from "@/i18n/interpolate";

type Translate = (key: string) => string;

/** The slice of a failed support action the panel needs to word the error. */
export type SupportSendFailure = {
  code?: string;
  retryAfterSec?: number;
};

/**
 * One place that words a failed support send. A rate limit says so and when it
 * lifts; every other failure keeps the generic "did not send" line. Previously
 * both collapsed into the generic line, so a capped user retried forever.
 */
export function supportSendErrorText(t: Translate, failure: SupportSendFailure | null | undefined): string {
  if (failure?.code === "network") return t("dashboard.adminSupport.sendFailedNetwork");
  if (failure?.code === "rate_limited") {
    const minutes = Math.max(1, Math.ceil((failure.retryAfterSec ?? 60) / 60));
    return interpolate(
      t(minutes === 1 ? "dashboard.adminSupport.rateLimitedOne" : "dashboard.adminSupport.rateLimited"),
      { minutes: String(minutes) },
    );
  }
  return t("dashboard.adminSupport.sendFailed");
}

/**
 * Run a support send and fold a thrown error (network drop, rejected fetch)
 * into a failed result, so callers keep the typed text and show the inline error.
 */
export async function guardSupportSend<R extends { ok: boolean }>(
  run: () => Promise<R>,
): Promise<R | { ok: false; code: "network" }> {
  try {
    return await run();
  } catch {
    return { ok: false, code: "network" };
  }
}
