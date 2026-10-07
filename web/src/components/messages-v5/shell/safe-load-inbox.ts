import * as Sentry from "@sentry/nextjs";

import type { ActionResult, InboxFilter, InboxRow } from "@/lib/messaging/types";

type InboxResult = ActionResult<{ rows: InboxRow[]; unreadCount: number }>;
type LoadInbox = (input: { locationSlug: string; filter: InboxFilter }) => Promise<InboxResult>;

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

function report(error: unknown, attempt: number): void {
  const e = error as { name?: unknown; message?: unknown; digest?: unknown } | null;
  Sentry.captureException(error, {
    tags: { area: "talent-inbox", action: "messagingTalentLoadInbox" },
    extra: {
      attempt,
      name: typeof e?.name === "string" ? e.name : null,
      message: typeof e?.message === "string" ? e.message : String(error),
      digest: typeof e?.digest === "string" ? e.digest : null,
    },
  });
}

/**
 * Calls the inbox server action and never rejects. A transport failure (the
 * action POST answering 503, a dropped stream) is reported to Sentry, retried
 * once after `retryDelayMs`, and then surfaces as the "unavailable" refusal so
 * the shell leaves its skeleton and shows the existing retry state.
 */
export async function safeLoadInbox(
  load: LoadInbox,
  input: { locationSlug: string; filter: InboxFilter },
  retryDelayMs = 2000,
): Promise<InboxResult> {
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    try {
      return await load(input);
    } catch (error) {
      report(error, attempt);
      if (attempt === 1) await wait(retryDelayMs);
    }
  }
  return { ok: false, reason: "unavailable" };
}
